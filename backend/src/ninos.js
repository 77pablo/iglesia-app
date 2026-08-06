// ============================================================
//  Fase 3: Niños / Escuela Dominical  -  lider_ed o pastor
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, esLiderEdOPastor, esLiderEdEstricto, esObispo, auditar } from './auth.js';
import { validar, zRutaSubidaOpcional } from './seguridad.js';

const r = Router();
r.use(authMiddleware);
// Ver el módulo: el líder de Escuela Dominical o el pastor (observa).
r.use((req, res, next) => {
  if (!esLiderEdOPastor(req.user.persona_id) && !esObispo(req.user.persona_id)) return res.status(403).json({ error: 'Solo Escuela Dominical o el pastor' });
  next();
});
// Editar (crear clases, niños, material): SOLO el encargado; el pastor solo observa.
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
  // Texto libre (ej. "6-8 años"): sin formato fijo, solo un limite generoso
  // para que no se pueda meter un bloque de texto entero en un campo de edad.
  edad: z.string().trim().max(60, 'edad demasiado larga').optional()
});
r.post('/clases', soloEncargado, validar(claseSchema), (req, res) => {
  const { nombre, edad } = req.body;
  const info = db.prepare('INSERT INTO clase_ed (iglesia_id, nombre, edad) VALUES (?,?,?)').run(req.user.iglesia_id, nombre, edad || null);
  // El 30-jul quedo anotado que nada de este modulo dejaba rastro al crear.
  auditar(req.user.iglesia_id, req.user.persona_id, 'crear_clase', 'ninos', nombre,
    { tabla: 'clase_ed', id: info.lastInsertRowid });
  res.json({ ok: true });
});

// Corregir una clase. Solo se audita lo que cambio de verdad (la regla que
// estreno tesoreria.js hoy mismo): reenviar lo igual no ensucia el rastro.
const editarClaseSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre').optional(),
  edad: z.string().trim().max(60, 'edad demasiado larga').optional()
}).refine(b => b.nombre !== undefined || b.edad !== undefined,
  { message: 'no viene ningun campo que cambiar' });
