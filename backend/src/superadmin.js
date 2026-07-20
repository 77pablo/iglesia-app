// ============================================================
//  Super-admin (Onboarding)  -  gestion tecnica del sistema.
//  SOLO rol_global='super_admin' (NUNCA el obispo: el obispo es solo-lectura
//  sobre las iglesias existentes, ver obispo.js; crear iglesias/pastores es
//  una funcion tecnica distinta y mas sensible).
//  Crea la iglesia + la cuenta del pastor con una contrasena TEMPORAL
//  (debe_cambiar_pass=1): el pastor debe cambiarla en su primer ingreso.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import db from './db.js';
import { authMiddleware, hashPassword, auditar } from './auth.js';
import { validar } from './seguridad.js';

const r = Router();
r.use(authMiddleware);

function esSuperAdmin(personaId) {
  const p = db.prepare('SELECT rol_global FROM persona WHERE id = ?').get(personaId);
  return !!(p && p.rol_global === 'super_admin');
}

// Gate ESTRICTO: solo super_admin. Ni el pastor ni el obispo entran aqui.
r.use((req, res, next) => {
  if (!esSuperAdmin(req.user.persona_id)) return res.status(403).json({ error: 'Solo el super-admin puede acceder aqui' });
  next();
});

// Convierte el nombre de la iglesia en un codigo MAYUSCULAS sin espacios/tildes.
function normalizarCodigo(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quita tildes/acentos
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');                          // solo letras/numeros
}

// Genera un codigo_unico a partir del nombre, asegurando unicidad (agrega un
// numero al final si ya existe: MONTESION, MONTESION2, MONTESION3...).
function generarCodigoUnico(nombreIglesia) {
  const base = normalizarCodigo(nombreIglesia) || 'IGLESIA';
  let candidato = base;
  let n = 1;
  while (db.prepare('SELECT 1 FROM iglesia WHERE codigo_unico = ?').get(candidato)) {
    n += 1;
    candidato = base + n;
  }
  return candidato;
}

// --- Lista todas las iglesias (para el panel del super-admin) ---
r.get('/iglesias', (req, res) => {
  const iglesias = db.prepare(
    `SELECT i.id, i.nombre, i.codigo_unico, i.creada_en, i.activa,
        (SELECT nombre FROM persona WHERE iglesia_id = i.id AND es_pastor = 1 LIMIT 1) AS pastor,
        (SELECT COUNT(*) FROM persona p WHERE p.iglesia_id = i.id AND p.activo = 1) AS miembros
       FROM iglesia i ORDER BY i.nombre`
  ).all();
  res.json(iglesias);
});

// --- Crea la iglesia + la cuenta del pastor (contrasena temporal) ---
const crearIglesiaSchema = z.object({
  nombre_iglesia: z.string().trim().min(1, 'falta el nombre de la iglesia'),
  codigo: z.string().trim().min(1).optional().or(z.literal('')),
  pastor_nombre: z.string().trim().min(1, 'falta el nombre del pastor'),
  pastor_usuario: z.string().trim().min(1, 'falta el usuario del pastor'),
  pastor_email: z.string().trim().email('correo invalido').optional().or(z.literal('')),
  pastor_password: z.string().min(6, 'la contraseña debe tener al menos 6 caracteres')
});
r.post('/iglesias', validar(crearIglesiaSchema), (req, res) => {
  const { nombre_iglesia, codigo, pastor_nombre, pastor_usuario, pastor_email, pastor_password } = req.body;

  let codigoFinal;
  if (codigo) {
    codigoFinal = normalizarCodigo(codigo);
    if (!codigoFinal) return res.status(400).json({ error: 'código de iglesia no válido' });
    if (db.prepare('SELECT 1 FROM iglesia WHERE codigo_unico = ?').get(codigoFinal))
      return res.status(409).json({ error: 'Ya existe una iglesia con ese código' });
  } else {
    codigoFinal = generarCodigoUnico(nombre_iglesia);
  }

  let iglesiaId;
  try {
    const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run(nombre_iglesia, codigoFinal);
    iglesiaId = ig.lastInsertRowid;
  } catch {
    return res.status(409).json({ error: 'Ya existe una iglesia con ese código' });
  }

  // El pastor entra con contrasena TEMPORAL: debe_cambiar_pass=1 fuerza el
  // cambio en el primer ingreso (ver auth.js perfilPublico + cuenta.js).
  const info = db.prepare(
    `INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, email, es_pastor, activo, debe_cambiar_pass)
     VALUES (?,?,?,?,?,1,1,1)`
  ).run(
    iglesiaId, pastor_usuario, pastor_nombre, hashPassword(String(pastor_password)),
    pastor_email ? String(pastor_email).trim() : null
  );

  auditar(null, req.user.persona_id, 'superadmin_crear_iglesia', 'superadmin', `${nombre_iglesia} (${codigoFinal})`);
  res.json({
    iglesia: { id: iglesiaId, nombre: nombre_iglesia, codigo_unico: codigoFinal },
    pastor: { usuario: pastor_usuario, id: info.lastInsertRowid }
  });
});

