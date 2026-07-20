// ============================================================
//  Autenticacion + roles  -  Fase 1A.3 y 1A.4
//  Login en 3 pasos (iglesia -> usuario -> contrasena),
//  token JWT, jerarquia y modulos visibles por rol.
// ============================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';

// Variables de entorno REQUERIDAS en produccion. Si falta alguna, la app
// NO debe iniciar (evita secretos por defecto conocidos en produccion).
// En desarrollo se permite un fallback solo para facilitar las pruebas locales.
const REQUERIDAS_PRODUCCION = ['JWT_SECRET'];
if (process.env.NODE_ENV === 'production') {
  const faltan = REQUERIDAS_PRODUCCION.filter(v => !process.env[v]);
  if (faltan.length) {
    throw new Error(
      `[seguridad] Faltan variables de entorno requeridas en produccion: ${faltan.join(', ')}. ` +
      'Definelas antes de arrancar (no se usan valores por defecto en produccion).'
    );
  }
}
const SECRET = process.env.JWT_SECRET || 'dev-solo-local-cambia-esto';

export function hashPassword(plano) {
  return bcrypt.hashSync(plano, 10);
}
export function verifyPassword(plano, hash) {
  return bcrypt.compareSync(plano, hash);
}

// --- LOGIN EN 3 PASOS ---
// Recibe: codigo o nombre de iglesia, usuario, contrasena.
// Devuelve: { token, persona } o lanza Error.
export function login(iglesiaRef, usuario, password) {
  const iglesia = db.prepare(
    'SELECT * FROM iglesia WHERE codigo_unico = ? OR lower(nombre) = lower(?)'
  ).get(iglesiaRef, iglesiaRef);
  if (!iglesia) throw new Error('Iglesia no encontrada');

  const persona = db.prepare(
    'SELECT * FROM persona WHERE iglesia_id = ? AND usuario = ? AND activo = 1'
  ).get(iglesia.id, usuario);
  if (!persona) throw new Error('Usuario o contrasena incorrectos');

  if (!verifyPassword(password, persona.password_hash))
    throw new Error('Usuario o contrasena incorrectos');

  const token = signToken(persona);
  return { token, persona: perfilPublico(persona) };
}

export function signToken(persona) {
  return jwt.sign(
    { persona_id: persona.id, iglesia_id: persona.iglesia_id },
    SECRET,
    { expiresIn: '30d' }
  );
}

// --- ROLES Y JERARQUIA ---
// Junta el rol global + pastor + las pertenencias de la persona.
export function getRoles(personaId) {
  const p = db.prepare('SELECT * FROM persona WHERE id = ?').get(personaId);
  const pertenencias = db.prepare(
    `SELECT pe.rol, g.id AS grupo_id, g.nombre AS grupo
       FROM pertenencia pe JOIN grupo g ON g.id = pe.grupo_id
      WHERE pe.persona_id = ?`
  ).all(personaId);
  return {
    rol_global: p.rol_global,        // super_admin | obispo | null
    es_pastor: !!p.es_pastor,
    pertenencias                      // [{rol, grupo_id, grupo}]
  };
}

// --- MODULOS VISIBLES POR ROL (visibilidad de la matriz) ---
export function modulosVisibles(personaId) {
  const r = getRoles(personaId);
  const mods = new Set(['inicio', 'mi_servicio', 'anuncios', 'calendario']);

  // Super-admin: rol TÉCNICO/administrativo (crear/editar/borrar iglesias y
  // pastores, mantener el control). NO es un miembro de iglesia ni el obispo:
  // por eso NO ve el Panel del Obispo ni los módulos de una congregación.
  // Su panel ("superadmin") lo muestra el frontend según rol_global.
  if (r.rol_global === 'super_admin') {
    return ['inicio'];
  }
  // Obispo: SOLO observa. Su centro es el Panel del Obispo (informe por iglesia).
  if (r.rol_global === 'obispo') {
    return ['inicio', 'calendario', 'anuncios', 'panel_obispo'];
  }
  // Pastor: todo lo de su iglesia
  if (r.es_pastor) {
    ['calendario_completo','asistencia','panel_pastor','musicos','servicio_gestion',
     'cuidado_pastoral','ninos','tesoreria','admin','reportes'].forEach(m => mods.add(m));
    return [...mods];
  }
  // Por pertenencias (roles de grupo)
  for (const pe of r.pertenencias) {
    if (pe.rol === 'admin') {                 // lider de cuerpo
      ['calendario_completo','asistencia','servicio_gestion'].forEach(m => mods.add(m));
    }
    if (pe.rol === 'lider_musica') { mods.add('musicos'); mods.add('calendario_completo'); }
    if (pe.rol === 'musico')       { mods.add('musicos'); }
    if (pe.rol === 'lider_ed')     { mods.add('ninos'); mods.add('calendario_completo'); }
    if (pe.rol === 'tesorero')     { mods.add('tesoreria'); }
  }
  // "Mi Grupo": cualquiera que pertenezca a un grupo (el líder gestiona; el miembro observa)
  if (r.pertenencias.length) mods.add('mi_grupo');
  return [...mods];
}

