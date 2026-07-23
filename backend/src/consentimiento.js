// ============================================================
//  Consentimiento legal general (Terminos + Privacidad).
//  Tabla append-only: cada accion (otorgado/revocado) es una fila
//  nueva -> historial trazable + revocable. La vigencia = la ultima
//  fila de la persona es 'otorgado' Y su version == la vigente.
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware } from './auth.js';

export const CONSENT_VERSION = '2026-07-23';

export function tieneConsentimientoVigente(personaId, tipo = 'general') {
  const fila = db.prepare(
    'SELECT accion, version FROM consentimiento WHERE persona_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1'
  ).get(personaId, tipo);
  return !!fila && fila.accion === 'otorgado' && fila.version === CONSENT_VERSION;
}

export function registrarConsentimiento(personaId, iglesiaId, accion, req) {
  db.prepare(
    `INSERT INTO consentimiento (iglesia_id, persona_id, tipo, version, accion, fecha, ip, user_agent)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(
    iglesiaId, personaId, 'general', CONSENT_VERSION, accion,
    new Date().toISOString(),
    req ? String(req.ip || '') : null,
    req ? String(req.get?.('user-agent') || '') : null
  );
}

const r = Router();
r.use(authMiddleware);

r.get('/estado', (req, res) => {
  const fila = db.prepare(
    "SELECT version, fecha FROM consentimiento WHERE persona_id = ? AND tipo = 'general' AND accion = 'otorgado' ORDER BY id DESC LIMIT 1"
  ).get(req.user.persona_id);
  res.json({
    vigente: tieneConsentimientoVigente(req.user.persona_id),
    version: CONSENT_VERSION,
    fecha: fila ? fila.fecha : null
  });
});

r.post('/aceptar', (req, res) => {
  registrarConsentimiento(req.user.persona_id, req.user.iglesia_id, 'otorgado', req);
  res.json({ ok: true });
});

export default r;
