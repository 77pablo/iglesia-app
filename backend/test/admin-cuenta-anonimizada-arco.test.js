// ============================================================
//  Una cuenta eliminada por su propio titular (ARCO, ver cuenta.js POST
//  /cuenta/eliminar) NO la puede "resucitar" el pastor.
//
//  La fila no se borra: se anonimiza (nombre = 'Usuario eliminado', usuario =
//  'eliminado_<id>', activo = 0). Pero seguia apareciendo en el panel del
//  pastor con sus botones operativos, y nada en el servidor distinguia esa
//  fila de una cuenta normal desactivada. El pastor podia reactivarla,
//  ponerle su nombre real de vuelta, marcarla pastor, resetearle la clave o
//  darle un rol nuevo -- deshaciendo una decision que la persona tomo
//  ejerciendo un derecho.
//
//  El candado NO se basa en el patron 'eliminado_%' del campo usuario (ese
//  campo se valida sin restriccion de formato: una persona real podria
//  llamarse asi). Se basa en la columna explicita persona.anonimizada_en,
//  que cuenta.js rellena dentro de la MISMA transaccion en que anonimiza.
// ============================================================
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

beforeEach(() => {
  reiniciar(db);
  db.exec('DELETE FROM auditoria');
  SEM = sembrarMinimo(db);
});

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

// Hace que miembro1 ejerza su derecho ARCO de verdad (mismo camino que un
// usuario real), en vez de fabricar el estado a mano: asi las pruebas de
// abajo corren contra una cuenta REALMENTE anonimizada por cuenta.js.
async function eliminarCuentaDe(persona) {
  const res = await fetch(base + '/api/cuenta/eliminar', { method: 'POST', headers: H(persona) });
  assert.equal(res.status, 200, 'la eliminacion ARCO en si misma debe funcionar');
}

const patch = (id, body) => fetch(base + `/api/admin/usuarios/${id}`, {
  method: 'PATCH', headers: H(SEM.pastor), body: JSON.stringify(body)
});
const resetear = id => fetch(base + `/api/admin/usuarios/${id}/clave`, { method: 'POST', headers: H(SEM.pastor) });
const asignarRol = (id, grupo_id, rol) => fetch(base + `/api/admin/usuarios/${id}/rol`, {
  method: 'POST', headers: H(SEM.pastor), body: JSON.stringify({ grupo_id, rol })
});

const fila = id => db.prepare('SELECT * FROM persona WHERE id = ?').get(id);

// ------------------------------------------------------------
// El candado real: cada accion de escritura del panel del pastor
// ------------------------------------------------------------

test('el pastor NO puede reactivar una cuenta que su titular eliminó', async () => {
  await eliminarCuentaDe(SEM.miembro1);
  const res = await patch(SEM.miembro1.id, { activo: true });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /eliminó su propia cuenta/);
  assert.equal(fila(SEM.miembro1.id).activo, 0, 'sigue desactivada');
});

test('el pastor NO puede devolverle su nombre real', async () => {
  await eliminarCuentaDe(SEM.miembro1);
  const res = await patch(SEM.miembro1.id, { nombre: 'Miembro Uno' });
  assert.equal(res.status, 403);
  assert.equal(fila(SEM.miembro1.id).nombre, 'Usuario eliminado');
});

test('el pastor NO puede marcarla pastor', async () => {
  await eliminarCuentaDe(SEM.miembro1);
  const res = await patch(SEM.miembro1.id, { es_pastor: true });
  assert.equal(res.status, 403);
  assert.equal(fila(SEM.miembro1.id).es_pastor, 0);
});

test('el pastor NO puede restablecerle la contraseña', async () => {
  await eliminarCuentaDe(SEM.miembro1);
  const hashAntes = fila(SEM.miembro1.id).password_hash;
  const res = await resetear(SEM.miembro1.id);
  assert.equal(res.status, 403);
  assert.equal(fila(SEM.miembro1.id).password_hash, hashAntes, 'la clave muerta que dejo cuenta.js no cambia');
  assert.equal(fila(SEM.miembro1.id).debe_cambiar_pass, 0);
});

