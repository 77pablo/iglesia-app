// ============================================================
//  Modulo A: Calendario + Eventos  -  Fase 1B
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import {
  authMiddleware, esPastor, esAdminDeGrupo, esEncargadoGrupo, veCalendarioCompleto,
  gruposDeUsuario, auditar
} from './auth.js';
import { enviarPush } from './push.js';
import { validar } from './seguridad.js';

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
const crearEventoSchema = z.object({
  grupo_id: z.coerce.number().int().positive('falta el grupo'),
  titulo: z.string().trim().min(1, 'falta el titulo'),
  fecha: z.string().trim().min(1, 'falta la fecha'),
  hora_inicio: z.string().trim().optional(),
  hora_fin: z.string().trim().optional(),
  lugar: z.string().trim().optional(),
  descripcion: z.string().trim().optional()
});
r.post('/', validar(crearEventoSchema), (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const { grupo_id, titulo, fecha, hora_inicio, hora_fin, lugar, descripcion } = req.body;

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
  limpiarSolicitud(ev);
  registrarAprobacion(req, ev, 'aprobado');
  auditar(req.user.iglesia_id, req.user.persona_id, 'aprobar_fecha', 'calendario', ev.titulo);
  res.json({ ok: true });
});

const rechazarEventoSchema = z.object({
  motivo: z.string().trim().optional()
});
r.patch('/:id/rechazar', validar(rechazarEventoSchema), (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'No encontrado' });
  const motivo = req.body.motivo;
  db.prepare("UPDATE evento SET estado = 'rechazado' WHERE id = ?").run(ev.id);
  if (ev.creado_por) {
    db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
      .run(ev.creado_por, 'aprobacion', '🔴 Tu fecha fue rechazada', ev.titulo + (motivo ? ' · ' + motivo : ''));
    enviarPush([ev.creado_por], { titulo: '🔴 Tu fecha fue rechazada', texto: ev.titulo + (motivo ? ' · ' + motivo : '') }).catch(() => {});
  }
  limpiarSolicitud(ev);
  registrarAprobacion(req, ev, 'rechazado', motivo);
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
  // Mismo criterio de visibilidad que el listado: quien no ve el calendario
  // completo solo puede ver el detalle de eventos ya aprobados (evita
  // enumerar ids para leer solicitudes pendientes/rechazadas ajenas).
  if (ev.estado !== 'aprobado' && !veCalendarioCompleto(req.user.persona_id))
    return res.status(404).json({ error: 'Evento no encontrado' });
  res.json(ev);
});

// ¿Puede gestionar (editar/borrar) este evento?
//  - Si YA está APROBADO: solo el pastor (la fecha quedó confirmada en el calendario).
//  - Si está pendiente/rechazado: el encargado del grupo o quien lo creó.
function puedeGestionar(personaId, ev) {
  if (ev.estado === 'aprobado') return esPastor(personaId);
  return esEncargadoGrupo(personaId, ev.grupo_id) || ev.creado_por === personaId;
}
// Borrar es mas permisivo: el pastor puede ELIMINAR cualquier evento
// (aprobado/rechazado/pendiente), util para limpiar el calendario.
function puedeBorrar(personaId, ev) {
  if (esPastor(personaId)) return true;
  return esEncargadoGrupo(personaId, ev.grupo_id) || ev.creado_por === personaId;
}
// Quita la notificacion-solicitud ("Revisar y aprobar") cuando la fecha ya se
// resolvio o se borro, para que no quede activa.
function limpiarSolicitud(ev) {
  // La tabla notificacion no tiene iglesia_id: filtramos por persona_id
  // perteneciente a la iglesia del evento para no borrar avisos de otra
  // iglesia que coincidan en titulo+fecha (ver auditoria backend.md #6).
  db.prepare(
    `DELETE FROM notificacion WHERE tipo='aprobacion' AND titulo='Solicitud de fecha' AND texto = ?
       AND persona_id IN (SELECT id FROM persona WHERE iglesia_id = ?)`
  ).run(ev.titulo + ' · ' + ev.fecha, ev.iglesia_id);
}
// Registra en el historial de aprobaciones/rechazos del pastor.
function registrarAprobacion(req, ev, accion, motivo) {
  const actor = db.prepare('SELECT nombre FROM persona WHERE id = ?').get(req.user.persona_id);
  const grupo = ev.grupo_id ? (db.prepare('SELECT nombre FROM grupo WHERE id = ?').get(ev.grupo_id) || {}).nombre : null;
  db.prepare(`INSERT INTO aprobacion_log (iglesia_id, evento_titulo, fecha_evento, grupo, accion, motivo, actor_id, actor_nombre)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(req.user.iglesia_id, ev.titulo, ev.fecha, grupo, accion, motivo || null, req.user.persona_id, actor ? actor.nombre : null);
}

// --- Historial de aprobaciones/rechazos (pastor) ---
r.get('/historial/aprobaciones', (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  res.json(db.prepare(
    'SELECT * FROM aprobacion_log WHERE iglesia_id = ? ORDER BY id DESC LIMIT 100'
  ).all(req.user.iglesia_id));
});

// --- Editar evento ---
const editarEventoSchema = z.object({
  titulo: z.string().trim().optional(),
  fecha: z.string().trim().optional(),
  hora_inicio: z.string().trim().optional(),
  hora_fin: z.string().trim().optional(),
  lugar: z.string().trim().optional(),
  descripcion: z.string().trim().optional()
});
r.patch('/:id', validar(editarEventoSchema), (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!ev) return res.status(404).json({ error: 'No encontrado' });
  if (!puedeGestionar(persona_id, ev)) return res.status(403).json({ error: 'No tienes permiso' });
  const { titulo, fecha, hora_inicio, hora_fin, lugar, descripcion } = req.body;
  // PATCH parcial: un campo ausente (undefined) conserva el valor actual,
  // no lo borra (ver auditoria backend.md #3).
  db.prepare('UPDATE evento SET titulo=?, fecha=?, hora_inicio=?, hora_fin=?, lugar=?, descripcion=? WHERE id=?')
    .run(
      titulo ?? ev.titulo,
      fecha ?? ev.fecha,
      hora_inicio ?? ev.hora_inicio,
      hora_fin ?? ev.hora_fin,
      lugar ?? ev.lugar,
      descripcion ?? ev.descripcion,
      ev.id
    );
  auditar(iglesia_id, persona_id, 'editar_evento', 'calendario', ev.titulo);
  res.json({ ok: true });
});

// --- Eliminar evento ---
r.delete('/:id', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const ev = db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!ev) return res.status(404).json({ error: 'No encontrado' });
  if (!puedeBorrar(persona_id, ev)) return res.status(403).json({ error: 'No tienes permiso' });
  db.prepare('DELETE FROM asignacion WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM asistencia WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM setlist_item WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM equipo_musica WHERE evento_id=?').run(ev.id);
  db.prepare('DELETE FROM ensayo WHERE evento_id=?').run(ev.id);
  // El bosquejo del sermón puede vivir sin evento: lo desvinculamos (no lo borramos).
  db.prepare('UPDATE sermon SET evento_id=NULL WHERE evento_id=?').run(ev.id);
  limpiarSolicitud(ev);   // quita la notificación "Revisar y aprobar" si seguía activa
  db.prepare('DELETE FROM evento WHERE id=?').run(ev.id);
  auditar(iglesia_id, persona_id, 'eliminar_evento', 'calendario', ev.titulo);
  res.json({ ok: true });
});

export default r;
