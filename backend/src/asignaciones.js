// ============================================================
//  Modulo C: Servicio + Mi Servicio  -  Fase 1B
//  El pastor/lider asigna servicios; la persona acepta o no.
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esLiderOAdmin, auditar } from './auth.js';
import { enviarPush } from './push.js';

const r = Router();
r.use(authMiddleware);

const TIPOS = ['predicar', 'ofrenda', 'devocional', 'musica', 'aseo'];

// --- MI SERVICIO: lo que me toca servir ---
r.get('/mio', (req, res) => {
  const items = db.prepare(
    `SELECT a.*, e.titulo AS evento, e.fecha, e.hora_inicio, e.lugar
       FROM asignacion a JOIN evento e ON e.id = a.evento_id
      WHERE a.persona_id = ? ORDER BY e.fecha`
  ).all(req.user.persona_id);
  res.json(items);
});

// --- ASIGNAR un servicio (lider/pastor) ---
r.post('/', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const { evento_id, persona_id: aPersona, tipo } = req.body || {};
  if (!evento_id || !aPersona || !tipo) return res.status(400).json({ error: 'Faltan datos' });
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de servicio inválido' });
  if (!esLiderOAdmin(persona_id)) return res.status(403).json({ error: 'No tienes permiso para asignar' });

  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(evento_id, iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });

  // La persona asignada debe pertenecer a la misma iglesia (evita asignar a alguien de otra congregación).
  const destino = db.prepare('SELECT id FROM persona WHERE id = ? AND iglesia_id = ? AND activo = 1').get(aPersona, iglesia_id);
  if (!destino) return res.status(404).json({ error: 'Persona no encontrada en tu iglesia' });

  // ¿La persona marcó NO disponible para esa fecha? (avisa, no bloquea)
  const noDisp = db.prepare(
    'SELECT motivo FROM fecha_no_disp WHERE persona_id = ? AND ? BETWEEN desde AND hasta'
  ).get(aPersona, ev.fecha);

  const info = db.prepare(
    "INSERT INTO asignacion (evento_id, persona_id, tipo, estado) VALUES (?,?,?, 'pendiente')"
  ).run(evento_id, aPersona, tipo);

  // Avisar al asignado (notificacion in-app + push real)
  db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
    .run(aPersona, 'asignacion', 'Te asignaron: ' + tipo, ev.titulo + ' · ' + ev.fecha);
  enviarPush([aPersona], { titulo: 'Te asignaron: ' + tipo, texto: ev.titulo + ' · ' + ev.fecha }).catch(() => {});

  auditar(iglesia_id, persona_id, 'asignar_servicio', 'servicio', tipo + ' -> persona ' + aPersona);
  res.json({
    ok: true, id: info.lastInsertRowid,
    aviso: noDisp ? `Esa persona marcó NO disponible (${noDisp.motivo || 'sin motivo'})` : null
  });
});

// --- ACEPTAR / NO PUEDO (solo el asignado) ---
r.patch('/:id', (req, res) => {
  const { persona_id } = req.user;
  const { accion, motivo } = req.body || {};
  const a = db.prepare('SELECT * FROM asignacion WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Asignación no encontrada' });
  if (a.persona_id !== persona_id) return res.status(403).json({ error: 'No es tu asignación' });

  const estado = accion === 'aceptar' ? 'aceptado' : 'rechazado';
  db.prepare('UPDATE asignacion SET estado = ?, motivo = ? WHERE id = ?').run(estado, motivo || null, a.id);
  res.json({ ok: true, estado });
});

// --- Servicios de un evento (para quien asigna) ---
r.get('/evento/:id', (req, res) => {
  // El evento debe pertenecer a la iglesia del usuario.
  const ev = db.prepare('SELECT id FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  const items = db.prepare(
    `SELECT a.*, p.nombre FROM asignacion a JOIN persona p ON p.id = a.persona_id WHERE a.evento_id = ?`
  ).all(req.params.id);
  res.json(items);
});

export default r;
