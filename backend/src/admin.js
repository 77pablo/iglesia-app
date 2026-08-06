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
    // anonimizada_en viaja para lo mismo pero con las cuentas que su propio
    // titular elimino (ARCO, ver cuenta.js): la vista NO debe adivinarlo del
    // nombre o del usuario ('eliminado_<id>' es solo un texto, una persona
    // real podria llamarse asi).
    'SELECT id, nombre, usuario, email, es_pastor, activo, rol_global, anonimizada_en FROM persona WHERE iglesia_id = ? ORDER BY nombre'
  ).all(ig);
  const roles = db.prepare(
    `SELECT pe.id AS pertenencia_id, pe.persona_id, pe.grupo_id, pe.rol, g.nombre AS grupo
       FROM pertenencia pe JOIN grupo g ON g.id = pe.grupo_id
      WHERE g.iglesia_id = ?`
  ).all(ig);
  const grupos = db.prepare('SELECT id, nombre, color FROM grupo WHERE iglesia_id = ? ORDER BY nombre').all(ig);
  // Adjunta a cada usuario sus roles.
  const porPersona = new Map();
  for (const u of usuarios) {
    u.es_pastor = !!u.es_pastor; u.activo = !!u.activo;
    // Se manda un booleano, no la fecha: la vista solo necesita saber SI esta
    // anonimizada, la fecha exacta no le aporta nada y es un dato de mas.
    u.anonimizada = !!u.anonimizada_en;
    delete u.anonimizada_en;
    u.roles = [];
    porPersona.set(u.id, u);
  }
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

// El candado de verdad contra "resucitar" una cuenta que su propio titular
// elimino (ARCO, ver cuenta.js) va AQUI, en el servidor: esconder botones en
// el frontend es solo acompañamiento, cualquiera puede llamar a la ruta
// directamente con curl/Postman. Se usa en toda escritura que el panel del
// pastor ofrece sobre una persona y que podria reactivarla, devolverle su
// identidad o darle una capacidad nueva (activar, marcar pastor, corregir el
// nombre, restablecer la clave, asignar un rol). Devuelve true (y ya
// respondio) si hay que cortar aqui.
function bloqueaSiAnonimizada(p, res) {
  if (p.anonimizada_en) {
    res.status(403).json({
      error: 'Esta persona eliminó su propia cuenta ejerciendo su derecho a la privacidad. Esa decisión no se puede deshacer desde aquí.'
    });
    return true;
  }
  return false;
}

// --- El registro de actividad (tanda F) ---
// Acciones de acceso/lectura que la pantalla esconde por defecto: un muro de
// inicios de sesion esconde la correccion de dinero que importa. La lista
// vive AQUI (no en la pantalla) y hay un test que exige que cada una siga
// existiendo en el codigo que la escribe — para que no envejezca en silencio.
export const RUTINARIAS = ['login', 'recuperar_password', 'exportar_reporte',
  'exportar_asistencia', 'obispo_resumen', 'obispo_informe'];

r.get('/auditoria', (req, res) => {
  const ig = req.user.iglesia_id;
  const LIMIT = 50;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  // Filtros en la MISMA consulta, acotada por iglesia — no se descarga el
  // registro entero al navegador. Los placeholders se arman desde listas
  // propias, nunca desde texto del query (el modulo viaja como valor, no
  // como SQL).
  const cond = ['a.iglesia_id = ?'];
  const vals = [ig];
  if (String(req.query.todo || '') !== '1') {
    cond.push(`a.accion NOT IN (${RUTINARIAS.map(() => '?').join(',')})`);
    vals.push(...RUTINARIAS);
  }
  if (req.query.persona) { cond.push('a.actor_id = ?'); vals.push(Number(req.query.persona)); }
  if (req.query.modulo) { cond.push('a.modulo = ?'); vals.push(String(req.query.modulo)); }

  // LEFT JOIN como en tesoreria.js:153: la cuenta anonimizada muestra
  // "Usuario eliminado" por su propia fila; un actor sin fila sale null y la
  // pantalla pinta "(cuenta eliminada)". ORDER BY id: la fecha tiene grano de
  // segundo y dos apuntes del mismo segundo quedarian en orden ambiguo.
  const filas = db.prepare(
    `SELECT a.id, a.accion, a.modulo, a.detalle, a.fecha, p.nombre AS actor
       FROM auditoria a LEFT JOIN persona p ON p.id = a.actor_id
      WHERE ${cond.join(' AND ')}
      ORDER BY a.id DESC LIMIT ? OFFSET ?`
  ).all(...vals, LIMIT + 1, offset);
  const hayMas = filas.length > LIMIT;
  const resp = { items: hayMas ? filas.slice(0, LIMIT) : filas, hayMas, offset };

  // Solo con la primera pagina: los datos de los dos selectores (las personas
  // que aparecen en el registro y los modulos que existen), sin viaje extra.
  if (offset === 0) {
    resp.actores = db.prepare(
      `SELECT DISTINCT a.actor_id AS id, p.nombre FROM auditoria a
         JOIN persona p ON p.id = a.actor_id
        WHERE a.iglesia_id = ? ORDER BY p.nombre`
    ).all(ig);
    resp.modulos = db.prepare(
      'SELECT DISTINCT modulo FROM auditoria WHERE iglesia_id = ? AND modulo IS NOT NULL ORDER BY modulo'
    ).all(ig).map(x => x.modulo);
  }
  res.json(resp);
});

