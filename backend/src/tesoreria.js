// ============================================================
//  Fase 3: Tesoreria (contabilidad + transparencia)
//  Solo tesorero o pastor. La app NO recibe pagos: el tesorero
//  registra lo recaudado de forma presencial.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, esTesoreroOPastor, esTesoreroEstricto, esObispo, auditar } from './auth.js';
import { validar, limiterSensible, zRutaSubidaOpcional } from './seguridad.js';

const r = Router();
r.use(authMiddleware);
// Ver el módulo: el tesorero o el pastor (observa la transparencia).
r.use((req, res, next) => {
  if (!esTesoreroOPastor(req.user.persona_id) && !esObispo(req.user.persona_id)) return res.status(403).json({ error: 'Solo tesorería o el pastor' });
  next();
});
// Registrar/editar movimientos: SOLO el tesorero; el pastor solo observa.
function soloTesorero(req, res, next) {
  if (!esTesoreroEstricto(req.user.persona_id))
    return res.status(403).json({ error: 'Solo el tesorero puede registrar movimientos (el pastor solo observa).' });
  next();
}

const sum = (ig, cond, ...a) =>
  db.prepare(`SELECT COALESCE(SUM(monto),0) AS n FROM movimiento WHERE iglesia_id = ? ${cond}`).get(ig, ...a).n;

// --- Resumen (saldo + mes) ---
r.get('/resumen', (req, res) => {
  const ig = req.user.iglesia_id;
  const ing = sum(ig, "AND tipo = 'ingreso'");
  const gas = sum(ig, "AND tipo = 'gasto'");
  // 'localtime': Chile es UTC-3/-4, asi que un movimiento de fin de mes en
  // hora local puede caer al dia siguiente en UTC (y contarse en el mes
  // equivocado) si no se ajusta antes de agrupar por mes.
  const ingMes = sum(ig, "AND tipo = 'ingreso' AND strftime('%Y-%m', fecha) = strftime('%Y-%m','now','localtime')");
  const gasMes = sum(ig, "AND tipo = 'gasto'   AND strftime('%Y-%m', fecha) = strftime('%Y-%m','now','localtime')");

  // Rendicion (Camino C, 7-ago): lo que la caja pago en los eventos TAMBIEN
  // es plata que salio de la iglesia, y el saldo tiene que decirlo. Se lee
  // CALCULADO desde las hojas de Organizacion (la leccion de campañas: un
  // solo dato, sin copias que sincronizar). SOLO fuente='caja' descuenta:
  // 'aporte' fue voluntario, 'devuelve' no ha salido de la caja (y la
  // iglesia no devuelve — decision del dueño), y NULL es "no se sabe".
  const orgCaja = db.prepare(
    `SELECT COALESCE(SUM(g.monto),0) AS n FROM evento_org_gasto g
       JOIN evento_org o ON o.id = g.org_id
      WHERE o.iglesia_id = ? AND g.fuente = 'caja'`
  ).get(ig).n;
  // El mes de un gasto de evento es el de su hoja (o el del evento de la
  // hoja); sin ninguna fecha, el creado_en del gasto convertido a hora local
  // (creado_en es UTC — ver reportes.js:21-29 antes de tocar fechas).
  const orgCajaMes = db.prepare(
    `SELECT COALESCE(SUM(g.monto),0) AS n FROM evento_org_gasto g
       JOIN evento_org o ON o.id = g.org_id
       LEFT JOIN evento e ON e.id = o.evento_id
      WHERE o.iglesia_id = ? AND g.fuente = 'caja'
        AND strftime('%Y-%m', COALESCE(o.fecha, e.fecha, datetime(g.creado_en,'localtime'))) = strftime('%Y-%m','now','localtime')`
  ).get(ig).n;

  // gasMes sigue siendo SOLO el libro (nada de mezclar peras con manzanas en
  // un numero ya publicado): la linea nueva viaja aparte.
  res.json({ saldo: ing - gas - orgCaja, ingMes, gasMes, balanceMes: ingMes - gasMes, gastosEventosMes: orgCajaMes });
});

