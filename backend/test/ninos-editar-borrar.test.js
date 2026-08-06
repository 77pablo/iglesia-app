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

// El mismo tope tiene que valer al CREAR, no solo al corregir: si no, un nino
// se puede dar de alta con una lista larguisima que despues nadie puede editar
// (guardarNino manda siempre los cinco campos, asi que el PATCH lo rechazaria
// aunque la maestra solo quisiera corregir otra cosa).
test('una lista de autorizados larguisima al crear -> 400 en castellano', async () => {
  conEncargada();
  const claseId = Number(db.prepare("INSERT INTO clase_ed (iglesia_id, nombre) VALUES (?, 'Parvulos')")
    .run(SEM.iglesiaId).lastInsertRowid);

  const res = await fetch(base + '/api/ninos/ninos', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ clase_id: claseId, nombre: 'Sofia', autorizados: 'x'.repeat(301) })
  });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.doesNotMatch(error, /autorizados/, 'no debe soltarle al usuario el nombre tecnico del campo');

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM nino').get().n, 0, 'y no debe haber creado nada');
});

// ------------------------------------------------------------
//  Borrar la ficha, y con ella su historial de asistencia.
//  Ese historial ya no lo muestra ninguna pantalla (la asistencia de ninos se
//  retiro el 30 jul), asi que conservarlo seria guardar datos de un menor que
//  nadie puede consultar.
// ------------------------------------------------------------
const borrar = (persona, id, iglesiaId) => fetch(base + '/api/ninos/ninos/' + id, {
  method: 'DELETE', headers: H(persona, iglesiaId)
});

test('borrar un nino con asistencias historicas se lleva las dos cosas', async () => {
  conEncargada();
  const { claseId, ninoId } = claseConNino('Sofia');
  db.prepare('INSERT INTO asistencia_nino (clase_id, nino_id, fecha) VALUES (?,?,?)')
    .run(claseId, ninoId, '2026-07-05');
  db.prepare('INSERT INTO asistencia_nino (clase_id, nino_id, fecha) VALUES (?,?,?)')
    .run(claseId, ninoId, '2026-07-12');

  const res = await borrar(SEM.lider, ninoId);
  assert.equal(res.status, 200);

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM nino WHERE id = ?').get(ninoId).n, 0);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM asistencia_nino WHERE nino_id = ?').get(ninoId).n, 0,
    'no deben quedar asistencias huerfanas apuntando a un nino que ya no existe'
  );
});

test('borrar un nino sin historial funciona igual', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Mateo');
  assert.equal((await borrar(SEM.lider, ninoId)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM nino').get().n, 0);
});

test('borrar NO se lleva por delante a los demas ninos ni sus asistencias', async () => {
  conEncargada();
  const { claseId, ninoId } = claseConNino('Sofia');
  const otro = Number(db.prepare('INSERT INTO nino (iglesia_id, clase_id, nombre) VALUES (?,?,?)')
    .run(SEM.iglesiaId, claseId, 'Mateo').lastInsertRowid);
  db.prepare('INSERT INTO asistencia_nino (clase_id, nino_id, fecha) VALUES (?,?,?)')
    .run(claseId, otro, '2026-07-05');

  await borrar(SEM.lider, ninoId);

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM nino WHERE id = ?').get(otro).n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM asistencia_nino WHERE nino_id = ?').get(otro).n, 1);
});

test('un encargado de OTRA iglesia recibe 404 y el nino sigue ahi', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia');

  const otraIglesia = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA')")
    .run().lastInsertRowid);
  const otroGrupo = Number(db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Ninos', '#2f7')")
    .run(otraIglesia).lastInsertRowid);
  const ajeno = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,'ed2','Encargada Ajena','x',1)"
  ).run(otraIglesia).lastInsertRowid);
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(ajeno, otroGrupo, 'lider_ed');

  assert.equal((await borrar({ id: ajeno }, ninoId, otraIglesia)).status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM nino WHERE id = ?').get(ninoId).n, 1);
});

test('el pastor solo observa: 403 al borrar', async () => {
  conEncargada();
  const { ninoId } = claseConNino();
  assert.equal((await borrar(SEM.pastor, ninoId)).status, 403);
});

test('borrar queda auditado', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia');
  await borrar(SEM.lider, ninoId);

  const log = db.prepare("SELECT accion, modulo, detalle FROM auditoria WHERE accion = 'eliminar_nino'").get();
  assert.ok(log, 'borrar la ficha de un menor tiene que dejar rastro');
  assert.equal(log.modulo, 'ninos');
  assert.match(log.detalle, /Sofia/);
});

// ---------- Backlog 5-ago: el PATCH del nino tambien usa soloCambios() ----------
// La regla nueva del propio modulo (editar clase/leccion) decia "solo se
// audita lo que cambio de verdad", y este PATCH la contradecia: reenviaba
// todo y auditaba sin diff — la septima aparicion del "Juan Perez -> Juan
// Perez" esperando su turno.

test('PATCH del nino con los MISMOS valores: 200 y CERO apuntes nuevos', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia', 'Ana (abuela)');

  const res = await editar(SEM.lider, ninoId, { nombre: 'Sofia', autorizados: 'Ana (abuela)' });
  assert.equal(res.status, 200);

  const apuntes = db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'editar_nino'").get().n;
  assert.equal(apuntes, 0, 'reenviar lo igual no es una correccion y no debe ensuciar el rastro');
});

test('PATCH del nino con un cambio real: audita "antes -> despues" y nombra al nino', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia', 'Ana (abuela)');

  const res = await editar(SEM.lider, ninoId, { autorizados: 'Pedro (tio)', nombre: 'Sofia' });
  assert.equal(res.status, 200);

  const logs = db.prepare("SELECT detalle FROM auditoria WHERE accion = 'editar_nino'").all();
  assert.equal(logs.length, 1, 'un solo apunte por la correccion');
  assert.match(logs[0].detalle, /Sofia/, 'el apunte dice de quien es la ficha');
  assert.match(logs[0].detalle, /autorizados: Ana \(abuela\) -> Pedro \(tio\)/, 'y que cambio de verdad');
  assert.doesNotMatch(logs[0].detalle, /nombre:/, 'el nombre reenviado igual NO aparece como cambio');
});
