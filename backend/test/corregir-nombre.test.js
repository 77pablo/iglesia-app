// ============================================================
//  Corregir el nombre de una persona.
//  "juan perez" quedaba asi para siempre: ni "Mi perfil" (directorio.js) ni
//  "Cambiar mi cuenta" (cuenta.js) aceptaban 'nombre'. Este archivo cubre los
//  dos caminos: el propio (autoservicio) y el del pastor sobre otra persona.
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
  db.exec('DELETE FROM auditoria');
  db.exec('DELETE FROM aprobacion_log');
  SEM = sembrarMinimo(db);
});

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

const corregirPropio = (persona, nombre) => fetch(base + '/api/directorio/perfil', {
  method: 'PATCH', headers: H(persona), body: JSON.stringify({ nombre })
});

function logAprobacion(actorId, actorNombre) {
  db.prepare(
    `INSERT INTO aprobacion_log (iglesia_id, evento_titulo, fecha_evento, grupo, accion, motivo, actor_id, actor_nombre)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(SEM.iglesiaId, 'Retiro de jóvenes', '2026-08-15', 'Jovenes', 'aprobado', null, actorId, actorNombre);
}

test('PATCH /api/directorio/perfil: corrige el propio nombre', async () => {
  const res = await corregirPropio(SEM.miembro1, 'Juan Pérez');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  const fila = db.prepare('SELECT nombre FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(fila.nombre, 'Juan Pérez');
});

test('PATCH /api/directorio/perfil: nombre vacio -> 400 en castellano', async () => {
  const res = await corregirPropio(SEM.miembro1, '');
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /nombre/i);

  const fila = db.prepare('SELECT nombre FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(fila.nombre, 'Miembro Uno', 'no debe haber cambiado nada');
});

test('PATCH /api/directorio/perfil: nombre de 121+ caracteres -> 400 en castellano', async () => {
  const res = await corregirPropio(SEM.miembro1, 'x'.repeat(121));
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /120|largo/i);

  // Igual que su gemela de "nombre vacio": sin esta linea, mover la validacion
  // detras del UPDATE dejaria el nombre roto en la BD y la prueba seguiria en verde.
  const fila = db.prepare('SELECT nombre FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(fila.nombre, 'Miembro Uno', 'no debe haber cambiado nada');
});

// ------------------------------------------------------------
//  Reenviar el MISMO nombre no es una correccion.
//  "Mi perfil" es un formulario entero: manda 'nombre' cada vez que alguien
//  guarda, aunque solo haya tocado el telefono. Si se audita por "vino el
//  campo" en vez de por "cambio el campo", cada guardado deja una linea
//  `Miembro Uno → Miembro Uno`, y un rastro que afirma cambios que nadie hizo
//  no sirve como red de seguridad — que es justo lo que promete el documento ARCO.
// ------------------------------------------------------------
test('PATCH /api/directorio/perfil: guardar el perfil sin tocar el nombre no deja rastro de correccion', async () => {
  logAprobacion(SEM.miembro1.id, 'Miembro Uno');

  const res = await fetch(base + '/api/directorio/perfil', {
    method: 'PATCH', headers: H(SEM.miembro1),
    body: JSON.stringify({ nombre: 'Miembro Uno', telefono: '+56 9 1111 1111', mostrar_telefono: 1 })
  });
  assert.equal(res.status, 200);

  const fila = db.prepare('SELECT nombre, telefono FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(fila.telefono, '+56 9 1111 1111', 'lo que si se toco tiene que guardarse igual');
  assert.equal(fila.nombre, 'Miembro Uno');

  const n = db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'corregir_nombre'").get().n;
  assert.equal(n, 0, 'cambiar el telefono no puede quedar auditado como "Miembro Uno → Miembro Uno"');
});

test('PATCH /api/directorio/perfil: sincroniza aprobacion_log.actor_nombre, y no toca las de otro actor', async () => {
  logAprobacion(SEM.miembro1.id, 'Miembro Uno');
  logAprobacion(SEM.pastor.id, 'Pastor');

  await corregirPropio(SEM.miembro1, 'Juan Pérez');

  const mia = db.prepare('SELECT actor_nombre FROM aprobacion_log WHERE actor_id = ?').get(SEM.miembro1.id);
  const ajena = db.prepare('SELECT actor_nombre FROM aprobacion_log WHERE actor_id = ?').get(SEM.pastor.id);
  assert.equal(mia.actor_nombre, 'Juan Pérez', 'el historial de aprobaciones no debe quedar con el nombre viejo');
  assert.equal(ajena.actor_nombre, 'Pastor', 'y no debe tocar la fila de otra persona');
});

test('PATCH /api/directorio/perfil: corregir el nombre queda auditado con el nombre viejo y el nuevo', async () => {
  await corregirPropio(SEM.miembro1, 'Juan Pérez');

  const log = db.prepare("SELECT * FROM auditoria WHERE accion = 'corregir_nombre'").get();
  assert.ok(log, 'corregir el nombre tiene que dejar rastro');
  assert.equal(log.modulo, 'directorio');
  assert.equal(log.actor_id, SEM.miembro1.id);
  assert.match(log.detalle, /Miembro Uno/);
  assert.match(log.detalle, /Juan Pérez/);
});

// ------------------------------------------------------------
//  El pastor corrige el nombre de OTRA persona.
//  Mismo argumento que ya justifica "Restablecer contraseña" (admin.js): sin
//  eso, quien no puede resolverlo sola (no entra a la app, o no sabe donde
//  mirar) se queda con el nombre mal escrito para siempre.
// ------------------------------------------------------------
const corregirOtro = (actor, id, nombre, iglesiaId = SEM.iglesiaId) => fetch(base + '/api/admin/usuarios/' + id, {
  method: 'PATCH', headers: H(actor, iglesiaId), body: JSON.stringify({ nombre })
});

test('PATCH /api/admin/usuarios/:id: el pastor corrige el nombre de otro', async () => {
  const res = await corregirOtro(SEM.pastor, SEM.miembro1.id, 'Juan Pérez');
  assert.equal(res.status, 200);

  const fila = db.prepare('SELECT nombre FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(fila.nombre, 'Juan Pérez');
});

test('PATCH /api/admin/usuarios/:id: sincroniza aprobacion_log.actor_nombre de la persona corregida, y no toca las de otro', async () => {
  logAprobacion(SEM.miembro1.id, 'Miembro Uno');
  // Se siembra tambien la fila de OTRO actor, igual que en el test gemelo del
  // perfil propio: sin ella, quitarle el `WHERE actor_id = ?` al UPDATE
  // reescribiria el historial de aprobaciones de TODA la iglesia con el mismo
  // nombre y esta prueba seguiria pasando.
  logAprobacion(SEM.pastor.id, 'Pastor');

  await corregirOtro(SEM.pastor, SEM.miembro1.id, 'Juan Pérez');

  const fila = db.prepare('SELECT actor_nombre FROM aprobacion_log WHERE actor_id = ?').get(SEM.miembro1.id);
  const ajena = db.prepare('SELECT actor_nombre FROM aprobacion_log WHERE actor_id = ?').get(SEM.pastor.id);
  assert.equal(fila.actor_nombre, 'Juan Pérez');
  assert.equal(ajena.actor_nombre, 'Pastor', 'no debe tocar el rastro de otra persona');
});

test('PATCH /api/admin/usuarios/:id: corregir el nombre queda auditado, sin duplicar editar_usuario', async () => {
  await corregirOtro(SEM.pastor, SEM.miembro1.id, 'Juan Pérez');

  const especifico = db.prepare("SELECT * FROM auditoria WHERE accion = 'corregir_nombre_usuario'").get();
  assert.ok(especifico, 'corregir el nombre de otro tiene que dejar rastro propio');
  assert.equal(especifico.actor_id, SEM.pastor.id);
  assert.match(especifico.detalle, /Miembro Uno/);
  assert.match(especifico.detalle, /Juan Pérez/);

  const generico = db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'editar_usuario'").get();
  assert.equal(generico.n, 0, 'un PATCH que solo trae nombre no debe generar tambien un editar_usuario vacio');
});

test('PATCH /api/admin/usuarios/:id: un lider que NO es pastor -> 403 (no cambia nada)', async () => {
  const res = await corregirOtro(SEM.lider, SEM.miembro1.id, 'Cualquier Cosa');
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT nombre FROM persona WHERE id = ?').get(SEM.miembro1.id).nombre, 'Miembro Uno');
});

test('PATCH /api/admin/usuarios/:id: usuario de OTRA iglesia -> 404 (no cambia nada)', async () => {
  const ig2 = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA3')").run().lastInsertRowid);
  const ajenoId = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,'x','Feligres De Otra','h',1)"
  ).run(ig2).lastInsertRowid);

  const res = await corregirOtro(SEM.pastor, ajenoId, 'Nombre Que No Debe Quedar');
  assert.equal(res.status, 404);
  assert.equal(db.prepare('SELECT nombre FROM persona WHERE id = ?').get(ajenoId).nombre, 'Feligres De Otra');
});

test('PATCH /api/admin/usuarios/:id: corregir el nombre del super-admin -> 403', async () => {
  db.prepare("UPDATE persona SET rol_global = 'super_admin' WHERE id = ?").run(SEM.ajeno.id);
  const res = await corregirOtro(SEM.pastor, SEM.ajeno.id, 'Cualquier Cosa');
  assert.equal(res.status, 403);
});

test('PATCH /api/admin/usuarios/:id: corregir el nombre del obispo -> 403', async () => {
  db.prepare("UPDATE persona SET rol_global = 'obispo' WHERE id = ?").run(SEM.ajeno.id);
  const res = await corregirOtro(SEM.pastor, SEM.ajeno.id, 'Cualquier Cosa');
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT nombre FROM persona WHERE id = ?').get(SEM.ajeno.id).nombre, 'Feligres Ajeno');
});

test('PATCH /api/admin/usuarios/:id: nombre vacio -> 400 en castellano', async () => {
  const res = await corregirOtro(SEM.pastor, SEM.miembro1.id, '');
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /nombre/i);
});

test('PATCH /api/admin/usuarios/:id: nombre de 121+ caracteres -> 400 en castellano', async () => {
  const res = await corregirOtro(SEM.pastor, SEM.miembro1.id, 'x'.repeat(121));
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /120|largo/i);
});

// El modal del pastor viene prellenado con el nombre actual, asi que pulsar
// "Guardar" sin tocar nada manda el mismo nombre. Mismo criterio que en el
// perfil propio: eso no es una correccion y no puede ensuciar el rastro.
test('PATCH /api/admin/usuarios/:id: reenviar el MISMO nombre no deja rastro de correccion', async () => {
  const res = await corregirOtro(SEM.pastor, SEM.miembro1.id, 'Miembro Uno');
  assert.equal(res.status, 200);

  const n = db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'corregir_nombre_usuario'").get().n;
  assert.equal(n, 0, 'el rastro no puede decir "Miembro Uno → Miembro Uno"');
});

// ------------------------------------------------------------
//  Los dos caminos juntos: el escenario que esta rama existe para servir.
//  El pastor corrige a alguien que tiene la app abierta desde antes, y esa
//  persona guarda su perfil despues. "Mi perfil" se prellena con lo que
//  responde GET /perfil, asi que la correccion NO puede volver atras.
// ------------------------------------------------------------
test('corregir por admin y luego guardar el perfil no revierte el nombre', async () => {
  await corregirOtro(SEM.pastor, SEM.miembro1.id, 'Juan Pérez');

  // Lo que hace "Mi perfil" al abrirse: pedir el perfil fresco. De aqui sale
  // el valor con el que se prellena el campo (no de la cache del arranque).
  const perfil = await (await fetch(base + '/api/directorio/perfil', { headers: H(SEM.miembro1) })).json();
  assert.equal(perfil.nombre, 'Juan Pérez', 'GET /perfil tiene que devolver ya el nombre corregido');

  // Y ahora la persona guarda cambiando SOLO el telefono.
  const res = await fetch(base + '/api/directorio/perfil', {
    method: 'PATCH', headers: H(SEM.miembro1),
    body: JSON.stringify({ nombre: perfil.nombre, telefono: '+56 9 2222 2222' })
  });
  assert.equal(res.status, 200);

  const fila = db.prepare('SELECT nombre, telefono FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(fila.nombre, 'Juan Pérez', 'guardar el telefono no puede deshacer la correccion del pastor');
  assert.equal(fila.telefono, '+56 9 2222 2222');

  const propia = db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'corregir_nombre'").get().n;
  assert.equal(propia, 0, 'y el rastro no puede decir que el nombre lo cambio la persona');
  const delPastor = db.prepare("SELECT * FROM auditoria WHERE accion = 'corregir_nombre_usuario'").get();
  assert.equal(delPastor.actor_id, SEM.pastor.id, 'la unica correccion registrada es la del pastor');
});
