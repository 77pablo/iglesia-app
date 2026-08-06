// -----------------------------------------------------------------------------
//  Corregir un movimiento de tesoreria (spec 2026-08-05-corregir-movimiento).
//
//  Lo que sostiene todo: SOLO se escribe (y SOLO se audita) lo que de verdad
//  cambio, y el UPDATE viaja con su apunte en la misma transaccion. Un PATCH
//  que reenvia lo mismo no deja rastro — la leccion repetida cinco veces en
//  este proyecto (formularios que reenvian campos que nadie toco).
// -----------------------------------------------------------------------------
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let dbDirecta, srv, base, signToken, SEM, tesorero;

before(async () => {
  dbDirecta = await cargarDb();
  ({ signToken } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(res => srv.once('listening', res));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(res => srv.close(res)));

beforeEach(() => {
  reiniciar(dbDirecta);
  dbDirecta.exec('DELETE FROM movimiento');
  dbDirecta.exec('DELETE FROM campania');
  dbDirecta.exec('DELETE FROM auditoria');
  SEM = sembrarMinimo(dbDirecta);
  // sembrarMinimo no trae tesorero: se asciende a miembro1, igual que en
  // campanias.test.js (soloTesorero exige rol='tesorero' en una pertenencia).
  dbDirecta.prepare("UPDATE pertenencia SET rol = 'tesorero' WHERE persona_id = ? AND grupo_id = ?")
    .run(SEM.miembro1.id, SEM.grupoId);
  tesorero = SEM.miembro1;
});

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});
const patchMov = (id, cuerpo, quien = tesorero) =>
  fetch(`${base}/api/tesoreria/movimientos/${id}`, { method: 'PATCH', headers: H(quien), body: JSON.stringify(cuerpo) });

const crearMov = (campos = {}) => Number(dbDirecta.prepare(
  `INSERT INTO movimiento (iglesia_id, tipo, categoria, monto, descripcion, creado_por, campania_id)
   VALUES (?,?,?,?,?,?,?)`
).run(campos.iglesia_id ?? SEM.iglesiaId, campos.tipo ?? 'ingreso', campos.categoria ?? 'ofrenda',
      campos.monto ?? 5000, campos.descripcion ?? 'Ofrenda dominical', tesorero.id,
      campos.campania_id ?? null).lastInsertRowid);

const movDe = (id) => dbDirecta.prepare('SELECT * FROM movimiento WHERE id = ?').get(id);
const apuntesDe = (id) => dbDirecta.prepare(
  "SELECT * FROM auditoria WHERE ref_tabla='movimiento' AND ref_id=? AND accion='movimiento_corregir' ORDER BY id"
).all(id);

test('la tesorera corrige el monto: cambia, y queda UN apunte con antes -> despues', async () => {
  const id = crearMov({ monto: 5000 });
  const res = await patchMov(id, { monto: 50000 });
  assert.equal(res.status, 200);
  assert.equal(movDe(id).monto, 50000);
  const apuntes = apuntesDe(id);
  assert.equal(apuntes.length, 1, 'corregir dinero sin rastro no es aceptable');
  assert.ok(apuntes[0].detalle.includes('5000') && apuntes[0].detalle.includes('50000'),
    `el apunte no dice antes y despues: ${apuntes[0].detalle}`);
  assert.equal(apuntes[0].actor_id, tesorero.id);
});

test('el pastor NO corrige: 403 y el movimiento intacto', async () => {
  const id = crearMov({ monto: 5000 });
  const res = await patchMov(id, { monto: 1 }, SEM.pastor);
  assert.equal(res.status, 403);
  assert.equal(movDe(id).monto, 5000);
  assert.equal(apuntesDe(id).length, 0);
});

