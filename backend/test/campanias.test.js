// -----------------------------------------------------------------------------
//  Campanias de tesoreria.
//
//  Lo que sostiene todo lo demas: el total de una campania NO se guarda, se
//  CALCULA sumando los ingresos que llevan su campania_id. Con dos numeros que
//  mantener sincronizados (la barra y los libros) podian discrepar; con uno
//  derivado del otro, no pueden.
// -----------------------------------------------------------------------------
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let migrarCampaniaAMovimientos;
let dbDirecta, srv, base, signToken, SEM, tesorero;

before(async () => {
  dbDirecta = await cargarDb(); // efecto: fija DB_PATH a un temporal ANTES de cargar db.js
  ({ migrarCampaniaAMovimientos } = await import('../src/db.js'));
  ({ signToken } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(res => srv.once('listening', res));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(res => srv.close(res)));

// reiniciar() no toca 'campania' ni 'movimiento' (no estan en su lista de
// tablas): se limpian a mano, igual que contacto_publico en
// bandeja-portal.test.js, o las filas de un test se cuelan en el siguiente.
beforeEach(() => {
  reiniciar(dbDirecta);
  dbDirecta.exec('DELETE FROM movimiento');
  dbDirecta.exec('DELETE FROM campania');
  SEM = sembrarMinimo(dbDirecta);
  // sembrarMinimo mete a miembro1 en el grupo Jovenes con rol 'miembro'; para
  // estas pruebas necesita ser el tesorero (soloTesorero exige rol='tesorero'
  // en alguna pertenencia, sin atajo de pastor: ver esTesoreroEstricto).
  dbDirecta.prepare("UPDATE pertenencia SET rol = 'tesorero' WHERE persona_id = ? AND grupo_id = ?")
    .run(SEM.miembro1.id, SEM.grupoId);
  tesorero = SEM.miembro1;
});

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});
const get = async (ruta) => (await fetch(base + ruta, { headers: H(tesorero) })).json();
const post = (ruta, cuerpo) => fetch(base + ruta, { method: 'POST', headers: H(tesorero), body: JSON.stringify(cuerpo) });
const postComoPastor = (ruta, cuerpo) => fetch(base + ruta, { method: 'POST', headers: H(SEM.pastor), body: JSON.stringify(cuerpo) });
const patchRaw = (ruta, cuerpo) => fetch(base + ruta, { method: 'PATCH', headers: H(tesorero), body: JSON.stringify(cuerpo) });
const patch = async (ruta, cuerpo) => {
  const res = await patchRaw(ruta, cuerpo);
  const cuerpoRes = await res.json();
  assert.equal(res.status, 200, `PATCH ${ruta} fallo: ${JSON.stringify(cuerpoRes)}`);
  return cuerpoRes;
};
const patchComoPastor = (ruta, cuerpo) => fetch(base + ruta, { method: 'PATCH', headers: H(SEM.pastor), body: JSON.stringify(cuerpo) });
const delRaw = (ruta) => fetch(base + ruta, { method: 'DELETE', headers: H(tesorero) });
const del = async (ruta) => {
  const res = await delRaw(ruta);
  const cuerpoRes = await res.json();
  assert.equal(res.status, 200, `DELETE ${ruta} fallo: ${JSON.stringify(cuerpoRes)}`);
  return cuerpoRes;
};
const delComoPastor = (ruta) => fetch(base + ruta, { method: 'DELETE', headers: H(SEM.pastor) });

async function crearCampania({ nombre, meta }) {
  const res = await post('/api/tesoreria/campanias', { nombre, meta });
  assert.equal(res.status, 200, 'la campania de prueba no se pudo crear');
  const { id } = await res.json();
  return { campaniaId: id };
}

// Inserta un ingreso de campania DIRECTO en la BD, sin pasar por la ruta de
// aportar (que Task 3 todavia no existe): asi la prueba demuestra que el
// total se CALCULA desde los movimientos, no que lo escribio quien aporto.
function insertarIngresoDirecto({ campaniaId, monto, iglesiaId = SEM.iglesiaId }) {
  dbDirecta.prepare(
    `INSERT INTO movimiento (iglesia_id, tipo, categoria, monto, descripcion, creado_por, campania_id)
     VALUES (?, 'ingreso', NULL, ?, NULL, NULL, ?)`
  ).run(iglesiaId, monto, campaniaId);
}

