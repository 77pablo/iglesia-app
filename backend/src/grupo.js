// ============================================================
//  Fase 4.7: "Mi Grupo" — centro del líder de cuerpo (ej. Jóvenes)
//  El líder comparte links/archivos, publica avisos/recordatorios,
//  avisa a uno o a todos, y agrega/quita miembros.
//  Ver: miembros del grupo + el pastor (observa). Editar: el líder.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, esEncargadoGrupo, esPastor, auditar } from './auth.js';
import { enviarPush } from './push.js';
import { validar } from './seguridad.js';

const r = Router();
r.use(authMiddleware);

function grupoDeIglesia(gid, iglesiaId) {
  return db.prepare('SELECT * FROM grupo WHERE id = ? AND iglesia_id = ?').get(gid, iglesiaId);
}
function esMiembro(personaId, grupoId) {
  return !!db.prepare('SELECT 1 FROM pertenencia WHERE persona_id = ? AND grupo_id = ?').get(personaId, grupoId);
}
function puedeVer(personaId, grupoId) {
  return esMiembro(personaId, grupoId) || esPastor(personaId);
}
function notificar(personaId, titulo, texto) {
  db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
    .run(personaId, 'grupo', titulo, texto || '');
  enviarPush([personaId], { titulo, texto: texto || '' }).catch(() => {});
}
function miembrosIds(grupoId) {
  return db.prepare('SELECT DISTINCT persona_id FROM pertenencia WHERE grupo_id = ?').all(grupoId).map(x => x.persona_id);
}

// --- Grupos a los que pertenezco (con bandera de si soy líder) ---
r.get('/mis', (req, res) => {
  const rows = db.prepare(
    `SELECT g.id, g.nombre, g.color, g.drive_url,
            MAX(CASE WHEN pe.rol IN ('admin','lider_musica','lider_ed') THEN 1 ELSE 0 END) AS soyLider
       FROM grupo g JOIN pertenencia pe ON pe.grupo_id = g.id
      WHERE pe.persona_id = ? AND g.iglesia_id = ?
      GROUP BY g.id ORDER BY g.nombre`
  ).all(req.user.persona_id, req.user.iglesia_id);
  res.json(rows.map(x => ({ id: x.id, nombre: x.nombre, color: x.color, drive_url: x.drive_url || '', soyLider: !!x.soyLider })));
});

// --- Vincular / actualizar la carpeta de Google Drive del grupo (solo el líder) ---
const driveSchema = z.object({
  url: z.string().trim().refine(u => u === '' || /^https?:\/\//i.test(u), 'Pega un enlace válido (https://…)').optional()
});
r.post('/:gid/drive', validar(driveSchema), (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!esEncargadoGrupo(req.user.persona_id, g.id)) return res.status(403).json({ error: 'Solo el líder del grupo' });
  const url = String(req.body.url || '').trim();
  db.prepare('UPDATE grupo SET drive_url = ? WHERE id = ?').run(url || null, g.id);
  auditar(req.user.iglesia_id, req.user.persona_id, 'grupo_drive', 'grupo', g.nombre);
  res.json({ ok: true });
});

// --- Miembros del grupo ---
r.get('/:gid/miembros', (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!puedeVer(req.user.persona_id, g.id)) return res.status(403).json({ error: 'No perteneces a este grupo' });
  const miembros = db.prepare(
    `SELECT p.id, p.nombre, GROUP_CONCAT(pe.rol) AS roles
       FROM persona p JOIN pertenencia pe ON pe.persona_id = p.id
      WHERE pe.grupo_id = ? AND p.activo = 1 GROUP BY p.id ORDER BY p.nombre`
  ).all(g.id);
  res.json(miembros.map(m => ({ id: m.id, nombre: m.nombre, esLider: /admin|lider_/.test(m.roles || '') })));
});

// --- Personas de la iglesia que NO están en el grupo (para agregar) ---
r.get('/:gid/candidatos', (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!esEncargadoGrupo(req.user.persona_id, g.id)) return res.status(403).json({ error: 'Solo el líder del grupo' });
  const libres = db.prepare(
    `SELECT id, nombre FROM persona WHERE iglesia_id = ? AND activo = 1
        AND id NOT IN (SELECT persona_id FROM pertenencia WHERE grupo_id = ?) ORDER BY nombre`
  ).all(req.user.iglesia_id, g.id);
  res.json(libres);
});