test('el pastor NO puede asignarle un rol nuevo', async () => {
  await eliminarCuentaDe(SEM.miembro1);
  const res = await asignarRol(SEM.miembro1.id, SEM.grupoId, 'musico');
  assert.equal(res.status, 403);
  const tiene = db.prepare('SELECT 1 FROM pertenencia WHERE persona_id = ? AND rol = ?').get(SEM.miembro1.id, 'musico');
  assert.equal(tiene, undefined);
});

// ------------------------------------------------------------
// Control positivo: el arreglo no puede consistir en bloquear el boton
// entero para TODAS las cuentas inactivas -- solo para las anonimizadas.
// Esta es la mitad que se olvida, y sin ella el candado podria estar
// bloqueando a todo el mundo y las pruebas de arriba seguirian en verde.
// ------------------------------------------------------------

test('una cuenta normal desactivada por el pastor SI se puede reactivar', async () => {
  let res = await patch(SEM.miembro1.id, { activo: false });
  assert.equal(res.status, 200);
  assert.equal(fila(SEM.miembro1.id).activo, 0);

  res = await patch(SEM.miembro1.id, { activo: true });
  assert.equal(res.status, 200);
  assert.equal(fila(SEM.miembro1.id).activo, 1, 'una desactivacion normal SI es reversible');
});

test('una cuenta normal SI admite restablecer la clave y asignar un rol', async () => {
  const res1 = await resetear(SEM.miembro1.id);
  assert.equal(res1.status, 200);
  const res2 = await asignarRol(SEM.miembro1.id, SEM.grupoId, 'musico');
  assert.equal(res2.status, 200);
});

// La ruta DELETE /admin/rol sigue SIN guardia de anonimizada a proposito (ver
// el comentario en admin.js): borrar un rol solo quita datos. Pero desde la
// tanda D (5-ago) el escenario "rol residual" ya no puede existir: la
// anonimizacion (cuenta.js) se lleva las pertenencias en su transaccion, y
// asignar un rol nuevo a una cuenta anonimizada esta bloqueado con 403. Asi
// que el DELETE del pastor encuentra un 404 honesto — nada que borrar — y no
// un 403 que sugiera un bloqueo que no existe.
test('tras eliminar la cuenta no queda rol residual que quitar: el DELETE del pastor da 404, no 403', async () => {
  const pertenencia = db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)')
    .run(SEM.miembro1.id, SEM.grupoId, 'musico');
  await eliminarCuentaDe(SEM.miembro1);
  const quedan = db.prepare('SELECT COUNT(*) AS n FROM pertenencia WHERE persona_id = ?').get(SEM.miembro1.id).n;
  assert.equal(quedan, 0, 'la anonimizacion se llevo la pertenencia');
  const res = await fetch(base + `/api/admin/rol/${pertenencia.lastInsertRowid}`, { method: 'DELETE', headers: H(SEM.pastor) });
  assert.equal(res.status, 404);
});

// ------------------------------------------------------------
// GET /admin/datos: la vista recibe el dato del servidor, no lo adivina
// ------------------------------------------------------------

test('GET /api/admin/datos: solo la cuenta eliminada trae anonimizada:true', async () => {
  await eliminarCuentaDe(SEM.miembro1);
  const res = await fetch(base + '/api/admin/datos', { headers: H(SEM.pastor) });
  assert.equal(res.status, 200);
  const { usuarios } = await res.json();
  assert.equal(usuarios.find(u => u.id === SEM.miembro1.id).anonimizada, true);
  assert.equal(usuarios.find(u => u.id === SEM.miembro2.id).anonimizada, false);
  // No se filtra del listado: el pastor tiene que poder VERLA (ver el brief:
  // que desaparezca sin mas parece un fallo y alguien "lo arregla").
  assert.ok(usuarios.some(u => u.id === SEM.miembro1.id));
  // No se manda la fecha cruda, solo el booleano.
  assert.equal(usuarios.find(u => u.id === SEM.miembro1.id).anonimizada_en, undefined);
});

// Una persona real puede llamarse literalmente "eliminado_7": el candado NO
// se puede basar en el patron del campo 'usuario' (ver el guardia de arriba
// en admin.js / registro.js, que valida 'usuario' sin restriccion de formato).
test('una persona real llamada "eliminado_7" NO queda bloqueada', async () => {
  const id = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?, 'eliminado_7', 'Eliminado Siete Perez', 'x', 1)"
  ).run(SEM.iglesiaId).lastInsertRowid);
  const res = await patch(id, { activo: false });
  assert.equal(res.status, 200, 'el patron del nombre de usuario no debe bloquearla');
  assert.equal(fila(id).activo, 0);
});