r.patch('/clases/:id', soloEncargado, validar(editarClaseSchema), (req, res) => {
  const c = db.prepare('SELECT id, nombre, edad FROM clase_ed WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, req.user.iglesia_id);
  if (!c) return res.status(404).json({ error: 'Clase no encontrada' });
  const norm = v => (v === '' ? null : v);
  const sets = [], vals = [], cambios = [];
  const pedir = (col, nuevo, viejo) => {
    if (nuevo === undefined) return;
    const n = norm(nuevo);
    if (n === (viejo ?? null)) return;
    sets.push(`${col} = ?`); vals.push(n);
    cambios.push(`${col}: ${viejo ?? '(vacio)'} -> ${n ?? '(vacio)'}`);
  };
  pedir('nombre', req.body.nombre, c.nombre);
  pedir('edad', req.body.edad, c.edad);
  if (!sets.length) return res.json({ ok: true, sinCambios: true });
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE clase_ed SET ${sets.join(', ')} WHERE id = ? AND iglesia_id = ?`)
      .run(...vals, c.id, req.user.iglesia_id);
    auditar(req.user.iglesia_id, req.user.persona_id, 'editar_clase', 'ninos', cambios.join(' · '),
      { tabla: 'clase_ed', id: c.id });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.json({ ok: true });
});

// Borrar una clase: SOLO vacia (decision del dueno, 5-ago). Con ninos, 409 —
// borrar fichas de menores en bloque es demasiado facil de hacer por error;
// cada borrado de nino ya existe, se confirma y se audita uno a uno.
// Vacia: se lleva sus lecciones y las filas VIEJAS de asistencia (huerfanas
// de ninos movidos o borrados; ese historial ya no lo muestra ninguna
// pantalla — mismo razonamiento que el borrado de ninos de la Fase 13).
// Los archivos de las lecciones quedan huerfanos en /uploads: asumido.
r.delete('/clases/:id', soloEncargado, (req, res) => {
  const c = db.prepare('SELECT id, nombre FROM clase_ed WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, req.user.iglesia_id);
  if (!c) return res.status(404).json({ error: 'Clase no encontrada' });
  const ninos = db.prepare('SELECT COUNT(*) AS n FROM nino WHERE clase_id = ?').get(c.id).n;
  if (ninos > 0)
    return res.status(409).json({ error: `La clase tiene ${ninos} niño(s): mueve o borra sus fichas primero.` });
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM asistencia_nino WHERE clase_id = ?').run(c.id);
    const lecciones = db.prepare('DELETE FROM leccion WHERE clase_id = ?').run(c.id).changes;
    db.prepare('DELETE FROM clase_ed WHERE id = ?').run(c.id);
    auditar(req.user.iglesia_id, req.user.persona_id, 'eliminar_clase', 'ninos',
      `${c.nombre} (${lecciones} leccion(es))`, { tabla: 'clase_ed', id: c.id });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: 'No se pudo borrar la clase' }); }
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
  autorizados: z.string().trim().max(300, 'la lista de quién puede retirarlo es muy larga (máximo 300 caracteres)').optional()
});
r.post('/ninos', soloEncargado, validar(ninoSchema), (req, res) => {
  const { clase_id, nombre, edad, familia, alergias, autorizados } = req.body;
  if (!claseDeIglesia(clase_id, req.user.iglesia_id)) return res.status(404).json({ error: 'Clase no encontrada' });
  db.prepare('INSERT INTO nino (iglesia_id, clase_id, nombre, edad, familia, alergias, autorizados) VALUES (?,?,?,?,?,?,?)')
    .run(req.user.iglesia_id, clase_id, nombre, edad || null, familia || null, alergias || null, autorizados || null);
  res.json({ ok: true });
});

// Corregir la ficha. Nace con esta fase: el modulo solo sabia crear, asi que la
// lista de autorizados no se podia cambiar nunca — y es justo el dato que cambia.
const editarNinoSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre').optional(),
  edad: z.string().trim().optional(),
  familia: z.string().trim().optional(),
  alergias: z.string().trim().optional(),
  autorizados: z.string().trim().max(300, 'la lista de quién puede retirarlo es muy larga (máximo 300 caracteres)').optional()
});
r.patch('/ninos/:id', soloEncargado, validar(editarNinoSchema), (req, res) => {
  // Acotado por iglesia en la MISMA consulta. Resolver primero y comprobar
  // despues es como se colo el borrado que cruzaba iglesias en musica.js.
  const nino = db.prepare('SELECT id, nombre FROM nino WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, req.user.iglesia_id);
  if (!nino) return res.status(404).json({ error: 'Niño no encontrado' });

  // Solo se tocan los campos que vinieron: un PATCH no debe borrar lo que no menciona.
  const PERMITIDOS = ['nombre', 'edad', 'familia', 'alergias', 'autorizados'];
  const campos = PERMITIDOS.filter(c => c in req.body);
  if (!campos.length) return res.status(400).json({ error: 'Datos inválidos: no mandaste nada que cambiar' });
  const sets = campos.map(c => `${c} = ?`).join(', ');
  const vals = campos.map(c => (req.body[c] === '' ? null : req.body[c]));
  db.prepare(`UPDATE nino SET ${sets} WHERE id = ?`).run(...vals, nino.id);

  auditar(req.user.iglesia_id, req.user.persona_id, 'editar_nino', 'ninos', nino.nombre);
  res.json({ ok: true });
});

// Borrar la ficha, y con ella su historial de asistencia. La asistencia de
// ninos se retiro de la app el 30 jul: ese historial ya no lo muestra ninguna
// pantalla, asi que conservarlo seria guardar datos de un menor que nadie
// puede consultar. Decision explicita del dueno.
r.delete('/ninos/:id', soloEncargado, (req, res) => {
  // Acotado por iglesia en la MISMA consulta (ver comentario en el PATCH de arriba).
  const nino = db.prepare('SELECT id, nombre FROM nino WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, req.user.iglesia_id);
  if (!nino) return res.status(404).json({ error: 'Niño no encontrado' });

  // Las asistencias van PRIMERO: asistencia_nino.nino_id referencia nino(id), y
  // al reves salta FOREIGN KEY constraint failed. En transaccion, para no dejar
  // asistencias huerfanas si algo falla a medias.
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM asistencia_nino WHERE nino_id = ?').run(nino.id);
    db.prepare('DELETE FROM nino WHERE id = ?').run(nino.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'No se pudo eliminar al niño' });
  }
  auditar(req.user.iglesia_id, req.user.persona_id, 'eliminar_nino', 'ninos', nino.nombre);
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
