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
beforeEach(() => { reiniciar(db); SEM = sembrarMinimo(db); });

// Headers con token de una persona (mint directo, sin pasar por /api/login).
const H = (p) => ({ 'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: SEM.iglesiaId }) });

test('esquema: existen las tablas del chat', () => {
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  assert.deepEqual(cols('conversacion').sort(),
    ['creado_en','creado_por','grupo_id','iglesia_id','id','tipo','titulo'].sort());
  assert.deepEqual(cols('conversacion_miembro').sort(),
    ['conversacion_id','persona_id','rol','silenciado','ultimo_leido_mensaje_id'].sort());
  assert.deepEqual(cols('mensaje').sort(),
    ['adjunto_tipo','adjunto_url','borrado','conversacion_id','creado_en','id','persona_id','texto'].sort());
});

test('el app responde /api/health', async () => {
  const r = await fetch(base + '/api/health');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});
