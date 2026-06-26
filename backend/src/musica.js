// ============================================================
//  Fase 2.3: Modulo de Musicos — cancionero + orden del servicio
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esLiderMusicaEstricto, esDelMinisterioMusica, auditar } from './auth.js';

const SOLO_LIDER = 'Solo el líder de música puede editar (el pastor solo observa).';

const r = Router();
r.use(authMiddleware);

// ---------- CANCIONERO ----------
r.get('/canciones', (req, res) => {
  res.json(db.prepare('SELECT * FROM cancion WHERE iglesia_id = ? ORDER BY titulo').all(req.user.iglesia_id));
});

r.post('/canciones', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  if (!esLiderMusicaEstricto(persona_id)) return res.status(403).json({ error: SOLO_LIDER });
  const { titulo, autor, tono, enlace, letra } = req.body || {};
  if (!titulo) return res.status(400).json({ error: 'Falta el título' });
  const info = db.prepare('INSERT INTO cancion (iglesia_id, titulo, autor, tono, enlace, letra) VALUES (?,?,?,?,?,?)')
    .run(iglesia_id, titulo, autor || null, tono || null, enlace || null, letra || null);
  auditar(iglesia_id, persona_id, 'agregar_cancion', 'musica', titulo);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// Editar una canción (título, tono, acordes/letra...) — solo el líder de música.
r.patch('/canciones/:id', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  if (!esLiderMusicaEstricto(persona_id)) return res.status(403).json({ error: SOLO_LIDER });
  const c = db.prepare('SELECT * FROM cancion WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!c) return res.status(404).json({ error: 'Canción no encontrada' });
  const { titulo, autor, tono, enlace, letra } = req.body || {};
  db.prepare('UPDATE cancion SET titulo=?, autor=?, tono=?, enlace=?, letra=? WHERE id=?')
    .run(titulo ?? c.titulo, autor ?? c.autor, tono ?? c.tono, enlace ?? c.enlace, letra ?? c.letra, c.id);
  auditar(iglesia_id, persona_id, 'editar_cancion', 'musica', c.titulo);
  res.json({ ok: true });
});

// ---------- ORDEN DEL SERVICIO (setlist) ----------
r.get('/setlist/:eventoId', (req, res) => {
  const ev = db.prepare('SELECT id FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.eventoId, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  const items = db.prepare(
    `SELECT s.id, s.tono_dia, s.orden, c.titulo, c.autor, c.tono, c.enlace
       FROM setlist_item s JOIN cancion c ON c.id = s.cancion_id
      WHERE s.evento_id = ? ORDER BY s.orden, s.id`
  ).all(req.params.eventoId);
  res.json(items);
});

r.post('/setlist/:eventoId', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  if (!esLiderMusicaEstricto(persona_id)) return res.status(403).json({ error: SOLO_LIDER });
  const { cancion_id, tono_dia } = req.body || {};
  if (!cancion_id) return res.status(400).json({ error: 'Falta la canción' });
  const ev = db.prepare('SELECT id FROM evento WHERE id = ? AND iglesia_id = ?').get(req.params.eventoId, iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  const cancion = db.prepare('SELECT tono FROM cancion WHERE id = ? AND iglesia_id = ?').get(cancion_id, iglesia_id);
  if (!cancion) return res.status(404).json({ error: 'Canción no encontrada' });
  const n = db.prepare('SELECT COUNT(*) AS n FROM setlist_item WHERE evento_id = ?').get(req.params.eventoId).n;
  db.prepare('INSERT INTO setlist_item (evento_id, cancion_id, orden, tono_dia) VALUES (?,?,?,?)')
    .run(req.params.eventoId, cancion_id, n + 1, tono_dia || (cancion ? cancion.tono : null));
  auditar(iglesia_id, persona_id, 'agregar_a_setlist', 'musica', 'evento ' + req.params.eventoId);
  res.json({ ok: true });
});

r.delete('/setlist/item/:id', (req, res) => {
  if (!esLiderMusicaEstricto(req.user.persona_id)) return res.status(403).json({ error: SOLO_LIDER });
  // Solo permitir borrar items cuyo evento pertenece a la iglesia del usuario.
  const info = db.prepare(
    `DELETE FROM setlist_item WHERE id = ? AND evento_id IN (SELECT id FROM evento WHERE iglesia_id = ?)`
  ).run(req.params.id, req.user.iglesia_id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

// --- Eliminar canción del cancionero ---
r.delete('/canciones/:id', (req, res) => {
  if (!esLiderMusicaEstricto(req.user.persona_id)) return res.status(403).json({ error: SOLO_LIDER });
  db.prepare('DELETE FROM setlist_item WHERE cancion_id = ?').run(req.params.id);
  const info = db.prepare('DELETE FROM cancion WHERE id = ? AND iglesia_id = ?').run(req.params.id, req.user.iglesia_id);
  if (info.changes === 0) return res.status(404).json({ error: 'Canción no encontrada' });
  res.json({ ok: true });
});

// ============================================================
//  Fase 4.5: Equipo de música + ensayo por evento
//  El líder de música arma el equipo (quién toca qué), agenda el
//  ensayo y avisa a los asignados. El pastor/otros solo observan.
// ============================================================
const INSTRUMENTOS = ['Voz','Coros','Guitarra','Bajo','Bateria','Teclado','Piano','Percusion','Sonido'];

function eventoDeIglesia(id, iglesiaId) {
  return db.prepare('SELECT * FROM evento WHERE id = ? AND iglesia_id = ?').get(id, iglesiaId);
}

// --- Lo que ME toca tocar (para "Mi Servicio") ---
r.get('/mis-asignaciones', (req, res) => {
  res.json(db.prepare(
    `SELECT em.instrumento, e.id AS evento_id, e.titulo, e.fecha, e.hora_inicio
       FROM equipo_musica em JOIN evento e ON e.id = em.evento_id
      WHERE em.persona_id = ? AND em.iglesia_id = ? ORDER BY e.fecha`
  ).all(req.user.persona_id, req.user.iglesia_id));
});

// --- Ver el plan (equipo + ensayo) de un evento (abierto a la iglesia) ---
r.get('/plan/:eventoId', (req, res) => {
  const ev = eventoDeIglesia(req.params.eventoId, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  const equipo = db.prepare(
    `SELECT em.id, em.persona_id, em.instrumento, p.nombre
       FROM equipo_musica em JOIN persona p ON p.id = em.persona_id
      WHERE em.evento_id = ? ORDER BY em.instrumento, p.nombre`
  ).all(ev.id);
  const ensayo = db.prepare('SELECT fecha, hora, lugar, nota FROM ensayo WHERE evento_id = ?').get(ev.id) || null;
  res.json({
    evento: { id: ev.id, titulo: ev.titulo, fecha: ev.fecha },
    equipo, ensayo, instrumentos: INSTRUMENTOS,
    puedeEditar: esLiderMusicaEstricto(req.user.persona_id)
  });
});

// --- Agregar un integrante al equipo (+ aviso a la persona) ---
r.post('/plan/:eventoId/equipo', (req, res) => {
  const { persona_id: actor, iglesia_id } = req.user;
  if (!esLiderMusicaEstricto(actor)) return res.status(403).json({ error: SOLO_LIDER });
  const ev = eventoDeIglesia(req.params.eventoId, iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  const { persona_id, instrumento } = req.body || {};
  const persona = db.prepare('SELECT id, nombre FROM persona WHERE id = ? AND iglesia_id = ? AND activo = 1').get(persona_id, iglesia_id);
  if (!persona) return res.status(404).json({ error: 'Persona no encontrada en tu iglesia' });
  const inst = String(instrumento || '').trim() || 'Voz';
  try {
    db.prepare('INSERT INTO equipo_musica (iglesia_id, evento_id, persona_id, instrumento) VALUES (?,?,?,?)')
      .run(iglesia_id, ev.id, persona.id, inst);
  } catch {
    return res.status(409).json({ error: 'Esa persona ya está en el equipo con ese instrumento' });
  }
  db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
    .run(persona.id, 'musica', '🎵 Te toca tocar', `${inst} en "${ev.titulo}" · ${ev.fecha}`);
  auditar(iglesia_id, actor, 'equipo_musica_add', 'musica', `${persona.nombre} (${inst}) en ${ev.titulo}`);
  res.json({ ok: true });
});

// --- Quitar un integrante ---
r.delete('/plan/equipo/:id', (req, res) => {
  if (!esLiderMusicaEstricto(req.user.persona_id)) return res.status(403).json({ error: SOLO_LIDER });
  const info = db.prepare(
    `DELETE FROM equipo_musica WHERE id = ? AND evento_id IN (SELECT id FROM evento WHERE iglesia_id = ?)`
  ).run(req.params.id, req.user.iglesia_id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

// --- Agendar / actualizar el ensayo ---
r.post('/plan/:eventoId/ensayo', (req, res) => {
  const { persona_id: actor, iglesia_id } = req.user;
  if (!esLiderMusicaEstricto(actor)) return res.status(403).json({ error: SOLO_LIDER });
  const ev = eventoDeIglesia(req.params.eventoId, iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  const { fecha, hora, lugar, nota } = req.body || {};
  const existe = db.prepare('SELECT evento_id FROM ensayo WHERE evento_id = ?').get(ev.id);
  if (existe) {
    db.prepare('UPDATE ensayo SET fecha=?, hora=?, lugar=?, nota=? WHERE evento_id=?')
      .run(fecha || null, hora || null, lugar || null, nota || null, ev.id);
  } else {
    db.prepare('INSERT INTO ensayo (evento_id, iglesia_id, fecha, hora, lugar, nota) VALUES (?,?,?,?,?,?)')
      .run(ev.id, iglesia_id, fecha || null, hora || null, lugar || null, nota || null);
  }
  auditar(iglesia_id, actor, 'ensayo_set', 'musica', ev.titulo);
  res.json({ ok: true });
});

// --- Avisar a todo el equipo (servicio + ensayo) ---
r.post('/plan/:eventoId/avisar', (req, res) => {
  const { persona_id: actor, iglesia_id } = req.user;
  if (!esLiderMusicaEstricto(actor)) return res.status(403).json({ error: SOLO_LIDER });
  const ev = eventoDeIglesia(req.params.eventoId, iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  const equipo = db.prepare('SELECT persona_id, instrumento FROM equipo_musica WHERE evento_id = ?').all(ev.id);
  if (!equipo.length) return res.status(400).json({ error: 'Aún no hay equipo asignado' });
  const ensayo = db.prepare('SELECT fecha, hora, lugar FROM ensayo WHERE evento_id = ?').get(ev.id);
  const txtEnsayo = ensayo && ensayo.fecha
    ? ` · Ensayo: ${ensayo.fecha}${ensayo.hora ? ' ' + ensayo.hora : ''}${ensayo.lugar ? ' en ' + ensayo.lugar : ''}` : '';
  const st = db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)');
  for (const m of equipo)
    st.run(m.persona_id, 'musica', '🎵 Recordatorio de música', `${m.instrumento} en "${ev.titulo}" · ${ev.fecha}${txtEnsayo}`);
  auditar(iglesia_id, actor, 'avisar_equipo_musica', 'musica', `${ev.titulo}: ${equipo.length}`);
  res.json({ ok: true, avisados: equipo.length });
});

// ============================================================
//  Material / partituras compartidas (PDF, Word, foto...)
//  Ver: todo el ministerio. Subir/borrar: solo el líder de música.
// ============================================================
r.get('/material', (req, res) => {
  res.json(db.prepare('SELECT id, titulo, archivo_url, creado_por, creado_en FROM material_musica WHERE iglesia_id = ? ORDER BY creado_en DESC')
    .all(req.user.iglesia_id));
});

// Subir/compartir material: cualquier integrante del ministerio de música.
r.post('/material', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  if (!esDelMinisterioMusica(persona_id)) return res.status(403).json({ error: 'Solo el ministerio de música puede compartir material.' });
  const { titulo, archivo_url } = req.body || {};
  if (!titulo || !archivo_url) return res.status(400).json({ error: 'Falta el título o el archivo' });
  const info = db.prepare('INSERT INTO material_musica (iglesia_id, titulo, archivo_url, creado_por) VALUES (?,?,?,?)')
    .run(iglesia_id, String(titulo).trim(), archivo_url, persona_id);
  auditar(iglesia_id, persona_id, 'material_musica_add', 'musica', String(titulo).trim());
  res.json({ ok: true, id: info.lastInsertRowid });
});

// Borrar material: su autor, o el líder de música. El material permanente
// (archivos empaquetados en /assets/, p.ej. el himnario) NO se puede borrar.
r.delete('/material/:id', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const mat = db.prepare('SELECT creado_por, archivo_url FROM material_musica WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!mat) return res.status(404).json({ error: 'No encontrado' });
  if (String(mat.archivo_url || '').startsWith('/assets/'))
    return res.status(403).json({ error: 'Este material es permanente y no se puede borrar.' });
  if (mat.creado_por !== persona_id && !esLiderMusicaEstricto(persona_id))
    return res.status(403).json({ error: 'Solo el autor o el líder de música puede borrar este material.' });
  db.prepare('DELETE FROM material_musica WHERE id = ? AND iglesia_id = ?').run(req.params.id, iglesia_id);
  res.json({ ok: true });
});

export default r;
