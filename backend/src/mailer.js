// ============================================================
//  Envio de correo (Gmail SMTP)  -  Fase 5
//  Se usa para la recuperacion de contrasena (codigo de 6 digitos).
//  Degrada con elegancia: si no hay credenciales, no envia y avisa.
//
//  Configuracion (variables de entorno):
//    SMTP_USER   tu correo Gmail (ej. mi.iglesia@gmail.com)
//    SMTP_PASS   "Contrasena de aplicacion" de Google (16 letras, NO la normal)
//    SMTP_FROM   (opcional) remitente visible; por defecto SMTP_USER
//  Para generar la app password: cuenta Google -> Seguridad -> Verificacion
//  en 2 pasos -> Contrasenas de aplicaciones.
// ============================================================
import nodemailer from 'nodemailer';

const USER = process.env.SMTP_USER || '';
const PASS = process.env.SMTP_PASS || '';
const FROM = process.env.SMTP_FROM || USER;

export const mailActivo = !!(USER && PASS);

let transporter = null;
if (mailActivo) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: USER, pass: PASS }
  });
} else {
  console.warn('[mail] SMTP no configurado (SMTP_USER/SMTP_PASS) -> el correo de recuperacion no se enviara.');
}

// Envia un correo. Lanza si falla (el que llama decide como responder).
export async function enviarCorreo(to, asunto, texto, html) {
  if (!mailActivo) throw new Error('El correo no esta configurado en el servidor');
  await transporter.sendMail({ from: FROM, to, subject: asunto, text: texto, html: html || undefined });
}
