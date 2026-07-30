// ============================================================
//  Disponibilidad: "no puedo servir del X al Y".
//
//  La tabla fecha_no_disp existia desde siempre y asignaciones.js YA la
//  consulta al asignar, pero nadie la escribia nunca. Esto es la mitad que
//  faltaba. Ver docs/superpowers/specs/2026-07-30-no-puedo-servir-design.md
//
//  Cada quien marca SOLO lo suyo: el persona_id sale del token, nunca del body.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, esLiderOAdmin } from './auth.js';
import { validar } from './seguridad.js';

const r = Router();
r.use(authMiddleware);

// Fecha sin hora. NO se convierte a zona horaria en ningun momento: se guarda y
// se compara como texto YYYY-MM-DD, que ordena igual que cronologicamente.
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const periodoSchema = z.object({
  desde: z.string().trim().regex(FECHA, 'elige la fecha de inicio (día, mes y año)'),
  hasta: z.string().trim().regex(FECHA, 'elige la fecha de término (día, mes y año)'),
  motivo: z.string().trim().max(200, 'el motivo es muy largo (máximo 200 caracteres)').optional()
}).refine(p => p.hasta >= p.desde, {
  error: 'la fecha de término no puede ser anterior a la de inicio',
  path: ['hasta']
});

// GET /api/disponibilidad/mias
r.get('/mias', (req, res) => {
  res.json(db.prepare(
    'SELECT id, desde, hasta, motivo FROM fecha_no_disp WHERE persona_id = ? ORDER BY desde'
  ).all(req.user.persona_id));
});

// POST /api/disponibilidad
r.post('/', validar(periodoSchema), (req, res) => {
  const { desde, hasta, motivo } = req.body;
  const info = db.prepare(
    'INSERT INTO fecha_no_disp (persona_id, desde, hasta, motivo) VALUES (?,?,?,?)'
  ).run(req.user.persona_id, desde, hasta, motivo || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

// DELETE /api/disponibilidad/:id — solo el propio.
// 404 (y no 403) a proposito: no confirma que ese periodo exista.
r.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM fecha_no_disp WHERE id = ? AND persona_id = ?')
    .run(req.params.id, req.user.persona_id);
  if (!info.changes) return res.status(404).json({ error: 'Periodo no encontrado' });
  res.json({ ok: true });
});

// GET /api/disponibilidad/no-disponibles?fecha=YYYY-MM-DD
// Para que el lider lo vea ANTES de asignar (hoy el aviso llega despues, cuando
// a la persona ya le salio el push "te asignaron").
//
// Devuelve SOLO ids, nunca motivos: con eso basta para pintar la marca en el
// desplegable, y no le manda al navegador del lider los motivos de toda la iglesia.
const fechaQuerySchema = z.object({
  fecha: z.string().trim().regex(FECHA, 'elige una fecha')
});
r.get('/no-disponibles', validar(fechaQuerySchema, 'query'), (req, res) => {
  if (!esLiderOAdmin(req.user.persona_id))
    return res.status(403).json({ error: 'Solo quien asigna servicios puede ver esto' });
  // El JOIN con persona es lo que impide ver a gente de otra iglesia:
  // fecha_no_disp NO tiene columna de iglesia, cuelga de la persona.
  const filas = db.prepare(
    `SELECT DISTINCT f.persona_id
       FROM fecha_no_disp f
       JOIN persona p ON p.id = f.persona_id
      WHERE p.iglesia_id = ? AND ? BETWEEN f.desde AND f.hasta`
  ).all(req.user.iglesia_id, req.query.fecha);
  res.json(filas.map(f => f.persona_id));
});

export default r;