// Inserta un movimiento SIN campania (campania_id NULL), como cualquier
// ingreso o gasto normal de la tesoreria: sirve para probar que la ruta de
// borrar aportes no lo puede alcanzar.
function crearMovimientoNormal({ tipo, monto, iglesiaId = SEM.iglesiaId }) {
  const info = dbDirecta.prepare(
    `INSERT INTO movimiento (iglesia_id, tipo, monto, descripcion, creado_por, campania_id)
     VALUES (?, ?, ?, NULL, NULL, NULL)`
  ).run(iglesiaId, tipo, monto);
  return Number(info.lastInsertRowid);
}

function crearCampaniaEnOtraIglesia({ nombre }) {
  const otraIg = Number(dbDirecta.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRACAMP')"
  ).run().lastInsertRowid);
  const campaniaId = Number(dbDirecta.prepare(
    'INSERT INTO campania (iglesia_id, nombre, meta, recaudado) VALUES (?,?,0,0)'
  ).run(otraIg, nombre).lastInsertRowid);
  return { campaniaId };
}

// Monta una conexion propia con el esquema ANTERIOR a la columna campania_id
// (el que tendria una base real creada antes de esta migracion).
//
// No se reusa la BD compartida de los demas tests del proyecto: db.js ya llamo
// a migrarCampaniaAMovimientos() UNA vez al cargarse (antes de que exista
// ninguna campania con saldo), asi que contra esa conexion la columna ya
// existe y la guarda vuelve la llamada un no-op: jamas se veria el relleno
// de verdad. Mismo patron que el tercer test de bandeja-portal.test.js.
function montarDbDePrueba() {
  const archivo = path.join(mkdtempSync(path.join(tmpdir(), 'iglesia-campanias-')), 'previa.db');
  const db = new DatabaseSync(archivo);
  db.exec(`
    CREATE TABLE iglesia (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, codigo_unico TEXT NOT NULL UNIQUE
    );
    CREATE TABLE movimiento (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
      tipo        TEXT NOT NULL,
      categoria   TEXT,
      monto       REAL NOT NULL,
      descripcion TEXT,
      fecha       TEXT NOT NULL DEFAULT (date('now','localtime')),
      creado_por  INTEGER
    );
    CREATE TABLE campania (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      iglesia_id INTEGER NOT NULL REFERENCES iglesia(id),
      nombre     TEXT NOT NULL,
      meta       REAL,
      recaudado  REAL NOT NULL DEFAULT 0
    );
  `);
  const iglesiaId = Number(db.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Test','CAMPTEST')"
  ).run().lastInsertRowid);
  return { db, iglesiaId };
}

test('la migracion crea el ingreso del saldo anterior UNA sola vez', async () => {
  const { db, iglesiaId } = montarDbDePrueba();
  try {
    // Una campania del mundo viejo: tiene recaudado pero ningun movimiento.
    db.prepare("INSERT INTO campania (iglesia_id, nombre, meta, recaudado) VALUES (?,'Techo',500000,50000)").run(iglesiaId);

    migrarCampaniaAMovimientos(db);
    const tras1 = db.prepare("SELECT COUNT(*) AS n FROM movimiento WHERE campania_id IS NOT NULL").get().n;
    assert.equal(tras1, 1, 'el saldo anterior tiene que convertirse en un ingreso, o esa plata desaparece de la barra');

    // La segunda llamada NO puede volver a insertarlo. Si el relleno quedara
    // FUERA de la guarda de existencia de la columna, correria en cada arranque
    // y el dinero de la campania se multiplicaria en cada reinicio.
    migrarCampaniaAMovimientos(db);
    const tras2 = db.prepare("SELECT COUNT(*) AS n FROM movimiento WHERE campania_id IS NOT NULL").get().n;
    assert.equal(tras2, 1, 'la migracion se ejecuto dos veces y duplico el dinero');
  } finally {
    db.close();
  }
});

test('el ingreso del saldo anterior se distingue de un aporte de verdad', async () => {
  const { db, iglesiaId } = montarDbDePrueba();
  try {
    db.prepare("INSERT INTO campania (iglesia_id, nombre, meta, recaudado) VALUES (?,'Techo',500000,50000)").run(iglesiaId);
    migrarCampaniaAMovimientos(db);
    const m = db.prepare("SELECT * FROM movimiento WHERE campania_id IS NOT NULL").get();

    assert.equal(m.tipo, 'ingreso');
    assert.equal(m.monto, 50000);
    // Su fecha sera la del dia de la migracion, no la del dinero real (esa fecha
    // no se guardo nunca). Por eso la descripcion tiene que decirlo: si no,
    // quien revise las cuentas ve plata de hace meses fechada hoy.
    assert.equal(m.descripcion, 'Saldo anterior de la campaña');
    assert.equal(m.creado_por, null, 'no lo registro ninguna persona');
  } finally {
    db.close();
  }
});

