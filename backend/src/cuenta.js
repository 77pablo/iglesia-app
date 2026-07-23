// ============================================================
//  Cuenta del usuario  -  Fase 5
//  - Cambiar su correo (Gmail).
//  - Cambiar su contrasena (verificando la actual).
//  - Recuperar contrasena olvidada por CODIGO de 6 digitos al correo.
//  Las rutas de recuperacion son PUBLICAS (no requieren sesion).
// ============================================================
import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, hashPassword, verifyPassword, auditar } from './auth.js';
import { enviarCorreo, mailActivo } from './mailer.js';
import { validar, limiterLogin } from './seguridad.js';
import { registrarConsentimiento } from './consentimiento.js';

const r = Router();

const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
const CODIGO_MIN_PASS = 4;   // largo minimo de contrasena (seed usa "1234")

const recuperarSchema = z.object({
  email: z.string().trim().min(1).refine(emailValido, 'correo invalido')
});
const confirmarSchema = z.object({
  email: z.string().trim().min(1).refine(emailValido, 'correo invalido'),
  codigo: z.string().trim().regex(/^\d{6}$/, 'codigo invalido'),
  nueva: z.string().min(CODIGO_MIN_PASS, `la nueva contraseña debe tener al menos ${CODIGO_MIN_PASS} caracteres`)
});
const emailSchema = z.object({
  email: z.string().trim().refine(e => e === '' || emailValido(e), 'correo invalido').optional()
});
const passwordSchema = z.object({
  actual: z.string().optional(),
  nueva: z.string().min(CODIGO_MIN_PASS, `la nueva contraseña debe tener al menos ${CODIGO_MIN_PASS} caracteres`)
});

// ============================================================
//  RUTAS PUBLICAS — recuperacion de contrasena
// ============================================================

// Paso 1: el usuario pide recuperar -> generamos codigo y lo enviamos al correo.
// Responde SIEMPRE ok (no revela si el correo existe o no).
// Rate limit: son rutas PUBLICAS (sin auth) -> superficie clasica de abuso
// (enumerar correos registrados, fuerza bruta del codigo de 6 digitos).
// Se reusa limiterLogin (5 req/IP/15min): es el mismo perfil de riesgo que el
// login (credenciales), y 5 intentos/15min es razonable para pedir un codigo
// o para probarlo, sin estorbar a un usuario real que se equivoca una vez.
r.post('/recuperar', limiterLogin, validar(recuperarSchema), async (req, res) => {
  const email = req.body.email.toLowerCase();
  if (!mailActivo) return res.status(503).json({ error: 'El servidor aún no tiene configurado el envío de correo.' });

  // 'email' no es UNIQUE en el esquema (ver db.js): puede haber mas de una
  // cuenta activa con el mismo correo (incluso en iglesias distintas). Si
  // adivinaramos "la primera creada" resetariamos la cuenta equivocada
  // (ver auditoria backend.md #5). En vez de eso: si hay colision, NO se
  // envia codigo (se aborta de forma segura) y se deja registro para que
  // un administrador corrija los correos duplicados. La respuesta al
  // cliente es identica a la de "correo no encontrado" (no revela nada).
  const candidatas = db.prepare('SELECT id, nombre FROM persona WHERE lower(email) = ? AND activo = 1 ORDER BY id').all(email);
  if (candidatas.length > 1) {
    console.warn(`[cuenta] recuperar: ${candidatas.length} cuentas activas comparten el mismo correo; se aborta el envio de codigo para evitar resetear la cuenta equivocada`);
    return res.json({ ok: true, mensaje: 'Si el correo está registrado, te enviamos un código.' });
  }
  const persona = candidatas[0];
  if (persona) {
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    // Invalida codigos anteriores y guarda el nuevo (expira en 15 min).
    db.prepare('DELETE FROM reset_codigo WHERE persona_id = ?').run(persona.id);
    db.prepare("INSERT INTO reset_codigo (persona_id, codigo, expira) VALUES (?,?, datetime('now','+15 minutes'))")
      .run(persona.id, codigo);
    try {
      await enviarCorreo(
        email,
        'Código para recuperar tu contraseña',
        `Hola ${persona.nombre}:\n\nTu código para restablecer la contraseña es: ${codigo}\n\nVence en 15 minutos. Si no fuiste tú, ignora este correo.`,
        `<p>Hola <b>${persona.nombre}</b>:</p><p>Tu código para restablecer la contraseña es:</p>
         <p style="font-size:26px;font-weight:bold;letter-spacing:4px">${codigo}</p>
         <p>Vence en 15 minutos. Si no fuiste tú, ignora este correo.</p>`
      );
    } catch (e) {
      console.error('[cuenta] no se pudo enviar correo:', e.message);
      return res.status(502).json({ error: 'No se pudo enviar el correo. Inténtalo más tarde.' });
    }
  }
  // Respuesta uniforme exista o no el correo.
  res.json({ ok: true, mensaje: 'Si el correo está registrado, te enviamos un código.' });
});

