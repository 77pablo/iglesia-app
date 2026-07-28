// ============================================================
//  Administracion (solo el pastor / super-admin)  -  Fase 5.2
//  Crear usuarios, asignar/quitar roles (por grupo), marcar pastor,
//  desactivar cuentas y gestionar los grupos de la iglesia.
//  Todo aislado por iglesia_id.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, esPastor, hashPassword, auditar, generarPasswordTemporal } from './auth.js';
import { validar } from './seguridad.js';

const r = Router();
r.use(authMiddleware);

// ¿Es super-admin? (NO el obispo: el obispo es SOLO LECTURA en todo el sistema,
// ver auth.js modulosVisibles(), que excluye 'admin' del rol obispo. Se comprueba
// aqui en vez de usar esObispo() de auth.js porque esa funcion agrupa obispo +
// super_admin, y eso es justo lo que este gate NO debe hacer.)
function esSuperAdmin(personaId) {
  const p = db.prepare('SELECT rol_global FROM persona WHERE id = ?').get(personaId);
  return !!(p && p.rol_global === 'super_admin');
}

// Solo el pastor o el super-admin entran a Administracion. El obispo NUNCA
// (aunque comparta jerarquia de "solo lectura total" con el super-admin en
// otros modulos, en Administracion no debe poder crear usuarios ni roles).
r.use((req, res, next) => {
  if (esPastor(req.user.persona_id) || esSuperAdmin(req.user.persona_id)) return next();
  return res.status(403).json({ error: 'Solo el pastor puede administrar usuarios y roles.' });
});

// Roles de grupo que el pastor puede asignar (un rol puede tener varios usuarios).
const ROLES_GRUPO = ['admin', 'lider_musica', 'musico', 'lider_ed', 'tesorero', 'miembro'];

// --- Todo lo que la vista necesita en una sola llamada ---
r.get('/datos', (req, res) => {
  const ig = req.user.iglesia_id;
  const usuarios = db.prepare(
    // rol_global viaja para que la vista sepa que cuentas NO administra el
    // pastor (super-admin / obispo): no les ofrece restablecer la contrasena.
    'SELECT id, nombre, usuario, email, es_pastor, activo, rol_global FROM persona WHERE iglesia_id = ? ORDER BY nombre'
  ).all(ig);
  const roles = db.prepare(
    `SELECT pe.id AS pertenencia_id, pe.persona_id, pe.grupo_id, pe.rol, g.nombre AS grupo
       FROM pertenencia pe JOIN grupo g ON g.id = pe.grupo_id
      WHERE g.iglesia_id = ?`
  ).all(ig);
  const grupos = db.prepare('SELECT id, nombre, color FROM grupo WHERE iglesia_id = ? ORDER BY nombre').all(ig);
  // Adjunta a cada usuario sus roles.
  const porPersona = new Map();
  for (const u of usuarios) { u.es_pastor = !!u.es_pastor; u.activo = !!u.activo; u.roles = []; porPersona.set(u.id, u); }
  for (const rl of roles) { const u = porPersona.get(rl.persona_id); if (u) u.roles.push(rl); }
  res.json({ usuarios, grupos, rolesDisponibles: ROLES_GRUPO });
});