test('una campania sin saldo anterior no genera ningun ingreso', async () => {
  const { db, iglesiaId } = montarDbDePrueba();
  try {
    db.prepare("INSERT INTO campania (iglesia_id, nombre, meta, recaudado) VALUES (?,'Viaje',100000,0)").run(iglesiaId);
    migrarCampaniaAMovimientos(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM movimiento").get().n, 0,
      'una campania a cero no puede inventarse un ingreso de 0');
  } finally {
    db.close();
  }
});

// ---------- GET/POST /api/tesoreria/campanias ----------

test('el total de la campania sale de los movimientos, no de la columna recaudado', async () => {
  // Se inserta el ingreso A MANO, sin pasar por la ruta de aportar: asi se
  // demuestra que el total se CALCULA y no que lo escribio quien aporto.
  const { campaniaId } = await crearCampania({ nombre: 'Techo', meta: 500000 });
  insertarIngresoDirecto({ campaniaId, monto: 30000 });

  const camps = await get('/api/tesoreria/campanias');
  const c = camps.find(x => x.id === campaniaId);
  assert.equal(c.recaudado, 30000, 'el total no se esta calculando desde los movimientos');
  assert.equal(c.aportes.length, 1);
  assert.equal(c.aportes[0].monto, 30000);
});

test('la columna muerta recaudado NO es lo que se devuelve', async () => {
  // Se ensucia la columna a mano con un valor imposible. Si el codigo la
  // leyera, ese numero saldria por la respuesta; como el total se calcula
  // desde los movimientos (y no hay ninguno), tiene que salir 0.
  const { campaniaId } = await crearCampania({ nombre: 'Viaje', meta: 100000 });
  dbDirecta.prepare('UPDATE campania SET recaudado = 999999 WHERE id = ?').run(campaniaId);

  const c = (await get('/api/tesoreria/campanias')).find(x => x.id === campaniaId);
  assert.equal(c.recaudado, 0,
    'se esta devolviendo la columna recaudado en vez del total calculado: vuelven los dos numeros distintos');
});

test('una campania de OTRA iglesia no aparece', async () => {
  const { campaniaId } = crearCampaniaEnOtraIglesia({ nombre: 'Ajena' });
  const camps = await get('/api/tesoreria/campanias');
  assert.ok(!camps.some(c => c.id === campaniaId), 'se filtro una campania de otra iglesia');
});

test('el nombre de la campania tiene un tope', async () => {
  // Sin tope, un nombre de 50.000 caracteres entra en la base y luego rompe
  // cualquier pantalla que lo pinte.
  const res = await post('/api/tesoreria/campanias', { nombre: 'x'.repeat(101) });
  assert.equal(res.status, 400);
});

test('solo el tesorero crea campanias; el pastor observa', async () => {
  const res = await postComoPastor('/api/tesoreria/campanias', { nombre: 'Techo' });
  assert.equal(res.status, 403);
});

// ---------- El nombre de la campania en Movimientos ----------

test('un ingreso de campania dice de que campania es, sin copiar el nombre', async () => {
  const { campaniaId } = await crearCampania({ nombre: 'Techo' });
  insertarIngresoDirecto({ campaniaId, monto: 1000 });
  const movs = await get('/api/tesoreria/movimientos');
  const m = movs.items.find(x => x.campania_id === campaniaId);
  assert.equal(m.campania_nombre, 'Techo',
    'el listado no trae el nombre de la campania: la persona ve un ingreso suelto sin saber de que es');
});

// ---------- PATCH /api/tesoreria/campanias/:id/aportar y /cerrar ----------

test('un aporte aparece en los libros, no solo en la barra de la campania', async () => {
  // Esta es LA prueba de este trabajo. Sin ella volveriamos a tener plata que
  // sube en la campania y no existe en ningun libro.
  const { campaniaId } = await crearCampania({ nombre: 'Techo', meta: 500000 });
  await patch(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 50000 });

  const movs = await get('/api/tesoreria/movimientos');
  assert.ok(movs.items.some(m => m.monto === 50000 && m.tipo === 'ingreso'),
    'el aporte no aparece en Movimientos: la plata estaria solo en la barra');

  const trans = await get('/api/tesoreria/transparencia');
  assert.equal(trans.recaudado, 50000,
    'el aporte no cuenta en Transparencia: los libros y la campania dirian cosas distintas');
});