// --- Agregar un miembro (+ aviso a la persona) ---
const miembroSchema = z.object({
  persona_id: z.coerce.number().int().positive('falta la persona')
});
r.post('/:gid/miembros', validar(miembroSchema), (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!esEncargadoGrupo(req.user.persona_id, g.id)) return res.status(403).json({ error: 'Solo el líder del grupo' });
  const p = db.prepare('SELECT id, nombre FROM persona WHERE id = ? AND iglesia_id = ? AND activo = 1')
    .get(req.body.persona_id, req.user.iglesia_id);
  if (!p) return res.status(404).json({ error: 'Persona no encontrada en tu iglesia' });
  try {
    db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'miembro')").run(p.id, g.id);
  } catch {
    return res.status(409).json({ error: 'Esa persona ya está en el grupo' });
  }
  notificar(p.id, '👋 Te uniste a ' + g.nombre, 'Ahora eres parte del grupo ' + g.nombre + '.');
  auditar(req.user.iglesia_id, req.user.persona_id, 'grupo_add_miembro', 'grupo', `${p.nombre} → ${g.nombre}`);
  res.json({ ok: true });
});

// --- Quitar un miembro (solo el rol 'miembro'; nunca quita a un líder) ---
r.delete('/:gid/miembros/:pid', (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!esEncargadoGrupo(req.user.persona_id, g.id)) return res.status(403).json({ error: 'Solo el líder del grupo' });
  const info = db.prepare("DELETE FROM pertenencia WHERE persona_id = ? AND grupo_id = ? AND rol = 'miembro'")
    .run(req.params.pid, g.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No es miembro del grupo (o es un líder)' });
  auditar(req.user.iglesia_id, req.user.persona_id, 'grupo_quita_miembro', 'grupo', String(req.params.pid));
  res.json({ ok: true });
});

