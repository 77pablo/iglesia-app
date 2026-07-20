// ============================================================
//  Super-admin: control de iglesias (nuevo)  -  pruebas
//  Cubre:
//   - PATCH /api/superadmin/iglesias/:id (editar nombre/codigo, unicidad 409)
//   - Desactivar/reactivar iglesia (activa) -> bloquea/permite login
//   - POST /api/superadmin/iglesias/:id/reset-pastor (contrasena temporal)
//   - Gate ESTRICTO: solo super_admin (feligres/pastor/obispo -> 403)
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

function crearSuperAdmin(iglesiaId = SEM.iglesiaId) {
  const id = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (?,?,?,?, 'super_admin', 1)"
  ).run(iglesiaId, 'superadmin', 'Super Admin', 'x').lastInsertRowid);
  return { id };
}

// Crea una iglesia con un pastor de password REAL (para poder probar login de verdad).
function crearIglesiaConPastorReal(codigo, passwordPlano = 'pastor123') {
  const igId = Number(db.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES (?, ?)"
  ).run('Iglesia ' + codigo, codigo).lastInsertRowid);
  const pastorId = Number(db.prepare(
    `INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo, debe_cambiar_pass)
     VALUES (?, 'pastorreal', 'Pastor Real', ?, 1, 1, 0)`
  ).run(igId, hashPassword(passwordPlano)).lastInsertRowid);
  return { igId, pastorId };
}

async function login(iglesia, usuario, password) {
  return fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iglesia, usuario, password })
  });
}

