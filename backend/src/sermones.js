// ============================================================
//  Fase 4.3: Toma de Notas Inteligente
//  Bosquejo del sermon (sermon) + notas personales (nota_personal).
//  - El bosquejo lo publica el pastor/lider; lo ve toda la iglesia.
//  - Cada persona captura frases del bosquejo y escribe sus propias notas.
//    Las notas son PRIVADAS: cada quien ve SOLO las suyas.
//  Aislamiento por iglesia_id en todo.
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esLiderOAdmin, esPastor } from './auth.js';

const r = Router();
r.use(authMiddleware);

// Convierte el campo puntos (JSON en BD) a arreglo para el cliente.
function conPuntos(s) {
  if (!s) return s;
  let puntos = [];
  try { puntos = s.puntos ? JSON.parse(s.puntos) : []; } catch { puntos = []; }
  return { ...s, puntos };
}

// --- Listar bosquejos de sermones de la iglesia (mas recientes primero) ---
r.get('/', (req, res) => {
  const items = db.prepare(
    `SELECT s.*, p.nombre AS autor, e.titulo AS evento
       FROM sermon s
       LEFT JOIN persona p ON p.id = s.creado_por
       LEFT JOIN evento e ON e.id = s.evento_id
      WHERE s.iglesia_id = ?
      ORDER BY COALESCE(s.fecha, s.creado_en) DESC`
  ).all(req.user.iglesia_id);
  res.json(items.map(conPuntos));
});

// --- Detalle de un bosquejo + MIS notas de ese sermon ---
r.get('/:id', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const s = db.prepare(
    `SELECT s.*, p.nombre AS autor, e.titulo AS evento
       FROM sermon s
       LEFT JOIN persona p ON p.id = s.creado_por
       LEFT JOIN evento e ON e.id = s.evento_id
      WHERE s.id = ? AND s.iglesia_id = ?`
  ).get(req.params.id, iglesia_id);
  if (!s) return res.status(404).json({ error: 'Sermón no encontrado' });
  const notas = db.prepare(
    'SELECT * FROM nota_personal WHERE sermon_id = ? AND persona_id = ? ORDER BY creado_en'
  ).all(s.id, persona_id);
  res.json({ sermon: conPuntos(s), notas });
});

