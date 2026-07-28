// ============================================================
//  Organización de eventos: hoja de logística (cosas a llevar) + cuentas
//  (gastos que se suman). Puede ir pegada a un evento o ser una lista suelta.
//  Ver: solo líderes/pastor (esLiderOAdmin). Editar: solo el creador o el pastor.
//  Los gastos de la hoja son SEPARADOS de Tesorería (decisión de diseño del spec).
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, esPastor, esLiderOAdmin, auditar } from './auth.js';
import { enviarPush } from './push.js';
import { validar } from './seguridad.js';

const r = Router();
r.use(authMiddleware);

// ---------- La rendija del feligres ----------
// Estas DOS rutas van a proposito AQUI: despues de r.use(authMiddleware) (asi
// siguen exigiendo sesion) y ANTES del gate de lideres. Quien se comprometio a
// traer algo tiene que poder ver SU linea sin que se le abra la hoja, que
// contiene los gastos. Devuelven solo lo asignado a quien pregunta: nunca
// gastos, nunca totales, nunca las cosas de otros.
r.get('/mis-cosas', (req, res) => {
  const filas = db.prepare(
    `SELECT c.id, c.nombre, c.cantidad, c.listo,
            o.titulo AS hoja_titulo, o.fecha, o.hora_llegada,
            e.titulo AS evento_titulo, e.fecha AS evento_fecha, e.lugar
       FROM evento_org_cosa c
       JOIN evento_org o ON o.id = c.org_id
       LEFT JOIN evento e ON e.id = o.evento_id
      WHERE c.responsable_id = ? AND o.iglesia_id = ?
      ORDER BY COALESCE(e.fecha, o.fecha), c.id`
  ).all(req.user.persona_id, req.user.iglesia_id);
  res.json(filas);
});

// Solo el interruptor "ya lo tengo", y solo sobre lo propio. La autorizacion es
// responsable_id === persona_id, NO hojaEditable: el feligres no edita la hoja.
const misCosasSchema = z.object({ listo: z.union([z.boolean(), z.literal(0), z.literal(1)]) });
r.patch('/mis-cosas/:cosaId', validar(misCosasSchema), (req, res) => {
  const cosa = db.prepare(
    `SELECT c.id, c.responsable_id FROM evento_org_cosa c
       JOIN evento_org o ON o.id = c.org_id
      WHERE c.id = ? AND o.iglesia_id = ?`
  ).get(Number(req.params.cosaId), req.user.iglesia_id);
  if (!cosa || cosa.responsable_id !== req.user.persona_id)
    return res.status(403).json({ error: 'Esa no es una de tus cosas' });
  db.prepare('UPDATE evento_org_cosa SET listo = ? WHERE id = ?').run(req.body.listo ? 1 : 0, cosa.id);
  res.json({ ok: true });
});

// Gate de visibilidad: la organización es cosa de líderes/pastor. Todo lo que va
// DEBAJO de esta linea lo exige; la rendija de arriba queda deliberadamente fuera.
r.use((req, res, next) => {
  if (!esLiderOAdmin(req.user.persona_id)) return res.status(403).json({ error: 'Solo lideres o el pastor' });
  next();
});

// Mismo patrón HH:MM que eventos.js (comparaciones y pintado consistentes).
const horaSchema = z.string().trim().regex(/^\d{2}:\d{2}$/, 'hora invalida (usa HH:MM)').optional().or(z.literal(''));

// ¿Puede editar esta hoja? Solo su creador o el pastor.
function puedeEditarOrg(personaId, org) {
  return org.creado_por === personaId || esPastor(personaId);
}