// ------------------------------------------------------------
// La migracion: aditiva, y de UNA sola vez
// ------------------------------------------------------------

test('🔴 migrarAnonimizadaEn: llamarla otra vez (columna ya existe) no toca nada', async () => {
  const { migrarAnonimizadaEn } = await import('../src/db.js');
  // Una persona real que coincidiria con el patron de nombre de usuario, pero
  // SIGUE ACTIVA: si el backfill volviera a correr por error, la marcaria.
  const id = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?, 'eliminado_99', 'Real Activo', 'x', 1)"
  ).run(SEM.iglesiaId).lastInsertRowid);

  // Simula un arranque posterior contra la MISMA base (la columna ya existe
  // desde que se cargo db.js al inicio de la suite).
  migrarAnonimizadaEn();

  assert.equal(fila(id).anonimizada_en, null, 'un arranque posterior no puede marcar cuentas activas');
});

// 🔴 La prueba de arriba solo demuestra que la SEGUNDA llamada no hace nada.
// Sin esta, la suite pasaria igual si el backfill no exigiera las tres
// senales, o si no existiera: el dia del despliegue las cuentas YA
// anonimizadas antes de este cambio se quedarian sin la marca (visibles y
// tocables en el panel como si nada). Se monta una conexion propia con el
// esquema ANTERIOR a la columna (el que tendria una base real creada antes
// de este cambio).
test('🔴 migrarAnonimizadaEn, la PRIMERA vez, marca solo lo que junta las TRES señales', async () => {
  const { migrarAnonimizadaEn } = await import('../src/db.js');
  const archivo = path.join(mkdtempSync(path.join(tmpdir(), 'iglesia-migracion-anon-')), 'previa.db');
  const conexion = new DatabaseSync(archivo);
  conexion.exec(`
    CREATE TABLE iglesia (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, codigo_unico TEXT NOT NULL UNIQUE
    );
    CREATE TABLE persona (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      iglesia_id    INTEGER REFERENCES iglesia(id),
      usuario       TEXT NOT NULL,
      nombre        TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      activo        INTEGER NOT NULL DEFAULT 1
    );
  `);
  const igId = Number(conexion.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Vieja','VIEJAANON')"
  ).run().lastInsertRowid);
  const insertar = (usuario, nombre, activo) => Number(conexion.prepare(
    'INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,?)'
  ).run(igId, usuario, nombre, 'x', activo).lastInsertRowid);

  try {
    // Las tres señales juntas: SI es una cuenta anonimizada de verdad.
    const anonimizada = insertar('eliminado_5', 'Usuario eliminado', 0);
    // Persona real, llamada "eliminado_7" pero ACTIVA: no la tres señales.
    const realActiva = insertar('eliminado_7', 'Real Perez', 1);
    // Usuario y estado calzan, pero el NOMBRE es real: alguien podria haberse
    // desactivado por otro motivo con un usuario parecido; sin las 3 señales
    // a la vez esto se marcaria por error.
    const nombreReal = insertar('eliminado_9', 'Juan Perez', 0);

    migrarAnonimizadaEn(conexion);

    assert.ok(conexion.prepare('SELECT anonimizada_en FROM persona WHERE id = ?').get(anonimizada).anonimizada_en,
      'las tres señales juntas SI se marcan');
    assert.equal(conexion.prepare('SELECT anonimizada_en FROM persona WHERE id = ?').get(realActiva).anonimizada_en,
      null, 'una persona real activa NO se marca aunque su usuario calce el patron');
    assert.equal(conexion.prepare('SELECT anonimizada_en FROM persona WHERE id = ?').get(nombreReal).anonimizada_en,
      null, 'sin las tres señales a la vez no se marca');

    // Una fila insertada DESPUES de migrar nace sin marca (NULL por defecto).
    const despues = insertar('nueva', 'Persona Nueva', 1);
    assert.equal(conexion.prepare('SELECT anonimizada_en FROM persona WHERE id = ?').get(despues).anonimizada_en, null);
  } finally {
    conexion.close();
  }
});
