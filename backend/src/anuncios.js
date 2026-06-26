// ============================================================
//  Modulo B: Anuncios + Notificaciones  -  Fase 1B
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esLiderOAdmin, esPastor, auditar } from './auth.js';
import { notificarSegmento, etiquetaSegmento } from './notificaciones.js';

const r = Router();
r.use(authMiddleware);

// Crea una notificacion in-app para cada miembro de la iglesia.
// (En produccion, aqui ademas se enviaria el push real via FCM a sus dispositivos.)
// Se mantiene por compatibilidad; internamente usa la segmentacion (Fase 4.1).
export function notificarIglesia(iglesiaId, tipo, titulo, texto) {
  notificarSegmento(iglesiaId, { tipo: 'todos' }, tipo, titulo, texto);
}

// --- Listar anuncios de la iglesia ---
r.get('/', (req, res) => {
  const anuncios = db.prepare(
    `SELECT a.*, p.nombre AS autor FROM anuncio a
       LEFT JOIN persona p ON p.id = a.creado_por
      WHERE a.iglesia_id = ? ORDER BY a.creado_en DESC`
  ).all(req.user.iglesia_id);
  res.json(anuncios);
});

// --- Publicar anuncio (solo lider/pastor) ---
// body: { titulo, texto, urgente, segmento:{tipo:'todos'|'grupo'|'rol', grupo_id?, rol?} }
r.post('/', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const { titulo, texto, urgente, segmento } = req.body || {};
  if (!titulo) return res.status(400).json({ error: 'Falta el título' });
  if (!esLiderOAdmin(persona_id))
    return res.status(403).json({ error: 'No tienes permiso para publicar anuncios' });

  // Normaliza el segmento (por defecto, toda la iglesia)
  const seg = segmento && segmento.tipo ? segmento : { tipo: 'todos' };
  const segGrupo = seg.tipo === 'grupo' ? (Number(seg.grupo_id) || null) : null;
  const segRol = seg.tipo === 'rol' ? (seg.rol || null) : null;

  const info = db.prepare(
    'INSERT INTO anuncio (iglesia_id, titulo, texto, urgente, creado_por, segmento, grupo_id, rol) VALUES (?,?,?,?,?,?,?,?)'
  ).run(iglesia_id, titulo, texto || null, urgente ? 1 : 0, persona_id, seg.tipo, segGrupo, segRol);

  // Avisar segun el segmento elegido (jovenes, lideres, padres, etc.)
  const enviadas = notificarSegmento(
    iglesia_id,
    seg,
    urgente ? 'anuncio_urgente' : 'anuncio',
    (urgente ? '🔴 ' : '📢 ') + titulo,
    texto || ''
  );
  auditar(iglesia_id, persona_id, 'publicar_anuncio', 'anuncios', titulo + ' · ' + etiquetaSegmento(iglesia_id, seg));
  res.json({ ok: true, id: info.lastInsertRowid, enviadas });
});

// --- Editar anuncio (pastor o autor) ---
r.patch('/:id', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const a = db.prepare('SELECT * FROM anuncio WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!a) return res.status(404).json({ error: 'No encontrado' });
  if (!(esPastor(persona_id) || a.creado_por === persona_id)) return res.status(403).json({ error: 'No tienes permiso' });
  const { titulo, texto, urgente } = req.body || {};
  db.prepare('UPDATE anuncio SET titulo=?, texto=?, urgente=? WHERE id=?')
    .run(titulo || a.titulo, texto || null, urgente ? 1 : 0, a.id);
  res.json({ ok: true });
});

// --- Eliminar anuncio (pastor o autor) ---
r.delete('/:id', (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const a = db.prepare('SELECT * FROM anuncio WHERE id = ? AND iglesia_id = ?').get(req.params.id, iglesia_id);
  if (!a) return res.status(404).json({ error: 'No encontrado' });
  if (!(esPastor(persona_id) || a.creado_por === persona_id)) return res.status(403).json({ error: 'No tienes permiso' });
  db.prepare('DELETE FROM anuncio WHERE id=?').run(a.id);
  res.json({ ok: true });
});

export default r;
