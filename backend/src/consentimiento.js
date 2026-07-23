// ============================================================
//  Consentimiento legal general (Terminos + Privacidad).
//  Tabla append-only: cada accion (otorgado/revocado) es una fila
//  nueva -> historial trazable + revocable. La vigencia = la ultima
//  fila de la persona es 'otorgado' Y su version == la vigente.
// ============================================================
import db from './db.js';

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