// ------------------------------------------------------------
// PATCH /api/superadmin/iglesias/:id
// ------------------------------------------------------------
test('PATCH /api/superadmin/iglesias/:id: el super-admin edita nombre y código', async () => {
  const superAdmin = crearSuperAdmin();
  const { igId } = crearIglesiaConPastorReal('EDITME');

  const res = await fetch(base + `/api/superadmin/iglesias/${igId}`, {
    method: 'PATCH', headers: H(superAdmin),
    body: JSON.stringify({ nombre: 'Nombre Editado', codigo: 'nuevocodigo' })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.nombre, 'Nombre Editado');
  assert.equal(body.codigo_unico, 'NUEVOCODIGO'); // normalizado a MAYUSCULAS

  const fila = db.prepare('SELECT * FROM iglesia WHERE id = ?').get(igId);
  assert.equal(fila.nombre, 'Nombre Editado');
  assert.equal(fila.codigo_unico, 'NUEVOCODIGO');
});

test('PATCH /api/superadmin/iglesias/:id: actualiza solo los campos enviados (no borra el resto)', async () => {
  const superAdmin = crearSuperAdmin();
  const { igId } = crearIglesiaConPastorReal('SOLONOMBRE');

  const res = await fetch(base + `/api/superadmin/iglesias/${igId}`, {
    method: 'PATCH', headers: H(superAdmin),
    body: JSON.stringify({ nombre: 'Solo Nombre Cambiado' })
  });
  assert.equal(res.status, 200);
  const fila = db.prepare('SELECT * FROM iglesia WHERE id = ?').get(igId);
  assert.equal(fila.nombre, 'Solo Nombre Cambiado');
  assert.equal(fila.codigo_unico, 'SOLONOMBRE'); // sin cambios
});

test('PATCH /api/superadmin/iglesias/:id: código ya usado por otra iglesia -> 409', async () => {
  const superAdmin = crearSuperAdmin();
  crearIglesiaConPastorReal('OCUPADO');
  const { igId: ig2 } = crearIglesiaConPastorReal('LIBRE');

  const res = await fetch(base + `/api/superadmin/iglesias/${ig2}`, {
    method: 'PATCH', headers: H(superAdmin),
    body: JSON.stringify({ codigo: 'ocupado' }) // case-insensitive: choca con 'OCUPADO'
  });
  assert.equal(res.status, 409);
  // no debe haber cambiado el codigo de la iglesia 2
  assert.equal(db.prepare('SELECT codigo_unico FROM iglesia WHERE id = ?').get(ig2).codigo_unico, 'LIBRE');
});

test('PATCH /api/superadmin/iglesias/:id: iglesia inexistente -> 404', async () => {
  const superAdmin = crearSuperAdmin();
  const res = await fetch(base + '/api/superadmin/iglesias/999999', {
    method: 'PATCH', headers: H(superAdmin),
    body: JSON.stringify({ nombre: 'X' })
  });
  assert.equal(res.status, 404);
});

test('PATCH /api/superadmin/iglesias/:id: un pastor NO es super-admin -> 403', async () => {
  const { igId } = crearIglesiaConPastorReal('NOTOCAR');
  const res = await fetch(base + `/api/superadmin/iglesias/${igId}`, {
    method: 'PATCH', headers: H(SEM.pastor),
    body: JSON.stringify({ nombre: 'Hackeado' })
  });
  assert.equal(res.status, 403);
  assert.notEqual(db.prepare('SELECT nombre FROM iglesia WHERE id = ?').get(igId).nombre, 'Hackeado');
});

test('PATCH /api/superadmin/iglesias/:id: un feligres NO es super-admin -> 403', async () => {
  const { igId } = crearIglesiaConPastorReal('NOTOCAR2');
  const res = await fetch(base + `/api/superadmin/iglesias/${igId}`, {
    method: 'PATCH', headers: H(SEM.miembro1),
    body: JSON.stringify({ nombre: 'Hackeado' })
  });
  assert.equal(res.status, 403);
});

test('PATCH /api/superadmin/iglesias/:id: el obispo (rol_global=obispo) NO es super-admin -> 403', async () => {
  db.prepare("UPDATE persona SET rol_global = 'obispo' WHERE id = ?").run(SEM.ajeno.id);
  const { igId } = crearIglesiaConPastorReal('NOTOCAR3');
  const res = await fetch(base + `/api/superadmin/iglesias/${igId}`, {
    method: 'PATCH', headers: H(SEM.ajeno),
    body: JSON.stringify({ nombre: 'Hackeado' })
  });
  assert.equal(res.status, 403);
});

// ------------------------------------------------------------
// Desactivar / reactivar iglesia -> bloquea/permite login
// ------------------------------------------------------------
test('PATCH activa=false: desactiva la iglesia y el login de sus usuarios falla; reactivar lo restaura', async () => {
  const superAdmin = crearSuperAdmin();
  const { igId } = crearIglesiaConPastorReal('TOGGLE', 'clave12345');

  // Login funciona antes de desactivar
  let res = await login('TOGGLE', 'pastorreal', 'clave12345');
  assert.equal(res.status, 200);

  // Desactiva
  res = await fetch(base + `/api/superadmin/iglesias/${igId}`, {
    method: 'PATCH', headers: H(superAdmin),
    body: JSON.stringify({ activa: false })
  });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT activa FROM iglesia WHERE id = ?').get(igId).activa, 0);

  // Login ahora falla con mensaje claro
  res = await login('TOGGLE', 'pastorreal', 'clave12345');
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /desactivada/i);

  // Reactiva
  res = await fetch(base + `/api/superadmin/iglesias/${igId}`, {
    method: 'PATCH', headers: H(superAdmin),
    body: JSON.stringify({ activa: true })
  });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT activa FROM iglesia WHERE id = ?').get(igId).activa, 1);

  // Login vuelve a funcionar
  res = await login('TOGGLE', 'pastorreal', 'clave12345');
  assert.equal(res.status, 200);
});