// Arma la hoja completa (cosas + gastos + total + evento) a partir de su row.
// total_gastado NUNCA se persiste: se recalcula al leer, asi no queda descuadrado.
function armarHoja(org) {
  // LEFT JOIN (no INNER): una cosa sin responsable debe seguir apareciendo.
  // responsable_activo permite avisar en la hoja "cuenta inactiva - reasignar"
  // sin borrar el dato a espaldas del lider.
  const cosas = db.prepare(
    `SELECT c.id, c.nombre, c.cantidad, c.listo, c.orden, c.responsable_id,
            p.nombre AS responsable_nombre, p.activo AS responsable_activo
       FROM evento_org_cosa c LEFT JOIN persona p ON p.id = c.responsable_id
      WHERE c.org_id = ? ORDER BY c.orden, c.id`
  ).all(org.id);
  const gastos = db.prepare('SELECT id, concepto, monto, creado_en FROM evento_org_gasto WHERE org_id = ? ORDER BY id').all(org.id);
  const total = db.prepare('SELECT COALESCE(SUM(monto),0) AS t FROM evento_org_gasto WHERE org_id = ?').get(org.id).t;
  const evento = org.evento_id
    ? db.prepare('SELECT id, titulo, fecha, hora_inicio, lugar FROM evento WHERE id = ?').get(org.evento_id)
    : null;
  return { ...org, evento, cosas, gastos, total_gastado: total };
}

// Obtiene el row de la hoja y valida edición. Responde 404/403 y devuelve null,
// o devuelve el row si el usuario puede editarla. El filtro por iglesia_id es
// lo que impide tocar (o siquiera confirmar la existencia de) hojas ajenas.
function hojaEditable(req, res, orgId) {
  const org = db.prepare('SELECT * FROM evento_org WHERE id = ? AND iglesia_id = ?').get(orgId, req.user.iglesia_id);
  if (!org) { res.status(404).json({ error: 'Hoja no encontrada' }); return null; }
  if (!puedeEditarOrg(req.user.persona_id, org)) { res.status(403).json({ error: 'Solo quien creo la lista o el pastor' }); return null; }
  return org;
}

// --- Lista de hojas de la iglesia (para el apartado de líderes) ---
r.get('/', (req, res) => {
  const filas = db.prepare(
    `SELECT o.*, e.titulo AS evento_titulo, e.fecha AS evento_fecha,
        (SELECT COALESCE(SUM(monto),0) FROM evento_org_gasto g WHERE g.org_id = o.id) AS total_gastado,
        (SELECT COUNT(*) FROM evento_org_cosa c WHERE c.org_id = o.id) AS n_cosas
       FROM evento_org o LEFT JOIN evento e ON e.id = o.evento_id
      WHERE o.iglesia_id = ? ORDER BY o.creada_en DESC, o.id DESC`
  ).all(req.user.iglesia_id);
  res.json(filas);
});

