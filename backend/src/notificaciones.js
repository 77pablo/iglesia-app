// ============================================================
//  Notificaciones (centro de avisos in-app)  -  Fase 1B
//  Fase 4.1: segmentacion por canal/grupo/rol.
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esLiderOAdmin } from './auth.js';

const r = Router();

// ============================================================
//  SEGMENTACION (Fase 4.1)
//  Un segmento describe a QUIEN va dirigido un aviso dentro de la iglesia:
//   { tipo:'todos' }                -> todos los activos de la iglesia
//   { tipo:'grupo', grupo_id }      -> miembros (cualquier rol) de ese grupo
//   { tipo:'rol',   rol }           -> personas con ese rol en cualquier grupo
//  Siempre se filtra por iglesia_id (aislamiento multi-iglesia).
// ============================================================
export function personasDeSegmento(iglesiaId, segmento) {
  const seg = segmento || { tipo: 'todos' };
  if (seg.tipo === 'grupo' && seg.grupo_id) {
    // El grupo debe pertenecer a la iglesia (evita filtrar a otra congregacion).
    const g = db.prepare('SELECT id FROM grupo WHERE id = ? AND iglesia_id = ?').get(seg.grupo_id, iglesiaId);
    if (!g) return [];
    return db.prepare(
      `SELECT DISTINCT p.id FROM persona p
         JOIN pertenencia pe ON pe.persona_id = p.id
        WHERE pe.grupo_id = ? AND p.iglesia_id = ? AND p.activo = 1`
    ).all(seg.grupo_id, iglesiaId).map(x => x.id);
  }
  if (seg.tipo === 'rol' && seg.rol) {
    return db.prepare(
      `SELECT DISTINCT p.id FROM persona p
         JOIN pertenencia pe ON pe.persona_id = p.id
        WHERE pe.rol = ? AND p.iglesia_id = ? AND p.activo = 1`
    ).all(seg.rol, iglesiaId).map(x => x.id);
  }
  // Por defecto: toda la iglesia
  return db.prepare('SELECT id FROM persona WHERE iglesia_id = ? AND activo = 1').all(iglesiaId).map(x => x.id);
}

// Inserta una notificacion in-app a cada persona del segmento.
// (En produccion, aqui ademas se enviaria el push real a sus dispositivos.)
export function notificarSegmento(iglesiaId, segmento, tipo, titulo, texto) {
  const ids = personasDeSegmento(iglesiaId, segmento);
  const stmt = db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)');
  for (const id of ids) stmt.run(id, tipo, titulo, texto);
  return ids.length;
}

// Etiqueta legible de un segmento (para auditoria / UI).
export function etiquetaSegmento(iglesiaId, segmento) {
  const seg = segmento || { tipo: 'todos' };
  if (seg.tipo === 'grupo' && seg.grupo_id) {
    const g = db.prepare('SELECT nombre FROM grupo WHERE id = ? AND iglesia_id = ?').get(seg.grupo_id, iglesiaId);
    return g ? `Grupo: ${g.nombre}` : 'Grupo';
  }
  if (seg.tipo === 'rol' && seg.rol) return `Rol: ${seg.rol}`;
  return 'Toda la iglesia';
}

r.use(authMiddleware);

// --- Segmentos disponibles para dirigir un aviso (para los selectores de la UI) ---
// Devuelve los grupos de la iglesia y los roles conocidos.
r.get('/segmentos', (req, res) => {
  const grupos = db.prepare('SELECT id, nombre FROM grupo WHERE iglesia_id = ? ORDER BY nombre')
    .all(req.user.iglesia_id);
  const roles = ['admin', 'lider_musica', 'lider_ed', 'tesorero', 'musico', 'miembro'];
  res.json({ grupos, roles });
});

// --- Mis notificaciones (paginadas) + cuántas sin leer ---
// query opcional: ?offset=0  (devuelve hayMas para "ver más")
r.get('/', (req, res) => {
  const LIMIT = 50;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  // Pedimos LIMIT+1 para saber si quedan más sin un COUNT extra.
  const rows = db.prepare(
    'SELECT * FROM notificacion WHERE persona_id = ? ORDER BY fecha DESC LIMIT ? OFFSET ?'
  ).all(req.user.persona_id, LIMIT + 1, offset);
  const hayMas = rows.length > LIMIT;
  const items = hayMas ? rows.slice(0, LIMIT) : rows;
  const noLeidas = db.prepare(
    'SELECT COUNT(*) AS n FROM notificacion WHERE persona_id = ? AND leida = 0'
  ).get(req.user.persona_id).n;
  res.json({ items, noLeidas, hayMas, offset });
});

// --- Enviar una notificacion segmentada (solo lider/pastor) ---
// body: { titulo, texto, segmento:{tipo,grupo_id?,rol?} }
r.post('/segmentada', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  if (!esLiderOAdmin(persona_id))
    return res.status(403).json({ error: 'No tienes permiso para enviar avisos' });
  const { titulo, texto, segmento } = req.body || {};
  if (!titulo) return res.status(400).json({ error: 'Falta el título' });
  const n = notificarSegmento(iglesia_id, segmento, 'aviso', '🔔 ' + titulo, texto || '');
  res.json({ ok: true, enviadas: n, destino: etiquetaSegmento(iglesia_id, segmento) });
});

// --- Marcar todas como leídas ---
r.patch('/leer', (req, res) => {
  db.prepare('UPDATE notificacion SET leida = 1 WHERE persona_id = ?').run(req.user.persona_id);
  res.json({ ok: true });
});

export default r;
