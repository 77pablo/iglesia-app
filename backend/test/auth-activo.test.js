// ============================================================
//  authMiddleware: revoca el acceso si la persona o su iglesia
//  quedan desactivadas, aunque el JWT (30 dias) siga vigente.
// ============================================================
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, srv, base, signToken, SEM;

before(async () => {
  db = await cargarDb();
  ({ signToken } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));

beforeEach(() => {
  reiniciar(db);
  SEM = sembrarMinimo(db);
});

test('token valido de una persona activa en una iglesia activa -> 200', async () => {
  const token = signToken({ id: SEM.miembro1.id, iglesia_id: SEM.iglesiaId });
  const res = await fetch(base + '/api/me', {
    headers: { Authorization: 'Bearer ' + token }
  });
  assert.equal(res.status, 200);
});

test('persona desactivada (activo=0) -> el mismo token ahora responde 401', async () => {
  const token = signToken({ id: SEM.miembro1.id, iglesia_id: SEM.iglesiaId });

  // Funciona antes de desactivar.
  let res = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(res.status, 200);

  db.prepare('UPDATE persona SET activo = 0 WHERE id = ?').run(SEM.miembro1.id);

  res = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(res.status, 401);
});

test('iglesia desactivada (activa=0) -> el token de un miembro de esa iglesia responde 401', async () => {
  const token = signToken({ id: SEM.miembro1.id, iglesia_id: SEM.iglesiaId });

  // Reactiva por si acaso (independiente del test anterior: beforeEach reinicia todo).
  db.prepare('UPDATE persona SET activo = 1 WHERE id = ?').run(SEM.miembro1.id);
  db.prepare('UPDATE iglesia SET activa = 0 WHERE id = ?').run(SEM.iglesiaId);

  const res = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(res.status, 401);
});

test('super_admin con iglesia_id=NULL no se rompe por el chequeo de iglesia', async () => {
  const r = db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (NULL,'sa','SA','x','super_admin',1)"
  ).run();
  const saId = Number(r.lastInsertRowid);
  const token = signToken({ id: saId, iglesia_id: null });

  const res = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
  assert.notEqual(res.status, 401);
});

test('super_admin: consentimiento_pendiente=false (no pasa por la puerta legal de feligrés)', async () => {
  // Regresión: el super-admin (iglesia_id=NULL) quedaba atascado en la pantalla
  // de consentimiento porque /me lo marcaba pendiente y la tabla consentimiento
  // exige iglesia_id NOT NULL, así que aceptar fallaba. Debe quedar exento.
  const r = db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (NULL,'sa2','SA2','x','super_admin',1)"
  ).run();
  const token = signToken({ id: Number(r.lastInsertRowid), iglesia_id: null });

  const res = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.consentimiento_pendiente, false);
});