// --- Edita nombre/codigo/estado (activa) de una iglesia ---
// Solo actualiza los campos presentes en el body (no borra lo no enviado).
const editarIglesiaSchema = z.object({
  nombre: z.string().trim().min(1, 'el nombre no puede quedar vacío').optional(),
  codigo: z.string().trim().min(1, 'el código no puede quedar vacío').optional(),
  activa: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional()
});
r.patch('/iglesias/:id', validar(editarIglesiaSchema), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id de iglesia no válido' });

  const iglesia = db.prepare('SELECT * FROM iglesia WHERE id = ?').get(id);
  if (!iglesia) return res.status(404).json({ error: 'Iglesia no encontrada' });

  const { nombre, codigo, activa } = req.body;

  let codigoFinal = iglesia.codigo_unico;
  if (codigo !== undefined) {
    codigoFinal = normalizarCodigo(codigo);
    if (!codigoFinal) return res.status(400).json({ error: 'código de iglesia no válido' });
    if (codigoFinal !== iglesia.codigo_unico &&
        db.prepare('SELECT 1 FROM iglesia WHERE codigo_unico = ? AND id != ?').get(codigoFinal, id))
      return res.status(409).json({ error: 'Ya existe una iglesia con ese código' });
  }
  const nombreFinal = nombre !== undefined ? nombre : iglesia.nombre;
  const activaFinal = activa !== undefined ? (activa ? 1 : 0) : iglesia.activa;

  db.prepare('UPDATE iglesia SET nombre = ?, codigo_unico = ?, activa = ? WHERE id = ?')
    .run(nombreFinal, codigoFinal, activaFinal, id);

  auditar(id, req.user.persona_id, 'superadmin_editar_iglesia', 'superadmin',
    `${nombreFinal} (${codigoFinal}) activa=${activaFinal}`);

  const actualizada = db.prepare(
    'SELECT id, nombre, codigo_unico, activa, creada_en FROM iglesia WHERE id = ?'
  ).get(id);
  res.json(actualizada);
});

// Genera una contrasena temporal legible (8-10 caracteres, sin ambiguos: sin 0/O/1/l/I).
function generarPasswordTemporal() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const largo = 9;
  let pass = '';
  const bytes = crypto.randomBytes(largo);
  for (let i = 0; i < largo; i++) pass += alfabeto[bytes[i] % alfabeto.length];
  return pass;
}

// --- Resetea la contrasena del pastor de una iglesia (contrasena temporal) ---
r.post('/iglesias/:id/reset-pastor', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id de iglesia no válido' });

  const iglesia = db.prepare('SELECT * FROM iglesia WHERE id = ?').get(id);
  if (!iglesia) return res.status(404).json({ error: 'Iglesia no encontrada' });

  const pastor = db.prepare(
    'SELECT * FROM persona WHERE iglesia_id = ? AND es_pastor = 1 ORDER BY id LIMIT 1'
  ).get(id);
  if (!pastor) return res.status(404).json({ error: 'Esta iglesia no tiene un pastor registrado' });

  const temporal = generarPasswordTemporal();
  db.prepare('UPDATE persona SET password_hash = ?, debe_cambiar_pass = 1 WHERE id = ?')
    .run(hashPassword(temporal), pastor.id);

  auditar(id, req.user.persona_id, 'superadmin_reset_pastor', 'superadmin', `pastor=${pastor.usuario}`);

  res.json({
    pastor: { id: pastor.id, usuario: pastor.usuario, nombre: pastor.nombre },
    password_temporal: temporal
  });
});

export default r;
