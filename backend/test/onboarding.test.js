// ============================================================
//  Onboarding / acceso (nuevo)  -  pruebas
//  Cubre:
//   - POST /api/registro (feligres se registra SOLO con el codigo de iglesia)
//   - flag debe_cambiar_pass en login/me/registro
//   - PATCH /api/cuenta/password limpia el flag
//   - POST /api/admin/usuarios deja el flag en 1 (contrasena temporal)
//   - POST /api/superadmin/iglesias (gate ESTRICTO rol_global=super_admin)
//   - aislamiento entre iglesias
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

function personaDe(usuario, iglesiaId = SEM.iglesiaId) {
  return db.prepare('SELECT * FROM persona WHERE usuario = ? AND iglesia_id = ?').get(usuario, iglesiaId);
}

// ------------------------------------------------------------
// POST /api/registro — registro publico de feligres (SIN auth)
// ------------------------------------------------------------
test('POST /api/registro: con codigo valido crea el feligres y devuelve {token, persona} (auto-login)', async () => {
  const res = await fetch(base + '/api/registro', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: 'TEST', nombre: 'Nuevo Feligres', usuario: 'nuevof', password: '123456' })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.token);
  assert.equal(body.persona.usuario, 'nuevof');
  assert.equal(body.persona.nombre, 'Nuevo Feligres');
  assert.equal(body.persona.es_pastor, false);
  assert.equal(body.persona.debe_cambiar_pass, false);

  const fila = personaDe('nuevof');
  assert.ok(fila);
  assert.equal(fila.es_pastor, 0);
  assert.equal(fila.activo, 1);
  assert.equal(fila.debe_cambiar_pass, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pertenencia WHERE persona_id = ?').get(fila.id).n, 0);
});

test('POST /api/registro: el codigo es case-insensitive (se normaliza a MAYUSCULAS)', async () => {
  const res = await fetch(base + '/api/registro', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: 'test', nombre: 'Minuscula', usuario: 'minusc', password: '123456' })
  });
  assert.equal(res.status, 200);
  assert.ok(personaDe('minusc'));
});

test('POST /api/registro: codigo de iglesia invalido -> 400', async () => {
  const res = await fetch(base + '/api/registro', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: 'NOEXISTE', nombre: 'X', usuario: 'x1', password: '123456' })
  });
  assert.equal(res.status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM persona WHERE usuario='x1'").get().n, 0);
});

test('POST /api/registro: usuario duplicado dentro de la misma iglesia -> 409', async () => {
  // SEM.pastor ya existe con usuario 'pastor' en la iglesia TEST.
  const res = await fetch(base + '/api/registro', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: 'TEST', nombre: 'Otro', usuario: 'pastor', password: '123456' })
  });
  assert.equal(res.status, 409);
});

test('POST /api/registro: password muy corta -> 400', async () => {
  const res = await fetch(base + '/api/registro', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: 'TEST', nombre: 'X', usuario: 'x2', password: '123' })
  });
  assert.equal(res.status, 400);
});

test('POST /api/registro: aislamiento — el mismo nombre de usuario puede existir en DOS iglesias distintas', async () => {
  const ig2 = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA2')").run().lastInsertRowid);

  let res = await fetch(base + '/api/registro', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: 'TEST', nombre: 'Compartido Uno', usuario: 'compartido', password: '123456' })
  });
  assert.equal(res.status, 200);

  res = await fetch(base + '/api/registro', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: 'OTRA2', nombre: 'Compartido Dos', usuario: 'compartido', password: '123456' })
  });
  assert.equal(res.status, 200);

  const p1 = personaDe('compartido', SEM.iglesiaId);
  const p2 = personaDe('compartido', ig2);
  assert.ok(p1 && p2);
  assert.notEqual(p1.id, p2.id);
  assert.equal(p1.iglesia_id, SEM.iglesiaId);
  assert.equal(p2.iglesia_id, ig2);
});

// ------------------------------------------------------------
// Flag debe_cambiar_pass: login/me + PATCH /api/cuenta/password
// ------------------------------------------------------------
test('login: el flag debe_cambiar_pass viaja en el objeto persona', async () => {
  const temporal = db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo, debe_cambiar_pass) VALUES (?,?,?,?,1,1)"
  ).run(SEM.iglesiaId, 'temporal', 'Cuenta Temporal', hashPassword('temp123')).lastInsertRowid;

  const res = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iglesia: 'TEST', usuario: 'temporal', password: 'temp123' })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.persona.debe_cambiar_pass, true);

  const meRes = await fetch(base + '/api/me', { headers: H({ id: temporal }) });
  assert.equal((await meRes.json()).persona.debe_cambiar_pass, true);
});

