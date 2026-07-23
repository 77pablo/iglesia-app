// ============================================================
//  Fixes B1 (integridad de datos y fechas): regresion.
//  Cubre: validacion de fecha en movimientos (tesoreria.js),
//  idempotencia de asistencia_nino (indice unico, ninos.js/db.js),
//  porCategoria con NULL/'otro' colapsado en una sola fila (tesoreria.js),
//  formato HH:MM de horas y re-deteccion de choque en el PATCH de eventos.
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

// reiniciar() (helpers.js) solo limpia mensaje/conversacion*/pertenencia/grupo/
// persona/iglesia. Aqui usamos ademas movimiento/clase_ed/nino/asistencia_nino/evento,
// asi que los limpiamos tambien entre tests.
function limpiarExtra() {
  for (const t of ['asistencia_nino', 'nino', 'clase_ed', 'movimiento', 'evento'])
    db.exec('DELETE FROM ' + t);
}
beforeEach(() => { limpiarExtra(); reiniciar(db); SEM = sembrarMinimo(db); });

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

// ------------------------------------------------------------
// 1. tesoreria.js: fecha del movimiento debe ser YYYY-MM-DD.
// ------------------------------------------------------------
test('POST /api/tesoreria/movimientos: fecha invalida -> 400, fecha valida -> 200', async () => {
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(SEM.pastor.id, SEM.grupoId, 'tesorero');

  let res = await fetch(base + '/api/tesoreria/movimientos', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ tipo: 'ingreso', monto: 100, fecha: 'no-es-una-fecha' })
  });
  assert.equal(res.status, 400, 'una fecha con formato invalido debe rechazarse');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM movimiento').get().n, 0, 'no debe crearse el movimiento');

  res = await fetch(base + '/api/tesoreria/movimientos', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ tipo: 'ingreso', monto: 100, fecha: '2026-03-15' })
  });
  assert.equal(res.status, 200);
  const fila = db.prepare('SELECT fecha FROM movimiento').get();
  assert.equal(fila.fecha, '2026-03-15');
});

test('POST /api/tesoreria/movimientos: sin fecha (omitida) sigue funcionando con el default de la BD', async () => {
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(SEM.pastor.id, SEM.grupoId, 'tesorero');
  const res = await fetch(base + '/api/tesoreria/movimientos', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ tipo: 'gasto', monto: 50 })
  });
  assert.equal(res.status, 200);
  const fila = db.prepare('SELECT fecha FROM movimiento').get();
  assert.match(fila.fecha, /^\d{4}-\d{2}-\d{2}$/);
});

// ------------------------------------------------------------
// 2. ninos.js / db.js: dos asistencias iguales (clase_id, nino_id, fecha) no duplican.
// ------------------------------------------------------------
test('POST /api/ninos/asistencia dos veces con los mismos datos no duplica la fila en asistencia_nino', async () => {
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(SEM.lider.id, SEM.grupoId, 'lider_ed');
  const claseId = Number(db.prepare("INSERT INTO clase_ed (iglesia_id, nombre) VALUES (?, 'Parvulos')").run(SEM.iglesiaId).lastInsertRowid);
  const ninoId = Number(db.prepare("INSERT INTO nino (iglesia_id, clase_id, nombre) VALUES (?,?, 'Nino A')").run(SEM.iglesiaId, claseId).lastInsertRowid);

  const body = JSON.stringify({ clase_id: claseId, fecha: '2026-08-02', presentes: [{ nino_id: ninoId }] });
  let res = await fetch(base + '/api/ninos/asistencia', { method: 'POST', headers: H(SEM.lider), body });
  assert.equal(res.status, 200);
  res = await fetch(base + '/api/ninos/asistencia', { method: 'POST', headers: H(SEM.lider), body });
  assert.equal(res.status, 200);

  const filas = db.prepare('SELECT * FROM asistencia_nino WHERE clase_id = ? AND nino_id = ? AND fecha = ?')
    .all(claseId, ninoId, '2026-08-02');
  assert.equal(filas.length, 1, 'no debe haber filas duplicadas para la misma clase+nino+fecha');
});