test('movimiento de otra iglesia: 404 sin confirmar que exista', async () => {
  const otra = Number(dbDirecta.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA')").run().lastInsertRowid);
  const ajeno = crearMov({ iglesia_id: otra });
  const res = await patchMov(ajeno, { monto: 1 });
  assert.equal(res.status, 404);
  assert.equal(movDe(ajeno).monto, 5000);
});

test('PATCH con los MISMOS valores: 200 y CERO apuntes nuevos', async () => {
  const id = crearMov({ monto: 5000, descripcion: 'Ofrenda dominical', categoria: 'ofrenda' });
  const res = await patchMov(id, { monto: 5000, descripcion: 'Ofrenda dominical', categoria: 'ofrenda' });
  assert.equal(res.status, 200);
  assert.equal(apuntesDe(id).length, 0,
    'se audito un cambio que nadie hizo: es el fallo del "Juan Perez -> Juan Perez"');
});

test('PATCH sin ningun campo -> 400', async () => {
  const id = crearMov();
  const res = await patchMov(id, {});
  assert.equal(res.status, 400);
});

test('tipo y fecha se descartan en silencio: el movimiento no los cambia', async () => {
  const id = crearMov({ tipo: 'ingreso' });
  const antes = movDe(id);
  const res = await patchMov(id, { tipo: 'gasto', fecha: '2020-01-01', monto: 7000 });
  assert.equal(res.status, 200);
  const despues = movDe(id);
  assert.equal(despues.tipo, 'ingreso', 'el tipo NO se corrige: cambiarlo es borrar+crear');
  assert.equal(despues.fecha, antes.fecha, 'la fecha NO se corrige (mueve totales mensuales)');
  assert.equal(despues.monto, 7000);
});

test('corregir el monto de un aporte ajusta el recaudado CALCULADO, tambien con la campania cerrada', async () => {
  const camp = Number(dbDirecta.prepare(
    "INSERT INTO campania (iglesia_id, nombre, meta, recaudado, cerrada_en) VALUES (?,?,0,0,datetime('now'))"
  ).run(SEM.iglesiaId, 'Techo').lastInsertRowid);
  const aporte = crearMov({ monto: 10000, campania_id: camp, descripcion: 'Aporte a campaña' });
  const res = await patchMov(aporte, { monto: 15000 });
  assert.equal(res.status, 200, 'cerrada rechaza aportes NUEVOS, no arreglos de tecleo');
  const r = await fetch(`${base}/api/tesoreria/campanias`, { headers: H(tesorero) });
  const campanias = await r.json();
  assert.equal(campanias.find(c => c.id === camp).recaudado, 15000,
    'la barra no reflejo la correccion: habria dos contabilidades otra vez');
});

test('descripcion vacia se guarda como NULL (misma normalizacion que el POST)', async () => {
  const id = crearMov({ descripcion: 'con typo' });
  const res = await patchMov(id, { descripcion: '' });
  assert.equal(res.status, 200);
  assert.equal(movDe(id).descripcion, null);
  assert.equal(apuntesDe(id).length, 1);
});

test('categoria vacia se guarda como NULL, simetrica con descripcion', async () => {
  const id = crearMov({ categoria: 'ofrenda' });
  const res = await patchMov(id, { categoria: '' });
  assert.equal(res.status, 200);
  assert.equal(movDe(id).categoria, null);
  assert.equal(apuntesDe(id).length, 1);
});

test('GET /movimientos trae `correcciones` por fila: 0 y el conteo real', async () => {
  const limpio = crearMov();
  const tocado = crearMov({ monto: 100 });
  await patchMov(tocado, { monto: 200 });
  await patchMov(tocado, { monto: 300 });
  const r = await fetch(`${base}/api/tesoreria/movimientos`, { headers: H(tesorero) });
  const { items } = await r.json();
  assert.equal(items.find(x => x.id === limpio).correcciones, 0);
  assert.equal(items.find(x => x.id === tocado).correcciones, 2);
});

test('el historial devuelve los apuntes con el nombre del actor', async () => {
  const id = crearMov({ monto: 100 });
  await patchMov(id, { monto: 200 });
  const r = await fetch(`${base}/api/tesoreria/movimientos/${id}/historial`, { headers: H(SEM.pastor) });
  assert.equal(r.status, 200, 'el pastor VE el historial (supervisa, no toca)');
  const filas = await r.json();
  assert.equal(filas.length, 1);
  assert.equal(filas[0].actor, tesorero.nombre);
  assert.ok(filas[0].detalle.includes('100') && filas[0].detalle.includes('200'));
  assert.ok(filas[0].fecha, 'sin fecha no hay rastro que valga');
});

test('historial de un movimiento de otra iglesia -> 404', async () => {
  const otra = Number(dbDirecta.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra2','OTRA2')").run().lastInsertRowid);
  const ajeno = crearMov({ iglesia_id: otra });
  const r = await fetch(`${base}/api/tesoreria/movimientos/${ajeno}/historial`, { headers: H(tesorero) });
  assert.equal(r.status, 404);
});

test('el detalle del obispo trae `correcciones` por fila', async () => {
  const obispoId = Number(dbDirecta.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, rol_global, activo) VALUES (NULL,'obispo2','Obispo','x',0,'obispo',1)"
  ).run().lastInsertRowid);
  const id = crearMov({ monto: 100 });
  await patchMov(id, { monto: 200 });
  const mes = dbDirecta.prepare("SELECT strftime('%Y-%m', fecha) AS m FROM movimiento WHERE id = ?").get(id).m;
  const r = await fetch(`${base}/api/obispo/iglesia/${SEM.iglesiaId}/tesoreria?mes=${mes}`, {
    headers: { Authorization: 'Bearer ' + signToken({ id: obispoId, iglesia_id: null }) }
  });
  assert.equal(r.status, 200);
  const filas = await r.json();
  assert.ok(filas.some(f => f.correcciones === 1),
    'el obispo no ve la marca: la mitad de la decision 2 de la spec');
});

test('el frontend manda SOLO lo tocado: guardarCorreccionMov compara contra el original', () => {
  const fuente = fs.readFileSync(new URL('../../web/app.js', import.meta.url), 'utf8');
  const fn = fuente.match(/async function guardarCorreccionMov\([\s\S]*?\n\}/);
  assert.ok(fn, 'no se encontro guardarCorreccionMov en web/app.js');
  assert.ok(/if\s*\(\s*monto\s*!==\s*Number\(m\.monto\)\s*\)/.test(fn[0]),
    'el monto viaja siempre: volveria el formulario que reenvia lo que nadie toco');
  assert.ok(!fn[0].includes('tipo'), 'el frontend no debe ofrecer cambiar el tipo');
});