// --- MIDDLEWARE: protege rutas leyendo el token ---
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Falta el token' });
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;            // { persona_id, iglesia_id }
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

export function perfilPublico(persona) {
  return {
    id: persona.id,
    iglesia_id: persona.iglesia_id,
    usuario: persona.usuario,
    nombre: persona.nombre,
    email: persona.email || null,
    es_pastor: !!persona.es_pastor,
    rol_global: persona.rol_global,
    // Contrasena temporal (super-admin creo el pastor, o el pastor creo el
    // usuario): el frontend debe forzar el cambio antes de dejar usar la app.
    debe_cambiar_pass: !!persona.debe_cambiar_pass
  };
}

// --- AUDITORIA: registra accesos/acciones sensibles ---
export function auditar(iglesiaId, actorId, accion, modulo, detalle = '') {
  db.prepare(
    'INSERT INTO auditoria (iglesia_id, actor_id, accion, modulo, detalle) VALUES (?,?,?,?,?)'
  ).run(iglesiaId, actorId, accion, modulo, detalle);
}

// ¿Es obispo o super-admin? (jerarquía sobre el pastor, ve TODAS las iglesias)
export function esObispo(personaId) {
  const p = db.prepare('SELECT rol_global FROM persona WHERE id = ?').get(personaId);
  return !!(p && (p.rol_global === 'obispo' || p.rol_global === 'super_admin'));
}

