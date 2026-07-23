import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, SEM, srv, base;
before(async () => {
  db = await cargarDb();
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));
beforeEach(() => { reiniciar(db); SEM = sembrarMinimo(db); });

const J = { 'Content-Type': 'application/json' };

test('registro SIN acepto -> 400 y no crea persona', async () => {
  const antes = db.prepare('SELECT COUNT(*) AS n FROM persona').get().n;
  const res = await fetch(base + '/api/registro', {
    method: 'POST', headers: J,
    body: JSON.stringify({ codigo: 'TEST', nombre: 'Nuevo', usuario: 'nuevo1', password: 'clave1234' })
  });
  assert.equal(res.status, 400);
  const despues = db.prepare('SELECT COUNT(*) AS n FROM persona').get().n;
  assert.equal(despues, antes);
});

test('registro CON acepto:true -> crea persona y fila consentimiento otorgado', async () => {
  const res = await fetch(base + '/api/registro', {
    method: 'POST', headers: J,
    body: JSON.stringify({ codigo: 'TEST', nombre: 'Nuevo', usuario: 'nuevo2', password: 'clave1234', acepto: true })
  });
  assert.equal(res.status, 200);
  const p = db.prepare("SELECT id FROM persona WHERE usuario = 'nuevo2'").get();
  assert.ok(p);
  const c = db.prepare("SELECT * FROM consentimiento WHERE persona_id = ? AND accion = 'otorgado'").get(p.id);
  assert.ok(c, 'se registro el consentimiento');
});