// --- Activar/desactivar, marcar/quitar pastor, o corregir el nombre ---
const editarUsuarioSchema = z.object({
  activo: z.boolean().optional(),
  es_pastor: z.boolean().optional(),
  // Nace con esta fase: antes el pastor solo podia activar/desactivar o
  // marcar pastor, nunca corregir un nombre mal escrito de alguien que no
  // puede arreglarselo solo (no entra a la app, o no sabe donde mirar).
  nombre: z.string().trim().min(1, 'falta el nombre')
    .max(120, 'el nombre es demasiado largo (máximo 120 caracteres)').optional()
});
r.patch('/usuarios/:id', validar(editarUsuarioSchema), (req, res) => {
  const ig = req.user.iglesia_id;
  const p = personaDeIglesia(req.params.id, ig);
  if (!p) return res.status(404).json({ error: 'Usuario no encontrado' });
  const yo = req.user.persona_id;

  if (bloqueaSiAnonimizada(p, res)) return;

  // Mismo guardia que el reset de clave de mas abajo, y por la misma razon: el
  // super-admin y el obispo no son miembros de la congregacion, sus cuentas
  // estan por encima del pastor. Sin esto, el pastor podia desactivar al obispo
  // —que se queda fuera de TODAS las iglesias, no solo de esta— o meterle
  // es_pastor. El supervisado no administra al supervisor.
  if (p.rol_global === 'super_admin' || p.rol_global === 'obispo')
    return res.status(403).json({ error: 'Esta cuenta no se administra desde la iglesia' });

  const { activo, es_pastor, nombre } = req.body;
  if (typeof activo === 'boolean') {
    if (p.id === yo && !activo) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
    db.prepare('UPDATE persona SET activo = ? WHERE id = ?').run(activo ? 1 : 0, p.id);
  }
  if (typeof es_pastor === 'boolean') {
    if (p.id === yo && !es_pastor) return res.status(400).json({ error: 'No puedes quitarte a ti mismo el rol de Pastor' });
    db.prepare('UPDATE persona SET es_pastor = ? WHERE id = ?').run(es_pastor ? 1 : 0, p.id);
  }
  // Corregir el nombre de otro: mismo patron de sincronizacion de una linea
  // que ya usa cuenta.js al anonimizar una cuenta eliminada. Se audita aparte
  // (con el nombre viejo y el nuevo) en vez de sumarse al 'editar_usuario' de
  // mas abajo, que no dice QUE cambio.
  // Se compara contra el nombre que ya habia (`p` se leyo ANTES del UPDATE):
  // reenviar el mismo nombre no es una correccion, y anotarlo dejaria en el
  // rastro un `Juan Perez → Juan Perez` que afirma un cambio que nadie hizo.
  if (typeof nombre === 'string' && nombre !== p.nombre) {
    db.prepare('UPDATE persona SET nombre = ? WHERE id = ?').run(nombre, p.id);
    db.prepare('UPDATE aprobacion_log SET actor_nombre = ? WHERE actor_id = ?').run(nombre, p.id);
    auditar(ig, yo, 'corregir_nombre_usuario', 'admin', `${p.nombre} → ${nombre}`);
  }
  // El 'editar_usuario' generico solo tiene sentido cuando de verdad se tocó
  // activo/es_pastor: si el PATCH solo traía nombre, ya quedó auditado arriba
  // con mas detalle (que decia antes, que dice ahora), y duplicarlo aqui solo
  // ensuciaria el log.
  if (typeof activo === 'boolean' || typeof es_pastor === 'boolean') {
    auditar(ig, yo, 'editar_usuario', 'admin', `${p.nombre}`);
  }
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

  if (bloqueaSiAnonimizada(p, res)) return;

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
  if (bloqueaSiAnonimizada(p, res)) return;
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
// Sin guardia de anonimizada a proposito: a diferencia de las rutas de arriba,
// esta SOLO borra datos (nunca reactiva, renombra, ni concede nada nuevo), asi
// que no puede "resucitar" una cuenta eliminada por su titular. Bloquearla
// dejaria pertenencias huerfanas de una cuenta ya eliminada sin forma de
// limpiarlas, que va en contra del mismo espiritu de minimizar datos que pide
// el derecho ARCO.
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

// El color de un grupo es lo que pinta el chip del evento en el calendario que
// ve TODA la iglesia. La UI lo manda desde un <input type="color">, o sea
// siempre #rrggbb, pero la API lo aceptaba como texto libre: un PATCH a mano con
// `red" onmouseover="…` cerraba el atributo style y colaba un manejador. El
// frontend ya lo filtra por forma (safeColor), y aqui esta el segundo candado.
const zColorHex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'el color debe ser un hexadecimal como #2563EB').optional();

// --- Crear grupo ---
const crearGrupoSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre del grupo'),
  color: zColorHex
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
  color: zColorHex
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
