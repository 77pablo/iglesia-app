// ============================================================
//  Fase 6: Mensajeria interna (chat) — /api/mensajes
//  Conversaciones 1:1 / por grupo / a medida, tiempo real por SSE,
//  adjuntos, leido/no-leidos, "escribiendo...", moderacion del pastor.
// ============================================================
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';
import { authMiddleware, esPastor, auditar, puedeIniciarChatCon, verificarToken } from './auth.js';
import { enviarPush } from './push.js';
import { emitir, estaConectada, registrar } from './sse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = Router();

// --- STREAM SSE (sin authMiddleware: valida el token por query param) ---
r.get('/stream', (req, res) => {
  const payload = verificarToken(String(req.query.token || ''));
  if (!payload) return res.status(401).json({ error: 'Token invalido' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': conectado\n\n');
  const baja = registrar(payload.persona_id, res);
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 25000);
  req.on('close', () => { clearInterval(hb); baja(); });
});

// A partir de aqui, todo requiere token en header
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

// Crea (si falta) el canal 'grupo' de cada grupo del actor y sincroniza sus miembros.
function provisionarCanalesDeGrupo(personaId, iglesiaId) {
  const grupos = db.prepare(
    `SELECT DISTINCT g.id, g.nombre FROM grupo g
       JOIN pertenencia pe ON pe.grupo_id = g.id
      WHERE pe.persona_id = ? AND g.iglesia_id = ?`
  ).all(personaId, iglesiaId);
  for (const g of grupos) {
    let conv = db.prepare("SELECT id FROM conversacion WHERE tipo = 'grupo' AND grupo_id = ? AND iglesia_id = ?")
      .get(g.id, iglesiaId);
    if (!conv) {
      const info = db.prepare(
        "INSERT INTO conversacion (iglesia_id, tipo, grupo_id, titulo, creado_por) VALUES (?, 'grupo', ?, ?, ?)"
      ).run(iglesiaId, g.id, g.nombre, personaId);
      conv = { id: Number(info.lastInsertRowid) };
    }
    // sincronizar miembros del grupo como miembros de la conversacion (idempotente)
    db.prepare(
      `INSERT OR IGNORE INTO conversacion_miembro (conversacion_id, persona_id, rol)
       SELECT ?, persona_id, 'miembro' FROM pertenencia WHERE grupo_id = ?`
    ).run(conv.id, g.id);
    // podar miembros del canal que ya no pertenecen al grupo
    db.prepare(
      `DELETE FROM conversacion_miembro
        WHERE conversacion_id = ?
          AND persona_id NOT IN (SELECT persona_id FROM pertenencia WHERE grupo_id = ?)`
    ).run(conv.id, g.id);
  }
}

// --- Mis conversaciones (con ultimo mensaje + no leidos) ---
r.get('/conversaciones', (req, res) => {
  provisionarCanalesDeGrupo(req.user.persona_id, req.user.iglesia_id);
  const filas = db.prepare(
    `SELECT c.id, c.tipo, c.titulo, c.grupo_id, cm.ultimo_leido_mensaje_id
       FROM conversacion c
       JOIN conversacion_miembro cm ON cm.conversacion_id = c.id AND cm.persona_id = ?
      WHERE c.iglesia_id = ?`
  ).all(req.user.persona_id, req.user.iglesia_id);

  const ultimoMsg = db.prepare(
    `SELECT id, texto, adjunto_url, creado_en FROM mensaje
      WHERE conversacion_id = ? AND borrado = 0 ORDER BY id DESC LIMIT 1`);
  const cuentaNoLeidos = db.prepare(
    `SELECT COUNT(*) AS n FROM mensaje
      WHERE conversacion_id = ? AND borrado = 0 AND persona_id != ? AND id > ?`);
  const otroDe = db.prepare(
    `SELECT p.id, p.nombre FROM conversacion_miembro cm JOIN persona p ON p.id = cm.persona_id
      WHERE cm.conversacion_id = ? AND cm.persona_id != ? LIMIT 1`);

  const salida = filas.map(c => {
    const um = ultimoMsg.get(c.id);
    const no = cuentaNoLeidos.get(c.id, req.user.persona_id, c.ultimo_leido_mensaje_id || 0).n;
    const otro = c.tipo === 'directo' ? otroDe.get(c.id, req.user.persona_id) : null;
    return {
      id: c.id, tipo: c.tipo, grupo_id: c.grupo_id,
      titulo: c.tipo === 'directo' ? (otro ? otro.nombre : '') : c.titulo,
      otro: otro || null,
      ultimo: um ? { texto: um.texto || (um.adjunto_url ? '📎 archivo' : ''), creado_en: um.creado_en } : null,
      no_leidos: no
    };
  });
  // mas recientes primero (por ultimo mensaje; sin actividad al final)
  salida.sort((a, b) => (b.ultimo?.creado_en || '').localeCompare(a.ultimo?.creado_en || ''));
  res.json(salida);
});

