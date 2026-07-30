// ============================================================
//  "No puedo servir ese dia": cada quien marca sus propias fechas.
//  La tabla fecha_no_disp existia desde siempre y nadie la escribia.
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

beforeEach(() => { db.exec('DELETE FROM fecha_no_disp'); reiniciar(db); SEM = sembrarMinimo(db); });

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

const crear = (persona, cuerpo) => fetch(base + '/api/disponibilidad', {
  method: 'POST', headers: H(persona), body: JSON.stringify(cuerpo)
});

test('marco un periodo y lo veo en mi lista', async () => {
  const res = await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', motivo: 'Viaje' });
  assert.equal(res.status, 200);

  const mias = await (await fetch(base + '/api/disponibilidad/mias', { headers: H(SEM.miembro1) })).json();
  assert.equal(mias.length, 1);
  assert.equal(mias[0].desde, '2026-08-05');
  assert.equal(mias[0].hasta, '2026-08-12');
  assert.equal(mias[0].motivo, 'Viaje');
});

test('el motivo es opcional', async () => {
  assert.equal((await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-05' })).status, 200);
  const mias = await (await fetch(base + '/api/disponibilidad/mias', { headers: H(SEM.miembro1) })).json();
  assert.equal(mias[0].motivo, null);
});

test('solo veo los mios, nunca los de otro', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', motivo: 'Viaje' });
  const mias = await (await fetch(base + '/api/disponibilidad/mias', { headers: H(SEM.miembro2) })).json();
  assert.deepEqual(mias, []);
});

test('el persona_id del body se ignora: manda el del token', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', persona_id: SEM.miembro2.id });
  const fila = db.prepare('SELECT persona_id FROM fecha_no_disp').get();
  assert.equal(fila.persona_id, SEM.miembro1.id, 'debe quedar a nombre de quien lo mando, no de quien diga el body');
});

test('borro el mio', async () => {
  const { id } = await (await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12' })).json();
  const res = await fetch(base + '/api/disponibilidad/' + id, { method: 'DELETE', headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM fecha_no_disp').get().n, 0);
});

test('NO puedo borrar el de otro, y responde 404 (no confirma que exista)', async () => {
  const { id } = await (await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12' })).json();
  const res = await fetch(base + '/api/disponibilidad/' + id, { method: 'DELETE', headers: H(SEM.miembro2) });
  assert.equal(res.status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM fecha_no_disp').get().n, 1, 'no debe haberlo borrado');
});

test('hasta anterior a desde -> 400 en castellano', async () => {
  const res = await crear(SEM.miembro1, { desde: '2026-08-12', hasta: '2026-08-05' });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /anterior/i);
  assert.doesNotMatch(error, /hasta|desde/, 'no debe soltarle al usuario el nombre tecnico del campo');
});

test('un motivo larguisimo -> 400', async () => {
  const res = await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', motivo: 'x'.repeat(201) });
  assert.equal(res.status, 400);
});

test('una fecha con formato raro -> 400', async () => {
  assert.equal((await crear(SEM.miembro1, { desde: '5/8/2026', hasta: '2026-08-12' })).status, 400);
});