// --- Crear usuario ---
const crearUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre'),
  usuario: z.string().trim().min(1, 'falta el usuario'),
  password: z.string().min(4, 'la contraseña debe tener al menos 4 caracteres'),
  email: z.string().trim().email('correo invalido').optional().or(z.literal(''))
});
r.post('/usuarios', validar(crearUsuarioSchema), (req, res) => {
  const ig = req.user.iglesia_id;
  const { nombre, usuario, password, email } = req.body;
  const existe = db.prepare('SELECT 1 FROM persona WHERE iglesia_id = ? AND usuario = ?').get(ig, usuario);
  if (existe) return res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario' });
  // El pastor pone una contrasena TEMPORAL: la cuenta exige cambiarla en el primer ingreso.
  const info = db.prepare(
    'INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, email, es_pastor, activo, debe_cambiar_pass) VALUES (?,?,?,?,?,0,1,1)'
  ).run(ig, usuario, nombre, hashPassword(String(password)), email ? String(email).trim() : null);
  auditar(ig, req.user.persona_id, 'crear_usuario', 'admin', `${nombre} (${usuario})`);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// Busca una persona DE LA MISMA iglesia (evita tocar otra congregacion).
function personaDeIglesia(id, ig) {
  return db.prepare('SELECT * FROM persona WHERE id = ? AND iglesia_id = ?').get(id, ig);
}

// --- Activar/desactivar o marcar/quitar pastor ---
const editarUsuarioSchema = z.object({
  activo: z.boolean().optional(),
  es_pastor: z.boolean().optional()
});
r.patch('/usuarios/:id', validar(editarUsuarioSchema), (req, res) => {
  const ig = req.user.iglesia_id;
  const p = personaDeIglesia(req.params.id, ig);
  if (!p) return res.status(404).json({ error: 'Usuario no encontrado' });
  const yo = req.user.persona_id;
  const { activo, es_pastor } = req.body;
  if (typeof activo === 'boolean') {
    if (p.id === yo && !activo) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
    db.prepare('UPDATE persona SET activo = ? WHERE id = ?').run(activo ? 1 : 0, p.id);
  }
  if (typeof es_pastor === 'boolean') {
    if (p.id === yo && !es_pastor) return res.status(400).json({ error: 'No puedes quitarte a ti mismo el rol de Pastor' });
    db.prepare('UPDATE persona SET es_pastor = ? WHERE id = ?').run(es_pastor ? 1 : 0, p.id);
  }
  auditar(ig, yo, 'editar_usuario', 'admin', `${p.nombre}`);
  res.json({ ok: true });
});

// --- Restablecer la contrasena de un miembro (clave TEMPORAL) ---
// Sin SMTP configurado, quien olvida su clave queda fuera de la app para
// siempre: la recuperacion por correo (cuenta.js) no puede funcionar. Aqui el
// pastor genera una clave temporal ALEATORIA, se la dicta al miembro, y la
// cuenta queda con debe_cambiar_pass=1 para obligarlo a cambiarla al entrar.
// La clave se devuelve UNA sola vez: no se guarda en claro ni se puede volver
// a consultar (en la BD solo queda el hash, y en la auditoria solo el nombre).
const idParamSchema = z.object({
  id: z.coerce.number().int().positive('usuario invalido')
});
r.post('/usuarios/:id/clave', validar(idParamSchema, 'params'), (req, res) => {
  const ig = req.user.iglesia_id;
  const yo = req.user.persona_id;
  // Acotado por iglesia_id: alguien de otra congregacion da 404, NO 403
  // (un 403 confirmaria que esa cuenta existe).
  const p = personaDeIglesia(req.params.id, ig);
  if (!p) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Para la propia clave esta "Cambiar mi contraseña" (cuenta.js), que exige la
  // actual. Si el pastor pudiera resetearse por aqui, cualquiera con su sesion
  // abierta (telefono desbloqueado) se la cambiaria sin conocer la anterior.
  if (p.id === yo)
    return res.status(400).json({ error: 'Para cambiar tu propia contraseña usa "Cambiar mi contraseña" en Ajustes' });

  // El super-admin y el obispo NO son miembros de la congregacion: sus cuentas
  // estan por encima del pastor y no se administran desde aqui.
  if (p.rol_global === 'super_admin' || p.rol_global === 'obispo')
    return res.status(403).json({ error: 'Esta cuenta no se administra desde la iglesia' });

  const temporal = generarPasswordTemporal();
  db.prepare('UPDATE persona SET password_hash = ?, debe_cambiar_pass = 1 WHERE id = ?')
    .run(hashPassword(temporal), p.id);
  // La auditoria NUNCA registra la clave, solo a quien se le restablecio.
  auditar(ig, yo, 'reset_password_usuario', 'admin', `${p.nombre} (${p.usuario})`);
  res.json({
    ok: true,
    usuario: { id: p.id, nombre: p.nombre, usuario: p.usuario },
    password_temporal: temporal
  });
});

// --- Asignar un rol (en un grupo) a un usuario ---
const asignarRolSchema = z.object({
  grupo_id: z.coerce.number().int().positive('grupo invalido'),
  rol: z.enum(ROLES_GRUPO)
});
r.post('/usuarios/:id/rol', validar(asignarRolSchema), (req, res) => {
  const ig = req.user.iglesia_id;
  const p = personaDeIglesia(req.params.id, ig);
  if (!p) return res.status(404).json({ error: 'Usuario no encontrado' });
  const { grupo_id, rol } = req.body;
  const g = db.prepare('SELECT id, nombre FROM grupo WHERE id = ? AND iglesia_id = ?').get(grupo_id, ig);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  try {
    db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(p.id, g.id, rol);
  } catch {
    return res.status(409).json({ error: 'Ese usuario ya tiene ese rol en ese grupo' });
  }
  // Avisa a la persona que recibio un rol nuevo.
  db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
    .run(p.id, 'admin', '🔑 Nuevo rol asignado', `Ahora eres ${rol.replace('_', ' ')} en ${g.nombre}.`);
  auditar(ig, req.user.persona_id, 'asignar_rol', 'admin', `${p.nombre}: ${rol} en ${g.nombre}`);
  res.json({ ok: true });
});

// --- Quitar un rol (pertenencia) ---
r.delete('/rol/:pertenenciaId', (req, res) => {
  const ig = req.user.iglesia_id;
  // Solo si la pertenencia es de un grupo de esta iglesia.
  const info = db.prepare(
    `DELETE FROM pertenencia WHERE id = ? AND grupo_id IN (SELECT id FROM grupo WHERE iglesia_id = ?)`
  ).run(req.params.pertenenciaId, ig);
  if (info.changes === 0) return res.status(404).json({ error: 'Rol no encontrado' });
  auditar(ig, req.user.persona_id, 'quitar_rol', 'admin', `pertenencia ${req.params.pertenenciaId}`);
  res.json({ ok: true });
});

// --- Crear grupo ---
const crearGrupoSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre del grupo'),
  color: z.string().trim().optional()
});
r.post('/grupos', validar(crearGrupoSchema), (req, res) => {
  const ig = req.user.iglesia_id;
  const { nombre, color } = req.body;
  const info = db.prepare('INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?,?,?)').run(ig, nombre, color || null);
  auditar(ig, req.user.persona_id, 'crear_grupo', 'admin', nombre);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// --- Editar grupo (nombre / color) ---
const editarGrupoSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  color: z.string().trim().optional()
});
r.patch('/grupos/:id', validar(editarGrupoSchema), (req, res) => {
  const ig = req.user.iglesia_id;
  const g = db.prepare('SELECT * FROM grupo WHERE id = ? AND iglesia_id = ?').get(req.params.id, ig);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  const { nombre, color } = req.body;
  db.prepare('UPDATE grupo SET nombre = ?, color = ? WHERE id = ?')
    .run(nombre != null ? nombre : g.nombre, color != null ? color : g.color, g.id);
  auditar(ig, req.user.persona_id, 'editar_grupo', 'admin', g.nombre);
  res.json({ ok: true });
});

export default r;
