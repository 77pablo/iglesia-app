// ============================================================
//  Web Push real (VAPID)  -  Fase 5
//  Envia notificaciones push al navegador (incluso con la app cerrada).
//  Degrada con elegancia: si no hay claves VAPID configuradas, el push
//  queda desactivado y las notificaciones siguen en la campana in-app.
//
//  Configuracion (variables de entorno):
//    VAPID_PUBLIC   clave publica  (la usa el navegador para suscribirse)
//    VAPID_PRIVATE  clave privada  (solo el servidor; NO exponer)
//    VAPID_SUBJECT  mailto:... o URL de contacto (opcional)
//  Generar un par:  node -e "console.log(require('web-push').generateVAPIDKeys())"
// ============================================================
import { Router } from 'express';
import webpush from 'web-push';
import db from './db.js';
import { authMiddleware } from './auth.js';

const PUBLIC = process.env.VAPID_PUBLIC || '';
const PRIVATE = process.env.VAPID_PRIVATE || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@iglesia.app';

export const pushActivo = !!(PUBLIC && PRIVATE);
if (pushActivo) {
  try { webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE); }
  catch (e) { console.error('[push] VAPID invalido:', e.message); }
} else {
  console.warn('[push] VAPID no configurado (VAPID_PUBLIC/VAPID_PRIVATE) -> push real desactivado; las notificaciones siguen en la campana.');
}

// Envia un push a varias personas. Nunca lanza: si una suscripcion falla, se
// registra; si caduco (404/410), se elimina. Es seguro llamarlo sin await.
export async function enviarPush(personaIds, { titulo, texto, url } = {}) {
  if (!pushActivo || !personaIds || !personaIds.length) return;
  const ids = [...new Set(personaIds.filter(Boolean))];
  if (!ids.length) return;
  const ph = ids.map(() => '?').join(',');
  const subs = db.prepare(`SELECT id, endpoint, p256dh, auth FROM push_sub WHERE persona_id IN (${ph})`).all(...ids);
  if (!subs.length) return;
  const payload = JSON.stringify({ titulo: titulo || 'Iglesia', texto: texto || '', url: url || '/' });
  const del = db.prepare('DELETE FROM push_sub WHERE id = ?');
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) del.run(s.id);   // suscripcion caducada
      else console.error('[push] error al enviar:', e.statusCode || e.message);
    }
  }));
}

const r = Router();
r.use(authMiddleware);

// La clave publica VAPID que el navegador necesita para suscribirse.
r.get('/clave-publica', (req, res) => res.json({ clave: PUBLIC, activo: pushActivo }));

// Guarda (o refresca) la suscripcion push del navegador del usuario.
r.post('/suscribir', (req, res) => {
  const sub = req.body || {};
  if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth)
    return res.status(400).json({ error: 'Suscripcion invalida' });
  // endpoint es unico: si ya existe, lo reasigna a esta persona y refresca llaves.
  db.prepare(`INSERT INTO push_sub (persona_id, endpoint, p256dh, auth) VALUES (?,?,?,?)
              ON CONFLICT(endpoint) DO UPDATE SET persona_id=excluded.persona_id, p256dh=excluded.p256dh, auth=excluded.auth`)
    .run(req.user.persona_id, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
  res.json({ ok: true });
});

// Da de baja la suscripcion (al desactivar o cerrar sesion).
r.post('/baja', (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) db.prepare('DELETE FROM push_sub WHERE endpoint = ? AND persona_id = ?').run(endpoint, req.user.persona_id);
  res.json({ ok: true });
});

// Envia un push de prueba a mi mismo.
r.post('/probar', async (req, res) => {
  if (!pushActivo) return res.status(400).json({ error: 'El push no esta configurado en el servidor (faltan claves VAPID).' });
  const tengo = db.prepare('SELECT COUNT(*) AS n FROM push_sub WHERE persona_id = ?').get(req.user.persona_id).n;
  if (!tengo) return res.status(400).json({ error: 'Este dispositivo aun no esta suscrito a las notificaciones.' });
  await enviarPush([req.user.persona_id], { titulo: '🔔 Prueba', texto: '¡Las notificaciones push funcionan!', url: '/' });
  res.json({ ok: true });
});

export default r;
