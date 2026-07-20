// ============================================================
//  Cuenta del usuario  -  Fase 5
//  - Cambiar su correo (Gmail).
//  - Cambiar su contrasena (verificando la actual).
//  - Recuperar contrasena olvidada por CODIGO de 6 digitos al correo.
//  Las rutas de recuperacion son PUBLICAS (no requieren sesion).
// ============================================================
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, hashPassword, verifyPassword, auditar } from './auth.js';
import { enviarCorreo, mailActivo } from './mailer.js';
import { validar } from './seguridad.js';

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
r.post('/recuperar', validar(recuperarSchema), async (req, res) => {
  const email = req.body.email.toLowerCase();
  if (!mailActivo) return res.status(503).json({ error: 'El servidor aún no tiene configurado el envío de correo.' });

  const persona = db.prepare('SELECT id, nombre FROM persona WHERE lower(email) = ? AND activo = 1 ORDER BY id LIMIT 1').get(email);
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
r.post('/recuperar/confirmar', validar(confirmarSchema), (req, res) => {
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

  db.prepare('UPDATE persona SET password_hash = ? WHERE id = ?').run(hashPassword(String(nueva)), fila.persona_id);
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
  db.prepare('UPDATE persona SET password_hash = ? WHERE id = ?').run(hashPassword(String(nueva)), req.user.persona_id);
  auditar(req.user.iglesia_id, req.user.persona_id, 'cambiar_password', 'cuenta');
  res.json({ ok: true });
});

export default r;