test('PATCH /api/cuenta/password: cambiar la contrasena limpia el flag debe_cambiar_pass', async () => {
  const temporalId = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo, debe_cambiar_pass) VALUES (?,?,?,?,1,1)"
  ).run(SEM.iglesiaId, 'temporal2', 'Cuenta Temporal 2', hashPassword('temp123')).lastInsertRowid);

  assert.equal(db.prepare('SELECT debe_cambiar_pass FROM persona WHERE id = ?').get(temporalId).debe_cambiar_pass, 1);

  const res = await fetch(base + '/api/cuenta/password', {
    method: 'PATCH', headers: H({ id: temporalId }),
    body: JSON.stringify({ actual: 'temp123', nueva: 'nuevaSegura123' })
  });
  assert.equal(res.status, 200);

  assert.equal(db.prepare('SELECT debe_cambiar_pass FROM persona WHERE id = ?').get(temporalId).debe_cambiar_pass, 0);
});

// ------------------------------------------------------------
// admin.js: crear usuario deja el flag en 1 (contrasena temporal)
// ------------------------------------------------------------
test('POST /api/admin/usuarios: el usuario creado por el pastor exige cambiar la contrasena (flag=1)', async () => {
  const res = await fetch(base + '/api/admin/usuarios', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ nombre: 'Nuevo Por Pastor', usuario: 'porpastor', password: 'temporal1' })
  });
  assert.equal(res.status, 200);
  const fila = personaDe('porpastor');
  assert.equal(fila.debe_cambiar_pass, 1);
});

// ------------------------------------------------------------
// superadmin.js: crea iglesia + pastor (gate ESTRICTO)
// ------------------------------------------------------------
function crearSuperAdmin(iglesiaId = SEM.iglesiaId) {
  const id = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (?,?,?,?, 'super_admin', 1)"
  ).run(iglesiaId, 'superadmin', 'Super Admin', 'x').lastInsertRowid);
  return { id };
}

test('POST /api/superadmin/iglesias: el super-admin crea la iglesia + el pastor con contrasena temporal', async () => {
  const superAdmin = crearSuperAdmin();

  const res = await fetch(base + '/api/superadmin/iglesias', {
    method: 'POST', headers: H(superAdmin),
    body: JSON.stringify({
      nombre_iglesia: 'Iglesia Nueva Vida',
      pastor_nombre: 'Pastor Nuevo',
      pastor_usuario: 'pastornuevo',
      pastor_email: 'pastor@nuevavida.org',
      pastor_password: 'temporal123'
    })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.iglesia.id);
  assert.equal(body.iglesia.nombre, 'Iglesia Nueva Vida');
  assert.ok(body.iglesia.codigo_unico); // generado a partir del nombre
  assert.equal(body.pastor.usuario, 'pastornuevo');

  const igFila = db.prepare('SELECT * FROM iglesia WHERE id = ?').get(body.iglesia.id);
  assert.ok(igFila);
  assert.equal(igFila.codigo_unico, body.iglesia.codigo_unico);

  const pastorFila = personaDe('pastornuevo', body.iglesia.id);
  assert.ok(pastorFila);
  assert.equal(pastorFila.es_pastor, 1);
  assert.equal(pastorFila.activo, 1);
  assert.equal(pastorFila.debe_cambiar_pass, 1);
});

test('POST /api/superadmin/iglesias: respeta un codigo explicito y rechaza uno ya usado', async () => {
  const superAdmin = crearSuperAdmin();

  let res = await fetch(base + '/api/superadmin/iglesias', {
    method: 'POST', headers: H(superAdmin),
    body: JSON.stringify({
      nombre_iglesia: 'Otra Congregacion', codigo: 'MICODIGO',
      pastor_nombre: 'P', pastor_usuario: 'pcodigo', pastor_password: 'temporal123'
    })
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).iglesia.codigo_unico, 'MICODIGO');

  res = await fetch(base + '/api/superadmin/iglesias', {
    method: 'POST', headers: H(superAdmin),
    body: JSON.stringify({
      nombre_iglesia: 'Repetida', codigo: 'micodigo',
      pastor_nombre: 'P2', pastor_usuario: 'pcodigo2', pastor_password: 'temporal123'
    })
  });
  assert.equal(res.status, 409);
});

test('POST /api/superadmin/iglesias: un pastor NO es super-admin -> 403 (no crea nada)', async () => {
  const res = await fetch(base + '/api/superadmin/iglesias', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({
      nombre_iglesia: 'Intento Pastor', pastor_nombre: 'P', pastor_usuario: 'intentop', pastor_password: 'temporal123'
    })
  });
  assert.equal(res.status, 403);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM iglesia WHERE nombre='Intento Pastor'").get().n, 0);
});

