// ============================================================
//  El endpoint del estado del respaldo: solo el super-admin, y sin filtrar
//  nunca las credenciales de R2 en el motivo que se muestra.
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';
import { signToken } from '../src/auth.js';

let db, base, srv, superId, pastorId, iglesiaId;

before(async () => {
  db = await cargarDb();
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Ig PERS','PERS')").run();
  iglesiaId = Number(ig.lastInsertRowid);
  superId = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (NULL,'super_api','Super','x','super_admin',1)"
  ).run().lastInsertRowid);
  pastorId = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,'pastor_api','Pastor','x',1,1)"
  ).run(iglesiaId).lastInsertRowid);

  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv && new Promise(r => srv.close(r)));

const pedir = (personaId, iglesia) => fetch(base + '/api/superadmin/persistencia', {
  headers: { Authorization: 'Bearer ' + signToken({ id: personaId, iglesia_id: iglesia ?? null }) }
});

test('el pastor NO puede ver el estado del respaldo (403)', async () => {
  const r = await pedir(pastorId, iglesiaId);
  assert.equal(r.status, 403);
});

test('el super-admin lo ve, con los dos bloques', async () => {
  const r = await pedir(superId, null);
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.ok(['litestream', 'sin-replica', 'desconocido'].includes(b.modo));
  assert.ok(['ok', 'mal', 'desconocido', 'no_aplica'].includes(b.bd.estado));
  assert.ok(['ok', 'mal', 'desconocido', 'no_aplica'].includes(b.uploads.estado));
  // La tarjeta pinta el retraso en numeros (con 'retraso_alto', 16 minutos y 6
  // horas son decisiones distintas), asi que el campo tiene que llegar SIEMPRE,
  // aunque valga null: si desaparece del contrato, el frontend se queda mudo
  // justo en el caso que mas importa.
  assert.ok('retraso_seg' in b.bd, 'bd debe traer retraso_seg (null si no se sabe)');
});

test('la respuesta no filtra credenciales ni rutas del servidor', async () => {
  const r = await pedir(superId, null);
  const texto = await r.text();
  assert.ok(!/cloudflarestorage|LITESTREAM_SECRET|AKIA/.test(texto),
    'el estado no puede arrastrar credenciales de R2');
  assert.ok(!/[A-Za-z]:\\\\|\/etc\/litestream/.test(texto),
    'el estado no puede filtrar rutas del servidor');
});
