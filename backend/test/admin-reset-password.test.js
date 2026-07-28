// ============================================================
//  Administracion: el pastor restablece la clave de un miembro
//  POST /api/admin/usuarios/:id/clave   -  pruebas
//  Cubre:
//   - genera clave temporal ALEATORIA y deja debe_cambiar_pass = 1
//   - la clave vieja deja de servir; la temporal si permite entrar
//   - dos reseteos seguidos dan claves DISTINTAS (aleatoriedad real)
//   - gates: no pastor -> 403, otra iglesia -> 404, super_admin/obispo -> 403,
//     uno mismo -> 400
//   - queda auditado
// ============================================================
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, srv, base, signToken, hashPassword, SEM;

before(async () => {
  db = await cargarDb();
  ({ signToken, hashPassword } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));

beforeEach(() => {
  reiniciar(db);
  db.exec('DELETE FROM auditoria');
  SEM = sembrarMinimo(db);
});

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

// Crea un miembro con contrasena REAL (para probar el login de verdad).
function miembroConClave(usuario, passwordPlano, iglesiaId = SEM.iglesiaId) {
  const id = Number(db.prepare(
    `INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo, debe_cambiar_pass)
     VALUES (?, ?, ?, ?, 0, 1, 0)`
  ).run(iglesiaId, usuario, 'Miembro ' + usuario, hashPassword(passwordPlano)).lastInsertRowid);
  return { id, usuario };
}

async function login(iglesia, usuario, password) {
  return fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iglesia, usuario, password })
  });
}

const resetear = (actor, id, iglesiaId = SEM.iglesiaId) =>
  fetch(base + `/api/admin/usuarios/${id}/clave`, { method: 'POST', headers: H(actor, iglesiaId) });

// ------------------------------------------------------------
// Camino feliz
// ------------------------------------------------------------
test('POST /api/admin/usuarios/:id/clave: el pastor genera una clave temporal y deja debe_cambiar_pass=1', async () => {
  const res = await resetear(SEM.pastor, SEM.miembro1.id);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.password_temporal, 'string');
  assert.ok(body.password_temporal.length >= 8);

  const fila = db.prepare('SELECT * FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(fila.debe_cambiar_pass, 1);
  // La clave se guarda HASHEADA, nunca en claro.
  assert.notEqual(fila.password_hash, body.password_temporal);
});

test('POST /api/admin/usuarios/:id/clave: la clave vieja deja de servir y la temporal permite entrar', async () => {
  const m = miembroConClave('conclave', 'viejaClave1');

  // Antes del reseteo la clave vieja funciona.
  let loginRes = await login('TEST', 'conclave', 'viejaClave1');
  assert.equal(loginRes.status, 200);

  const res = await resetear(SEM.pastor, m.id);
  assert.equal(res.status, 200);
  const { password_temporal } = await res.json();

  // La vieja YA no sirve.
  loginRes = await login('TEST', 'conclave', 'viejaClave1');
  assert.equal(loginRes.status, 401);

  // La temporal SI sirve, y el miembro entra obligado a cambiarla.
  loginRes = await login('TEST', 'conclave', password_temporal);
  assert.equal(loginRes.status, 200);
  assert.equal((await loginRes.json()).persona.debe_cambiar_pass, true);
});

// El flujo COMPLETO tiene que cerrar: el pastor resetea -> el miembro entra con
// la temporal -> la pantalla de cambio obligatorio (PATCH /cuenta/password) le
// deja una clave propia y limpia el flag. Si no cerrara, quedaria atrapado.
test('flujo completo: reset -> entra con la temporal -> la cambia -> queda con su clave y sin el flag', async () => {
  const m = miembroConClave('olvidadizo', 'noLaRecuerdo1');

  const { password_temporal } = await (await resetear(SEM.pastor, m.id)).json();

  const loginRes = await login('TEST', 'olvidadizo', password_temporal);
  assert.equal(loginRes.status, 200);
  const { token } = await loginRes.json();

  const cambio = await fetch(base + '/api/cuenta/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ actual: password_temporal, nueva: 'miClavePropia1' })
  });
  assert.equal(cambio.status, 200);
  assert.equal(db.prepare('SELECT debe_cambiar_pass FROM persona WHERE id = ?').get(m.id).debe_cambiar_pass, 0);

  // Entra con la suya y la temporal ya no vale.
  let res = await login('TEST', 'olvidadizo', 'miClavePropia1');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).persona.debe_cambiar_pass, false);
  res = await login('TEST', 'olvidadizo', password_temporal);
  assert.equal(res.status, 401);
});

test('POST /api/admin/usuarios/:id/clave: dos reseteos seguidos generan claves DISTINTAS', async () => {
  const primera = await (await resetear(SEM.pastor, SEM.miembro1.id)).json();
  const segunda = await (await resetear(SEM.pastor, SEM.miembro1.id)).json();
  assert.ok(primera.password_temporal && segunda.password_temporal);
  assert.notEqual(primera.password_temporal, segunda.password_temporal);

  // Y solo la ULTIMA queda vigente (la primera ya no sirve).
  const hash = db.prepare('SELECT password_hash FROM persona WHERE id = ?').get(SEM.miembro1.id).password_hash;
  const { verifyPassword } = await import('../src/auth.js');
  assert.equal(verifyPassword(segunda.password_temporal, hash), true);
  assert.equal(verifyPassword(primera.password_temporal, hash), false);
});

