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

// ------------------------------------------------------------
//  El lider ve quien no puede ANTES de asignar.
// ------------------------------------------------------------
const noDisp = (persona, fecha, iglesiaId) =>
  fetch(base + '/api/disponibilidad/no-disponibles?fecha=' + fecha, { headers: H(persona, iglesiaId) });

test('el lider ve el id de quien marco no disponible ese dia', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', motivo: 'Viaje' });
  const ids = await (await noDisp(SEM.lider, '2026-08-07')).json();
  assert.deepEqual(ids, [SEM.miembro1.id]);
});

test('los bordes del periodo cuentan como no disponible', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12' });
  assert.deepEqual(await (await noDisp(SEM.lider, '2026-08-05')).json(), [SEM.miembro1.id]);
  assert.deepEqual(await (await noDisp(SEM.lider, '2026-08-12')).json(), [SEM.miembro1.id]);
  assert.deepEqual(await (await noDisp(SEM.lider, '2026-08-13')).json(), []);
});

test('NO devuelve los motivos: al lider le basta con saber quien', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', motivo: 'Tratamiento medico' });
  const texto = await (await noDisp(SEM.lider, '2026-08-07')).text();
  assert.doesNotMatch(texto, /Tratamiento/, 'el motivo no debe viajar en esta respuesta');
});

test('dos periodos solapados de la misma persona no la duplican', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12' });
  await crear(SEM.miembro1, { desde: '2026-08-07', hasta: '2026-08-20' });
  assert.deepEqual(await (await noDisp(SEM.lider, '2026-08-08')).json(), [SEM.miembro1.id]);
});

test('un lider de OTRA iglesia no ve a mi gente', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12' });

  const otraIglesia = Number(db.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA')"
  ).run().lastInsertRowid);
  const pastorAjeno = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,'pastor2','Pastor Ajeno','x',1,1)"
  ).run(otraIglesia).lastInsertRowid);

  const ids = await (await noDisp({ id: pastorAjeno }, '2026-08-07', otraIglesia)).json();
  assert.deepEqual(ids, [], 'no debe ver a nadie de la iglesia de al lado');
});

test('un feligres cualquiera no puede consultar la lista', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12' });
  assert.equal((await noDisp(SEM.miembro2, '2026-08-07')).status, 403);
});

test('sin fecha o con fecha invalida -> 400 (esto estrena validar(...,"query"))', async () => {
  assert.equal((await noDisp(SEM.lider, '')).status, 400);
  assert.equal((await noDisp(SEM.lider, '7-8-2026')).status, 400);
});

test('al eliminar mi cuenta desaparecen mis periodos de no disponible', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', motivo: 'Tratamiento medico' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM fecha_no_disp').get().n, 1);

  const res = await fetch(base + '/api/cuenta/eliminar', { method: 'POST', headers: H(SEM.miembro1), body: '{}' });
  assert.equal(res.status, 200);

  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM fecha_no_disp WHERE persona_id = ?').get(SEM.miembro1.id).n, 0,
    'el motivo es un dato personal: no puede sobrevivir a la baja'
  );
});