test('aportar a una campania CERRADA se rechaza en el servidor', async () => {
  // Esconder el boton no basta: la ruta se puede llamar directamente.
  const { campaniaId } = await crearCampania({ nombre: 'Techo' });
  await patch(`/api/tesoreria/campanias/${campaniaId}/cerrar`, {});
  const res = await patchRaw(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 1000 });
  assert.equal(res.status, 409);

  const camps = await get('/api/tesoreria/campanias');
  assert.equal(camps.find(c => c.id === campaniaId).recaudado, 0,
    'entro plata en una campania cerrada');
});

test('cerrar deja la campania consultable, no la borra', async () => {
  const { campaniaId } = await crearCampania({ nombre: 'Techo' });
  await patch(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 50000 });
  await patch(`/api/tesoreria/campanias/${campaniaId}/cerrar`, {});

  const c = (await get('/api/tesoreria/campanias')).find(x => x.id === campaniaId);
  assert.ok(c, 'la campania desaparecio al cerrarla');
  assert.ok(c.cerrada_en, 'no quedo constancia de cuando se cerro');
  assert.equal(c.recaudado, 50000, 'se perdio lo que se habia juntado');
});

test('no se puede aportar ni cerrar una campania de otra iglesia', async () => {
  const { campaniaId } = crearCampaniaEnOtraIglesia({ nombre: 'Ajena' });
  assert.equal((await patchRaw(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 1 })).status, 404);
  assert.equal((await patchRaw(`/api/tesoreria/campanias/${campaniaId}/cerrar`, {})).status, 404);
});

test('el pastor no puede aportar ni cerrar', async () => {
  const { campaniaId } = await crearCampania({ nombre: 'Techo' });
  assert.equal((await patchComoPastor(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 1 })).status, 403);
  assert.equal((await patchComoPastor(`/api/tesoreria/campanias/${campaniaId}/cerrar`, {})).status, 403);
});

// ---------- DELETE /api/tesoreria/campanias/:id/aportes/:movId ----------

test('borrar un aporte lo quita de la campania Y de los libros', async () => {
  const { campaniaId } = await crearCampania({ nombre: 'Techo', meta: 500000 });
  await patch(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 500000 });  // el error de tecleo
  const c = (await get('/api/tesoreria/campanias')).find(x => x.id === campaniaId);
  const aporteId = c.aportes[0].id;

  await del(`/api/tesoreria/campanias/${campaniaId}/aportes/${aporteId}`);

  const c2 = (await get('/api/tesoreria/campanias')).find(x => x.id === campaniaId);
  assert.equal(c2.recaudado, 0, 'el aporte sigue contando en la campania');
  const trans = await get('/api/tesoreria/transparencia');
  assert.equal(trans.recaudado, 0, 'el ingreso sigue en los libros: la correccion no sirvio de nada');
});

test('esta ruta NO puede borrar un movimiento normal', async () => {
  // El agujero que hay que cerrar: si alcanzara movimientos sin campania,
  // seria una forma de borrar la contabilidad entera de la iglesia.
  const { campaniaId } = await crearCampania({ nombre: 'Techo' });
  const movId = crearMovimientoNormal({ tipo: 'ingreso', monto: 90000 });

  const res = await delRaw(`/api/tesoreria/campanias/${campaniaId}/aportes/${movId}`);
  assert.equal(res.status, 404);

  const movs = await get('/api/tesoreria/movimientos');
  assert.ok(movs.items.some(m => m.id === movId), 'se borro un movimiento que no era un aporte');
});

test('no se puede borrar un aporte de otra campania ni de otra iglesia', async () => {
  const { campaniaId: a } = await crearCampania({ nombre: 'Techo' });
  const { campaniaId: b } = await crearCampania({ nombre: 'Viaje' });
  await patch(`/api/tesoreria/campanias/${a}/aportar`, { monto: 1000 });
  const aporteDeA = (await get('/api/tesoreria/campanias')).find(x => x.id === a).aportes[0].id;

  // Pidiendolo por la campania equivocada.
  assert.equal((await delRaw(`/api/tesoreria/campanias/${b}/aportes/${aporteDeA}`)).status, 404);

  const c = (await get('/api/tesoreria/campanias')).find(x => x.id === a);
  assert.equal(c.recaudado, 1000, 'se borro pidiendolo por otra campania');
});

test('el pastor no puede borrar un aporte', async () => {
  const { campaniaId } = await crearCampania({ nombre: 'Techo' });
  await patch(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 1000 });
  const aporteId = (await get('/api/tesoreria/campanias')).find(x => x.id === campaniaId).aportes[0].id;
  assert.equal((await delComoPastor(`/api/tesoreria/campanias/${campaniaId}/aportes/${aporteId}`)).status, 403);
});
