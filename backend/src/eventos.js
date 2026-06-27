// ============================================================
//  Modulo A: Calendario + Eventos  -  Fase 1B
// ============================================================
import { Router } from 'express';
import db from './db.js';
import {
  authMiddleware, esPastor, esAdminDeGrupo, esEncargadoGrupo, veCalendarioCompleto,
  gruposDeUsuario, auditar
} from './auth.js';
import { enviarPush } from './push.js';

const r = Router();
r.use(authMiddleware);

// --- Listar eventos (segun lo que el usuario puede ver) ---
r.get('/', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  let eventos;
  if (veCalendarioCompleto(persona_id)) {
    // Lideres/pastor: ven TODO el calendario de su iglesia
    eventos = db.prepare(
      `SELECT e.*, g.nombre AS grupo, g.color AS grupo_color FROM evento e
         LEFT JOIN grupo g ON g.id = e.grupo_id
        WHERE e.iglesia_id = ? ORDER BY e.fecha, e.hora_inicio`
    ).all(iglesia_id);
  } else {
    // Feligres / toda la congregacion: ve TODO el calendario aprobado de su iglesia
    eventos = db.prepare(
      `SELECT e.*, g.nombre AS grupo, g.color AS grupo_color FROM evento e
         LEFT JOIN grupo g ON g.id = e.grupo_id
        WHERE e.iglesia_id = ? AND e.estado = 'aprobado'
        ORDER BY e.fecha, e.hora_inicio`
    ).all(iglesia_id);
  }
  res.json(eventos);
});

// --- Grupos donde el usuario PUEDE crear eventos ---
r.get('/grupos-gestionables', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  if (esPastor(persona_id)) {
    return res.json(db.prepare('SELECT id, nombre FROM grupo WHERE iglesia_id = ?').all(iglesia_id));
  }
  const grupos = gruposDeUsuario(persona_id)
    .filter(g => esAdminDeGrupo(persona_id, g.id))
    .map(g => ({ id: g.id, nombre: g.nombre }));
  res.json(grupos);
});

// --- Crear evento ---
r.post('/', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const { grupo_id, titulo, fecha, hora_inicio, hora_fin, lugar, descripcion } = req.body || {};

  if (!titulo || !fecha || !grupo_id)
    return res.status(400).json({ error: 'Faltan datos: titulo, fecha y grupo' });
  if (!esAdminDeGrupo(persona_id, Number(grupo_id)))
    return res.status(403).json({ error: 'No tienes permiso para crear eventos en ese grupo' });

  // Deteccion de choque: mismo dia + mismo lugar + horarios que se solapan
  if (lugar && hora_inicio && hora_fin) {
    const choque = db.prepare(
      `SELECT titulo FROM evento
        WHERE iglesia_id = ? AND fecha = ? AND lugar = ? AND estado != 'rechazado'
          AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL
          AND NOT (? <= hora_inicio OR ? >= hora_fin)`
    ).get(iglesia_id, fecha, lugar, hora_fin, hora_inicio);
    if (choque)
      return res.status(409).json({ error: `El lugar "${lugar}" ya esta ocupado a esa hora por "${choque.titulo}". Elige otro horario o lugar.` });
  }

  // Si lo crea el pastor -> aprobado directo. Si un lider -> pendiente de aprobacion.
  const estado = esPastor(persona_id) ? 'aprobado' : 'pendiente';
  const info = db.prepare(
    `INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, hora_inicio, hora_fin, lugar, descripcion, estado, creado_por)
     VALUES (?,?,?,?,?,?,?,?, ?, ?)`
  ).run(iglesia_id, grupo_id, titulo, fecha, hora_inicio || null, hora_fin || null, lugar || null, descripcion || null, estado, persona_id);

  if (estado === 'pendiente') {
    const pastores = db.prepare('SELECT id FROM persona WHERE iglesia_id = ? AND es_pastor = 1').all(iglesia_id);
    const st = db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)');
    for (const p of pastores) st.run(p.id, 'aprobacion', 'Solicitud de fecha', titulo + ' · ' + fecha);
    enviarPush(pastores.map(p => p.id), { titulo: 'Solicitud de fecha', texto: titulo + ' · ' + fecha }).catch(() => {});
  }
  auditar(iglesia_id, persona_id, 'crear_evento', 'calendario', titulo);
  res.json({ ok: true, id: info.lastInsertRowid, estado });
});