// --- Marcar leido (solo avanza) ---
r.post('/conversacion/:id/leido', (req, res) => {
  const conv = convDeIglesia(req.params.id, req.user.iglesia_id);
  if (!conv || !esMiembroConv(conv.id, req.user.persona_id))
    return res.status(403).json({ error: 'No perteneces a esta conversacion' });
  const mid = Number((req.body || {}).mensaje_id) || 0;
  db.prepare(
    `UPDATE conversacion_miembro SET ultimo_leido_mensaje_id = MAX(COALESCE(ultimo_leido_mensaje_id,0), ?)
      WHERE conversacion_id = ? AND persona_id = ?`
  ).run(mid, conv.id, req.user.persona_id);
  const nuevo = db.prepare('SELECT ultimo_leido_mensaje_id FROM conversacion_miembro WHERE conversacion_id = ? AND persona_id = ?')
    .get(conv.id, req.user.persona_id).ultimo_leido_mensaje_id;
  const otros = miembrosConv(conv.id).filter(pid => pid !== req.user.persona_id);
  emitir(otros, 'leido', { conversacion_id: conv.id, persona_id: req.user.persona_id, ultimo_leido_mensaje_id: nuevo });
  res.json({ ok: true });
});

// --- "escribiendo..." (solo reemite, sin BD) ---
r.post('/conversacion/:id/escribiendo', (req, res) => {
  const conv = convDeIglesia(req.params.id, req.user.iglesia_id);
  if (!conv || !esMiembroConv(conv.id, req.user.persona_id))
    return res.status(403).json({ error: 'No perteneces a esta conversacion' });
  const nombre = db.prepare('SELECT nombre FROM persona WHERE id = ?').get(req.user.persona_id).nombre;
  const otros = miembrosConv(conv.id).filter(pid => pid !== req.user.persona_id);
  emitir(otros, 'escribiendo', { conversacion_id: conv.id, persona_id: req.user.persona_id, nombre });
  res.json({ ok: true });
});

// --- Con quien puedo iniciar chat (para el selector) ---
r.get('/contactos', (req, res) => {
  const personas = db.prepare(
    'SELECT id, nombre FROM persona WHERE iglesia_id = ? AND activo = 1 AND id != ? ORDER BY nombre'
  ).all(req.user.iglesia_id, req.user.persona_id);
  res.json(personas.filter(p => puedeIniciarChatCon(req.user.persona_id, p.id)));
});

// --- Crear grupo a medida ---
r.post('/custom', (req, res) => {
  const { titulo, participantes } = req.body || {};
  const t = String(titulo || '').trim();
  if (!t) return res.status(400).json({ error: 'Falta el titulo' });
  const ids = [...new Set((Array.isArray(participantes) ? participantes : []).map(Number).filter(Boolean))]
    .filter(id => id !== req.user.persona_id);
  if (!ids.length) return res.status(400).json({ error: 'Elige al menos un participante' });
  // todos deben ser de la misma iglesia y estar activos
  const deLaIglesia = db.prepare(
    `SELECT id FROM persona WHERE iglesia_id = ? AND activo = 1 AND id IN (${ids.map(() => '?').join(',')})`
  ).all(req.user.iglesia_id, ...ids).map(x => x.id);
  // ademas, cada uno debe cumplir la regla de contacto (misma que /directo):
  // un feligres no puede meter en un chat "a medida" a cualquiera de su
  // iglesia, solo a quien ya podria escribirle 1:1.
  const validos = deLaIglesia.filter(id => puedeIniciarChatCon(req.user.persona_id, id));
  if (!validos.length) return res.status(400).json({ error: 'No puedes iniciar un chat con esos participantes' });

  const info = db.prepare("INSERT INTO conversacion (iglesia_id, tipo, titulo, creado_por) VALUES (?, 'custom', ?, ?)")
    .run(req.user.iglesia_id, t, req.user.persona_id);
  const convId = Number(info.lastInsertRowid);
  const insM = db.prepare('INSERT OR IGNORE INTO conversacion_miembro (conversacion_id, persona_id, rol) VALUES (?,?,?)');
  insM.run(convId, req.user.persona_id, 'admin');
  for (const id of validos) insM.run(convId, id, 'miembro');
  auditar(req.user.iglesia_id, req.user.persona_id, 'chat_custom', 'conversacion', t);
  res.json({ id: convId });
});

// --- Moderacion: el pastor borra (soft) mensajes de grupo/custom (no 1:1) ---
r.delete('/:mensajeId', (req, res) => {
  const msg = db.prepare(
    `SELECT m.id, m.conversacion_id, c.tipo, c.iglesia_id, m.adjunto_url
       FROM mensaje m JOIN conversacion c ON c.id = m.conversacion_id
      WHERE m.id = ?`
  ).get(req.params.mensajeId);
  if (!msg || msg.iglesia_id !== req.user.iglesia_id)
    return res.status(404).json({ error: 'Mensaje no encontrado' });
  if (msg.tipo === 'directo')
    return res.status(403).json({ error: 'No se pueden moderar mensajes privados' });
  if (!esPastor(req.user.persona_id))
    return res.status(403).json({ error: 'Solo el pastor puede moderar' });
  db.prepare('UPDATE mensaje SET borrado = 1, texto = ?, adjunto_url = NULL, adjunto_tipo = NULL WHERE id = ?')
    .run('', msg.id);
  if (msg.adjunto_url && msg.adjunto_url.startsWith('/uploads/')) {
    try {
      const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
      fs.unlinkSync(path.join(uploadsDir, path.basename(msg.adjunto_url)));
    } catch { /* archivo ya no existe: se ignora */ }
  }
  emitir(miembrosConv(msg.conversacion_id), 'mensaje', {
    conversacion_id: msg.conversacion_id, mensaje: { id: msg.id, borrado: 1 }
  });
  auditar(req.user.iglesia_id, req.user.persona_id, 'chat_moderar', 'mensaje', String(msg.id));
  res.json({ ok: true });
});

export default r;