// --- Hoja de un evento (se crea vacía la 1a vez que se abre) ---
r.get('/evento/:eventoId', (req, res) => {
  const eventoId = Number(req.params.eventoId);
  const ev = db.prepare('SELECT id FROM evento WHERE id = ? AND iglesia_id = ?').get(eventoId, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  let org = db.prepare('SELECT * FROM evento_org WHERE evento_id = ? AND iglesia_id = ?').get(eventoId, req.user.iglesia_id);
  if (!org) {
    // El indice unico de evento_org(evento_id) es GLOBAL, no por iglesia: el INSERT
    // puede chocar aunque el SELECT de arriba no encontrara nada (hoja creada por otro
    // proceso, o fila inconsistente de otra iglesia). Se relee SIEMPRE acotado a la
    // iglesia: nunca se devuelve la hoja de otra.
    try {
      const info = db.prepare('INSERT INTO evento_org (iglesia_id, evento_id, creado_por) VALUES (?,?,?)')
        .run(req.user.iglesia_id, eventoId, req.user.persona_id);
      org = db.prepare('SELECT * FROM evento_org WHERE id = ?').get(Number(info.lastInsertRowid));
      auditar(req.user.iglesia_id, req.user.persona_id, 'crear_org', 'organizacion', 'evento ' + eventoId);
    } catch {
      org = db.prepare('SELECT * FROM evento_org WHERE evento_id = ? AND iglesia_id = ?').get(eventoId, req.user.iglesia_id);
      if (!org) return res.status(409).json({ error: 'No se pudo abrir la hoja, intenta de nuevo' });
    }
  }
  res.json({ ...armarHoja(org), puede_editar: puedeEditarOrg(req.user.persona_id, org) });
});

// --- Detalle de una hoja por id ---
r.get('/:id', (req, res) => {
  const org = db.prepare('SELECT * FROM evento_org WHERE id = ? AND iglesia_id = ?').get(Number(req.params.id), req.user.iglesia_id);
  if (!org) return res.status(404).json({ error: 'Hoja no encontrada' });
  res.json({ ...armarHoja(org), puede_editar: puedeEditarOrg(req.user.persona_id, org) });
});

// --- Crear hoja suelta ---
const crearHojaSchema = z.object({
  titulo: z.string().trim().min(1, 'falta el titulo'),
  fecha: z.string().trim().optional().or(z.literal('')),
  hora_llegada: horaSchema
});
r.post('/', validar(crearHojaSchema), (req, res) => {
  const { titulo, fecha, hora_llegada } = req.body;
  const info = db.prepare('INSERT INTO evento_org (iglesia_id, titulo, fecha, hora_llegada, creado_por) VALUES (?,?,?,?,?)')
    .run(req.user.iglesia_id, titulo, fecha || null, hora_llegada || null, req.user.persona_id);
  auditar(req.user.iglesia_id, req.user.persona_id, 'crear_org', 'organizacion', titulo);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

// --- Editar hoja (título/fecha/hora) ---
// PATCH parcial: un campo ausente (undefined) conserva su valor, no lo borra.
const editarHojaSchema = z.object({
  titulo: z.string().trim().min(1).optional(),
  fecha: z.string().trim().optional().or(z.literal('')),
  hora_llegada: horaSchema
});
r.patch('/:id', validar(editarHojaSchema), (req, res) => {
  const org = hojaEditable(req, res, Number(req.params.id));
  if (!org) return;
  const { titulo, fecha, hora_llegada } = req.body;
  db.prepare('UPDATE evento_org SET titulo=?, fecha=?, hora_llegada=? WHERE id=?').run(
    titulo ?? org.titulo,
    fecha === undefined ? org.fecha : (fecha || null),
    hora_llegada === undefined ? org.hora_llegada : (hora_llegada || null),
    org.id
  );
  auditar(req.user.iglesia_id, req.user.persona_id, 'editar_org', 'organizacion', String(org.id));
  res.json({ ok: true });
});

// --- Borrar hoja (+ cosas + gastos) en una sola transaccion ---
r.delete('/:id', (req, res) => {
  const org = hojaEditable(req, res, Number(req.params.id));
  if (!org) return;
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM evento_org_cosa WHERE org_id=?').run(org.id);
    db.prepare('DELETE FROM evento_org_gasto WHERE org_id=?').run(org.id);
    db.prepare('DELETE FROM evento_org WHERE id=?').run(org.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'No se pudo borrar la hoja' });
  }
  auditar(req.user.iglesia_id, req.user.persona_id, 'borrar_org', 'organizacion', org.titulo || ('evento ' + org.evento_id));
  res.json({ ok: true });
});

// ---------- Cosas a llevar ----------
// /:id/cosas y /cosas/:cosaId no colisionan: la primera lleva el id de la hoja
// delante, la segunda empieza por el literal 'cosas'.
const cosaSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre'),
  cantidad: z.coerce.number().int().min(1).optional()
});
r.post('/:id/cosas', validar(cosaSchema), (req, res) => {
  const org = hojaEditable(req, res, Number(req.params.id));
  if (!org) return;
  const info = db.prepare('INSERT INTO evento_org_cosa (org_id, nombre, cantidad) VALUES (?,?,?)')
    .run(org.id, req.body.nombre, req.body.cantidad || 1);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

// PATCH parcial: lo que no venga conserva su valor. 'listo' acepta booleano o 0/1
// porque el checkbox del frontend manda true/false y la BD guarda 0/1.
const editarCosaSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  cantidad: z.coerce.number().int().min(1).optional(),
  listo: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
  // null explicito = desasignar. Ausente = no tocar (PATCH parcial de v1).
  responsable_id: z.coerce.number().int().positive().nullable().optional()
});
r.patch('/cosas/:cosaId', validar(editarCosaSchema), (req, res) => {
  const cosa = db.prepare('SELECT * FROM evento_org_cosa WHERE id = ?').get(Number(req.params.cosaId));
  if (!cosa) return res.status(404).json({ error: 'Cosa no encontrada' });
  const org = hojaEditable(req, res, cosa.org_id);   // valida iglesia (404) y permiso (403)
  if (!org) return;
  const { nombre, cantidad, listo, responsable_id } = req.body;

  // El responsable puede ser CUALQUIER persona activa de la iglesia: media hoja
  // es suelta y no cuelga de ningun grupo, y quien trae la torta a veces no
  // esta en el grupo.
  if (responsable_id != null) {
    const p = db.prepare('SELECT id FROM persona WHERE id = ? AND iglesia_id = ? AND activo = 1')
      .get(responsable_id, req.user.iglesia_id);
    if (!p) return res.status(400).json({ error: 'Esa persona no esta en tu iglesia o su cuenta esta inactiva' });
  }

  const cambiaResponsable = responsable_id !== undefined && responsable_id !== cosa.responsable_id;
  db.prepare('UPDATE evento_org_cosa SET nombre=?, cantidad=?, listo=?, responsable_id=?, asignada_en=? WHERE id=?').run(
    nombre ?? cosa.nombre,
    cantidad ?? cosa.cantidad,
    listo === undefined ? cosa.listo : (listo ? 1 : 0),
    responsable_id === undefined ? cosa.responsable_id : responsable_id,
    cambiaResponsable && responsable_id != null
      ? new Date().toISOString().slice(0, 19).replace('T', ' ')
      : cosa.asignada_en,
    cosa.id
  );

  // Avisar SOLO cuando el responsable cambia de verdad: el lider edita la lista
  // muchas veces mientras la arma y no puede bombardear a la gente.
  if (cambiaResponsable && responsable_id != null) {
    const nom = nombre ?? cosa.nombre;
    const cant = cantidad ?? cosa.cantidad;
    const titulo = `📦 Traer: ${nom} x${cant}`;
    const donde = org.titulo || 'un evento';
    const texto = `Para "${donde}"` + (org.hora_llegada ? ` · llegar ${org.hora_llegada}` : '');
    db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
      .run(responsable_id, 'organizacion', titulo, texto);
    enviarPush([responsable_id], { titulo, texto }).catch(() => {});
  }
  res.json({ ok: true });
});