// --- Movimientos (paginados; ?offset=0 -> devuelve hayMas para "ver más") ---
r.get('/movimientos', (req, res) => {
  const LIMIT = 50;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  // LEFT JOIN, no una copia del nombre en el movimiento: una copia habria que
  // mantenerla sincronizada, y eso es exactamente el problema que este trabajo
  // viene a quitar de la tesoreria.
  const rows = db.prepare(
    `SELECT m.*, c.nombre AS campania_nombre,
            (SELECT COUNT(*) FROM auditoria a
              WHERE a.ref_tabla = 'movimiento' AND a.ref_id = m.id
                AND a.accion = 'movimiento_corregir') AS correcciones
       FROM movimiento m LEFT JOIN campania c ON c.id = m.campania_id
      WHERE m.iglesia_id = ?
      ORDER BY m.fecha DESC, m.id DESC LIMIT ? OFFSET ?`
  ).all(req.user.iglesia_id, LIMIT + 1, offset);
  const hayMas = rows.length > LIMIT;
  res.json({ items: hayMas ? rows.slice(0, LIMIT) : rows, hayMas, offset });
});
// Rutas que escriben dinero: ademas de zod, llevan el limitador sensible
// (10 req/IP/15min) — ver nota de trade-off en server.js sobre por que
// las lecturas de tesoreria NO llevan este limite.
// z.coerce.number() a secas tambien "coerciona" booleanos (true->1) y arrays
// de un elemento ([5000]->5000): en la pantalla del dinero eso convierte un
// true perdido en un movimiento de $1 (backlog del 5-ago). Numero o texto
// numerico, nada mas — el texto sigue valiendo porque los formularios mandan
// strings. El undefined pasa tal cual para que .optional() siga funcionando.
const numeroEstricto = (msg) => z.preprocess(
  v => (v === undefined || typeof v === 'number' || typeof v === 'string') ? v : {},
  z.coerce.number().positive(msg));

const movimientoSchema = z.object({
  tipo: z.enum(['ingreso', 'gasto']),
  categoria: z.string().trim().max(100).optional(),
  monto: numeroEstricto('el monto debe ser un numero mayor que cero'),
  descripcion: z.string().trim().max(500).optional(),
  // Formato fijo YYYY-MM-DD (o vacio/omitido -> usa el default de la BD).
  // Sin este formato, un string cualquiera pasaba a SQLite y strftime()
  // devolvia NULL, rompiendo los totales mensuales (resumen/reportes).
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha invalida').optional().or(z.literal('')),
  // El comprobante es una foto/PDF subido a la app (/api/upload), nunca un
  // enlace a otro servidor: la transparencia de la iglesia no puede depender
  // de un host ajeno que manana sirva otra cosa.
  comprobante_url: zRutaSubidaOpcional(500).optional()
});
r.post('/movimientos', soloTesorero, limiterSensible, validar(movimientoSchema), (req, res) => {
  const { tipo, categoria, monto, descripcion, fecha, comprobante_url } = req.body;
  const montoNum = monto;
  if (fecha)
    db.prepare('INSERT INTO movimiento (iglesia_id, tipo, categoria, monto, descripcion, fecha, creado_por, comprobante_url) VALUES (?,?,?,?,?,?,?,?)')
      .run(req.user.iglesia_id, tipo, categoria || null, montoNum, descripcion || null, fecha, req.user.persona_id, comprobante_url || null);
  else
    db.prepare('INSERT INTO movimiento (iglesia_id, tipo, categoria, monto, descripcion, creado_por, comprobante_url) VALUES (?,?,?,?,?,?,?)')
      .run(req.user.iglesia_id, tipo, categoria || null, montoNum, descripcion || null, req.user.persona_id, comprobante_url || null);
  auditar(req.user.iglesia_id, req.user.persona_id, 'movimiento_' + tipo, 'tesoreria', String(montoNum));
  res.json({ ok: true });
});

