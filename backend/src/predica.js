// ============================================================
//  Fase 4.8: Predica — historial de prédicas (fusión de Devocional + Notas)
//  Ver: toda la congregación. Editar: el pastor o un predicador vigente.
//  El pastor asigna el rol 'predicador' a un feligrés entre dos fechas.
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esPastor, esPredicador, auditar } from './auth.js';
import { enviarPush } from './push.js';

const r = Router();
r.use(authMiddleware);

// ---------- PRÉDICAS ----------
r.get('/', (req, res) => {
  const items = db.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM predica_recurso pr WHERE pr.predica_id = p.id) AS recursos
       FROM predica p WHERE p.iglesia_id = ? ORDER BY COALESCE(p.fecha,'') DESC, p.id DESC`
  ).all(req.user.iglesia_id);
  res.json({ puedeEditar: esPredicador(req.user.persona_id), items });
});

r.get('/predicadores', (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  res.json(db.prepare(
    `SELECT rt.id, rt.persona_id, rt.desde, rt.hasta, p.nombre,
            (date('now') BETWEEN rt.desde AND rt.hasta) AS vigente
       FROM rol_temporal rt JOIN persona p ON p.id = rt.persona_id
      WHERE rt.iglesia_id = ? AND rt.rol = 'predicador' ORDER BY rt.hasta DESC`
  ).all(req.user.iglesia_id).map(x => ({ ...x, vigente: !!x.vigente })));
});

r.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM predica WHERE id = ? AND iglesia_id = ?').get(req.params.id, req.user.iglesia_id);
  if (!p) return res.status(404).json({ error: 'Prédica no encontrada' });
  const recursos = db.prepare('SELECT id, tipo, titulo, url FROM predica_recurso WHERE predica_id = ? ORDER BY id').all(p.id);
  res.json({ ...p, recursos, puedeEditar: esPredicador(req.user.persona_id) });
});

function soloPredicador(req, res, next) {
  if (!esPredicador(req.user.persona_id))
    return res.status(403).json({ error: 'Solo el pastor o el predicador puede editar las prédicas.' });
  next();
}

r.post('/', soloPredicador, (req, res) => {
  const { titulo, fecha, predicador, notas } = req.body || {};
  if (!titulo) return res.status(400).json({ error: 'Falta el nombre de la prédica' });
  const info = db.prepare('INSERT INTO predica (iglesia_id, titulo, fecha, predicador, notas, creado_por) VALUES (?,?,?,?,?,?)')
    .run(req.user.iglesia_id, String(titulo).trim(), fecha || null, predicador || null, notas || null, req.user.persona_id);
  auditar(req.user.iglesia_id, req.user.persona_id, 'crear_predica', 'predica', String(titulo).trim());
  res.json({ ok: true, id: info.lastInsertRowid });
});

r.patch('/:id', soloPredicador, (req, res) => {
  const p = db.prepare('SELECT * FROM predica WHERE id = ? AND iglesia_id = ?').get(req.params.id, req.user.iglesia_id);
  if (!p) return res.status(404).json({ error: 'No encontrada' });
  const { titulo, fecha, predicador, notas } = req.body || {};
  db.prepare('UPDATE predica SET titulo=?, fecha=?, predicador=?, notas=? WHERE id=?')
    .run(titulo ?? p.titulo, fecha ?? p.fecha, predicador ?? p.predicador, notas ?? p.notas, p.id);
  res.json({ ok: true });
});

r.delete('/:id', soloPredicador, (req, res) => {
  const p = db.prepare('SELECT id FROM predica WHERE id = ? AND iglesia_id = ?').get(req.params.id, req.user.iglesia_id);
  if (!p) return res.status(404).json({ error: 'No encontrada' });
  db.prepare('DELETE FROM predica_recurso WHERE predica_id = ?').run(p.id);
  db.prepare('DELETE FROM predica WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

// ---------- RECURSOS DE UNA PRÉDICA (links / archivos / libros) ----------
r.post('/:id/recurso', soloPredicador, (req, res) => {
  const p = db.prepare('SELECT id FROM predica WHERE id = ? AND iglesia_id = ?').get(req.params.id, req.user.iglesia_id);
  if (!p) return res.status(404).json({ error: 'No encontrada' });
  const { tipo, titulo, url } = req.body || {};
  if (!titulo) return res.status(400).json({ error: 'Falta el título' });
  const t = ['link', 'archivo', 'libro'].includes(tipo) ? tipo : 'link';
  db.prepare('INSERT INTO predica_recurso (predica_id, tipo, titulo, url) VALUES (?,?,?,?)')
    .run(p.id, t, String(titulo).trim(), url || null);
  res.json({ ok: true });
});
r.delete('/recurso/:rid', soloPredicador, (req, res) => {
  const info = db.prepare(
    `DELETE FROM predica_recurso WHERE id = ? AND predica_id IN (SELECT id FROM predica WHERE iglesia_id = ?)`
  ).run(req.params.rid, req.user.iglesia_id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

// ---------- GESTIÓN DEL ROL PREDICADOR (solo el pastor) ----------
r.post('/predicadores', (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor asigna predicadores' });
  const { persona_id, desde, hasta } = req.body || {};
  const persona = db.prepare('SELECT id, nombre FROM persona WHERE id = ? AND iglesia_id = ? AND activo = 1').get(persona_id, req.user.iglesia_id);
  if (!persona) return res.status(404).json({ error: 'Persona no encontrada' });
  if (!desde || !hasta) return res.status(400).json({ error: 'Indica desde y hasta qué fecha' });
  db.prepare('INSERT INTO rol_temporal (iglesia_id, persona_id, rol, desde, hasta, creado_por) VALUES (?,?,?,?,?,?)')
    .run(req.user.iglesia_id, persona.id, 'predicador', desde, hasta, req.user.persona_id);
  const txtPred = `Del ${desde} al ${hasta} puedes gestionar el módulo Predica.`;
  db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
    .run(persona.id, 'predica', '🎤 Eres predicador', txtPred);
  enviarPush([persona.id], { titulo: '🎤 Eres predicador', texto: txtPred }).catch(() => {});
  auditar(req.user.iglesia_id, req.user.persona_id, 'asignar_predicador', 'predica', `${persona.nombre} ${desde}→${hasta}`);
  res.json({ ok: true });
});
r.delete('/predicadores/:id', (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  const info = db.prepare('DELETE FROM rol_temporal WHERE id = ? AND iglesia_id = ? AND rol = \'predicador\'').run(req.params.id, req.user.iglesia_id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

export default r;
