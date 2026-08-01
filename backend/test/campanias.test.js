// -----------------------------------------------------------------------------
//  Campanias de tesoreria.
//
//  Lo que sostiene todo lo demas: el total de una campania NO se guarda, se
//  CALCULA sumando los ingresos que llevan su campania_id. Con dos numeros que
//  mantener sincronizados (la barra y los libros) podian discrepar; con uno
//  derivado del otro, no pueden.
// -----------------------------------------------------------------------------
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { cargarDb } from './helpers.js';

let migrarCampaniaAMovimientos;

before(async () => {
  await cargarDb(); // efecto: fija DB_PATH a un temporal ANTES de cargar db.js
  ({ migrarCampaniaAMovimientos } = await import('../src/db.js'));
});

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
