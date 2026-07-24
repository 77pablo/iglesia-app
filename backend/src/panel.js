// ============================================================
//  Fase 2.2: Panel del pastor + ausentes
//  Soporta filtro por grupo (?grupo_id=) y exportación CSV.
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, puedeVerComoPastor, auditar } from './auth.js';

const r = Router();
r.use(authMiddleware);

// Miembros del grupo (distintos, activos)
function miembrosDeGrupo(grupoId) {
  return db.prepare(
    `SELECT DISTINCT p.id, p.nombre FROM persona p
       JOIN pertenencia pe ON pe.persona_id = p.id
      WHERE pe.grupo_id = ? AND p.activo = 1 ORDER BY p.nombre`
  ).all(grupoId);
}

r.get('/', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  if (!puedeVerComoPastor(persona_id)) return res.status(403).json({ error: 'Solo el pastor' });

  // Filtro opcional por grupo (debe ser un grupo de la iglesia)
  const grupos = db.prepare('SELECT id, nombre FROM grupo WHERE iglesia_id = ? ORDER BY nombre').all(iglesia_id);
  const grupoId = grupos.some(g => g.id === Number(req.query.grupo_id)) ? Number(req.query.grupo_id) : null;

  // Miembros: del grupo si hay filtro, o de toda la iglesia
  const miembros = grupoId
    ? miembrosDeGrupo(grupoId).length
    : db.prepare('SELECT COUNT(*) AS n FROM persona WHERE iglesia_id = ? AND activo = 1').get(iglesia_id).n;

  // Reuniones recientes CON asistencia (para la tendencia), filtradas por grupo si aplica
  const reuniones = db.prepare(
    `SELECT e.id, e.titulo, e.fecha,
            (SELECT COUNT(*) FROM asistencia a WHERE a.evento_id = e.id) AS total
       FROM evento e
      WHERE e.iglesia_id = ? ${grupoId ? 'AND e.grupo_id = ?' : ''}
      ORDER BY e.fecha DESC, e.id DESC`
  ).all(...(grupoId ? [iglesia_id, grupoId] : [iglesia_id])).filter(x => x.total > 0).slice(0, 6);

  const totales = reuniones.map(x => x.total);
  const promedio = totales.length ? Math.round(totales.reduce((a, b) => a + b, 0) / totales.length) : 0;
  const ultima = reuniones[0] || null;

  // Ausentes de la ultima reunion (miembros del grupo que no asistieron)
  let ausentes = [];
  if (ultima) {
    const ev = db.prepare('SELECT * FROM evento WHERE id = ?').get(ultima.id);
    if (ev.grupo_id) {
      const miembrosG = miembrosDeGrupo(ev.grupo_id);
      const presentes = new Set(
        db.prepare('SELECT persona_id FROM asistencia WHERE evento_id = ?').all(ev.id).map(x => x.persona_id)
      );
      ausentes = miembrosG.filter(m => !presentes.has(m.id));
    }
  }

  res.json({
    miembros, promedio, ultima,
    reuniones: reuniones.slice().reverse(),  // cronologico para la grafica
    ausentes, grupos, grupoId
  });
});

// --- Exportar asistencia a CSV (abre en Excel) ---
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

r.get('/export.csv', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  if (!puedeVerComoPastor(persona_id)) return res.status(403).json({ error: 'Solo el pastor' });

  const grupos = db.prepare('SELECT id FROM grupo WHERE iglesia_id = ?').all(iglesia_id);
  const grupoId = grupos.some(g => g.id === Number(req.query.grupo_id)) ? Number(req.query.grupo_id) : null;

  // Filas Evento x Miembro-del-grupo-del-evento, con su asistencia (Si/No),
  // en UNA sola consulta (antes: 1 query de miembros + 1 de presentes POR
  // evento, es decir 2N consultas para N eventos). DISTINCT en la subconsulta
  // de pertenencia evita filas dobles cuando una persona tiene mas de un rol
  // en el mismo grupo (admin+miembro), igual que hacia miembrosDeGrupo().
  // Eventos sin ningun miembro activo en su grupo quedan fuera (mismo
  // resultado que el "if (!miembros.length) continue" de antes).
  const filas = [['Fecha', 'Evento', 'Grupo', 'Persona', 'Asistio']];
  const rows = db.prepare(
    `SELECT e.fecha, e.titulo, g.nombre AS grupo, p.nombre AS persona,
            CASE WHEN a.persona_id IS NOT NULL THEN 1 ELSE 0 END AS asistio
       FROM evento e
       JOIN grupo g ON g.id = e.grupo_id
       JOIN (SELECT DISTINCT persona_id, grupo_id FROM pertenencia) pe ON pe.grupo_id = g.id
       JOIN persona p ON p.id = pe.persona_id AND p.activo = 1
       LEFT JOIN asistencia a ON a.evento_id = e.id AND a.persona_id = p.id
      WHERE e.iglesia_id = ? ${grupoId ? 'AND e.grupo_id = ?' : ''}
      ORDER BY e.fecha, e.id, p.nombre`
  ).all(...(grupoId ? [iglesia_id, grupoId] : [iglesia_id]));
  for (const row of rows)
    filas.push([row.fecha, row.titulo, row.grupo || '', row.persona, row.asistio ? 'Si' : 'No']);

  const csv = filas.map(f => f.map(csvCell).join(',')).join('\r\n');
  auditar(iglesia_id, persona_id, 'exportar_asistencia', 'panel', grupoId ? 'grupo ' + grupoId : 'todos');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="asistencia.csv"');
  res.send('﻿' + csv);  // BOM para que Excel respete los acentos
});

export default r;
