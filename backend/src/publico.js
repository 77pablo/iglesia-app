// ============================================================
//  Portal publico (Fase 7): pagina SIN login, por iglesia.
//  /publico.html?ig=CODIGO_IGLESIA consume estos endpoints.
//
//  CRITICO DE SEGURIDAD: los endpoints publicos SOLO exponen lo aprobado
//  y publico de la iglesia indicada por codigo_unico:
//   - eventos APROBADOS con fecha futura (NUNCA pendientes/rechazados)
//   - la ultima predica: solo titulo/fecha/predicador (NUNCA sus notas)
//   - nombre de la iglesia + info de contacto que el propio pastor publico
//  NUNCA se exponen aqui personas, tesoreria, asistencia, chat, ni ningun
//  dato que no haya sido marcado explicitamente como publico/aprobado.
//  Los endpoints de edicion de iglesia_info SI requieren sesion + pastor.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, esPastor, auditar } from './auth.js';
import { limiterSensible, validar } from './seguridad.js';

const r = Router();

function iglesiaPorCodigo(codigo) {
  const cod = String(codigo || '').trim();
  if (!cod) return null;
  return db.prepare('SELECT id, nombre, codigo_unico FROM iglesia WHERE codigo_unico = ?').get(cod);
}

function infoPublicaDe(iglesiaId) {
  return db.prepare(
    'SELECT horarios, direccion, telefono, descripcion FROM iglesia_info WHERE iglesia_id = ?'
  ).get(iglesiaId) || { horarios: null, direccion: null, telefono: null, descripcion: null };
}

// ============================================================
//  AUTENTICADO (solo pastor): edita la info publica de SU iglesia.
//  Registrado ANTES de la ruta parametrica /:codigoIglesia para que
//  "/info" no sea interpretado como un codigo de iglesia.
// ============================================================
r.get('/info', authMiddleware, (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor puede ver esto' });
  res.json(infoPublicaDe(req.user.iglesia_id));
});

const infoSchema = z.object({
  horarios: z.string().trim().max(2000).optional(),
  direccion: z.string().trim().max(500).optional(),
  telefono: z.string().trim().max(100).optional(),
  descripcion: z.string().trim().max(4000).optional()
});
r.patch('/info', authMiddleware, validar(infoSchema), (req, res) => {
  if (!esPastor(req.user.persona_id)) return res.status(403).json({ error: 'Solo el pastor puede editar esto' });
  const actual = infoPublicaDe(req.user.iglesia_id);
  const { horarios, direccion, telefono, descripcion } = req.body;
  db.prepare(
    `INSERT INTO iglesia_info (iglesia_id, horarios, direccion, telefono, descripcion) VALUES (?,?,?,?,?)
       ON CONFLICT(iglesia_id) DO UPDATE SET
         horarios=excluded.horarios, direccion=excluded.direccion,
         telefono=excluded.telefono, descripcion=excluded.descripcion`
  ).run(
    req.user.iglesia_id,
    horarios ?? actual.horarios ?? null,
    direccion ?? actual.direccion ?? null,
    telefono ?? actual.telefono ?? null,
    descripcion ?? actual.descripcion ?? null
  );
  auditar(req.user.iglesia_id, req.user.persona_id, 'editar_info_publica', 'publico');
  res.json({ ok: true });
});

// ============================================================
//  PUBLICO (sin login): datos de una iglesia por su codigo_unico.
// ============================================================
r.get('/:codigoIglesia', (req, res) => {
  const iglesia = iglesiaPorCodigo(req.params.codigoIglesia);
  if (!iglesia) return res.status(404).json({ error: 'Iglesia no encontrada' });

  const hoy = new Date().toISOString().slice(0, 10);
  // Solo eventos APROBADOS con fecha de hoy en adelante. NUNCA pendientes/rechazados.
  const eventos = db.prepare(
    `SELECT titulo, fecha, hora_inicio, hora_fin, lugar, descripcion
       FROM evento
      WHERE iglesia_id = ? AND estado = 'aprobado' AND fecha >= ?
      ORDER BY fecha ASC, hora_inicio ASC
      LIMIT 20`
  ).all(iglesia.id, hoy);

  // Solo lo publico de la ultima predica: NUNCA 'notas' (son privadas del predicador/pastor).
  const predica = db.prepare(
    `SELECT titulo, fecha, predicador FROM predica
      WHERE iglesia_id = ? ORDER BY COALESCE(fecha, '') DESC, id DESC LIMIT 1`
  ).get(iglesia.id) || null;

  res.json({
    nombre: iglesia.nombre,
    eventos,
    predica,
    info: infoPublicaDe(iglesia.id)
  });
});

// --- Formulario de contacto / "planifica tu visita" (sin login) ---
// Rate limit razonable (reusa limiterSensible: 10 req/IP cada 15 min) para
// evitar spam, ya que no exige autenticacion.
const contactoSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre').max(120),
  mensaje: z.string().trim().min(1, 'falta el mensaje').max(2000)
});
r.post('/:codigoIglesia/contacto', limiterSensible, validar(contactoSchema), (req, res) => {
  const iglesia = iglesiaPorCodigo(req.params.codigoIglesia);
  if (!iglesia) return res.status(404).json({ error: 'Iglesia no encontrada' });

  const { nombre, mensaje } = req.body;
  db.prepare('INSERT INTO contacto_publico (iglesia_id, nombre, mensaje) VALUES (?,?,?)')
    .run(iglesia.id, nombre, mensaje);

  // Notifica a todos los pastores activos de ESA iglesia (aislamiento estricto).
  const pastores = db.prepare(
    'SELECT id FROM persona WHERE iglesia_id = ? AND es_pastor = 1 AND activo = 1'
  ).all(iglesia.id);
  const st = db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)');
  const texto = `${nombre}: ${mensaje}`;
  for (const p of pastores) st.run(p.id, 'contacto_publico', '📬 Nuevo mensaje del portal público', texto);

  res.json({ ok: true });
});

export default r;
