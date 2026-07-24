// ============================================================
//  Fase 3: Tesoreria (contabilidad + transparencia)
//  Solo tesorero o pastor. La app NO recibe pagos: el tesorero
//  registra lo recaudado de forma presencial.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, esTesoreroOPastor, esTesoreroEstricto, esObispo, auditar } from './auth.js';
import { validar, limiterSensible } from './seguridad.js';

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
  res.json({ saldo: ing - gas, ingMes, gasMes, balanceMes: ingMes - gasMes });
});

// --- Movimientos (paginados; ?offset=0 -> devuelve hayMas para "ver más") ---
r.get('/movimientos', (req, res) => {
  const LIMIT = 50;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const rows = db.prepare('SELECT * FROM movimiento WHERE iglesia_id = ? ORDER BY fecha DESC, id DESC LIMIT ? OFFSET ?')
    .all(req.user.iglesia_id, LIMIT + 1, offset);
  const hayMas = rows.length > LIMIT;
  res.json({ items: hayMas ? rows.slice(0, LIMIT) : rows, hayMas, offset });
});
// Rutas que escriben dinero: ademas de zod, llevan el limitador sensible
// (10 req/IP/15min) — ver nota de trade-off en server.js sobre por que
// las lecturas de tesoreria NO llevan este limite.
const movimientoSchema = z.object({
  tipo: z.enum(['ingreso', 'gasto']),
  categoria: z.string().trim().max(100).optional(),
  monto: z.coerce.number().positive('el monto debe ser un numero mayor que cero'),
  descripcion: z.string().trim().max(500).optional(),
  // Formato fijo YYYY-MM-DD (o vacio/omitido -> usa el default de la BD).
  // Sin este formato, un string cualquiera pasaba a SQLite y strftime()
  // devolvia NULL, rompiendo los totales mensuales (resumen/reportes).
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha invalida').optional().or(z.literal('')),
  comprobante_url: z.string().trim().max(500).optional()
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

// --- Campañas ---
r.get('/campanias', (req, res) => {
  res.json(db.prepare('SELECT * FROM campania WHERE iglesia_id = ?').all(req.user.iglesia_id));
});
const campaniaSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre'),
  meta: z.coerce.number().optional()
});
r.post('/campanias', soloTesorero, limiterSensible, validar(campaniaSchema), (req, res) => {
  const { nombre, meta } = req.body;
  const metaNum = meta;
  db.prepare('INSERT INTO campania (iglesia_id, nombre, meta, recaudado) VALUES (?,?,?,0)')
    .run(req.user.iglesia_id, nombre, (Number.isFinite(metaNum) && metaNum > 0) ? metaNum : 0);
  res.json({ ok: true });
});
const aportarSchema = z.object({
  monto: z.coerce.number().positive('el aporte debe ser un numero mayor que cero')
});
r.patch('/campanias/:id/aportar', soloTesorero, limiterSensible, validar(aportarSchema), (req, res) => {
  const { monto } = req.body;
  const info = db.prepare('UPDATE campania SET recaudado = recaudado + ? WHERE id = ? AND iglesia_id = ?')
    .run(monto, req.params.id, req.user.iglesia_id);
  if (info.changes === 0) return res.status(404).json({ error: 'Campaña no encontrada' });
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
