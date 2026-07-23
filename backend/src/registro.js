// ============================================================
//  Registro publico de feligres (Onboarding)  -  SIN sesion.
//  El feligres se registra SOLO con el codigo de su iglesia: el codigo
//  es el candado (si no lo tienes, no puedes entrar). El pastor y el
//  super-admin siguen creando cuentas aparte (admin.js / superadmin.js).
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { hashPassword, signToken, perfilPublico, auditar } from './auth.js';
import { limiterSensible, validar } from './seguridad.js';
import { registrarConsentimiento } from './consentimiento.js';

const r = Router();

const registroSchema = z.object({
  codigo: z.string().trim().min(1, 'falta el codigo de la iglesia'),
  nombre: z.string().trim().min(1, 'falta el nombre'),
  usuario: z.string().trim().min(1, 'falta el usuario'),
  password: z.string().min(6, 'la contraseña debe tener al menos 6 caracteres'),
  email: z.string().trim().email('correo invalido').optional().or(z.literal('')),
  telefono: z.string().trim().max(50).optional().or(z.literal('')),
  acepto: z.literal(true, { errorMap: () => ({ message: 'debes aceptar los Términos y la Política de Privacidad' }) })
});

// POST /api/registro — crea la cuenta del feligres y devuelve { token, persona }
// (auto-login, igual que /api/login). Rate-limited: es publico y sin sesion,
// asi que es superficie clasica de abuso (crear cuentas en masa).
r.post('/', limiterSensible, validar(registroSchema), (req, res) => {
  const { codigo, nombre, usuario, password, email, telefono } = req.body;

  // El codigo de iglesia se normaliza a MAYUSCULAS (asi se guardan en la BD,
  // ver iglesia.codigo_unico) y la busqueda es case-insensitive de por si.
  const codigoNorm = String(codigo).trim().toUpperCase();
  const iglesia = db.prepare('SELECT id FROM iglesia WHERE upper(codigo_unico) = ?').get(codigoNorm);
  if (!iglesia) return res.status(400).json({ error: 'código de iglesia no válido' });

  // Usuario unico DENTRO de esa iglesia (la BD ya tiene UNIQUE(iglesia_id, usuario);
  // se comprueba antes para responder un 409 con mensaje claro, y se captura
  // igual el error de la BD por si hay una carrera entre dos registros).
  const existe = db.prepare('SELECT 1 FROM persona WHERE iglesia_id = ? AND usuario = ?').get(iglesia.id, usuario);
  if (existe) return res.status(409).json({ error: 'Ese nombre de usuario ya existe en esta iglesia' });

  let info;
  try {
    info = db.prepare(
      `INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, email, telefono, es_pastor, activo, debe_cambiar_pass)
       VALUES (?,?,?,?,?,?,0,1,0)`
    ).run(
      iglesia.id, usuario, nombre, hashPassword(String(password)),
      email ? String(email).trim() : null,
      telefono ? String(telefono).trim() : null
    );
  } catch {
    return res.status(409).json({ error: 'Ese nombre de usuario ya existe en esta iglesia' });
  }

  const persona = db.prepare('SELECT * FROM persona WHERE id = ?').get(info.lastInsertRowid);
  registrarConsentimiento(persona.id, iglesia.id, 'otorgado', req);
  const token = signToken(persona);
  auditar(iglesia.id, persona.id, 'registro_publico', 'registro', usuario);
  res.json({ token, persona: perfilPublico(persona) });
});

export default r;
