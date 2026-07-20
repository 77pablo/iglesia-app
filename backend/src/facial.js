// ============================================================
//  Modulo Facial (Fase 3): inscripcion y reconocimiento.
//  Reenvia las imagenes al microservicio Python (puerto 5001),
//  guarda/compara embeddings (coseno) por iglesia.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, esLiderOAdmin, auditar } from './auth.js';
import { validar } from './seguridad.js';

const PY_URL = process.env.FACIAL_PY_URL || 'http://localhost:5001';
const MODELO = 'buffalo_l';
// Umbral de coseno para aceptar un reconocimiento (configurable por env).
const UMBRAL = Number(process.env.FACIAL_UMBRAL || 0.35);

const r = Router();
r.use(authMiddleware);

// Pide el embedding de una imagen al servicio Python.
// Devuelve el objeto JSON tal cual ({ ok, faces, embedding, det_score }).
async function pedirEmbedding(image) {
  let resp;
  try {
    resp = await fetch(`${PY_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image })
    });
  } catch (e) {
    const err = new Error('No se pudo conectar con el servicio facial (Python en :5001). ¿Está encendido?');
    err.status = 503;
    throw err;
  }
  if (!resp.ok) {
    let detalle = '';
    try { detalle = (await resp.json()).error || ''; } catch { /* ignore */ }
    const err = new Error('El servicio facial devolvió un error: ' + (detalle || resp.status));
    err.status = 502;
    throw err;
  }
  return resp.json();
}

// Coseno entre dos vectores ya normalizados (L2) = producto punto.
function coseno(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

// --- INSCRIBIR un rostro (solo lider/pastor) ---
// body: { persona_id, image }
// image: base64 de una foto, puede ser un string largo -> min(1) nada mas,
// sin limite de largo (el limite real lo pone express.json({limit:'12mb'}) en server.js).
const inscribirSchema = z.object({
  persona_id: z.coerce.number().int().positive('falta la persona'),
  image: z.string().min(1, 'falta la imagen')
});
r.post('/inscribir', validar(inscribirSchema), async (req, res) => {
  const { persona_id, iglesia_id } = req.user;
  const { persona_id: target, image } = req.body;
  if (!esLiderOAdmin(persona_id))
    return res.status(403).json({ error: 'No tienes permiso para inscribir rostros' });

  // La persona debe pertenecer a la misma iglesia.
  const persona = db.prepare('SELECT id, nombre FROM persona WHERE id = ? AND iglesia_id = ?')
    .get(target, iglesia_id);
  if (!persona) return res.status(404).json({ error: 'Persona no encontrada en tu iglesia' });

  try {
    const data = await pedirEmbedding(image);
    if (!data.ok) return res.status(400).json({ error: data.error || 'Error en el servicio facial' });
    if (!data.faces || !data.embedding)
      return res.status(422).json({ error: 'No se detectó ningún rostro. Acerca tu cara y mejora la luz.' });

    db.prepare(
      'INSERT INTO biometria_persona (iglesia_id, persona_id, embedding, modelo) VALUES (?,?,?,?)'
    ).run(iglesia_id, target, JSON.stringify(data.embedding), MODELO);

    auditar(iglesia_id, persona_id, 'inscribir_rostro', 'facial', persona.nombre);
    res.json({ ok: true, persona: { id: persona.id, nombre: persona.nombre }, det_score: data.det_score });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// --- RECONOCER un rostro ---
// body: { image }  -> compara contra la biometria de la MISMA iglesia.
const reconocerSchema = z.object({
  image: z.string().min(1, 'falta la imagen')
});
r.post('/reconocer', validar(reconocerSchema), async (req, res) => {
  const { iglesia_id } = req.user;
  const { image } = req.body;

  try {
    const data = await pedirEmbedding(image);
    if (!data.ok) return res.status(400).json({ error: data.error || 'Error en el servicio facial' });
    if (!data.faces || !data.embedding)
      return res.json({ reconocido: false, faces: 0 });

    const consulta = data.embedding;
    // Cargar en memoria las biometrias de esta iglesia.
    const filas = db.prepare(
      `SELECT b.persona_id, b.embedding, p.nombre
         FROM biometria_persona b JOIN persona p ON p.id = b.persona_id
        WHERE b.iglesia_id = ?`
    ).all(iglesia_id);

    let mejor = null;
    let mejorSim = -1;
    for (const f of filas) {
      let emb;
      try { emb = JSON.parse(f.embedding); } catch { continue; }
      const sim = coseno(consulta, emb);
      if (sim > mejorSim) {
        mejorSim = sim;
        mejor = f;
      }
    }

    if (mejor && mejorSim >= UMBRAL) {
      return res.json({
        reconocido: true,
        persona: { id: mejor.persona_id, nombre: mejor.nombre },
        confianza: Number(mejorSim.toFixed(4))
      });
    }
    res.json({ reconocido: false, confianza: mejor ? Number(mejorSim.toFixed(4)) : null });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// --- LISTA de personas con biometria inscrita ---
r.get('/inscritos', (req, res) => {
  const filas = db.prepare(
    `SELECT p.id, p.nombre, COUNT(b.id) AS muestras, MAX(b.creado_en) AS ultima
       FROM biometria_persona b JOIN persona p ON p.id = b.persona_id
      WHERE b.iglesia_id = ?
      GROUP BY p.id, p.nombre
      ORDER BY p.nombre`
  ).all(req.user.iglesia_id);
  res.json(filas);
});

export default r;