// --- Recursos (links / archivos) ---
r.get('/:gid/recursos', (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!puedeVer(req.user.persona_id, g.id)) return res.status(403).json({ error: 'No perteneces a este grupo' });
  res.json(db.prepare('SELECT id, tipo, titulo, url, creado_en FROM recurso_grupo WHERE grupo_id = ? ORDER BY creado_en DESC').all(g.id));
});
const recursoSchema = z.object({
  tipo: z.string().trim().optional(),
  titulo: z.string().trim().min(1, 'falta el titulo'),
  url: z.string().trim().min(1, 'falta el enlace/archivo')
});
r.post('/:gid/recursos', validar(recursoSchema), (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!esEncargadoGrupo(req.user.persona_id, g.id)) return res.status(403).json({ error: 'Solo el líder del grupo' });
  const { tipo, titulo, url } = req.body;
  db.prepare('INSERT INTO recurso_grupo (iglesia_id, grupo_id, tipo, titulo, url, creado_por) VALUES (?,?,?,?,?,?)')
    .run(req.user.iglesia_id, g.id, tipo === 'archivo' ? 'archivo' : 'link', String(titulo).trim(), url, req.user.persona_id);
  auditar(req.user.iglesia_id, req.user.persona_id, 'grupo_recurso_add', 'grupo', String(titulo).trim());
  res.json({ ok: true });
});
r.delete('/:gid/recursos/:id', (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!esEncargadoGrupo(req.user.persona_id, g.id)) return res.status(403).json({ error: 'Solo el líder del grupo' });
  const info = db.prepare('DELETE FROM recurso_grupo WHERE id = ? AND grupo_id = ?').run(req.params.id, g.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

// --- Avisos / recordatorios (board del grupo, notifica a todos los miembros) ---
r.get('/:gid/avisos', (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!puedeVer(req.user.persona_id, g.id)) return res.status(403).json({ error: 'No perteneces a este grupo' });
  res.json(db.prepare('SELECT id, tipo, titulo, texto, fecha, creado_en FROM aviso_grupo WHERE grupo_id = ? ORDER BY creado_en DESC').all(g.id));
});
const avisoSchema = z.object({
  tipo: z.string().trim().optional(),
  titulo: z.string().trim().min(1, 'falta el titulo'),
  texto: z.string().trim().optional(),
  fecha: z.string().trim().optional()
});
r.post('/:gid/avisos', validar(avisoSchema), (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!esEncargadoGrupo(req.user.persona_id, g.id)) return res.status(403).json({ error: 'Solo el líder del grupo' });
  const { tipo, titulo, texto, fecha } = req.body;
  const t = tipo === 'recordatorio' ? 'recordatorio' : 'aviso';
  db.prepare('INSERT INTO aviso_grupo (iglesia_id, grupo_id, tipo, titulo, texto, fecha, creado_por) VALUES (?,?,?,?,?,?,?)')
    .run(req.user.iglesia_id, g.id, t, String(titulo).trim(), texto || null, fecha || null, req.user.persona_id);
  // Notificar a todo el grupo
  const icono = t === 'recordatorio' ? '⏰' : '📢';
  const ids = miembrosIds(g.id);
  for (const pid of ids) notificar(pid, `${icono} ${g.nombre}: ${String(titulo).trim()}`, (texto || '') + (fecha ? ' · ' + fecha : ''));
  auditar(req.user.iglesia_id, req.user.persona_id, 'grupo_aviso', 'grupo', `${t}: ${String(titulo).trim()} (${ids.length})`);
  res.json({ ok: true, avisados: ids.length });
});
r.delete('/:gid/avisos/:id', (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!esEncargadoGrupo(req.user.persona_id, g.id)) return res.status(403).json({ error: 'Solo el líder del grupo' });
  const info = db.prepare('DELETE FROM aviso_grupo WHERE id = ? AND grupo_id = ?').run(req.params.id, g.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

// --- Avisar directo: a UN miembro o a TODOS (solo notificación, sin board) ---
const avisarSchema = z.object({
  persona_id: z.coerce.number().int().positive().optional(),
  titulo: z.string().trim().min(1, 'falta el mensaje'),
  texto: z.string().trim().optional()
});
r.post('/:gid/avisar', validar(avisarSchema), (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!esEncargadoGrupo(req.user.persona_id, g.id)) return res.status(403).json({ error: 'Solo el líder del grupo' });
  const { persona_id, titulo, texto } = req.body;
  let destinos;
  if (persona_id) {
    if (!esMiembro(persona_id, g.id)) return res.status(400).json({ error: 'Esa persona no es del grupo' });
    destinos = [Number(persona_id)];
  } else {
    destinos = miembrosIds(g.id);
  }
  for (const pid of destinos) notificar(pid, `💬 ${g.nombre}: ${String(titulo).trim()}`, texto || '');
  auditar(req.user.iglesia_id, req.user.persona_id, 'grupo_avisar', 'grupo', `${persona_id ? '1 persona' : 'todos'}: ${String(titulo).trim()}`);
  res.json({ ok: true, avisados: destinos.length });
});

// --- Tareas asignadas a un miembro (aparecen en "Mi Servicio") ---
r.get('/:gid/tareas', (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!esEncargadoGrupo(req.user.persona_id, g.id)) return res.status(403).json({ error: 'Solo el líder del grupo' });
  res.json(db.prepare(
    `SELECT t.id, t.titulo, t.detalle, t.estado, t.persona_id, p.nombre
       FROM tarea_grupo t JOIN persona p ON p.id = t.persona_id
      WHERE t.grupo_id = ? ORDER BY (t.estado='hecho'), t.creado_en DESC`
  ).all(g.id));
});
const tareaSchema = z.object({
  persona_id: z.coerce.number().int().positive('falta la persona'),
  titulo: z.string().trim().min(1, 'falta el titulo de la tarea'),
  detalle: z.string().trim().optional()
});
r.post('/:gid/tareas', validar(tareaSchema), (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!esEncargadoGrupo(req.user.persona_id, g.id)) return res.status(403).json({ error: 'Solo el líder del grupo' });
  const { persona_id, titulo, detalle } = req.body;
  if (!esMiembro(persona_id, g.id)) return res.status(400).json({ error: 'Esa persona no es del grupo' });
  db.prepare('INSERT INTO tarea_grupo (iglesia_id, grupo_id, persona_id, titulo, detalle, creado_por) VALUES (?,?,?,?,?,?)')
    .run(req.user.iglesia_id, g.id, persona_id, String(titulo).trim(), detalle || null, req.user.persona_id);
  notificar(persona_id, `📋 Nueva tarea (${g.nombre})`, String(titulo).trim());
  auditar(req.user.iglesia_id, req.user.persona_id, 'grupo_tarea', 'grupo', String(titulo).trim());
  res.json({ ok: true });
});
r.delete('/:gid/tareas/:tid', (req, res) => {
  const g = grupoDeIglesia(req.params.gid, req.user.iglesia_id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!esEncargadoGrupo(req.user.persona_id, g.id)) return res.status(403).json({ error: 'Solo el líder del grupo' });
  const info = db.prepare('DELETE FROM tarea_grupo WHERE id = ? AND grupo_id = ?').run(req.params.tid, g.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrada' });
  res.json({ ok: true });
});

// --- MIS tareas (para "Mi Servicio") + marcar hecho ---
r.get('/mis-tareas', (req, res) => {
  res.json(db.prepare(
    `SELECT t.id, t.titulo, t.detalle, t.estado, t.grupo_id, g.nombre AS grupo
       FROM tarea_grupo t JOIN grupo g ON g.id = t.grupo_id
      WHERE t.persona_id = ? AND t.iglesia_id = ? ORDER BY (t.estado='hecho'), t.creado_en DESC`
  ).all(req.user.persona_id, req.user.iglesia_id));
});
r.patch('/tareas/:tid/hecho', (req, res) => {
  const info = db.prepare("UPDATE tarea_grupo SET estado = 'hecho' WHERE id = ? AND persona_id = ? AND iglesia_id = ?")
    .run(req.params.tid, req.user.persona_id, req.user.iglesia_id);
  if (info.changes === 0) return res.status(404).json({ error: 'No es tu tarea' });
  res.json({ ok: true });
});

export default r;