test('POST /api/superadmin/iglesias: un feligres NO es super-admin -> 403', async () => {
  const res = await fetch(base + '/api/superadmin/iglesias', {
    method: 'POST', headers: H(SEM.miembro1),
    body: JSON.stringify({
      nombre_iglesia: 'Intento Feligres', pastor_nombre: 'P', pastor_usuario: 'intentof', pastor_password: 'temporal123'
    })
  });
  assert.equal(res.status, 403);
});

test('POST /api/superadmin/iglesias: el obispo (rol_global=obispo) NO es super-admin -> 403', async () => {
  db.prepare("UPDATE persona SET rol_global = 'obispo' WHERE id = ?").run(SEM.ajeno.id);
  const res = await fetch(base + '/api/superadmin/iglesias', {
    method: 'POST', headers: H(SEM.ajeno),
    body: JSON.stringify({
      nombre_iglesia: 'Intento Obispo', pastor_nombre: 'P', pastor_usuario: 'intentoob', pastor_password: 'temporal123'
    })
  });
  assert.equal(res.status, 403);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM iglesia WHERE nombre='Intento Obispo'").get().n, 0);
});

test('GET /api/superadmin/iglesias: lista todas las iglesias (solo super-admin)', async () => {
  const superAdmin = crearSuperAdmin();
  let res = await fetch(base + '/api/superadmin/iglesias', { headers: H(SEM.pastor) });
  assert.equal(res.status, 403);

  res = await fetch(base + '/api/superadmin/iglesias', { headers: H(superAdmin) });
  assert.equal(res.status, 200);
  const lista = await res.json();
  assert.ok(Array.isArray(lista));
  assert.ok(lista.some(i => i.codigo_unico === 'TEST'));
});

test('sin token: /api/superadmin/iglesias -> 401', async () => {
  const res = await fetch(base + '/api/superadmin/iglesias');
  assert.equal(res.status, 401);
});

// ------------------------------------------------------------
// Login del super-admin SIN iglesia (en lanzamiento real puede no haber
// ninguna iglesia todavia). Entra solo con usuario + contrasena.
// ------------------------------------------------------------
function sembrarSuperAdmin(usuario = 'root', pass = 'secreta123') {
  db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, es_pastor, activo) VALUES (?,?,?,?, 'super_admin', 0, 1)"
  ).run(SEM.iglesiaId, usuario, 'Root', hashPassword(pass));
}

test('POST /api/login: el super-admin entra SIN indicar iglesia (usuario + contraseña)', async () => {
  sembrarSuperAdmin();
  const res = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'root', password: 'secreta123' }) // sin campo iglesia
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.token);
  assert.equal(body.persona.usuario, 'root');
  assert.equal(body.persona.rol_global, 'super_admin');
});

test('POST /api/login: super-admin con iglesia vacía ("") también entra', async () => {
  sembrarSuperAdmin();
  const res = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iglesia: '', usuario: 'root', password: 'secreta123' })
  });
  assert.equal(res.status, 200);
});

test('POST /api/login SIN iglesia: contraseña incorrecta -> 401', async () => {
  sembrarSuperAdmin();
  const res = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'root', password: 'incorrecta' })
  });
  assert.equal(res.status, 401);
});

test('POST /api/login SIN iglesia: un usuario que NO es super-admin no entra (no filtra info)', async () => {
  // 'pastor' existe (sembrarMinimo) pero no es super_admin: sin iglesia no debe entrar.
  const res = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'pastor', password: 'loquesea' })
  });
  assert.equal(res.status, 401);
});