// Paso 2: confirma el codigo + nueva contrasena.
r.post('/recuperar/confirmar', limiterLogin, validar(confirmarSchema), (req, res) => {
  const { codigo: code, nueva } = req.body;
  const mail = req.body.email.toLowerCase();

  // Busca un codigo valido (no usado, no vencido) cuyo dueño tenga ese correo.
  const fila = db.prepare(
    `SELECT rc.id, rc.persona_id FROM reset_codigo rc
       JOIN persona p ON p.id = rc.persona_id
      WHERE rc.codigo = ? AND rc.usado = 0 AND rc.expira > datetime('now')
        AND lower(p.email) = ? AND p.activo = 1
      ORDER BY rc.id DESC LIMIT 1`
  ).get(code, mail);
  if (!fila) return res.status(400).json({ error: 'Código incorrecto o vencido' });

  // Limpia tambien el flag de "debe cambiar contrasena": este reseteo YA es
  // un cambio de contrasena en toda regla (verificado por codigo al correo).
  db.prepare('UPDATE persona SET password_hash = ?, debe_cambiar_pass = 0 WHERE id = ?').run(hashPassword(String(nueva)), fila.persona_id);
  db.prepare('UPDATE reset_codigo SET usado = 1 WHERE id = ?').run(fila.id);
  auditar(null, fila.persona_id, 'recuperar_password', 'cuenta');
  res.json({ ok: true });
});

// ============================================================
//  RUTAS PRIVADAS — requieren sesion
// ============================================================
r.use(authMiddleware);

// Cambiar mi correo.
r.patch('/email', validar(emailSchema), (req, res) => {
  const email = (req.body.email || '').trim();
  db.prepare('UPDATE persona SET email = ? WHERE id = ?').run(email || null, req.user.persona_id);
  auditar(req.user.iglesia_id, req.user.persona_id, 'cambiar_email', 'cuenta');
  res.json({ ok: true, email: email || null });
});

// Cambiar mi contrasena (verificando la actual).
r.patch('/password', validar(passwordSchema), (req, res) => {
  const { actual, nueva } = req.body;
  const p = db.prepare('SELECT password_hash FROM persona WHERE id = ?').get(req.user.persona_id);
  if (!p || !verifyPassword(String(actual || ''), p.password_hash))
    return res.status(403).json({ error: 'La contraseña actual no es correcta' });
  // Limpia el flag de contrasena temporal (onboarding): ya cambio su contrasena.
  db.prepare('UPDATE persona SET password_hash = ?, debe_cambiar_pass = 0 WHERE id = ?').run(hashPassword(String(nueva)), req.user.persona_id);
  auditar(req.user.iglesia_id, req.user.persona_id, 'cambiar_password', 'cuenta');
  res.json({ ok: true });
});

// --- ARCO: descargar mis datos (derecho de acceso) ---
r.get('/mis-datos', (req, res) => {
  const p = db.prepare('SELECT usuario, nombre, email, telefono, cumple, foto_url FROM persona WHERE id = ?').get(req.user.persona_id);
  const grupos = db.prepare(
    `SELECT g.nombre FROM grupo g JOIN pertenencia pe ON pe.grupo_id = g.id
      WHERE pe.persona_id = ? ORDER BY g.nombre`
  ).all(req.user.persona_id).map(g => g.nombre);
  const consentimientos = db.prepare(
    'SELECT tipo, version, accion, fecha FROM consentimiento WHERE persona_id = ? ORDER BY id'
  ).all(req.user.persona_id);
  res.json({ perfil: p, grupos, consentimientos });
});

// --- ARCO: retirar consentimiento = eliminar (anonimizar) mi cuenta ---
r.post('/eliminar', (req, res) => {
  const pid = req.user.persona_id, iid = req.user.iglesia_id;
  const yo = db.prepare('SELECT * FROM persona WHERE id = ?').get(pid);
  if (!yo) return res.status(404).json({ error: 'Persona no encontrada' });

  // Guarda: responsables no pueden dejar la iglesia huerfana.
  if (yo.rol_global === 'super_admin')
    return res.status(409).json({ error: 'Eres administrador del sistema; no puedes eliminar tu cuenta desde aquí.' });
  if (yo.es_pastor) {
    const pastores = db.prepare('SELECT COUNT(*) AS n FROM persona WHERE iglesia_id = ? AND es_pastor = 1 AND activo = 1').get(iid).n;
    if (pastores <= 1)
      return res.status(409).json({ error: 'Eres el pastor responsable de la iglesia. Transfiere ese rol a otra persona antes de eliminar tu cuenta, o escribe al correo de contacto legal.' });
  }

  // Borrar el archivo de la foto de perfil (best-effort).
  if (yo.foto_url && String(yo.foto_url).startsWith('/uploads/')) {
    try {
      const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
      fs.unlinkSync(path.join(uploadsDir, path.basename(yo.foto_url)));
    } catch { /* si no existe, no pasa nada */ }
  }

  // Anonimizar en una transaccion.
  const claveMuerta = hashPassword(crypto.randomBytes(24).toString('hex'));
  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE persona SET nombre = 'Usuario eliminado', usuario = ?, email = NULL, telefono = NULL,
         foto_url = NULL, cumple = NULL, mostrar_telefono = 0, mostrar_email = 0,
         activo = 0, password_hash = ? WHERE id = ?`
    ).run('eliminado_' + pid, claveMuerta, pid);
    registrarConsentimiento(pid, iid, 'revocado', req);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'No se pudo completar la eliminación' });
  }
  auditar(iid, pid, 'eliminar_cuenta', 'cuenta');
  res.json({ ok: true });
});

export default r;