// --- Corregir un movimiento (spec 2026-08-05): monto, descripcion, categoria ---
// El tipo NO se corrige (cambiarlo es borrar+crear, y borrar esta prohibido) y
// la fecha tampoco (mueve los totales mensuales; ver reportes.js:21-29 antes de
// tocar cualquier fecha). validar() descarta esas claves en silencio y el test
// lo deja fijado.
const correccionSchema = z.object({
  monto: numeroEstricto('el monto debe ser un numero mayor que cero').optional(),
  descripcion: z.string().trim().max(500).optional(),
  categoria: z.string().trim().max(100).optional()
}).refine(b => b.monto !== undefined || b.descripcion !== undefined || b.categoria !== undefined,
  { message: 'no viene ningun campo que corregir' });

r.patch('/movimientos/:id', soloTesorero, limiterSensible, validar(correccionSchema), (req, res) => {
  const ig = req.user.iglesia_id;
  // La iglesia va en la MISMA consulta: al movimiento de otra iglesia se le
  // responde 404, no 403 (no se confirma que exista) — convencion del archivo.
  const m = db.prepare('SELECT id, monto, descripcion, categoria FROM movimiento WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, ig);
  if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' });

  // '' significa "borrar el texto": se normaliza a NULL, igual que el POST
  // (descripcion || null). Sin esto, '' y NULL serian dos vacios distintos.
  const norm = v => (v === '' ? null : v);

  // El SET se arma desde esta lista blanca, NUNCA desde las claves del body
  // (regla del repo desde el PATCH de ninos). Y SOLO entra lo que de verdad
  // es distinto: lo demas ni se escribe ni se audita.
  const sets = [], vals = [], cambios = [];
  const pedir = (col, nuevo, viejo) => {
    if (nuevo === undefined) return;
    const n = norm(nuevo);
    if (n === (viejo ?? null)) return;
    sets.push(`${col} = ?`); vals.push(n);
    cambios.push(`${col}: ${viejo ?? '(vacio)'} -> ${n ?? '(vacio)'}`);
  };
  pedir('monto', req.body.monto, m.monto);
  pedir('descripcion', req.body.descripcion, m.descripcion);
  pedir('categoria', req.body.categoria, m.categoria);

  if (!sets.length) return res.json({ ok: true, sinCambios: true });

  // UPDATE y apunte en la MISMA transaccion (convencion fijada el 31-jul):
  // una correccion de dinero no puede quedar aplicada sin rastro.
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE movimiento SET ${sets.join(', ')} WHERE id = ? AND iglesia_id = ?`)
      .run(...vals, m.id, ig);
    auditar(ig, req.user.persona_id, 'movimiento_corregir', 'tesoreria', cambios.join(' · '),
      { tabla: 'movimiento', id: m.id });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.json({ ok: true });
});

// El historial de correcciones de UN movimiento. Lo ve quien ve el modulo
// (tesorera, pastor, obispo): el gate del router ya lo garantiza. Se pide al
// tocar la marca, no viaja con el listado.
r.get('/movimientos/:id/historial', (req, res) => {
  const ig = req.user.iglesia_id;
  const m = db.prepare('SELECT id FROM movimiento WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, ig);
  if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' });
  // LEFT JOIN: si el actor ejercio ARCO y su fila quedo anonimizada, el apunte
  // sigue valiendo con el nombre que tenga; si la fila no existe, actor null.
  res.json(db.prepare(
    `SELECT a.fecha, a.detalle, p.nombre AS actor
       FROM auditoria a LEFT JOIN persona p ON p.id = a.actor_id
      WHERE a.ref_tabla = 'movimiento' AND a.ref_id = ? AND a.accion = 'movimiento_corregir'
        AND a.iglesia_id = ?
      ORDER BY a.id DESC`
  ).all(m.id, ig));
});

// --- Campañas ---
// Los aportes de una campania son movimientos: no hay tabla aparte.
const aportesDe = (campaniaId, ig) => db.prepare(
  `SELECT id, monto, fecha FROM movimiento
    WHERE campania_id = ? AND iglesia_id = ? AND tipo = 'ingreso'
    ORDER BY fecha DESC, id DESC`
).all(campaniaId, ig);

// ⚠️ El SELECT NO trae `recaudado`: esa columna esta muerta (ver
// migrarCampaniaAMovimientos en db.js). El total que se devuelve se CALCULA
// aqui sumando los aportes, para que la barra de la campania y los libros no
// puedan decir cosas distintas.
r.get('/campanias', (req, res) => {
  const ig = req.user.iglesia_id;
  const filas = db.prepare(
    `SELECT id, nombre, meta, cerrada_en FROM campania
      WHERE iglesia_id = ?
      ORDER BY (cerrada_en IS NOT NULL), id DESC`
  ).all(ig);
  res.json(filas.map(c => {
    const aportes = aportesDe(c.id, ig);
    return { ...c, aportes, recaudado: aportes.reduce((a, x) => a + x.monto, 0) };
  }));
});

const campaniaSchema = z.object({
  // .max(100) como el resto de los textos cortos del archivo: sin tope, un
  // nombre enorme entra en la base y luego rompe la pantalla que lo pinta.
  nombre: z.string().trim().min(1, 'falta el nombre').max(100, 'el nombre es demasiado largo'),
  meta: numeroEstricto('la meta debe ser un numero mayor que cero').optional()
});
r.post('/campanias', soloTesorero, limiterSensible, validar(campaniaSchema), (req, res) => {
  const { nombre, meta } = req.body;
  const metaNum = meta;
  // recaudado se sigue insertando a 0 solo porque la columna es NOT NULL DEFAULT
  // 0 y sigue existiendo; nadie la vuelve a leer.
  const info = db.prepare('INSERT INTO campania (iglesia_id, nombre, meta, recaudado) VALUES (?,?,?,0)')
    .run(req.user.iglesia_id, nombre, (Number.isFinite(metaNum) && metaNum > 0) ? metaNum : 0);
  auditar(req.user.iglesia_id, req.user.persona_id, 'campania_crear', 'tesoreria', nombre,
    { tabla: 'campania', id: info.lastInsertRowid });
  res.json({ ok: true, id: info.lastInsertRowid });
});
const aportarSchema = z.object({
  monto: numeroEstricto('el aporte debe ser un numero mayor que cero')
});
// Aportar CREA UN INGRESO de verdad. Antes solo sumaba a campania.recaudado, y
// esa plata no aparecia en ningun libro.
//
// Un solo INSERT: no hace falta transaccion. Con el total calculado ya no hay
// dos escrituras que puedan quedar a medias — ese problema lo elimino el
// diseno, no un BEGIN/COMMIT.
r.patch('/campanias/:id/aportar', soloTesorero, limiterSensible, validar(aportarSchema), (req, res) => {
  const ig = req.user.iglesia_id;
  // La iglesia va en la MISMA consulta: a una campania de otra iglesia se le
  // responde 404, no 403 (no se confirma que exista).
  const c = db.prepare('SELECT id, nombre, cerrada_en FROM campania WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, ig);
  if (!c) return res.status(404).json({ error: 'Campaña no encontrada' });
  if (c.cerrada_en)
    return res.status(409).json({ error: 'Esta campaña está cerrada: ya no admite aportes' });

  const { monto } = req.body;
  // ⚠️ La descripcion NO lleva el nombre de la campania. Copiarlo aqui seria
  // denormalizarlo, que es justo lo que este trabajo viene a evitar: el nombre
  // se saca con un JOIN al listar los movimientos (ver Task 2). Hoy no se puede
  // renombrar una campania, asi que copiarlo "funcionaria" — pero el dia que
  // alguien anada esa funcion, las copias quedarian mintiendo en silencio.
  const info = db.prepare(
    `INSERT INTO movimiento (iglesia_id, tipo, monto, descripcion, creado_por, campania_id)
     VALUES (?, 'ingreso', ?, ?, ?, ?)`
  ).run(ig, monto, 'Aporte a campaña', req.user.persona_id, c.id);

  auditar(ig, req.user.persona_id, 'campania_aporte', 'tesoreria', `${c.nombre}: ${monto}`,
    { tabla: 'movimiento', id: info.lastInsertRowid });
  res.json({ ok: true });
});

// Cerrar: la campania deja de admitir aportes pero SIGUE consultable. No se
// borra, para no perder el historial de para que se junto.
//
// `cerrada_en IS NULL` en el WHERE: cerrar dos veces no reescribe la fecha del
// primer cierre.
r.patch('/campanias/:id/cerrar', soloTesorero, limiterSensible, (req, res) => {
  const ig = req.user.iglesia_id;
  const c = db.prepare('SELECT id, nombre FROM campania WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, ig);
  if (!c) return res.status(404).json({ error: 'Campaña no encontrada' });
  // datetime('now') es UTC: el frontend lo pinta con fechaDeUTC().
  db.prepare("UPDATE campania SET cerrada_en = datetime('now') WHERE id = ? AND iglesia_id = ? AND cerrada_en IS NULL")
    .run(c.id, ig);
  auditar(ig, req.user.persona_id, 'campania_cerrar', 'tesoreria', c.nombre,
    { tabla: 'campania', id: c.id });
  res.json({ ok: true });
});

// Borrar un aporte: la unica forma de deshacer un error de tecleo en toda la
// tesoreria. Acotado A PROPOSITO a los aportes de campania — que ningun otro
// movimiento se pueda corregir es un problema mas amplio y es otro trabajo.
//
// ⚠️ `campania_id = ?` es lo que impide que esta ruta alcance un movimiento
// normal: los normales tienen campania_id NULL, y en SQL `NULL = cualquier
// cosa` NUNCA es cierto. Sin esa condicion, esto seria una forma de borrar la
// contabilidad entera de la iglesia pasando cualquier id.
r.delete('/campanias/:id/aportes/:movId', soloTesorero, limiterSensible, (req, res) => {
  const ig = req.user.iglesia_id;
  const m = db.prepare(
    `SELECT id, monto FROM movimiento
      WHERE id = ? AND iglesia_id = ? AND campania_id = ?`
  ).get(req.params.movId, ig, req.params.id);
  if (!m) return res.status(404).json({ error: 'Aporte no encontrado' });

  db.prepare('DELETE FROM movimiento WHERE id = ? AND iglesia_id = ?').run(m.id, ig);
  // Se audita SIEMPRE: borrar dinero sin dejar rastro de quien fue no es
  // aceptable en la pantalla de la tesoreria.
  auditar(ig, req.user.persona_id, 'campania_aporte_borrar', 'tesoreria', String(m.monto),
    { tabla: 'campania', id: Number(req.params.id) });
  res.json({ ok: true });
});

// --- Transparencia (resumen sin datos personales) ---
r.get('/transparencia', (req, res) => {
  const ig = req.user.iglesia_id;
  const recaudado = sum(ig, "AND tipo = 'ingreso'");
  const gastado = sum(ig, "AND tipo = 'gasto'");
  // GROUP BY sobre la MISMA expresion que se selecciona: si se agrupa por la
  // columna cruda "categoria", NULL y el texto literal 'otro' caen en grupos
  // distintos aunque el SELECT los etiquete igual (dos filas "otro").
  const porCategoria = db.prepare(
    "SELECT COALESCE(categoria,'otro') AS categoria, SUM(monto) AS monto FROM movimiento WHERE iglesia_id = ? AND tipo = 'gasto' GROUP BY COALESCE(categoria,'otro') ORDER BY monto DESC"
  ).all(ig);
  res.json({ recaudado, gastado, saldo: recaudado - gastado, porCategoria });
});

export default r;
