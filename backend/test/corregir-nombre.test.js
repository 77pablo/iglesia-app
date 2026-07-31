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
