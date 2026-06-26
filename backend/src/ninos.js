// ============================================================
//  Fase 3: Niños / Escuela Dominical  -  lider_ed o pastor
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esLiderEdOPastor, esLiderEdEstricto, esObispo, auditar } from './auth.js';

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
r.post('/clases', soloEncargado, (req, res) => {
  const { nombre, edad } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'Falta el nombre' });
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
r.post('/ninos', soloEncargado, (req, res) => {
  const { clase_id, nombre, edad, familia, alergias, autorizados } = req.body || {};
  if (!clase_id || !nombre) return res.status(400).json({ error: 'Falta clase y nombre' });
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
r.post('/material', soloEncargado, (req, res) => {
  const { clase_id, fecha, titulo, versiculo, material_url } = req.body || {};
  if (!clase_id || !titulo) return res.status(400).json({ error: 'Falta clase y título' });
  if (!claseDeIglesia(clase_id, req.user.iglesia_id)) return res.status(404).json({ error: 'Clase no encontrada' });
  db.prepare('INSERT INTO leccion (iglesia_id, clase_id, fecha, titulo, versiculo, material_url) VALUES (?,?,?,?,?,?)')
    .run(req.user.iglesia_id, clase_id, fecha || null, titulo, versiculo || null, material_url || null);
  res.json({ ok: true });
});

// --- Asistencia ---
r.post('/asistencia', soloEncargado, (req, res) => {
  const { clase_id, fecha, presentes } = req.body || {};
  if (!clase_id || !fecha) return res.status(400).json({ error: 'Falta clase y fecha' });
  if (!claseDeIglesia(clase_id, req.user.iglesia_id)) return res.status(404).json({ error: 'Clase no encontrada' });
  db.prepare('DELETE FROM asistencia_nino WHERE clase_id = ? AND fecha = ?').run(clase_id, fecha);
  const st = db.prepare('INSERT INTO asistencia_nino (clase_id, nino_id, fecha, retiro_por) VALUES (?,?,?,?)');
  for (const p of (presentes || [])) st.run(clase_id, p.nino_id, fecha, p.retiro_por || null);
  auditar(req.user.iglesia_id, req.user.persona_id, 'asistencia_ninos', 'ninos', 'clase ' + clase_id);
  res.json({ ok: true, total: (presentes || []).length });
});

export default r;
