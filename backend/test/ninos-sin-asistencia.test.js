// ============================================================
//  Escuela Dominical sin pasar asistencia (decision del dueno, 30 jul 2026).
//
//  La iglesia no va a pasar lista de los ninos, asi que la toma de asistencia
//  sale de la app: fuera la tarjeta de la pantalla y fuera POST /ninos/asistencia.
//
//  Lo que NO se hizo, y es a proposito: la tabla `asistencia_nino` se queda en
//  la base de datos con lo que hubiera anotado. Borrarla es irreversible y en
//  produccion hay una iglesia de verdad; quitar la funcion no tiene por que
//  llevarse el historial por delante. Si algun dia se quiere volver atras, los
//  datos siguen ahi.
//
//  Consecuencia asumida: `asistencia_nino.retiro_por` ("quien se llevo al nino
//  ese domingo") queda sin forma de rellenarse. La otra mitad del retiro
//  seguro —`nino.autorizados`, quien PUEDE retirarlo— vive en la ficha del
//  nino y no se toca aqui.
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

// De hijas a madres: `leccion` y `nino` apuntan a `clase_ed`, asi que borrar la
// clase primero revienta con FOREIGN KEY constraint failed.
function limpiarExtra() {
  for (const t of ['asistencia_nino', 'leccion', 'nino', 'clase_ed'])
    db.exec('DELETE FROM ' + t);
}
beforeEach(() => { limpiarExtra(); reiniciar(db); SEM = sembrarMinimo(db); });

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

test('POST /api/ninos/asistencia ya no existe', async () => {
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(SEM.lider.id, SEM.grupoId, 'lider_ed');
  const claseId = Number(db.prepare("INSERT INTO clase_ed (iglesia_id, nombre) VALUES (?, 'Parvulos')").run(SEM.iglesiaId).lastInsertRowid);
  const ninoId = Number(db.prepare("INSERT INTO nino (iglesia_id, clase_id, nombre) VALUES (?,?, 'Nino A')").run(SEM.iglesiaId, claseId).lastInsertRowid);

  const res = await fetch(base + '/api/ninos/asistencia', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ clase_id: claseId, fecha: '2026-08-02', presentes: [{ nino_id: ninoId }] })
  });
  assert.equal(res.status, 404, 'la ruta de asistencia de ninos debe haber desaparecido');

  const filas = db.prepare('SELECT COUNT(*) AS n FROM asistencia_nino').get().n;
  assert.equal(filas, 0, 'y desde luego no debe haber guardado nada');
});

test('la tabla asistencia_nino sigue existiendo: lo ya anotado no se borro', () => {
  const claseId = Number(db.prepare("INSERT INTO clase_ed (iglesia_id, nombre) VALUES (?, 'Primaria')").run(SEM.iglesiaId).lastInsertRowid);
  const ninoId = Number(db.prepare("INSERT INTO nino (iglesia_id, clase_id, nombre) VALUES (?,?, 'Nino B')").run(SEM.iglesiaId, claseId).lastInsertRowid);

  // Una asistencia historica, de las que ya podrian existir en produccion.
  db.prepare('INSERT INTO asistencia_nino (clase_id, nino_id, fecha) VALUES (?,?,?)').run(claseId, ninoId, '2026-07-05');
  const fila = db.prepare('SELECT nino_id, fecha FROM asistencia_nino WHERE clase_id = ?').get(claseId);
  assert.equal(fila.nino_id, ninoId);
  assert.equal(fila.fecha, '2026-07-05');
});

test('el resto de Escuela Dominical sigue funcionando: clase, nino y leccion', async () => {
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(SEM.lider.id, SEM.grupoId, 'lider_ed');

  let res = await fetch(base + '/api/ninos/clases', {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ nombre: 'Parvulos' })
  });
  assert.equal(res.status, 200, 'crear una clase debe seguir funcionando');
  const claseId = db.prepare('SELECT id FROM clase_ed').get().id;

  res = await fetch(base + '/api/ninos/ninos', {
    method: 'POST', headers: H(SEM.lider),
    // `edad` viaja como texto: es el valor crudo del <input> del formulario.
    body: JSON.stringify({ clase_id: claseId, nombre: 'Sofia', edad: '6' })
  });
  assert.equal(res.status, 200, 'inscribir un nino debe seguir funcionando');

  res = await fetch(base + '/api/ninos/material', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ clase_id: claseId, titulo: 'La oveja perdida' })
  });
  assert.equal(res.status, 200, 'subir una leccion debe seguir funcionando');

  res = await fetch(base + '/api/ninos/clase/' + claseId + '/ninos', { headers: H(SEM.lider) });
  assert.equal(res.status, 200);
  const ninos = await res.json();
  assert.equal(ninos.length, 1);
  assert.equal(ninos[0].nombre, 'Sofia');
});

test('la ficha del nino conserva "quien puede retirarlo" (la otra mitad del retiro seguro)', async () => {
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(SEM.lider.id, SEM.grupoId, 'lider_ed');
  const claseId = Number(db.prepare("INSERT INTO clase_ed (iglesia_id, nombre) VALUES (?, 'Parvulos')").run(SEM.iglesiaId).lastInsertRowid);

  const res = await fetch(base + '/api/ninos/ninos', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ clase_id: claseId, nombre: 'Sofia', autorizados: 'Ana (abuela)' })
  });
  assert.equal(res.status, 200);
  const fila = db.prepare('SELECT autorizados FROM nino WHERE nombre = ?').get('Sofia');
  assert.equal(fila.autorizados, 'Ana (abuela)', 'sacar la asistencia no debe llevarse por delante el campo de autorizados');
});
