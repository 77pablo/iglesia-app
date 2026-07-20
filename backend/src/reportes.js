// ============================================================
//  Reportes y estadisticas del pastor
//  Tendencias de asistencia, tesoreria y crecimiento, mas
//  exportacion a CSV. Agregaciones en SQL (strftime por mes).
//  Acceso: SOLO el pastor de su propia iglesia (esPastor).
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esPastor, auditar } from './auth.js';

const r = Router();
r.use(authMiddleware);

// Todo el modulo es exclusivo del pastor (el obispo tiene su propio panel).
r.use((req, res, next) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor' });
  next();
});

// --- Asistencia: serie mensual (total) + desglose por grupo ---
function asistenciaMensual(iglesiaId) {
  return db.prepare(
    `SELECT strftime('%Y-%m', e.fecha) AS mes, COUNT(*) AS total
       FROM asistencia a JOIN evento e ON e.id = a.evento_id
      WHERE e.iglesia_id = ?
      GROUP BY mes ORDER BY mes`
  ).all(iglesiaId);
}
function asistenciaPorGrupo(iglesiaId) {
  return db.prepare(
    `SELECT strftime('%Y-%m', e.fecha) AS mes, e.grupo_id AS grupo_id,
            COALESCE(g.nombre, 'General') AS grupo, COUNT(*) AS total
       FROM asistencia a
       JOIN evento e ON e.id = a.evento_id
       LEFT JOIN grupo g ON g.id = e.grupo_id
      WHERE e.iglesia_id = ?
      GROUP BY mes, e.grupo_id ORDER BY mes, grupo`
  ).all(iglesiaId);
}
r.get('/asistencia', (req, res) => {
  const ig = req.user.iglesia_id;
  res.json({ mensual: asistenciaMensual(ig), porGrupo: asistenciaPorGrupo(ig) });
});

// --- Tesoreria: ingresos/gastos por mes + saldo ---
function tesoreriaMensual(iglesiaId) {
  const filas = db.prepare(
    `SELECT strftime('%Y-%m', fecha) AS mes,
            COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN tipo = 'gasto'   THEN monto ELSE 0 END), 0) AS gastos
       FROM movimiento
      WHERE iglesia_id = ?
      GROUP BY mes ORDER BY mes`
  ).all(iglesiaId);
  return filas.map(f => ({ ...f, saldo: f.ingresos - f.gastos }));
}
r.get('/tesoreria', (req, res) => {
  const ig = req.user.iglesia_id;
  const mensual = tesoreriaMensual(ig);
  const saldoTotal = mensual.reduce((a, f) => a + f.saldo, 0);
  res.json({ mensual, saldoTotal });
});

// --- Crecimiento: altas por mes (persona.creada_en) + total activos ---
function crecimientoMensual(iglesiaId) {
  return db.prepare(
    `SELECT strftime('%Y-%m', creada_en) AS mes, COUNT(*) AS altas
       FROM persona
      WHERE iglesia_id = ?
      GROUP BY mes ORDER BY mes`
  ).all(iglesiaId);
}
r.get('/crecimiento', (req, res) => {
  const ig = req.user.iglesia_id;
  const totalActivos = db.prepare('SELECT COUNT(*) AS n FROM persona WHERE iglesia_id = ? AND activo = 1').get(ig).n;
  res.json({ mensual: crecimientoMensual(ig), totalActivos });
});

// --- Exportar a CSV (con BOM, para que Excel respete los acentos) ---
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function aCsv(filas) {
  return filas.map(f => f.map(csvCell).join(',')).join('\r\n');
}

r.get('/export.csv', (req, res) => {
  const ig = req.user.iglesia_id;
  const tipo = String(req.query.tipo || '');

  let filas;
  let nombre;
  if (tipo === 'asistencia') {
    nombre = 'reporte-asistencia.csv';
    filas = [['Mes', 'Grupo', 'Total asistencia']];
    for (const f of asistenciaPorGrupo(ig)) filas.push([f.mes, f.grupo, f.total]);
  } else if (tipo === 'tesoreria') {
    nombre = 'reporte-tesoreria.csv';
    filas = [['Mes', 'Ingresos', 'Gastos', 'Saldo']];
    for (const f of tesoreriaMensual(ig)) filas.push([f.mes, f.ingresos, f.gastos, f.saldo]);
  } else if (tipo === 'crecimiento') {
    nombre = 'reporte-crecimiento.csv';
    const totalActivos = db.prepare('SELECT COUNT(*) AS n FROM persona WHERE iglesia_id = ? AND activo = 1').get(ig).n;
    filas = [['Mes', 'Altas']];
    for (const f of crecimientoMensual(ig)) filas.push([f.mes, f.altas]);
    filas.push([]);
    filas.push(['Total miembros activos', totalActivos]);
  } else {
    return res.status(400).json({ error: 'Tipo de reporte invalido (usa asistencia, tesoreria o crecimiento)' });
  }

  const csv = aCsv(filas);
  auditar(ig, req.user.persona_id, 'exportar_reporte', 'reportes', tipo);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send('﻿' + csv);
});

export default r;
