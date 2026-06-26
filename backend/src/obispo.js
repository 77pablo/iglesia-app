// ============================================================
//  Fase 4.9: Panel del Obispo — visión sobre TODAS las iglesias
//  El obispo/super-admin observan (solo lectura) cualquier congregación,
//  por encima del aislamiento por iglesia. Solo ellos acceden aquí.
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esObispo, auditar } from './auth.js';

const r = Router();
r.use(authMiddleware);
// Toda la sección es exclusiva del obispo / super-admin.
r.use((req, res, next) => {
  if (!esObispo(req.user.persona_id)) return res.status(403).json({ error: 'Solo el obispo' });
  next();
});

const saldoSQL = `(SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END),0)
                     FROM movimiento m WHERE m.iglesia_id = i.id)`;

// --- Resumen de TODAS las iglesias (tarjetas) ---
r.get('/resumen', (req, res) => {
  const iglesias = db.prepare(
    `SELECT i.id, i.nombre, i.codigo_unico,
        (SELECT nombre FROM persona WHERE iglesia_id = i.id AND es_pastor = 1 LIMIT 1) AS pastor,
        (SELECT COUNT(*) FROM persona p WHERE p.iglesia_id = i.id AND p.activo = 1) AS miembros,
        (SELECT COUNT(*) FROM grupo  g WHERE g.iglesia_id = i.id) AS grupos,
        (SELECT COUNT(*) FROM evento e WHERE e.iglesia_id = i.id) AS eventos,
        ${saldoSQL} AS saldo
       FROM iglesia i ORDER BY i.nombre`
  ).all();
  // Asistencia promedio por iglesia (reuniones con asistencia)
  for (const ig of iglesias) {
    const rows = db.prepare(
      `SELECT (SELECT COUNT(*) FROM asistencia a WHERE a.evento_id = e.id) AS n
         FROM evento e WHERE e.iglesia_id = ?`
    ).all(ig.id).map(x => x.n).filter(n => n > 0);
    ig.asistenciaPromedio = rows.length ? Math.round(rows.reduce((a, b) => a + b, 0) / rows.length) : 0;
  }
  auditar(req.user.iglesia_id, req.user.persona_id, 'obispo_resumen', 'panel_obispo', String(iglesias.length));
  res.json(iglesias);
});