test('POST /api/admin/usuarios/:id/clave: la accion queda auditada', async () => {
  await resetear(SEM.pastor, SEM.miembro1.id);
  const fila = db.prepare(
    "SELECT * FROM auditoria WHERE accion = 'reset_password_usuario' AND modulo = 'admin'"
  ).get();
  assert.ok(fila, 'debe existir el registro de auditoria');
  assert.equal(fila.iglesia_id, SEM.iglesiaId);
  assert.equal(fila.actor_id, SEM.pastor.id);
  assert.match(fila.detalle, /miembro1/);
  // NUNCA se guarda la clave temporal en la auditoria.
  assert.doesNotMatch(fila.detalle, /[A-Za-z0-9]{9,}/);
});

// ------------------------------------------------------------
// Gates
// ------------------------------------------------------------
test('POST /api/admin/usuarios/:id/clave: un lider que NO es pastor -> 403 (no cambia nada)', async () => {
  const antes = db.prepare('SELECT password_hash FROM persona WHERE id = ?').get(SEM.miembro1.id).password_hash;
  const res = await resetear(SEM.lider, SEM.miembro1.id);
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT password_hash FROM persona WHERE id = ?').get(SEM.miembro1.id).password_hash, antes);
  assert.equal(db.prepare('SELECT debe_cambiar_pass FROM persona WHERE id = ?').get(SEM.miembro1.id).debe_cambiar_pass, 0);
});

test('POST /api/admin/usuarios/:id/clave: un feligres sin roles -> 403', async () => {
  const res = await resetear(SEM.ajeno, SEM.miembro1.id);
  assert.equal(res.status, 403);
});

test('POST /api/admin/usuarios/:id/clave: usuario de OTRA iglesia -> 404 (no confirma que exista)', async () => {
  const ig2 = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA2')").run().lastInsertRowid);
  const otro = miembroConClave('deotra', 'suClave123', ig2);

  const res = await resetear(SEM.pastor, otro.id);
  assert.equal(res.status, 404);
  // Su cuenta sigue intacta: puede entrar con su clave de siempre.
  const loginRes = await login('OTRA2', 'deotra', 'suClave123');
  assert.equal(loginRes.status, 200);
});

test('POST /api/admin/usuarios/:id/clave: usuario inexistente -> 404', async () => {
  const res = await resetear(SEM.pastor, 999999);
  assert.equal(res.status, 404);
});

test('POST /api/admin/usuarios/:id/clave: resetear al super-admin -> 403 (no es miembro de la congregacion)', async () => {
  db.prepare("UPDATE persona SET rol_global = 'super_admin' WHERE id = ?").run(SEM.ajeno.id);
  const res = await resetear(SEM.pastor, SEM.ajeno.id);
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT debe_cambiar_pass FROM persona WHERE id = ?').get(SEM.ajeno.id).debe_cambiar_pass, 0);
});

test('POST /api/admin/usuarios/:id/clave: resetear al obispo -> 403', async () => {
  db.prepare("UPDATE persona SET rol_global = 'obispo' WHERE id = ?").run(SEM.ajeno.id);
  const res = await resetear(SEM.pastor, SEM.ajeno.id);
  assert.equal(res.status, 403);
});

test('POST /api/admin/usuarios/:id/clave: el pastor NO puede resetear su PROPIA clave -> 400', async () => {
  const res = await resetear(SEM.pastor, SEM.pastor.id);
  assert.equal(res.status, 400);
  assert.equal(db.prepare('SELECT debe_cambiar_pass FROM persona WHERE id = ?').get(SEM.pastor.id).debe_cambiar_pass, 0);
});

// GET /api/admin/datos expone rol_global para que la vista NO ofrezca el boton
// de restablecer en cuentas que el backend rechaza (super-admin / obispo).
test('GET /api/admin/datos: cada usuario incluye su rol_global', async () => {
  db.prepare("UPDATE persona SET rol_global = 'obispo' WHERE id = ?").run(SEM.ajeno.id);

  const res = await fetch(base + '/api/admin/datos', { headers: H(SEM.pastor) });
  assert.equal(res.status, 200);
  const { usuarios } = await res.json();
  assert.equal(usuarios.find(u => u.id === SEM.ajeno.id).rol_global, 'obispo');
  assert.equal(usuarios.find(u => u.id === SEM.miembro1.id).rol_global, null);
});

test('POST /api/admin/usuarios/:id/clave: sin token -> 401', async () => {
  const res = await fetch(base + `/api/admin/usuarios/${SEM.miembro1.id}/clave`, { method: 'POST' });
  assert.equal(res.status, 401);
});