// ------------------------------------------------------------
// POST /api/superadmin/iglesias/:id/reset-pastor
// ------------------------------------------------------------
test('POST /api/superadmin/iglesias/:id/reset-pastor: genera contrasena temporal y el pastor puede entrar con ella', async () => {
  const superAdmin = crearSuperAdmin();
  const { igId, pastorId } = crearIglesiaConPastorReal('RESETME', 'viejaClave1');

  const res = await fetch(base + `/api/superadmin/iglesias/${igId}/reset-pastor`, {
    method: 'POST', headers: H(superAdmin)
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.password_temporal);
  assert.ok(body.password_temporal.length >= 8 && body.password_temporal.length <= 10);
  assert.equal(body.pastor.usuario, 'pastorreal');

  const fila = db.prepare('SELECT * FROM persona WHERE id = ?').get(pastorId);
  assert.equal(fila.debe_cambiar_pass, 1);

  // La clave vieja ya NO sirve
  let loginRes = await login('RESETME', 'pastorreal', 'viejaClave1');
  assert.equal(loginRes.status, 401);

  // La clave nueva SI sirve
  loginRes = await login('RESETME', 'pastorreal', body.password_temporal);
  assert.equal(loginRes.status, 200);
  const loginBody = await loginRes.json();
  assert.equal(loginBody.persona.debe_cambiar_pass, true);
});

test('POST /api/superadmin/iglesias/:id/reset-pastor: iglesia sin pastor -> 404', async () => {
  const superAdmin = crearSuperAdmin();
  const igId = Number(db.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Sin Pastor','SINPASTOR')"
  ).run().lastInsertRowid);

  const res = await fetch(base + `/api/superadmin/iglesias/${igId}/reset-pastor`, {
    method: 'POST', headers: H(superAdmin)
  });
  assert.equal(res.status, 404);
});

test('POST /api/superadmin/iglesias/:id/reset-pastor: iglesia inexistente -> 404', async () => {
  const superAdmin = crearSuperAdmin();
  const res = await fetch(base + '/api/superadmin/iglesias/999999/reset-pastor', {
    method: 'POST', headers: H(superAdmin)
  });
  assert.equal(res.status, 404);
});

test('POST /api/superadmin/iglesias/:id/reset-pastor: un pastor NO es super-admin -> 403', async () => {
  const { igId } = crearIglesiaConPastorReal('NORESET1');
  const res = await fetch(base + `/api/superadmin/iglesias/${igId}/reset-pastor`, {
    method: 'POST', headers: H(SEM.pastor)
  });
  assert.equal(res.status, 403);
});

test('POST /api/superadmin/iglesias/:id/reset-pastor: un feligres NO es super-admin -> 403', async () => {
  const { igId } = crearIglesiaConPastorReal('NORESET2');
  const res = await fetch(base + `/api/superadmin/iglesias/${igId}/reset-pastor`, {
    method: 'POST', headers: H(SEM.miembro1)
  });
  assert.equal(res.status, 403);
});

test('POST /api/superadmin/iglesias/:id/reset-pastor: el obispo (rol_global=obispo) NO es super-admin -> 403', async () => {
  db.prepare("UPDATE persona SET rol_global = 'obispo' WHERE id = ?").run(SEM.ajeno.id);
  const { igId } = crearIglesiaConPastorReal('NORESET3');
  const res = await fetch(base + `/api/superadmin/iglesias/${igId}/reset-pastor`, {
    method: 'POST', headers: H(SEM.ajeno)
  });
  assert.equal(res.status, 403);
});

// ------------------------------------------------------------
// GET /api/superadmin/iglesias devuelve el campo `activa`
// ------------------------------------------------------------
test('GET /api/superadmin/iglesias: incluye el campo activa (0/1) de cada iglesia', async () => {
  const superAdmin = crearSuperAdmin();
  const { igId } = crearIglesiaConPastorReal('CONACTIVA');
  db.prepare('UPDATE iglesia SET activa = 0 WHERE id = ?').run(igId);

  const res = await fetch(base + '/api/superadmin/iglesias', { headers: H(superAdmin) });
  assert.equal(res.status, 200);
  const lista = await res.json();
  const fila = lista.find(i => i.id === igId);
  assert.ok(fila);
  assert.equal(fila.activa, 0);
});