// --- Publicar un bosquejo (solo lider/pastor) ---
// body: { titulo, predicador, fecha, texto_base, bosquejo, puntos:[...], evento_id }
r.post('/', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  if (!esLiderOAdmin(persona_id))
    return res.status(403).json({ error: 'No tienes permiso para publicar bosquejos' });
  const { titulo, predicador, fecha, texto_base, bosquejo, puntos, evento_id } = req.body || {};
  if (!titulo) return res.status(400).json({ error: 'Falta el título' });

  // Si se asocia a un evento, debe ser de la misma iglesia.
  let evId = null;
  if (evento_id) {
    const ev = db.prepare('SELECT id FROM evento WHERE id = ? AND iglesia_id = ?').get(evento_id, iglesia_id);
    if (!ev) return res.status(404).json({ error: 'Evento no encontrado en tu iglesia' });
    evId = ev.id;
  }
  const puntosJson = Array.isArray(puntos) ? JSON.stringify(puntos.filter(x => x && x.trim()).map(x => x.trim())) : null;

  const info = db.prepare(
    `INSERT INTO sermon (iglesia_id, evento_id, titulo, predicador, fecha, texto_base, bosquejo, puntos, creado_por)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(iglesia_id, evId, titulo, predicador || null, fecha || null, texto_base || null, bosquejo || null, puntosJson, persona_id);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// --- Editar bosquejo (pastor o autor) ---
r.patch('/:id', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const s = db.prepare('SELECT * FROM sermon WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!s) return res.status(404).json({ error: 'No encontrado' });
  if (!(esPastor(persona_id) || s.creado_por === persona_id))
    return res.status(403).json({ error: 'No tienes permiso' });
  const { titulo, predicador, fecha, texto_base, bosquejo, puntos } = req.body || {};
  const puntosJson = Array.isArray(puntos) ? JSON.stringify(puntos.filter(x => x && x.trim()).map(x => x.trim())) : s.puntos;
  db.prepare(
    'UPDATE sermon SET titulo=?, predicador=?, fecha=?, texto_base=?, bosquejo=?, puntos=? WHERE id=?'
  ).run(titulo || s.titulo, predicador ?? s.predicador, fecha ?? s.fecha, texto_base ?? s.texto_base,
        bosquejo ?? s.bosquejo, puntosJson, s.id);
  res.json({ ok: true });
});

// --- Eliminar bosquejo (pastor o autor) - tambien borra las notas asociadas ---
r.delete('/:id', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const s = db.prepare('SELECT * FROM sermon WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!s) return res.status(404).json({ error: 'No encontrado' });
  if (!(esPastor(persona_id) || s.creado_por === persona_id))
    return res.status(403).json({ error: 'No tienes permiso' });
  db.prepare('DELETE FROM nota_personal WHERE sermon_id=?').run(s.id);
  db.prepare('DELETE FROM sermon WHERE id=?').run(s.id);
  res.json({ ok: true });
});

// ============================================================
//  NOTAS PERSONALES (privadas de cada persona)
// ============================================================

// --- Todas MIS notas (de todos los sermones) - para exportar ---
r.get('/notas/mias', (req, res) => {
  const items = db.prepare(
    `SELECT n.*, s.titulo AS sermon_titulo, s.fecha AS sermon_fecha
       FROM nota_personal n
       LEFT JOIN sermon s ON s.id = n.sermon_id
      WHERE n.persona_id = ? AND n.iglesia_id = ?
      ORDER BY n.creado_en DESC`
  ).all(req.user.persona_id, req.user.iglesia_id);
  res.json(items);
});

// --- Capturar / crear una nota personal ---
// body: { sermon_id, texto, comentario, origen:'captura'|'propia' }
r.post('/:id/notas', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const s = db.prepare('SELECT id FROM sermon WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!s) return res.status(404).json({ error: 'Sermón no encontrado' });
  const { texto, comentario, origen } = req.body || {};
  if (!texto || !texto.trim()) return res.status(400).json({ error: 'Falta el texto de la nota' });
  const info = db.prepare(
    'INSERT INTO nota_personal (iglesia_id, persona_id, sermon_id, texto, comentario, origen) VALUES (?,?,?,?,?,?)'
  ).run(iglesia_id, persona_id, s.id, texto.trim(), (comentario || '').trim() || null,
        origen === 'captura' ? 'captura' : 'propia');
  res.json({ ok: true, id: info.lastInsertRowid });
});

// --- Editar una nota propia (texto/comentario) ---
r.patch('/notas/:notaId', (req, res) => {
  const { persona_id } = req.user;
  const n = db.prepare('SELECT * FROM nota_personal WHERE id = ? AND persona_id = ?').get(req.params.notaId, persona_id);
  if (!n) return res.status(404).json({ error: 'Nota no encontrada' });
  const { texto, comentario } = req.body || {};
  db.prepare('UPDATE nota_personal SET texto=?, comentario=? WHERE id=?')
    .run(texto || n.texto, (comentario ?? n.comentario) || null, n.id);
  res.json({ ok: true });
});

// --- Borrar una nota propia ---
r.delete('/notas/:notaId', (req, res) => {
  const { persona_id } = req.user;
  const n = db.prepare('SELECT * FROM nota_personal WHERE id = ? AND persona_id = ?').get(req.params.notaId, persona_id);
  if (!n) return res.status(404).json({ error: 'Nota no encontrada' });
  db.prepare('DELETE FROM nota_personal WHERE id=?').run(n.id);
  res.json({ ok: true });
});

export default r;
