// ============================================================
//  Fase 6: Mensajeria interna (chat) — /api/mensajes
//  Conversaciones 1:1 / por grupo / a medida, tiempo real por SSE,
//  adjuntos, leido/no-leidos, "escribiendo...", moderacion del pastor.
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esPastor, auditar, puedeIniciarChatCon } from './auth.js';
import { enviarPush } from './push.js';
import { emitir, estaConectada } from './sse.js';

const r = Router();

r.use(authMiddleware);

const LARGO_MAX = 4000;

// La conversacion pertenece a la iglesia del actor?
function convDeIglesia(convId, iglesiaId) {
  return db.prepare('SELECT * FROM conversacion WHERE id = ? AND iglesia_id = ?').get(convId, iglesiaId);
}
function esMiembroConv(convId, personaId) {
  return !!db.prepare('SELECT 1 FROM conversacion_miembro WHERE conversacion_id = ? AND persona_id = ?')
    .get(convId, personaId);
}
function miembrosConv(convId) {
  return db.prepare('SELECT persona_id FROM conversacion_miembro WHERE conversacion_id = ?')
    .all(convId).map(x => x.persona_id);
}

// --- Obtener o crear el 1:1 con otra persona ---
r.post('/directo', (req, res) => {
  const otroId = Number((req.body || {}).persona_id);
  if (!otroId) return res.status(400).json({ error: 'Falta persona_id' });
  if (!puedeIniciarChatCon(req.user.persona_id, otroId))
    return res.status(403).json({ error: 'No puedes iniciar un chat con esa persona' });
  // buscar 1:1 existente entre exactamente estas 2 personas
  const existente = db.prepare(
    `SELECT c.id FROM conversacion c
       JOIN conversacion_miembro m1 ON m1.conversacion_id = c.id AND m1.persona_id = ?
       JOIN conversacion_miembro m2 ON m2.conversacion_id = c.id AND m2.persona_id = ?
      WHERE c.tipo = 'directo' AND c.iglesia_id = ?
      LIMIT 1`
  ).get(req.user.persona_id, otroId, req.user.iglesia_id);
  if (existente) return res.json({ id: existente.id, tipo: 'directo' });

  const info = db.prepare("INSERT INTO conversacion (iglesia_id, tipo, creado_por) VALUES (?, 'directo', ?)")
    .run(req.user.iglesia_id, req.user.persona_id);
  const convId = Number(info.lastInsertRowid);
  const insM = db.prepare('INSERT INTO conversacion_miembro (conversacion_id, persona_id, rol) VALUES (?,?,?)');
  insM.run(convId, req.user.persona_id, 'miembro');
  insM.run(convId, otroId, 'miembro');
  res.json({ id: convId, tipo: 'directo' });
});

// --- Enviar un mensaje ---
r.post('/conversacion/:id', (req, res) => {
  const conv = convDeIglesia(req.params.id, req.user.iglesia_id);
  if (!conv) return res.status(404).json({ error: 'Conversacion no encontrada' });
  if (!esMiembroConv(conv.id, req.user.persona_id))
    return res.status(403).json({ error: 'No perteneces a esta conversacion' });
  const b = req.body || {};
  const texto = String(b.texto || '').trim();
  const adjuntoUrl = b.adjunto_url ? String(b.adjunto_url) : null;
  if (!texto && !adjuntoUrl) return res.status(400).json({ error: 'El mensaje esta vacio' });
  if (texto.length > LARGO_MAX) return res.status(400).json({ error: 'Mensaje demasiado largo' });

  const info = db.prepare(
    'INSERT INTO mensaje (conversacion_id, persona_id, texto, adjunto_url, adjunto_tipo) VALUES (?,?,?,?,?)'
  ).run(conv.id, req.user.persona_id, texto, adjuntoUrl, b.adjunto_tipo ? String(b.adjunto_tipo) : null);
  const mensaje = {
    id: Number(info.lastInsertRowid), conversacion_id: conv.id, persona_id: req.user.persona_id,
    nombre: db.prepare('SELECT nombre FROM persona WHERE id = ?').get(req.user.persona_id).nombre,
    texto, adjunto_url: adjuntoUrl, adjunto_tipo: b.adjunto_tipo || null,
    creado_en: new Date().toISOString()
  };
  // el autor ya "leyo" hasta su propio mensaje
  db.prepare('UPDATE conversacion_miembro SET ultimo_leido_mensaje_id = ? WHERE conversacion_id = ? AND persona_id = ?')
    .run(mensaje.id, conv.id, req.user.persona_id);

  const otros = miembrosConv(conv.id).filter(pid => pid !== req.user.persona_id);
  emitir(otros, 'mensaje', { conversacion_id: conv.id, mensaje });
  const offline = otros.filter(pid => !estaConectada(pid));
  if (offline.length) {
    enviarPush(offline, { titulo: '💬 ' + mensaje.nombre, texto: texto || 'Te envió un archivo',
      url: '/#mensajes/' + conv.id }).catch(() => {});
  }
  res.json({ ok: true, mensaje });
});

// --- Leer mensajes de una conversacion (paginado hacia atras) ---
r.get('/conversacion/:id', (req, res) => {
  const conv = convDeIglesia(req.params.id, req.user.iglesia_id);
  if (!conv) return res.status(404).json({ error: 'Conversacion no encontrada' });
  const soyMiembro = esMiembroConv(conv.id, req.user.persona_id);
  const puedeModerar = esPastor(req.user.persona_id) && conv.tipo !== 'directo';
  if (!soyMiembro && !puedeModerar) return res.status(403).json({ error: 'No perteneces a esta conversacion' });

  const limite = Math.min(Number(req.query.limite) || 30, 100);
  const antes = Number(req.query.antes) || Number.MAX_SAFE_INTEGER;
  const mensajes = db.prepare(
    `SELECT m.id, m.persona_id, p.nombre, m.texto, m.adjunto_url, m.adjunto_tipo, m.borrado, m.creado_en
       FROM mensaje m JOIN persona p ON p.id = m.persona_id
      WHERE m.conversacion_id = ? AND m.id < ?
      ORDER BY m.id DESC LIMIT ?`
  ).all(conv.id, antes, limite);
  res.json({ conversacion: { id: conv.id, tipo: conv.tipo, titulo: conv.titulo, grupo_id: conv.grupo_id }, mensajes });
});

export default r;
