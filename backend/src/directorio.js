// ============================================================
//  Directorio de miembros + cumpleaños
//  - Listado del directorio de la iglesia (con privacidad de contacto).
//  - Mi perfil: ver/editar (foto, telefono, email, cumple, toggles).
//  - Cumpleaños del mes y aviso automatico el dia del cumpleaños.
//
//  PRIVACIDAD (nucleo de la feature): telefono/email de OTRA persona
//  solo se devuelven si esa persona activo su propio toggle
//  (mostrar_telefono/mostrar_email = 1). Unica excepcion: tu PROPIO
//  perfil siempre lo ves completo. NINGUN rol (ni pastor/lider) tiene
//  atajo para ver el contacto oculto de otra persona.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware } from './auth.js';
import { enviarPush } from './push.js';
import { validar } from './seguridad.js';

const r = Router();
r.use(authMiddleware);

// Nombres de los grupos a los que pertenece una persona.
function gruposDe(personaId) {
  return db.prepare(
    `SELECT g.nombre FROM grupo g JOIN pertenencia pe ON pe.grupo_id = g.id
      WHERE pe.persona_id = ? ORDER BY g.nombre`
  ).all(personaId).map(g => g.nombre);
}

// Aplica la regla de privacidad: solo yo mismo, o quien activo su toggle.
function contactoVisible(persona, miPersonaId) {
  const esYo = persona.id === miPersonaId;
  return {
    telefono: esYo || persona.mostrar_telefono ? (persona.telefono || null) : null,
    email: esYo || persona.mostrar_email ? (persona.email || null) : null
  };
}

// --- Listado del directorio (busqueda opcional por nombre) ---
r.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const filas = q
    ? db.prepare('SELECT * FROM persona WHERE iglesia_id = ? AND activo = 1 AND nombre LIKE ? ORDER BY nombre')
        .all(req.user.iglesia_id, `%${q}%`)
    : db.prepare('SELECT * FROM persona WHERE iglesia_id = ? AND activo = 1 ORDER BY nombre')
        .all(req.user.iglesia_id);

  res.json(filas.map(p => {
    const esYo = p.id === req.user.persona_id;
    const { telefono, email } = contactoVisible(p, req.user.persona_id);
    return {
      id: p.id,
      nombre: p.nombre,
      foto_url: p.foto_url || null,
      grupos: gruposDe(p.id),
      telefono,
      email,
      es_yo: esYo
    };
  }));
});

// --- Cumpleaños del mes actual ---
r.get('/cumpleanos', (req, res) => {
  const filas = db.prepare(
    `SELECT id, nombre, foto_url, cumple FROM persona
      WHERE iglesia_id = ? AND activo = 1 AND cumple IS NOT NULL AND cumple != ''
        AND strftime('%m', cumple) = strftime('%m', 'now', 'localtime')
      ORDER BY strftime('%d', cumple)`
  ).all(req.user.iglesia_id);
  res.json(filas.map(p => ({
    id: p.id,
    nombre: p.nombre,
    foto_url: p.foto_url || null,
    dia: Number(p.cumple.slice(8, 10))
  })));
});

// --- Mi perfil completo ---
r.get('/perfil', (req, res) => {
  const p = db.prepare('SELECT * FROM persona WHERE id = ?').get(req.user.persona_id);
  if (!p) return res.status(404).json({ error: 'Persona no encontrada' });
  res.json({
    id: p.id,
    nombre: p.nombre,
    telefono: p.telefono || null,
    email: p.email || null,
    cumple: p.cumple || null,
    foto_url: p.foto_url || null,
    mostrar_telefono: !!p.mostrar_telefono,
    mostrar_email: !!p.mostrar_email
  });
});

// --- Editar mi perfil (solo el propio; campos no enviados se ignoran) ---
const perfilSchema = z.object({
  telefono: z.string().trim().max(50).optional(),
  email: z.string().trim().max(200).optional(),
  cumple: z.string().trim().refine(v => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v),
    'la fecha debe ser YYYY-MM-DD o vacia').optional(),
  foto_url: z.string().trim().max(1000).optional(),
  mostrar_telefono: z.coerce.number().int().min(0).max(1).optional(),
  mostrar_email: z.coerce.number().int().min(0).max(1).optional()
});
r.patch('/perfil', validar(perfilSchema), (req, res) => {
  const campos = ['telefono', 'email', 'cumple', 'foto_url', 'mostrar_telefono', 'mostrar_email'];
  const sets = [];
  const valores = [];
  for (const c of campos) {
    if (req.body[c] === undefined) continue;
    sets.push(`${c} = ?`);
    valores.push(req.body[c]);
  }
  if (sets.length) {
    valores.push(req.user.persona_id);
    db.prepare(`UPDATE persona SET ${sets.join(', ')} WHERE id = ?`).run(...valores);
  }
  res.json({ ok: true });
});

// --- Aviso de notificacion (mismo patron que grupo.js/recordatorios.js) ---
function notificarCumple(personaId, titulo, texto) {
  db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
    .run(personaId, 'cumple', titulo, texto || '');
  enviarPush([personaId], { titulo, texto: texto || '' }).catch(() => {});
}

// --- Cumpleaños automaticos: avisa a toda la iglesia el dia del cumpleaños ---
// Deduplicado con recordatorio_enviado (clave = 'cumple:<cumpleañeroId>:<fechaHoy>').
// El cumpleañero/a no se auto-notifica. Devuelve cuantas notificaciones nuevas creo.
export function generarCumpleanosHoy(iglesiaId) {
  const cumpleaneros = db.prepare(
    `SELECT id, nombre FROM persona
      WHERE iglesia_id = ? AND activo = 1 AND cumple IS NOT NULL AND cumple != ''
        AND strftime('%m-%d', cumple) = strftime('%m-%d', 'now', 'localtime')`
  ).all(iglesiaId);
  if (!cumpleaneros.length) return 0;

  const hoy = db.prepare("SELECT strftime('%Y-%m-%d', 'now', 'localtime') AS f").get().f;
  const miembros = db.prepare('SELECT id FROM persona WHERE iglesia_id = ? AND activo = 1').all(iglesiaId);

  let creados = 0;
  for (const c of cumpleaneros) {
    const clave = `cumple:${c.id}:${hoy}`;
    for (const m of miembros) {
      if (m.id === c.id) continue; // el cumpleañero no se auto-notifica
      const ins = db.prepare(
        'INSERT OR IGNORE INTO recordatorio_enviado (iglesia_id, persona_id, clave) VALUES (?,?,?)'
      ).run(iglesiaId, m.id, clave);
      if (ins.changes === 0) continue; // ya se le habia avisado hoy
      notificarCumple(m.id, `🎂 Hoy cumple ${c.nombre}`, `¡Felicita a ${c.nombre} en su cumpleaños!`);
      creados++;
    }
  }
  return creados;
}

// --- Throttle: no recalcular en CADA /api/me (mismo patron que recordatorios.js) ---
// Solo se recalcula como maximo 1 vez por hora por iglesia (en memoria).
const _ultimaGen = new Map();              // iglesia_id -> ms del ultimo calculo
const GEN_CADA_MS = 60 * 60 * 1000;        // 1 hora
export function generarCumpleanosHoyThrottled(iglesiaId) {
  const ahora = Date.now();
  if (ahora - (_ultimaGen.get(iglesiaId) || 0) < GEN_CADA_MS) return 0;  // ya se hizo hace poco
  _ultimaGen.set(iglesiaId, ahora);
  try { return generarCumpleanosHoy(iglesiaId); } catch { return 0; }
}

export default r;