// --- Informe MENSUAL (solo lectura) de UNA iglesia, por apartado ---
r.get('/iglesia/:id', (req, res) => {
  const ig = db.prepare('SELECT id, nombre, codigo_unico FROM iglesia WHERE id = ?').get(req.params.id);
  if (!ig) return res.status(404).json({ error: 'Iglesia no encontrada' });

  // Mes del informe (YYYY-MM); por defecto el mes actual.
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes
    : db.prepare("SELECT strftime('%Y-%m','now') AS m").get().m;

  // --- Generales (no dependen del mes) ---
  const miembros = db.prepare('SELECT COUNT(*) AS n FROM persona WHERE iglesia_id = ? AND activo = 1').get(ig.id).n;
  const pastor = db.prepare('SELECT nombre FROM persona WHERE iglesia_id = ? AND es_pastor = 1 LIMIT 1').get(ig.id);
  const grupos = db.prepare(
    `SELECT g.nombre, (SELECT COUNT(DISTINCT persona_id) FROM pertenencia pe WHERE pe.grupo_id = g.id) AS miembros
       FROM grupo g WHERE g.iglesia_id = ? ORDER BY g.nombre`
  ).all(ig.id);
  const lideres = db.prepare(
    `SELECT DISTINCT p.nombre, pe.rol, g.nombre AS grupo
       FROM pertenencia pe JOIN persona p ON p.id = pe.persona_id JOIN grupo g ON g.id = pe.grupo_id
      WHERE p.iglesia_id = ? AND pe.rol IN ('admin','lider_musica','lider_ed','tesorero') ORDER BY p.nombre`
  ).all(ig.id);

  // --- 📅 Eventos del mes ---
  const eventosMes = db.prepare(
    `SELECT e.id, e.titulo, e.fecha, e.estado, g.nombre AS grupo,
            (SELECT COUNT(*) FROM asistencia a WHERE a.evento_id = e.id) AS asistencia
       FROM evento e LEFT JOIN grupo g ON g.id = e.grupo_id
      WHERE e.iglesia_id = ? AND strftime('%Y-%m', e.fecha) = ? ORDER BY e.fecha`
  ).all(ig.id, mes);

  // --- ✅ Asistencia del mes (promedio sobre reuniones con asistencia) ---
  const conAsist = eventosMes.map(e => e.asistencia).filter(n => n > 0);
  const asistenciaProm = conAsist.length ? Math.round(conAsist.reduce((a, b) => a + b, 0) / conAsist.length) : 0;

  // --- 💰 Tesorería del mes ---
  const ingMes = db.prepare("SELECT COALESCE(SUM(monto),0) AS n FROM movimiento WHERE iglesia_id = ? AND tipo='ingreso' AND strftime('%Y-%m',fecha)=?").get(ig.id, mes).n;
  const gasMes = db.prepare("SELECT COALESCE(SUM(monto),0) AS n FROM movimiento WHERE iglesia_id = ? AND tipo='gasto'   AND strftime('%Y-%m',fecha)=?").get(ig.id, mes).n;
  const saldoTotal = db.prepare("SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END),0) AS n FROM movimiento WHERE iglesia_id=?").get(ig.id).n;

  // --- 📖 Prédicas del mes · 📢 Anuncios del mes · ❤️ Cuidado · 👶 Niños ---
  const predicasMes = db.prepare("SELECT id, titulo, fecha, predicador FROM predica WHERE iglesia_id=? AND strftime('%Y-%m',COALESCE(fecha,creado_en))=? ORDER BY fecha").all(ig.id, mes);
  const anunciosMes = db.prepare("SELECT COUNT(*) AS n FROM anuncio WHERE iglesia_id=? AND strftime('%Y-%m',creado_en)=?").get(ig.id, mes).n;
  const casosAbiertos = db.prepare("SELECT COUNT(*) AS n FROM caso_cuidado WHERE iglesia_id=? AND estado!='atendido'").get(ig.id).n;
  const clases = db.prepare('SELECT COUNT(*) AS n FROM clase_ed WHERE iglesia_id=?').get(ig.id).n;
  const ninos = db.prepare('SELECT COUNT(*) AS n FROM nino WHERE iglesia_id=?').get(ig.id).n;

  auditar(req.user.iglesia_id, req.user.persona_id, 'obispo_informe', 'panel_obispo', `${ig.nombre} ${mes}`);
  res.json({
    iglesia: ig, mes, pastor: pastor ? pastor.nombre : '—', miembros, grupos, lideres,
    eventosMes, asistencia: { promedio: asistenciaProm, reuniones: conAsist.length },
    tesoreria: { ingresosMes: ingMes, gastosMes: gasMes, balanceMes: ingMes - gasMes, saldoTotal },
    predicasMes, anunciosMes, cuidado: { casosAbiertos }, ninos: { clases, ninos }
  });
});

// --- Detalle de tesorería del mes (movimientos) ---
r.get('/iglesia/:id/tesoreria', (req, res) => {
  const ig = db.prepare('SELECT id FROM iglesia WHERE id = ?').get(req.params.id);
  if (!ig) return res.status(404).json({ error: 'Iglesia no encontrada' });
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : db.prepare("SELECT strftime('%Y-%m','now') AS m").get().m;
  res.json(db.prepare("SELECT tipo, categoria, monto, descripcion, fecha, comprobante_url FROM movimiento WHERE iglesia_id=? AND strftime('%Y-%m',fecha)=? ORDER BY fecha DESC, id DESC").all(ig.id, mes));
});

// --- Detalle de asistencia del mes (eventos + asistentes) ---
r.get('/iglesia/:id/asistencia', (req, res) => {
  const ig = db.prepare('SELECT id FROM iglesia WHERE id = ?').get(req.params.id);
  if (!ig) return res.status(404).json({ error: 'Iglesia no encontrada' });
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : db.prepare("SELECT strftime('%Y-%m','now') AS m").get().m;
  const eventos = db.prepare("SELECT id, titulo, fecha FROM evento WHERE iglesia_id=? AND strftime('%Y-%m',fecha)=? ORDER BY fecha").all(ig.id, mes);
  for (const ev of eventos)
    ev.presentes = db.prepare("SELECT p.nombre FROM asistencia a JOIN persona p ON p.id=a.persona_id WHERE a.evento_id=? ORDER BY p.nombre").all(ev.id).map(x => x.nombre);
  res.json(eventos);
});

// --- Detalle de una prédica (cualquier iglesia, solo lectura) ---
r.get('/predica/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM predica WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'No encontrada' });
  const recursos = db.prepare('SELECT tipo, titulo, url FROM predica_recurso WHERE predica_id = ?').all(p.id);
  res.json({ ...p, recursos });
});

export default r;