// --- Pendientes (bandeja del pastor) ---
r.get('/pendientes', (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  const items = db.prepare(
    `SELECT e.*, g.nombre AS grupo, p.nombre AS solicitante FROM evento e
       LEFT JOIN grupo g ON g.id = e.grupo_id
       LEFT JOIN persona p ON p.id = e.creado_por
      WHERE e.iglesia_id = ? AND e.estado = 'pendiente' ORDER BY e.fecha`
  ).all(req.user.iglesia_id);
  res.json(items);
});

// --- Aprobar / Rechazar (pastor) ---
r.patch('/:id/aprobar', (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'No encontrado' });
  db.prepare("UPDATE evento SET estado = 'aprobado' WHERE id = ?").run(ev.id);
  if (ev.creado_por) {
    db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
      .run(ev.creado_por, 'aprobacion', '✅ Tu fecha fue aprobada', ev.titulo + ' · ' + ev.fecha);
    enviarPush([ev.creado_por], { titulo: '✅ Tu fecha fue aprobada', texto: ev.titulo + ' · ' + ev.fecha }).catch(() => {});
  }
  auditar(req.user.iglesia_id, req.user.persona_id, 'aprobar_fecha', 'calendario', ev.titulo);
  res.json({ ok: true });
});

r.patch('/:id/rechazar', (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'No encontrado' });
  const motivo = (req.body || {}).motivo;
  db.prepare("UPDATE evento SET estado = 'rechazado' WHERE id = ?").run(ev.id);
  if (ev.creado_por) {
    db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
      .run(ev.creado_por, 'aprobacion', '🔴 Tu fecha fue rechazada', ev.titulo + (motivo ? ' · ' + motivo : ''));
    enviarPush([ev.creado_por], { titulo: '🔴 Tu fecha fue rechazada', texto: ev.titulo + (motivo ? ' · ' + motivo : '') }).catch(() => {});
  }
  auditar(req.user.iglesia_id, req.user.persona_id, 'rechazar_fecha', 'calendario', ev.titulo);
  res.json({ ok: true });
});

// --- Detalle ---
r.get('/:id', (req, res) => {
  const ev = db.prepare(
    `SELECT e.*, g.nombre AS grupo FROM evento e
       LEFT JOIN grupo g ON g.id = e.grupo_id
      WHERE e.id = ? AND e.iglesia_id = ?`
  ).get(req.params.id, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  res.json(ev);
});

// ¿Puede gestionar (editar/borrar) este evento?
//  - Si YA está APROBADO: solo el pastor (la fecha quedó confirmada en el calendario).
//  - Si está pendiente/rechazado: el encargado del grupo o quien lo creó.
function puedeGestionar(personaId, ev) {
  if (ev.estado === 'aprobado') return esPastor(personaId);
  return esEncargadoGrupo(personaId, ev.grupo_id) || ev.creado_por === personaId;
}

// --- Editar evento ---
r.patch('/:id', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!ev) return res.status(404).json({ error: 'No encontrado' });
  if (!puedeGestionar(persona_id, ev)) return res.status(403).json({ error: 'No tienes permiso' });
  const { titulo, fecha, hora_inicio, hora_fin, lugar, descripcion } = req.body || {};
  db.prepare('UPDATE evento SET titulo=?, fecha=?, hora_inicio=?, hora_fin=?, lugar=?, descripcion=? WHERE id=?')
    .run(titulo || ev.titulo, fecha || ev.fecha, hora_inicio || null, hora_fin || null, lugar || null, descripcion || null, ev.id);
  auditar(iglesia_id, persona_id, 'editar_evento', 'calendario', ev.titulo);
  res.json({ ok: true });
});

// --- Eliminar evento ---
r.delete('/:id', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!ev) return res.status(404).json({ error: 'No encontrado' });
  if (!puedeGestionar(persona_id, ev)) return res.status(403).json({ error: 'No tienes permiso' });
  db.prepare('DELETE FROM asignacion WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM asistencia WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM setlist_item WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM equipo_musica WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM ensayo WHERE evento_id=?').run(ev.id);
  // El bosquejo del sermón puede vivir sin evento: lo desvinculamos (no lo borramos).
  db.prepare('UPDATE sermon SET evento_id=NULL WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM evento WHERE id=?').run(ev.id);
  auditar(iglesia_id, persona_id, 'eliminar_evento', 'calendario', ev.titulo);
  res.json({ ok: true });
});

export default r;
