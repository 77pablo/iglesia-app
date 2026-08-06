// -----------------------------------------------------------------------------
//  Clases y lecciones de Escuela Dominical: corregir y borrar (spec
//  2026-08-05-editar-clases-lecciones).
//
//  La regla dura: una clase con ninos NO se borra (409) — borrar fichas de
//  menores en bloque es demasiado facil de hacer por error. Y la regla nueva
//  de la casa: solo se audita lo que cambio de verdad.
// -----------------------------------------------------------------------------
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let dbDirecta, srv, base, signToken, SEM, encargada;

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
  for (const t of ['asistencia_nino', 'leccion', 'nino', 'clase_ed', 'auditoria'])
    dbDirecta.exec('DELETE FROM ' + t);
  SEM = sembrarMinimo(dbDirecta);
  // miembro1 asciende a encargada de ED (soloEncargado exige el rol en una
  // pertenencia — mismo truco que campanias.test.js con el tesorero).
  dbDirecta.prepare("UPDATE pertenencia SET rol = 'lider_ed' WHERE persona_id = ? AND grupo_id = ?")
    .run(SEM.miembro1.id, SEM.grupoId);
  encargada = SEM.miembro1;
});

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});
const llamar = (metodo, ruta, cuerpo, quien = encargada) =>
  fetch(base + ruta, { method: metodo, headers: H(quien), body: cuerpo && JSON.stringify(cuerpo) });

const crearClase = (campos = {}) => Number(dbDirecta.prepare(
  'INSERT INTO clase_ed (iglesia_id, nombre, edad) VALUES (?,?,?)'
).run(campos.iglesia_id ?? SEM.iglesiaId, campos.nombre ?? 'Primarios', campos.edad ?? '6-8 años').lastInsertRowid);

const claseDe = (id) => dbDirecta.prepare('SELECT * FROM clase_ed WHERE id = ?').get(id);
const apuntes = (accion) => dbDirecta.prepare(
  'SELECT * FROM auditoria WHERE accion = ? ORDER BY id').all(accion);

test('corregir el nombre de una clase: cambia y deja UN apunte antes -> despues', async () => {
  const id = crearClase({ nombre: 'Primarios' });
  const res = await llamar('PATCH', `/api/ninos/clases/${id}`, { nombre: 'Intermedios' });
  assert.equal(res.status, 200);
  assert.equal(claseDe(id).nombre, 'Intermedios');
  const a = apuntes('editar_clase');
  assert.equal(a.length, 1);
  assert.ok(a[0].detalle.includes('Primarios') && a[0].detalle.includes('Intermedios'));
});

test('PATCH con los mismos valores: 200 y cero apuntes', async () => {
  const id = crearClase({ nombre: 'Primarios', edad: '6-8 años' });
  const res = await llamar('PATCH', `/api/ninos/clases/${id}`, { nombre: 'Primarios', edad: '6-8 años' });
  assert.equal(res.status, 200);
  assert.equal(apuntes('editar_clase').length, 0);
});

test('el pastor no edita: 403; una clase ajena: 404', async () => {
  const id = crearClase();
  assert.equal((await llamar('PATCH', `/api/ninos/clases/${id}`, { nombre: 'X' }, SEM.pastor)).status, 403);
  const otra = Number(dbDirecta.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA')").run().lastInsertRowid);
  const ajena = crearClase({ iglesia_id: otra });
  assert.equal((await llamar('PATCH', `/api/ninos/clases/${ajena}`, { nombre: 'X' })).status, 404);
  assert.equal(claseDe(ajena).nombre, 'Primarios');
});

test('borrar una clase CON ninos: 409, nada cambia, el mensaje trae el conteo', async () => {
  const id = crearClase();
  dbDirecta.prepare('INSERT INTO nino (iglesia_id, clase_id, nombre) VALUES (?,?,?)')
    .run(SEM.iglesiaId, id, 'Sofi');
  const res = await llamar('DELETE', `/api/ninos/clases/${id}`);
  assert.equal(res.status, 409);
  const { error } = await res.json();
  assert.ok(error.includes('1'), `el mensaje no dice cuantos ninos: ${error}`);
  assert.ok(claseDe(id), 'la clase se borro igual');
  assert.equal(apuntes('eliminar_clase').length, 0);
});

test('borrar una clase VACIA se lleva lecciones y asistencia vieja, en transaccion', async () => {
  const id = crearClase();
  dbDirecta.prepare('INSERT INTO leccion (iglesia_id, clase_id, titulo) VALUES (?,?,?)')
    .run(SEM.iglesiaId, id, 'El arca');
  // Asistencia huerfana: el nino se borro (Fase 13) pero su fila vieja de
  // asistencia guardaba el clase_id — sin limpiarla, el DELETE de la clase
  // reventaria por FK.
  dbDirecta.exec('PRAGMA foreign_keys=OFF');
  dbDirecta.prepare('INSERT INTO asistencia_nino (clase_id, nino_id, fecha) VALUES (?, 99999, ?)')
    .run(id, '2026-07-01');
  dbDirecta.exec('PRAGMA foreign_keys=ON');
  const res = await llamar('DELETE', `/api/ninos/clases/${id}`);
  assert.equal(res.status, 200);
  assert.equal(claseDe(id), undefined);
  assert.equal(dbDirecta.prepare('SELECT COUNT(*) AS n FROM leccion WHERE clase_id = ?').get(id).n, 0);
  assert.equal(dbDirecta.prepare('SELECT COUNT(*) AS n FROM asistencia_nino WHERE clase_id = ?').get(id).n, 0);
  const a = apuntes('eliminar_clase');
  assert.equal(a.length, 1);
  assert.ok(a[0].detalle.includes('Primarios'));
});

test('crear una clase deja apunte (el hueco del 30-jul se cierra)', async () => {
  const res = await llamar('POST', '/api/ninos/clases', { nombre: 'Cuna' });
  assert.equal(res.status, 200);
  assert.equal(apuntes('crear_clase').length, 1);
});
