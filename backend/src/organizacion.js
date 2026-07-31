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

// Los montos del detalle de auditoria se guardan ya formateados, porque ese
// texto se le va a MOSTRAR a la gente en la hoja (ver la Task 6): "$12.000" y
// no "$12000", igual que money() en el frontend.
//
// A mano y no con toLocaleString('es-CL'): no se usa en ningun sitio del
// backend hoy (cero coincidencias en backend/src/), y haria que el texto ya
// guardado dependiera de la configuracion regional del servidor.
function montoTxt(n) {
  return '$' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Describe en castellano llano quien puso la plata de un gasto, para el
// detalle de auditoria (Task 4, punto 1 de la revision). Nada de "fuente" ni
// "pagado_por": esto lo lee una persona, no un programador.
//
// fuente NULL + persona: es el estado de TRANSICION que ya entendia armarHoja
// antes de esta casilla (ver 'gasto antiguo CON persona pero sin fuente sigue
// contando como "por devolver"') — se describe igual que 'devuelve'.
function descOrigenGasto(fuente, pagadoPorId) {
  if (fuente === 'caja') return 'pagó la caja';
  if (pagadoPorId == null) return 'sin registrar quién puso';
  const persona = db.prepare('SELECT nombre FROM persona WHERE id = ?').get(pagadoPorId);
  const nombre = persona ? persona.nombre : 'alguien que ya no esta';
  return fuente === 'aporte' ? `aporte de ${nombre}` : `se devuelve a ${nombre}`;
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
  const gastos = db.prepare(
    `SELECT g.id, g.concepto, g.monto, g.creado_en, g.pagado_por, g.fuente, p.nombre AS pagado_por_nombre
       FROM evento_org_gasto g LEFT JOIN persona p ON p.id = g.pagado_por
      WHERE g.org_id = ? ORDER BY g.id`
  ).all(org.id);
  const total = db.prepare('SELECT COALESCE(SUM(monto),0) AS t FROM evento_org_gasto WHERE org_id = ?').get(org.id).t;
  // "Quien puso que", partido en tres, porque ya no es una sola cosa:
  //  - lo que pago la caja directo (no hay a quien devolverle nada)
  //  - lo que alguien puso y HAY que devolverle (incluye lo de antes de esta
  //    casilla, fuente NULL con persona: es lo que ya significaba)
  //  - lo que alguien puso como aporte y NO se devuelve
  const totalCaja = db.prepare(
    `SELECT COALESCE(SUM(monto),0) AS t FROM evento_org_gasto WHERE org_id = ? AND fuente = 'caja'`
  ).get(org.id).t;
  const porDevolver = db.prepare(
    `SELECT g.pagado_por AS persona_id, p.nombre, SUM(g.monto) AS total
       FROM evento_org_gasto g JOIN persona p ON p.id = g.pagado_por
      WHERE g.org_id = ? AND g.pagado_por IS NOT NULL AND (g.fuente = 'devuelve' OR g.fuente IS NULL)
      GROUP BY g.pagado_por, p.nombre ORDER BY total DESC, p.nombre`
  ).all(org.id);
  const aportesDonados = db.prepare(
    `SELECT g.pagado_por AS persona_id, p.nombre, SUM(g.monto) AS total
       FROM evento_org_gasto g JOIN persona p ON p.id = g.pagado_por
      WHERE g.org_id = ? AND g.fuente = 'aporte'
      GROUP BY g.pagado_por, p.nombre ORDER BY total DESC, p.nombre`
  ).all(org.id);
  const evento = org.evento_id
    ? db.prepare('SELECT id, titulo, fecha, hora_inicio, lugar FROM evento WHERE id = ?').get(org.evento_id)
    : null;
  return { ...org, evento, cosas, gastos, total_gastado: total,
    total_caja: totalCaja, por_devolver: porDevolver, aportes_donados: aportesDonados };
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

// --- Duplicar una hoja ("el año pasado hicimos esta misma lista") ---
// Reemplaza a un sistema de plantillas: para una iglesia que hace tres o cuatro
// eventos asi al ano, un boton resuelve el 90% del caso.
// Puede duplicar cualquiera que pueda VER la hoja (no hace falta poder editarla):
// asi un lider se hace la suya a partir de la ajena sin tocarla.
r.post('/:id/duplicar', (req, res) => {
  const org = db.prepare('SELECT * FROM evento_org WHERE id = ? AND iglesia_id = ?')
    .get(Number(req.params.id), req.user.iglesia_id);
  if (!org) return res.status(404).json({ error: 'Hoja no encontrada' });

  const titulo = 'Copia de ' + (org.titulo || nombreDeEvento(org.evento_id) || 'lista');
  let nuevaId;
  db.exec('BEGIN');
  try {
    // La copia nace SUELTA: pegarla al evento viejo chocaria con el indice unico
    // (una hoja por evento) y ademas no es lo que se quiere: se copia para el
    // evento que viene, que todavia no existe.
    const info = db.prepare('INSERT INTO evento_org (iglesia_id, titulo, hora_llegada, creado_por) VALUES (?,?,?,?)')
      .run(req.user.iglesia_id, titulo, org.hora_llegada, req.user.persona_id);
    nuevaId = Number(info.lastInsertRowid);
    // Las cosas se copian EN LIMPIO: sin responsable y sin marcar. Nadie hereda
    // el compromiso del ano pasado. Los gastos no se copian nunca: son del
    // evento que ya paso.
    db.prepare(
      `INSERT INTO evento_org_cosa (org_id, nombre, cantidad, orden, listo, responsable_id)
       SELECT ?, nombre, cantidad, orden, 0, NULL FROM evento_org_cosa WHERE org_id = ?`
    ).run(nuevaId, org.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'No se pudo duplicar la lista' });
  }
  auditar(req.user.iglesia_id, req.user.persona_id, 'duplicar_org', 'organizacion', titulo);
  res.json({ ok: true, id: nuevaId });
});

// Titulo del evento al que cuelga una hoja (para nombrar la copia).
function nombreDeEvento(eventoId) {
  if (!eventoId) return null;
  const ev = db.prepare('SELECT titulo FROM evento WHERE id = ?').get(eventoId);
  return ev ? ev.titulo : null;
}

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
//
// FUENTES_GASTO: quien puso el dinero de verdad, no solo quien queda anotado.
// 'caja' no lleva persona (pago la iglesia directo). 'devuelve'/'aporte' SI
// llevan persona: la diferencia es si se le debe devolver o no.
const FUENTES_GASTO = ['caja', 'devuelve', 'aporte'];
const gastoSchema = z.object({
  concepto: z.string().trim().min(1, 'falta el concepto'),
  monto: z.coerce.number().positive('el monto debe ser mayor a 0'),
  // Opcional: si no viene, paga quien registra el gasto (el caso normal).
  pagado_por: z.coerce.number().int().positive().optional(),
  // Opcional para no romper llamadas viejas: sin ella, el gasto queda "no
  // especificado" (fuente NULL), igual que antes de que esta casilla
  // existiera. El frontend (Task 5) la manda siempre.
  fuente: z.enum(FUENTES_GASTO, { error: 'el origen del gasto no es válido' }).optional()
});
r.post('/:id/gastos', validar(gastoSchema), (req, res) => {
  const org = hojaEditable(req, res, Number(req.params.id));
  if (!org) return;
  // "La caja de la iglesia" no tiene persona: pagado_por queda NULL. Ese NULL
  // NO reutiliza el significado historico de "no se sabe quien puso" — lo
  // que distingue un caso del otro es la columna fuente, no el hueco vacio.
  const esCaja = req.body.fuente === 'caja';
  const quienPago = esCaja ? null : (req.body.pagado_por ?? req.user.persona_id);
  if (quienPago != null) {
    // Solo gente de la misma iglesia: atribuirle un pago a un tercero de otra
    // congregacion no significa nada y ensucia el resumen de a quien devolver.
    const p = db.prepare('SELECT id FROM persona WHERE id = ? AND iglesia_id = ?')
      .get(quienPago, req.user.iglesia_id);
    if (!p) return res.status(400).json({ error: 'Esa persona no esta en tu iglesia' });
  }
  const info = db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto, pagado_por, fuente) VALUES (?,?,?,?,?)')
    .run(org.id, req.body.concepto, req.body.monto, quienPago, req.body.fuente || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

// Corregir un gasto (monto mal tecleado, fuente equivocada). A diferencia
// del resto de los items de la hoja (que nunca dejaron rastro de nada), esta
// SI se audita: es la condicion explicita del dueño para poder corregir.
const editarGastoSchema = z.object({
  concepto: z.string().trim().min(1, 'falta el concepto').optional(),
  monto: z.coerce.number().positive('el monto debe ser mayor a 0').optional(),
  pagado_por: z.coerce.number().int().positive().nullable().optional(),
  // MISMO mensaje que gastoSchema (Task 2): no puede contener la palabra
  // "fuente", que es el nombre tecnico del campo. validar() compone
  // "Datos invalidos: " + este texto y se lo suelta tal cual a la persona.
  fuente: z.enum(FUENTES_GASTO, { error: 'el origen del gasto no es válido' }).optional()
});
r.patch('/gastos/:gastoId', validar(editarGastoSchema), (req, res) => {
  // Acotado por iglesia en la MISMA consulta: es el fallo que ya se colo una
  // vez en musica.js (borrado que cruzaba congregaciones). El resto de las
  // rutas de cosas/gastos de este archivo resuelven sin ese acotador y
  // filtran despues via hojaEditable (que si filtra) — sigue siendo seguro,
  // pero esta ruta nueva no repite ese patron.
  const gasto = db.prepare(
    `SELECT g.* FROM evento_org_gasto g JOIN evento_org o ON o.id = g.org_id
      WHERE g.id = ? AND o.iglesia_id = ?`
  ).get(Number(req.params.gastoId), req.user.iglesia_id);
  if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });
  const org = hojaEditable(req, res, gasto.org_id);   // valida permiso (403); iglesia ya validada arriba
  if (!org) return;

  const concepto = req.body.concepto ?? gasto.concepto;
  const monto = req.body.monto ?? gasto.monto;

  // fuente y pagado_por se corrigen juntos, pero SOLO se exige coherencia
  // cuando el PATCH toca alguno de los dos. Un gasto historico (fuente y
  // pagado_por ambos NULL, "no se sabe quien puso") tiene que poder corregir
  // su concepto o su monto SIN verse obligado a inventarle un pagador: si no,
  // arreglar una falta de ortografia le adjudicaria a alguien una deuda que
  // nadie contrajo.
  const tocaFuente = req.body.fuente !== undefined;
  const tocaPagador = req.body.pagado_por !== undefined;
  const fuente = tocaFuente ? req.body.fuente : gasto.fuente;
  let pagadoPor = tocaPagador ? req.body.pagado_por : gasto.pagado_por;

  if (fuente === 'caja') {
    // Pago la caja: no hay persona, pase lo que pase se haya mandado.
    pagadoPor = null;
  } else if (tocaFuente || tocaPagador) {
    // Solo aqui se exige que haya alguien: el PATCH esta cambiando de verdad
    // quien puso el dinero. Si no toca ninguno de los dos, se conserva lo que
    // hubiera -- incluido "no se sabe".
    if (pagadoPor == null) return res.status(400).json({ error: 'Elige quien puso el dinero, o marca que pago la caja' });
  }
  if (pagadoPor != null) {
    const p = db.prepare('SELECT id FROM persona WHERE id = ? AND iglesia_id = ?').get(pagadoPor, req.user.iglesia_id);
    if (!p) return res.status(400).json({ error: 'Esa persona no esta en tu iglesia' });
  }

  db.prepare('UPDATE evento_org_gasto SET concepto=?, monto=?, pagado_por=?, fuente=? WHERE id=?')
    .run(concepto, monto, pagadoPor, fuente, gasto.id);

  // El detalle guarda que cambio; quien y cuando ya los guarda auditar() solo
  // (actor_id y fecha son columnas propias de la tabla auditoria).
  //
  // El cambio de ORIGEN solo se anota si cambio de verdad. Importa porque pasar
  // un gasto de "se devuelve a Carolina" a "pago la caja" BORRA una deuda con
  // una persona, y sin esta parte el rastro decia literalmente
  //   "Carne" $20.000 -> "Carne" $20.000
  // o sea, aparentaba que no habia cambiado nada justo en el unico cambio que
  // hace desaparecer plata que se le debia a alguien. Si solo se corrigio el
  // concepto o el monto no se anade: seria ruido en el historial de la hoja.
  const cambioOrigen = fuente !== gasto.fuente || pagadoPor !== gasto.pagado_por;
  const origen = cambioOrigen
    ? ` · ${descOrigenGasto(gasto.fuente, gasto.pagado_por)} -> ${descOrigenGasto(fuente, pagadoPor)}`
    : '';
  auditar(req.user.iglesia_id, req.user.persona_id, 'editar_gasto', 'organizacion',
    `"${gasto.concepto}" ${montoTxt(gasto.monto)} -> "${concepto}" ${montoTxt(monto)}${origen}`);
  res.json({ ok: true });
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