r.delete('/cosas/:cosaId', (req, res) => {
  const cosa = db.prepare('SELECT * FROM evento_org_cosa WHERE id = ?').get(Number(req.params.cosaId));
  if (!cosa) return res.status(404).json({ error: 'Cosa no encontrada' });
  const org = hojaEditable(req, res, cosa.org_id);
  if (!org) return;
  db.prepare('DELETE FROM evento_org_cosa WHERE id=?').run(cosa.id);
  res.json({ ok: true });
});

// ---------- Gastos (se suman en total_gastado) ----------
// El total NO se guarda en ninguna columna: se recalcula al leer la hoja, asi
// nunca queda descuadrado respecto a las filas de gastos.
const gastoSchema = z.object({
  concepto: z.string().trim().min(1, 'falta el concepto'),
  monto: z.coerce.number().positive('el monto debe ser mayor a 0')
});
r.post('/:id/gastos', validar(gastoSchema), (req, res) => {
  const org = hojaEditable(req, res, Number(req.params.id));
  if (!org) return;
  const info = db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto) VALUES (?,?,?)')
    .run(org.id, req.body.concepto, req.body.monto);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

r.delete('/gastos/:gastoId', (req, res) => {
  const gasto = db.prepare('SELECT * FROM evento_org_gasto WHERE id = ?').get(Number(req.params.gastoId));
  if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });
  const org = hojaEditable(req, res, gasto.org_id);
  if (!org) return;
  db.prepare('DELETE FROM evento_org_gasto WHERE id=?').run(gasto.id);
  res.json({ ok: true });
});

export default r;
export { puedeEditarOrg, armarHoja, hojaEditable };