// --- Helpers de permisos (para eventos y servicio) ---
export function esPastor(personaId) {
  const p = db.prepare('SELECT es_pastor FROM persona WHERE id = ?').get(personaId);
  return !!(p && p.es_pastor);
}
export function gruposDeUsuario(personaId) {
  return db.prepare(
    'SELECT g.* FROM grupo g JOIN pertenencia pe ON pe.grupo_id = g.id WHERE pe.persona_id = ?'
  ).all(personaId);
}
// ¿Puede gestionar (crear eventos, etc.) en este grupo?
export function esAdminDeGrupo(personaId, grupoId) {
  if (esPastor(personaId)) return true;
  const row = db.prepare(
    `SELECT 1 FROM pertenencia WHERE persona_id = ? AND grupo_id = ?
       AND rol IN ('admin','lider_musica','lider_ed')`
  ).get(personaId, grupoId);
  return !!row;
}
export function veCalendarioCompleto(personaId) {
  return modulosVisibles(personaId).includes('calendario_completo');
}
// ¿Es el ENCARGADO (líder) de este grupo? (NO incluye al pastor: el pastor solo observa)
export function esEncargadoGrupo(personaId, grupoId) {
  const row = db.prepare(
    `SELECT 1 FROM pertenencia WHERE persona_id = ? AND grupo_id = ? AND rol IN ('admin','lider_musica','lider_ed')`
  ).get(personaId, grupoId);
  return !!row;
}
// ¿Es tesorero? (o pastor)
export function esTesoreroOPastor(personaId) {
  if (esPastor(personaId)) return true;
  const row = db.prepare("SELECT 1 FROM pertenencia WHERE persona_id = ? AND rol = 'tesorero'").get(personaId);
  return !!row;
}
// ¿Es lider de Escuela Dominical? (o pastor)
export function esLiderEdOPastor(personaId) {
  if (esPastor(personaId)) return true;
  const row = db.prepare("SELECT 1 FROM pertenencia WHERE persona_id = ? AND rol = 'lider_ed'").get(personaId);
  return !!row;
}
// ¿Es predicador? (el pastor siempre; o quien tenga el rol 'predicador' vigente hoy)
export function esPredicador(personaId) {
  if (esPastor(personaId)) return true;
  const row = db.prepare(
    "SELECT 1 FROM rol_temporal WHERE persona_id = ? AND rol = 'predicador' AND date('now') BETWEEN desde AND hasta"
  ).get(personaId);
  return !!row;
}
// ¿Es del ministerio de música? (músico o líder) — pueden compartir material/notas.
export function esDelMinisterioMusica(personaId) {
  const row = db.prepare("SELECT 1 FROM pertenencia WHERE persona_id = ? AND rol IN ('musico','lider_musica')").get(personaId);
  return !!row;
}
// ¿Es lider de musica? (o pastor)
export function esLiderMusica(personaId) {
  if (esPastor(personaId)) return true;
  const row = db.prepare("SELECT 1 FROM pertenencia WHERE persona_id = ? AND rol = 'lider_musica'").get(personaId);
  return !!row;
}
// --- Variantes ESTRICTAS: el encargado real, SIN atajo de pastor ---
// (El pastor VE estos módulos pero NO los edita; solo el encargado edita.)
export function esLiderMusicaEstricto(personaId) {
  const row = db.prepare("SELECT 1 FROM pertenencia WHERE persona_id = ? AND rol = 'lider_musica'").get(personaId);
  return !!row;
}
export function esLiderEdEstricto(personaId) {
  const row = db.prepare("SELECT 1 FROM pertenencia WHERE persona_id = ? AND rol = 'lider_ed'").get(personaId);
  return !!row;
}
export function esTesoreroEstricto(personaId) {
  const row = db.prepare("SELECT 1 FROM pertenencia WHERE persona_id = ? AND rol = 'tesorero'").get(personaId);
  return !!row;
}
// ¿Es lider o pastor? (puede publicar anuncios, gestionar servicio...)
export function esLiderOAdmin(personaId) {
  if (esPastor(personaId)) return true;
  const row = db.prepare(
    `SELECT 1 FROM pertenencia WHERE persona_id = ? AND rol IN ('admin','lider_musica','lider_ed')`
  ).get(personaId);
  return !!row;
}

// --- Verifica un JWT crudo (para el stream SSE, que no puede mandar headers) ---
export function verificarToken(token) {
  try { return jwt.verify(token, SECRET); }   // { persona_id, iglesia_id }
  catch { return null; }
}

// --- Puede ACTOR iniciar un chat 1:1 con DESTINO? (misma iglesia) ---
//  lider/pastor -> con cualquiera; feligres -> a su liderazgo o a quien comparte grupo.
export function puedeIniciarChatCon(actorId, destinoId) {
  if (Number(actorId) === Number(destinoId)) return false;
  const actor = db.prepare('SELECT iglesia_id FROM persona WHERE id = ?').get(actorId);
  const destino = db.prepare('SELECT iglesia_id FROM persona WHERE id = ? AND activo = 1').get(destinoId);
  if (!actor || !destino) return false;
  if (actor.iglesia_id !== destino.iglesia_id) return false;
  if (esLiderOAdmin(actorId)) return true;
  // destino es lider/pastor de algun grupo del actor?
  const destinoEsMiLider = db.prepare(
    `SELECT 1 FROM pertenencia pd
       JOIN pertenencia pa ON pa.grupo_id = pd.grupo_id AND pa.persona_id = ?
      WHERE pd.persona_id = ? AND pd.rol IN ('admin','lider_musica','lider_ed') LIMIT 1`
  ).get(actorId, destinoId);
  if (destinoEsMiLider) return true;
  if (esPastor(destinoId)) return true;
  // comparten algun grupo?
  const compartenGrupo = db.prepare(
    `SELECT 1 FROM pertenencia a JOIN pertenencia b ON a.grupo_id = b.grupo_id
      WHERE a.persona_id = ? AND b.persona_id = ? LIMIT 1`
  ).get(actorId, destinoId);
  return !!compartenGrupo;
}
