// ============================================================
//  Fase 4.4: Recordatorios automaticos
//  Genera notificaciones de recordatorio para eventos y asignaciones
//  proximas ("mañana tienes X", "tu servicio es en N dias").
//  - Evita duplicados con la tabla recordatorio_enviado (clave + persona).
//  - Se dispara al consultar (/me, campana) o con POST /api/recordatorios/generar.
//  Aislamiento por iglesia_id.
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware } from './auth.js';
import { enviarPush } from './push.js';

const r = Router();

// Dias antes del evento en que avisamos.
const VENTANAS = [1, 3];

// --- Throttle: no recalcular en CADA /me (era un costo innecesario por carga) ---
// Solo se recalcula como maximo 1 vez por hora por iglesia (en memoria).
const _ultimaGen = new Map();              // iglesia_id -> ms del ultimo calculo
const GEN_CADA_MS = 60 * 60 * 1000;        // 1 hora
export function generarRecordatoriosThrottled(iglesiaId) {
  const ahora = Date.now();
  if (ahora - (_ultimaGen.get(iglesiaId) || 0) < GEN_CADA_MS) return 0;  // ya se hizo hace poco
  _ultimaGen.set(iglesiaId, ahora);
  try { return generarRecordatorios(iglesiaId); } catch { return 0; }
}

// Diferencia en dias (enteros) entre hoy y una fecha 'YYYY-MM-DD'.
function diasHasta(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(fechaStr + 'T00:00:00');
  if (isNaN(f.getTime())) return null;
  return Math.round((f - hoy) / 86400000);
}

function fraseDias(dias) {
  if (dias === 0) return 'es HOY';
  if (dias === 1) return 'es MAÑANA';
  return `es en ${dias} días`;
}

// Inserta el recordatorio si no se envio antes (dedupe por clave+persona).
// Devuelve true si genero una notificacion nueva.
function enviarRecordatorio(iglesiaId, personaId, clave, titulo, texto) {
  const ins = db.prepare(
    'INSERT OR IGNORE INTO recordatorio_enviado (iglesia_id, persona_id, clave) VALUES (?,?,?)'
  ).run(iglesiaId, personaId, clave);
  if (ins.changes === 0) return false;   // ya se habia enviado
  db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
    .run(personaId, 'recordatorio', titulo, texto);
  enviarPush([personaId], { titulo, texto }).catch(() => {});
  return true;
}

// Genera todos los recordatorios pendientes de una iglesia. Devuelve cuantos creo.
export function generarRecordatorios(iglesiaId) {
  let creados = 0;

  // 1) Recordatorios de ASIGNACIONES (tu servicio) - solo no rechazadas.
  const asigs = db.prepare(
    `SELECT a.id, a.persona_id, a.tipo, e.titulo AS evento, e.fecha
       FROM asignacion a JOIN evento e ON e.id = a.evento_id
      WHERE e.iglesia_id = ? AND e.estado = 'aprobado'
        AND a.estado != 'rechazado' AND e.fecha IS NOT NULL`
  ).all(iglesiaId);
  for (const a of asigs) {
    const d = diasHasta(a.fecha);
    if (d == null || d < 0) continue;
    for (const v of VENTANAS) {
      if (d === v) {
        const clave = `asignacion:${a.id}:dia-${v}`;
        if (enviarRecordatorio(iglesiaId, a.persona_id, clave,
          `⏰ Recordatorio: ${a.tipo}`,
          `Tu servicio "${a.tipo}" en "${a.evento}" ${fraseDias(d)} (${a.fecha}).`)) creados++;
      }
    }
  }

  // 2) Recordatorios de EVENTOS para los miembros de cada grupo (1 dia antes).
  const eventos = db.prepare(
    `SELECT id, grupo_id, titulo, fecha FROM evento
      WHERE iglesia_id = ? AND estado = 'aprobado' AND grupo_id IS NOT NULL AND fecha IS NOT NULL`
  ).all(iglesiaId);
  for (const ev of eventos) {
    const d = diasHasta(ev.fecha);
    if (d !== 1) continue;   // solo "mañana"
    const miembros = db.prepare(
      `SELECT DISTINCT p.id FROM persona p
         JOIN pertenencia pe ON pe.persona_id = p.id
        WHERE pe.grupo_id = ? AND p.iglesia_id = ? AND p.activo = 1`
    ).all(ev.grupo_id, iglesiaId);
    for (const m of miembros) {
      const clave = `evento:${ev.id}:dia-1`;
      if (enviarRecordatorio(iglesiaId, m.id, clave,
        `📅 Mañana: ${ev.titulo}`,
        `El evento "${ev.titulo}" ${fraseDias(d)} (${ev.fecha}).`)) creados++;
    }
  }

  return creados;
}

r.use(authMiddleware);

// --- Disparar la generacion de recordatorios de la iglesia ---
// Cualquier usuario autenticado puede dispararla; solo afecta a su iglesia.
r.post('/generar', (req, res) => {
  const creados = generarRecordatorios(req.user.iglesia_id);
  res.json({ ok: true, creados });
});

export default r;
