// ============================================================
//  Fase 3: Tesoreria (contabilidad + transparencia)
//  Solo tesorero o pastor. La app NO recibe pagos: el tesorero
//  registra lo recaudado de forma presencial.
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esTesoreroOPastor, esTesoreroEstricto, esObispo, auditar } from './auth.js';

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
  const ingMes = sum(ig, "AND tipo = 'ingreso' AND strftime('%Y-%m', fecha) = strftime('%Y-%m','now')");
  const gasMes = sum(ig, "AND tipo = 'gasto'   AND strftime('%Y-%m', fecha) = strftime('%Y-%m','now')");
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
r.post('/movimientos', soloTesorero, (req, res) => {
  const { tipo, categoria, monto, descripcion, fecha, comprobante_url } = req.body || {};
  if (!['ingreso', 'gasto'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido (debe ser ingreso o gasto)' });
  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0)
    return res.status(400).json({ error: 'El monto debe ser un número mayor que cero' });
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
r.post('/campanias', soloTesorero, (req, res) => {
  const { nombre, meta } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'Falta el nombre' });
  const metaNum = Number(meta);
  db.prepare('INSERT INTO campania (iglesia_id, nombre, meta, recaudado) VALUES (?,?,?,0)')
    .run(req.user.iglesia_id, nombre, (Number.isFinite(metaNum) && metaNum > 0) ? metaNum : 0);
  res.json({ ok: true });
});
r.patch('/campanias/:id/aportar', soloTesorero, (req, res) => {
  const monto = Number((req.body || {}).monto);
  if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ error: 'El aporte debe ser un número mayor que cero' });
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
  const porCategoria = db.prepare(
    "SELECT COALESCE(categoria,'otro') AS categoria, SUM(monto) AS monto FROM movimiento WHERE iglesia_id = ? AND tipo = 'gasto' GROUP BY categoria ORDER BY monto DESC"
  ).all(ig);
  res.json({ recaudado, gastado, saldo: recaudado - gastado, porCategoria });
});

export default r;
