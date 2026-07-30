// ============================================================
//  Fase 3: Niños / Escuela Dominical  -  lider_ed o pastor
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
// Sin `auditar`: lo unico que se auditaba en este modulo era la asistencia, que
// ya no existe. Crear clase / inscribir nino / subir leccion nunca se auditaron.
import { authMiddleware, esLiderEdOPastor, esLiderEdEstricto, esObispo } from './auth.js';
import { validar, zRutaSubidaOpcional } from './seguridad.js';

const r = Router();
r.use(authMiddleware);
// Ver el módulo: el líder de Escuela Dominical o el pastor (observa).
r.use((req, res, next) => {
  if (!esLiderEdOPastor(req.user.persona_id) && !esObispo(req.user.persona_id)) return res.status(403).json({ error: 'Solo Escuela Dominical o el pastor' });
  next();
});
// Editar (crear clases, niños, material, asistencia): SOLO el encargado; el pastor solo observa.
function soloEncargado(req, res, next) {
  if (!esLiderEdEstricto(req.user.persona_id))
    return res.status(403).json({ error: 'Solo el encargado de Escuela Dominical puede editar (el pastor solo observa).' });
  next();
}

// --- Clases ---
r.get('/clases', (req, res) => {
  res.json(db.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM nino n WHERE n.clase_id = c.id) AS ninos
       FROM clase_ed c WHERE c.iglesia_id = ? ORDER BY c.nombre`
  ).all(req.user.iglesia_id));
});
const claseSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre'),
  edad: z.string().trim().optional()
});
r.post('/clases', soloEncargado, validar(claseSchema), (req, res) => {
  const { nombre, edad } = req.body;
  db.prepare('INSERT INTO clase_ed (iglesia_id, nombre, edad) VALUES (?,?,?)').run(req.user.iglesia_id, nombre, edad || null);
  res.json({ ok: true });
});

// Verifica que la clase pertenezca a la iglesia del usuario (aislamiento multi-iglesia)
function claseDeIglesia(claseId, iglesiaId) {
  return db.prepare('SELECT id FROM clase_ed WHERE id = ? AND iglesia_id = ?').get(claseId, iglesiaId);
}

// --- Niños ---
r.get('/clase/:id/ninos', (req, res) => {
  if (!claseDeIglesia(req.params.id, req.user.iglesia_id)) return res.status(404).json({ error: 'Clase no encontrada' });
  res.json(db.prepare('SELECT * FROM nino WHERE clase_id = ? ORDER BY nombre').all(req.params.id));
});
const ninoSchema = z.object({
  clase_id: z.coerce.number().int().positive('falta la clase'),
  nombre: z.string().trim().min(1, 'falta el nombre'),
  edad: z.string().trim().optional(),
  familia: z.string().trim().optional(),
  alergias: z.string().trim().optional(),
  autorizados: z.string().trim().optional()
});
r.post('/ninos', soloEncargado, validar(ninoSchema), (req, res) => {
  const { clase_id, nombre, edad, familia, alergias, autorizados } = req.body;
  if (!claseDeIglesia(clase_id, req.user.iglesia_id)) return res.status(404).json({ error: 'Clase no encontrada' });
  db.prepare('INSERT INTO nino (iglesia_id, clase_id, nombre, edad, familia, alergias, autorizados) VALUES (?,?,?,?,?,?,?)')
    .run(req.user.iglesia_id, clase_id, nombre, edad || null, familia || null, alergias || null, autorizados || null);
  res.json({ ok: true });
});

// --- Material / lecciones ---
r.get('/clase/:id/material', (req, res) => {
  if (!claseDeIglesia(req.params.id, req.user.iglesia_id)) return res.status(404).json({ error: 'Clase no encontrada' });
  res.json(db.prepare('SELECT * FROM leccion WHERE clase_id = ? ORDER BY fecha DESC').all(req.params.id));
});
const materialSchema = z.object({
  clase_id: z.coerce.number().int().positive('falta la clase'),
  titulo: z.string().trim().min(1, 'falta el titulo'),
  fecha: z.string().trim().optional(),
  versiculo: z.string().trim().optional(),
  // El documento de la leccion se sube por /api/upload; el formulario manda ''
  // cuando la leccion no lleva material.
  material_url: zRutaSubidaOpcional(1000).optional()
});
r.post('/material', soloEncargado, validar(materialSchema), (req, res) => {
  const { clase_id, fecha, titulo, versiculo, material_url } = req.body;
  if (!claseDeIglesia(clase_id, req.user.iglesia_id)) return res.status(404).json({ error: 'Clase no encontrada' });
  db.prepare('INSERT INTO leccion (iglesia_id, clase_id, fecha, titulo, versiculo, material_url) VALUES (?,?,?,?,?,?)')
    .run(req.user.iglesia_id, clase_id, fecha || null, titulo, versiculo || null, material_url || null);
  res.json({ ok: true });
});

// --- Asistencia: RETIRADA (decision del dueno, 30 jul 2026) ---
// La iglesia no pasa lista de los ninos, asi que POST /asistencia salio de la
// app junto con su tarjeta en la pantalla de la clase.
//
// La tabla `asistencia_nino` NO se borro a proposito: en produccion hay una
// iglesia de verdad y lo ya anotado se conserva. Nada la escribe ahora mismo;
// su indice unico sigue en db.js protegiendo ese historial.
//
// Efecto colateral asumido: `asistencia_nino.retiro_por` ("quien se llevo al
// nino ese domingo") queda sin forma de rellenarse. `nino.autorizados` —quien
// PUEDE retirarlo— vive en la ficha del nino y sigue en pie.
// Regresion en test/ninos-sin-asistencia.test.js.

export default r;
