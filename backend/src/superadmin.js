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
    `SELECT i.id, i.nombre, i.codigo_unico, i.creada_en,
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

export default r;