test('db.js: el indice unico de asistencia_nino existe y bloquea duplicados a nivel de BD', async () => {
  const claseId = Number(db.prepare("INSERT INTO clase_ed (iglesia_id, nombre) VALUES (?, 'Primaria')").run(SEM.iglesiaId).lastInsertRowid);
  const ninoId = Number(db.prepare("INSERT INTO nino (iglesia_id, clase_id, nombre) VALUES (?,?, 'Nino B')").run(SEM.iglesiaId, claseId).lastInsertRowid);
  db.prepare('INSERT INTO asistencia_nino (clase_id, nino_id, fecha) VALUES (?,?,?)').run(claseId, ninoId, '2026-08-03');
  assert.throws(() => {
    db.prepare('INSERT INTO asistencia_nino (clase_id, nino_id, fecha) VALUES (?,?,?)').run(claseId, ninoId, '2026-08-03');
  }, /UNIQUE constraint failed/);
});

// ------------------------------------------------------------
// 3. tesoreria.js: porCategoria colapsa NULL y 'otro' en una sola fila.
// ------------------------------------------------------------
test('GET /api/tesoreria/transparencia: un gasto con categoria NULL y otro con \'otro\' se ven como UNA sola fila "otro"', async () => {
  db.prepare("INSERT INTO movimiento (iglesia_id, tipo, categoria, monto, fecha) VALUES (?, 'gasto', NULL, 100, '2026-05-01')").run(SEM.iglesiaId);
  db.prepare("INSERT INTO movimiento (iglesia_id, tipo, categoria, monto, fecha) VALUES (?, 'gasto', 'otro', 50, '2026-05-02')").run(SEM.iglesiaId);

  const res = await fetch(base + '/api/tesoreria/transparencia', { headers: H(SEM.pastor) });
  assert.equal(res.status, 200);
  const d = await res.json();

  const filasOtro = d.porCategoria.filter(f => f.categoria === 'otro');
  assert.equal(filasOtro.length, 1, 'NULL y \'otro\' deben colapsar en una sola fila etiquetada "otro"');
  assert.equal(filasOtro[0].monto, 150, 'debe sumar ambos montos (100 + 50)');
});

// ------------------------------------------------------------
// 4. eventos.js: hora_inicio/hora_fin exigen formato HH:MM.
// ------------------------------------------------------------
test('POST /api/eventos: hora_inicio con formato invalido -> 400', async () => {
  const res = await fetch(base + '/api/eventos', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ grupo_id: SEM.grupoId, titulo: 'Culto', fecha: '2026-09-01', hora_inicio: '9:00', hora_fin: '10:00' })
  });
  assert.equal(res.status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM evento').get().n, 0);
});

// ------------------------------------------------------------
// 5. eventos.js: el PATCH re-valida el choque de lugar/hora (no solo el POST).
// ------------------------------------------------------------
test('PATCH /api/eventos/:id: mover un evento a un horario/lugar ya ocupado responde 409', async () => {
  let res = await fetch(base + '/api/eventos', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ grupo_id: SEM.grupoId, titulo: 'Culto A', fecha: '2026-09-01', hora_inicio: '19:00', hora_fin: '20:00', lugar: 'Salon' })
  });
  assert.equal(res.status, 200);

  res = await fetch(base + '/api/eventos', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ grupo_id: SEM.grupoId, titulo: 'Culto B', fecha: '2026-09-01', hora_inicio: '21:00', hora_fin: '22:00', lugar: 'Salon' })
  });
  assert.equal(res.status, 200, 'no deberia chocar: horarios distintos');
  const evB = await res.json();

  // Mover Culto B al mismo horario/lugar que Culto A -> debe chocar.
  res = await fetch(base + `/api/eventos/${evB.id}`, {
    method: 'PATCH', headers: H(SEM.pastor),
    body: JSON.stringify({ hora_inicio: '19:30', hora_fin: '20:30' })
  });
  assert.equal(res.status, 409);

  // El evento B no debe haber quedado modificado.
  const row = db.prepare('SELECT hora_inicio, hora_fin FROM evento WHERE id = ?').get(evB.id);
  assert.equal(row.hora_inicio, '21:00');
  assert.equal(row.hora_fin, '22:00');
});
