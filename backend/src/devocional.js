// ============================================================
//  Fase 4.2: Biblia / Devocional (lectura offline)
//  Contenido (devocional / texto biblico) que el feligres puede LEER y
//  DESCARGAR para leer sin conexion. El frontend guarda lo descargado en
//  IndexedDB; aqui solo servimos/gestionamos el contenido por iglesia.
//  Aislamiento por iglesia_id.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, esLiderOAdmin, esPastor } from './auth.js';
import { validar } from './seguridad.js';

const r = Router();
r.use(authMiddleware);

// --- Listar devocionales de la iglesia (mas recientes primero) ---
r.get('/', (req, res) => {
  const items = db.prepare(
    `SELECT d.*, p.nombre AS autor FROM devocional d
       LEFT JOIN persona p ON p.id = d.creado_por
      WHERE d.iglesia_id = ?
      ORDER BY COALESCE(d.fecha, d.creado_en) DESC`
  ).all(req.user.iglesia_id);
  res.json(items);
});

// --- Detalle de un devocional (para descargar/leer offline) ---
r.get('/:id', (req, res) => {
  const d = db.prepare(
    `SELECT d.*, p.nombre AS autor FROM devocional d
       LEFT JOIN persona p ON p.id = d.creado_por
      WHERE d.id = ? AND d.iglesia_id = ?`
  ).get(req.params.id, req.user.iglesia_id);
  if (!d) return res.status(404).json({ error: 'Devocional no encontrado' });
  res.json(d);
});

// --- Crear devocional (solo lider/pastor) ---
const crearDevocionalSchema = z.object({
  titulo: z.string().trim().min(1, 'falta el titulo'),
  fecha: z.string().trim().optional(),
  texto_base: z.string().trim().optional(),
  contenido: z.string().trim().optional()
});
r.post('/', validar(crearDevocionalSchema), (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  if (!esLiderOAdmin(persona_id))
    return res.status(403).json({ error: 'No tienes permiso para publicar devocionales' });
  const { titulo, fecha, texto_base, contenido } = req.body;
  const info = db.prepare(
    'INSERT INTO devocional (iglesia_id, titulo, fecha, texto_base, contenido, creado_por) VALUES (?,?,?,?,?,?)'
  ).run(iglesia_id, titulo, fecha || null, texto_base || null, contenido || null, persona_id);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// --- Editar devocional (pastor o autor) ---
const editarDevocionalSchema = z.object({
  titulo: z.string().trim().optional(),
  fecha: z.string().trim().optional(),
  texto_base: z.string().trim().optional(),
  contenido: z.string().trim().optional()
});
r.patch('/:id', validar(editarDevocionalSchema), (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const d = db.prepare('SELECT * FROM devocional WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!d) return res.status(404).json({ error: 'No encontrado' });
  if (!(esPastor(persona_id) || d.creado_por === persona_id))
    return res.status(403).json({ error: 'No tienes permiso' });
  const { titulo, fecha, texto_base, contenido } = req.body;
  db.prepare('UPDATE devocional SET titulo=?, fecha=?, texto_base=?, contenido=? WHERE id=?')
    .run(titulo || d.titulo, fecha ?? d.fecha, texto_base ?? d.texto_base, contenido ?? d.contenido, d.id);
  res.json({ ok: true });
});

// --- Eliminar devocional (pastor o autor) ---
r.delete('/:id', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const d = db.prepare('SELECT * FROM devocional WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!d) return res.status(404).json({ error: 'No encontrado' });
  if (!(esPastor(persona_id) || d.creado_por === persona_id))
    return res.status(403).json({ error: 'No tienes permiso' });
  db.prepare('DELETE FROM devocional WHERE id=?').run(d.id);
  res.json({ ok: true });
});

export default r;
