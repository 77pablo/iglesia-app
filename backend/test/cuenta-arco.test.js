import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, SEM, srv, base, signToken;
before(async () => {
  db = await cargarDb();
  ({ signToken } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));
beforeEach(() => { reiniciar(db); SEM = sembrarMinimo(db); });

const H = (p) => ({ 'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: SEM.iglesiaId }) });

test('GET /api/cuenta/mis-datos: devuelve mi perfil y mis grupos', async () => {
  const res = await fetch(base + '/api/cuenta/mis-datos', { headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.perfil.usuario, 'miembro1');
  assert.ok(Array.isArray(j.grupos));
  assert.ok(j.grupos.includes('Jovenes'));
  assert.ok(Array.isArray(j.consentimientos));
});

test('POST /api/cuenta/eliminar: anonimiza la persona y escribe revocado', async () => {
  db.prepare("UPDATE persona SET email='m1@test.com', telefono='+56911', foto_url='/uploads/x.jpg' WHERE id = ?").run(SEM.miembro1.id);
  const res = await fetch(base + '/api/cuenta/eliminar', { method: 'POST', headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  const p = db.prepare('SELECT * FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(p.nombre, 'Usuario eliminado');
  assert.equal(p.email, null);
  assert.equal(p.telefono, null);
  assert.equal(p.foto_url, null);
  assert.equal(p.activo, 0);
  assert.match(p.usuario, /^eliminado_/);
  const c = db.prepare("SELECT * FROM consentimiento WHERE persona_id = ? AND accion = 'revocado'").get(SEM.miembro1.id);
  assert.ok(c, 'se registro la revocacion');
  // la pertenencia historica NO se borra (queda anonimizada)
  const per = db.prepare('SELECT COUNT(*) AS n FROM pertenencia WHERE persona_id = ?').get(SEM.miembro1.id).n;
  assert.equal(per, 1);
});

test('guarda: el super-admin no puede auto-eliminarse -> 409', async () => {
  db.prepare("UPDATE persona SET rol_global = 'super_admin' WHERE id = ?").run(SEM.miembro2.id);
  const res = await fetch(base + '/api/cuenta/eliminar', { method: 'POST', headers: H(SEM.miembro2) });
  assert.equal(res.status, 409);
  const p = db.prepare('SELECT activo FROM persona WHERE id = ?').get(SEM.miembro2.id);
  assert.equal(p.activo, 1);
});

test('guarda: el unico pastor activo no puede auto-eliminarse -> 409', async () => {
  const res = await fetch(base + '/api/cuenta/eliminar', { method: 'POST', headers: H(SEM.pastor) });
  assert.equal(res.status, 409);
});

test('un segundo pastor SI puede eliminarse (no es el unico)', async () => {
  db.prepare('UPDATE persona SET es_pastor = 1 WHERE id = ?').run(SEM.lider.id);
  const res = await fetch(base + '/api/cuenta/eliminar', { method: 'POST', headers: H(SEM.lider) });
  assert.equal(res.status, 200);
});
