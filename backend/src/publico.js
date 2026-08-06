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
import { fechaLocal } from './fechas.js';

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
//  LA BANDEJA (solo pastor): los mensajes que la gente manda desde el
//  formulario "Planifica tu visita" del portal publico.
//
//  Registrada AQUI, antes de r.get('/:codigoIglesia'), por lo mismo que
//  /info: esa ruta parametrica se traga cualquier cosa y leeria "mensajes"
//  como el codigo unico de una iglesia.
// ============================================================
const MENSAJES_POR_PAGINA = 50;

function soloPastorBandeja(req, res, next) {
  if (!esPastor(req.user.persona_id))
    return res.status(403).json({ error: 'Solo el pastor puede ver los mensajes del portal' });
  next();
}

r.get('/mensajes', authMiddleware, soloPastorBandeja, (req, res) => {
  // ?previos=1 es la seccion plegada: los mensajes que ya estaban guardados
  // antes de que existiera esta bandeja. Se piden aparte para que la primera
  // apertura no sea un muro de meses acumulados.
  const verPrevios = String(req.query.previos || '') === '1';
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  // Se piden LIMIT+1 filas para saber si quedan mas sin un COUNT extra (mismo
  // patron que notificaciones.js:82-87).
  const filas = verPrevios
    ? db.prepare(
        `SELECT id, nombre, mensaje, creado_en, estado FROM contacto_publico
          WHERE iglesia_id = ? AND estado = 'previo'
          ORDER BY creado_en DESC, id DESC LIMIT ? OFFSET ?`
      ).all(req.user.iglesia_id, MENSAJES_POR_PAGINA + 1, offset)
    : db.prepare(
        // (estado = 'atendido') ordena primero lo que falta por atender, igual
        // que cuidado.js:26. El id DESC desempata dos del mismo segundo.
        `SELECT id, nombre, mensaje, creado_en, estado FROM contacto_publico
          WHERE iglesia_id = ? AND estado <> 'previo'
          ORDER BY (estado = 'atendido'), creado_en DESC, id DESC LIMIT ? OFFSET ?`
      ).all(req.user.iglesia_id, MENSAJES_POR_PAGINA + 1, offset);

  const hayMas = filas.length > MENSAJES_POR_PAGINA;
  const items = hayMas ? filas.slice(0, MENSAJES_POR_PAGINA) : filas;

  // Cuando ya se estan mostrando los previos no hay contador que pintar.
  const previos = verPrevios ? 0 : db.prepare(
    "SELECT COUNT(*) AS n FROM contacto_publico WHERE iglesia_id = ? AND estado = 'previo'"
  ).get(req.user.iglesia_id).n;

  res.json({ items, hayMas, offset, previos });
});

// Marcar un mensaje como atendido. Vale igual para uno 'nuevo' que para uno
// 'previo': un previo atendido deja de ser "un mensaje que la app escondio" y
// pasa a ser "uno que el pastor resolvio".
//
// No hay camino de vuelta a 'nuevo' a proposito (ver "Fuera de alcance" del
// spec): marcar atendido es una afirmacion del pastor, no un filtro.
r.patch('/mensajes/:id/atender', authMiddleware, soloPastorBandeja, (req, res) => {
  // Acotado por iglesia en la MISMA consulta, no en una comprobacion posterior:
  // es el fallo que ya se colo una vez en musica.js (borrado que cruzaba
  // congregaciones).
  const info = db.prepare(
    "UPDATE contacto_publico SET estado = 'atendido' WHERE id = ? AND iglesia_id = ?"
  ).run(Number(req.params.id), req.user.iglesia_id);
  // 404 y no 403: un 403 confirmaria que ese id existe en otra iglesia.
  if (info.changes === 0) return res.status(404).json({ error: 'Mensaje no encontrado' });
  res.json({ ok: true });
});

// Marcar atendido en bloque (tanda E). Sin body marca los 'nuevo'; con
// {previos:true}, los 'previo'. Los dos alcances son excluyentes A PROPOSITO:
// el boton principal no puede atender en silencio meses que el pastor quiza
// nunca leyo — "marcar atendido es una afirmacion del pastor" (spec 31-jul);
// los anteriores tienen su propio boton, explicito, dentro de su caja.
// Sin nada que marcar responde 200 con atendidos:0 (una orden ya cumplida,
// no un recurso que no existe). No audita, igual que el atender de a uno.
//
// No choca con /mensajes/:id/atender: son formas distintas (dos segmentos
// contra tres), Express no puede confundirlas.
const atenderTodosSchema = z.object({ previos: z.boolean().optional() });
r.patch('/mensajes/atender-todos', authMiddleware, soloPastorBandeja, validar(atenderTodosSchema), (req, res) => {
  const estado = req.body.previos === true ? 'previo' : 'nuevo';
  const info = db.prepare(
    "UPDATE contacto_publico SET estado = 'atendido' WHERE iglesia_id = ? AND estado = ?"
  ).run(req.user.iglesia_id, estado);
  res.json({ ok: true, atendidos: info.changes });
});

// Borrar un mensaje (tanda E). Es la unica destruccion sin vuelta atras de la
// bandeja, asi que deja apunte con el nombre del visitante — despues del
// borrado ya no habra fila que diga de quien era — y el DELETE y su apunte van
// en la misma transaccion (la convencion del 31-jul: una destruccion no puede
// quedar aplicada sin rastro). Se lee la fila antes, acotada por iglesia en la
// MISMA consulta, y el 404 es 404 (no 403, ver el atender de arriba).
r.delete('/mensajes/:id', authMiddleware, soloPastorBandeja, (req, res) => {
  const fila = db.prepare(
    'SELECT id, nombre FROM contacto_publico WHERE id = ? AND iglesia_id = ?'
  ).get(Number(req.params.id), req.user.iglesia_id);
  if (!fila) return res.status(404).json({ error: 'Mensaje no encontrado' });

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM contacto_publico WHERE id = ? AND iglesia_id = ?')
      .run(fila.id, req.user.iglesia_id);
    auditar(req.user.iglesia_id, req.user.persona_id, 'borrar_mensaje_portal', 'publico',
      `mensaje de ${fila.nombre}`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'No se pudo borrar el mensaje' });
  }
  res.json({ ok: true });
});

// La fecha local vive ahora en ./fechas.js, porque la comparte con
// persistencia.js (la clave diaria del aviso del respaldo). Se re-exporta desde
// aqui porque este era su sitio original y hay tests que la piden por esta
// puerta; el import esta arriba, con el resto.
export { fechaLocal };

// ============================================================
//  PUBLICO (sin login): datos de una iglesia por su codigo_unico.
// ============================================================
r.get('/:codigoIglesia', (req, res) => {
  const iglesia = iglesiaPorCodigo(req.params.codigoIglesia);
  if (!iglesia) return res.status(404).json({ error: 'Iglesia no encontrada' });

  const hoy = fechaLocal();
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
