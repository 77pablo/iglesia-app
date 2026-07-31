// ============================================================
//  Escuela Dominical: corregir y borrar la ficha de un nino.
//  El modulo solo sabia crear: no habia ni un PATCH ni un DELETE, asi que
//  "quien puede retirarlo" no se podia cambiar nunca — y es justo el dato que
//  cambia (la abuela se muda, los padres se separan).
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

function limpiarExtra() {
  for (const t of ['asistencia_nino', 'leccion', 'nino', 'clase_ed', 'auditoria'])
    db.exec('DELETE FROM ' + t);
}
beforeEach(() => { limpiarExtra(); reiniciar(db); SEM = sembrarMinimo(db); });

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

// SEM.lider pasa a ser la encargada de Escuela Dominical.
function conEncargada() {
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)')
    .run(SEM.lider.id, SEM.grupoId, 'lider_ed');
}
function claseConNino(nombre = 'Sofia', autorizados = null) {
  const claseId = Number(db.prepare("INSERT INTO clase_ed (iglesia_id, nombre) VALUES (?, 'Parvulos')")
    .run(SEM.iglesiaId).lastInsertRowid);
  const ninoId = Number(db.prepare('INSERT INTO nino (iglesia_id, clase_id, nombre, autorizados) VALUES (?,?,?,?)')
    .run(SEM.iglesiaId, claseId, nombre, autorizados).lastInsertRowid);
  return { claseId, ninoId };
}
const editar = (persona, id, cuerpo, iglesiaId) => fetch(base + '/api/ninos/ninos/' + id, {
  method: 'PATCH', headers: H(persona, iglesiaId), body: JSON.stringify(cuerpo)
});

test('la encargada corrige quien puede retirar al nino', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia', 'Ana (abuela)');

  const res = await editar(SEM.lider, ninoId, { autorizados: 'Ana Rojas (abuela), Juan Perez (papa)' });
  assert.equal(res.status, 200);

  const fila = db.prepare('SELECT nombre, autorizados FROM nino WHERE id = ?').get(ninoId);
  assert.equal(fila.autorizados, 'Ana Rojas (abuela), Juan Perez (papa)');
  assert.equal(fila.nombre, 'Sofia', 'lo que no se mando no debe cambiar');
});

test('lo que no se manda no se toca', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia', 'Ana (abuela)');
  db.prepare("UPDATE nino SET alergias = 'mani', familia = 'Rojas' WHERE id = ?").run(ninoId);

  await editar(SEM.lider, ninoId, { nombre: 'Sofia Rojas' });

  const fila = db.prepare('SELECT nombre, alergias, familia, autorizados FROM nino WHERE id = ?').get(ninoId);
  assert.equal(fila.nombre, 'Sofia Rojas');
  assert.equal(fila.alergias, 'mani');
  assert.equal(fila.familia, 'Rojas');
  assert.equal(fila.autorizados, 'Ana (abuela)');
});

test('un encargado de OTRA iglesia recibe 404 y no cambia nada', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia', 'Ana (abuela)');

  const otraIglesia = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA')")
    .run().lastInsertRowid);
  const otroGrupo = Number(db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Ninos', '#2f7')")
    .run(otraIglesia).lastInsertRowid);
  const ajeno = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,'ed2','Encargada Ajena','x',1)"
  ).run(otraIglesia).lastInsertRowid);
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(ajeno, otroGrupo, 'lider_ed');

  const res = await editar({ id: ajeno }, ninoId, { autorizados: 'Cualquiera' }, otraIglesia);
  assert.equal(res.status, 404, 'no debe poder tocar a un nino de otra congregacion');

  const fila = db.prepare('SELECT autorizados FROM nino WHERE id = ?').get(ninoId);
  assert.equal(fila.autorizados, 'Ana (abuela)', 'y desde luego no debe haberlo cambiado');
});

test('el pastor solo observa: 403 al editar', async () => {
  conEncargada();
  const { ninoId } = claseConNino();
  const res = await editar(SEM.pastor, ninoId, { autorizados: 'Quien sea' });
  assert.equal(res.status, 403);
});

test('editar queda auditado', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia');
  await editar(SEM.lider, ninoId, { autorizados: 'Ana (abuela)' });

  const log = db.prepare("SELECT accion, modulo, detalle FROM auditoria WHERE accion = 'editar_nino'").get();
  assert.ok(log, 'editar la ficha de un menor tiene que dejar rastro');
  assert.equal(log.modulo, 'ninos');
  assert.match(log.detalle, /Sofia/);
});

test('una lista de autorizados larguisima -> 400 en castellano', async () => {
  conEncargada();
  const { ninoId } = claseConNino();
  const res = await editar(SEM.lider, ninoId, { autorizados: 'x'.repeat(301) });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.doesNotMatch(error, /autorizados/, 'no debe soltarle al usuario el nombre tecnico del campo');
});
