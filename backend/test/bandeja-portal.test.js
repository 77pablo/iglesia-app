// ============================================================
//  La bandeja de mensajes del portal publico.
//  contacto_publico se escribia y NO la leia nadie: cero SELECT en todo el
//  proyecto fuera de los tests. Aqui se cubre la columna estado (con su
//  migracion de una sola vez), el listado de solo-pastor y el marcar atendido.
//  Ver spec: docs/superpowers/specs/2026-07-31-bandeja-portal-publico-design.md
// ============================================================
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
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

// reiniciar() NO limpia contacto_publico (ver helpers.js:23-28), asi que se
// borra a mano: si no, los mensajes de un test se cuelan en el siguiente.
beforeEach(() => {
  reiniciar(db);
  db.exec('DELETE FROM contacto_publico');
  SEM = sembrarMinimo(db);
});

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

// Inserta un mensaje directo en la BD. `estado` a null = deja el DEFAULT.
function mensaje(texto, iglesiaId = SEM.iglesiaId, estado = null) {
  const id = Number(db.prepare(
    'INSERT INTO contacto_publico (iglesia_id, nombre, mensaje) VALUES (?,?,?)'
  ).run(iglesiaId, 'Visitante ' + texto, texto).lastInsertRowid);
  if (estado) db.prepare('UPDATE contacto_publico SET estado = ? WHERE id = ?').run(estado, id);
  return id;
}

test('la columna estado existe y un mensaje nuevo nace "nuevo"', () => {
  const cols = db.prepare('PRAGMA table_info(contacto_publico)').all().map(c => c.name);
  assert.ok(cols.includes('estado'), 'falta la columna estado');

  const id = mensaje('Quiero visitarlos');
  assert.equal(db.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(id).estado, 'nuevo');
});

test('un mensaje que entra por el formulario publico tambien nace "nuevo"', async () => {
  const ig = db.prepare('SELECT codigo_unico FROM iglesia WHERE id = ?').get(SEM.iglesiaId);
  const res = await fetch(base + '/api/publico/' + ig.codigo_unico + '/contacto', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Maria', mensaje: 'Hola' })
  });
  assert.equal(res.status, 200);
  const fila = db.prepare("SELECT estado FROM contacto_publico WHERE nombre = 'Maria'").get();
  assert.equal(fila.estado, 'nuevo', 'el DEFAULT de la columna manda sobre la migracion de una sola vez');
});

test('🔴 la migracion es de UNA sola vez: llamarla otra vez no toca nada', async () => {
  const { migrarEstadoContactoPublico } = await import('../src/db.js');
  const nuevoId = mensaje('Recien llegado');
  const atendidoId = mensaje('Ya resuelto', SEM.iglesiaId, 'atendido');

  // Simula un segundo arranque del servidor contra la MISMA base de datos.
  migrarEstadoContactoPublico();

  assert.equal(db.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(nuevoId).estado,
    'nuevo', 'un arranque posterior NO puede mandar los mensajes nuevos a "previo"');
  assert.equal(db.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(atendidoId).estado,
    'atendido', 'ni deshacer lo que el pastor ya atendio');
});

// 🔴 La prueba de arriba solo demuestra que la SEGUNDA llamada no hace nada.
// Sin esta, la suite pasaria igual si el UPDATE de la migracion dijera
// SET estado = 'atendido', o si la migracion no existiera: el dia del
// despliegue el pastor abriria la bandeja y veria el muro de meses que todo
// este diseno existe para evitar, sin ningun error que lo avisara antes.
// Se monta una conexion propia con el esquema ANTERIOR a la columna 'estado'
// (el que tendria una base real creada antes de que existiera la bandeja).
test('🔴 la migracion, la PRIMERA vez, manda a "previo" lo que ya estaba', async () => {
  const { migrarEstadoContactoPublico } = await import('../src/db.js');
  const archivo = path.join(mkdtempSync(path.join(tmpdir(), 'iglesia-migracion-')), 'previa.db');
  const conexion = new DatabaseSync(archivo);
  conexion.exec(`
    CREATE TABLE iglesia (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, codigo_unico TEXT NOT NULL UNIQUE
    );
    CREATE TABLE contacto_publico (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
      nombre      TEXT NOT NULL,
      mensaje     TEXT,
      creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const igId = Number(conexion.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Vieja','VIEJAMIG')"
  ).run().lastInsertRowid);
  const insertar = nombre => Number(conexion.prepare(
    'INSERT INTO contacto_publico (iglesia_id, nombre, mensaje) VALUES (?,?,?)'
  ).run(igId, nombre, 'hola').lastInsertRowid);

  try {
    const antes1 = insertar('Antes 1');
    const antes2 = insertar('Antes 2');

    migrarEstadoContactoPublico(conexion);

    assert.equal(conexion.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(antes1).estado,
      'previo', 'lo que ya estaba guardado tiene que nacer "previo", no "nuevo" ni "atendido"');
    assert.equal(conexion.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(antes2).estado,
      'previo');

    const despues = insertar('Llega despues de migrar');
    assert.equal(conexion.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(despues).estado,
      'nuevo', 'una fila insertada DESPUES de migrar nace "nuevo" por el DEFAULT de la columna, no "previo"');
  } finally {
    // Fuera de un try/finally, una aserción que falla deja la conexión (y su
    // carpeta en tmpdir()) sin cerrar: solo basura de test, pero evitable.
    conexion.close();
  }
});

// ---------- La bandeja ----------

test('el pastor ve los mensajes de SU iglesia y no los de otra', async () => {
  const otraIg = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRABAND')").run().lastInsertRowid);
  mensaje('De mi iglesia');
  mensaje('De la otra', otraIg);

  const res = await fetch(base + '/api/publico/mensajes', { headers: H(SEM.pastor) });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].mensaje, 'De mi iglesia');
});

test('un lider que no es pastor recibe 403, y el 403 no filtra nada del contenido', async () => {
  mensaje('Algo que el lider no deberia poder leer');
  const res = await fetch(base + '/api/publico/mensajes', { headers: H(SEM.lider) });
  assert.equal(res.status, 403);
  const texto = await res.text();
  assert.doesNotMatch(texto, /Algo que el lider no deberia poder leer/,
    'un 403 nunca deberia traer de vuelta el mensaje que bloqueo');
});

test('la bandeja NO trae los "previo", pero si dice cuantos hay', async () => {
  mensaje('Reciente');
  mensaje('Viejo 1', SEM.iglesiaId, 'previo');
  mensaje('Viejo 2', SEM.iglesiaId, 'previo');

  const d = await (await fetch(base + '/api/publico/mensajes', { headers: H(SEM.pastor) })).json();
  assert.equal(d.items.length, 1, 'los previo no pueden aparecer en la bandeja de trabajo');
  assert.equal(d.items[0].mensaje, 'Reciente');
  assert.equal(d.previos, 2, 'pero el pastor tiene que saber cuantos hay esperando');
});

test('?previos=1 trae los "previo" y nada mas', async () => {
  mensaje('Reciente');
  mensaje('Viejo', SEM.iglesiaId, 'previo');

  const d = await (await fetch(base + '/api/publico/mensajes?previos=1', { headers: H(SEM.pastor) })).json();
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].mensaje, 'Viejo');
  assert.equal(d.previos, 0, 'ya se estan mostrando: no hay un contador aparte que pintar');
});

test('la bandeja pagina de 50 en 50 y avisa que hay mas', async () => {
  for (let i = 0; i < 51; i++) mensaje('Mensaje ' + i);

  const p1 = await (await fetch(base + '/api/publico/mensajes', { headers: H(SEM.pastor) })).json();
  assert.equal(p1.items.length, 50);
  assert.equal(p1.hayMas, true);

  const p2 = await (await fetch(base + '/api/publico/mensajes?offset=50', { headers: H(SEM.pastor) })).json();
  assert.equal(p2.items.length, 1);
  assert.equal(p2.hayMas, false);
});

// ---------- Marcar atendido ----------

const atender = (persona, id, iglesiaId) => fetch(base + '/api/publico/mensajes/' + id + '/atender', {
  method: 'PATCH', headers: H(persona, iglesiaId)
});

test('el pastor marca un mensaje como atendido y baja en el orden', async () => {
  const viejo = mensaje('Primero');
  const nuevo = mensaje('Segundo');

  const res = await atender(SEM.pastor, viejo);
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(viejo).estado, 'atendido');

  const d = await (await fetch(base + '/api/publico/mensajes', { headers: H(SEM.pastor) })).json();
  assert.equal(d.items[0].id, nuevo, 'lo que falta por atender va primero');
  assert.equal(d.items[1].id, viejo);
});

test('marcar atendido un "previo" lo saca de la seccion plegada y baja su numero', async () => {
  const previo = mensaje('De hace meses', SEM.iglesiaId, 'previo');

  await atender(SEM.pastor, previo);

  const d = await (await fetch(base + '/api/publico/mensajes', { headers: H(SEM.pastor) })).json();
  assert.equal(d.previos, 0, 'ya no es un mensaje que la app escondio: es uno que el pastor resolvio');
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].estado, 'atendido');
});

test('el pastor de OTRA iglesia recibe 404 y el mensaje no cambia', async () => {
  const otraIg = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRAPATCH')").run().lastInsertRowid);
  const pastor2 = { id: Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,'p2','Pastor Dos','x',1,1)"
  ).run(otraIg).lastInsertRowid) };
  const mio = mensaje('Mio');

  const res = await atender(pastor2, mio, otraIg);
  assert.equal(res.status, 404, 'un 403 confirmaria que ese id existe en alguna parte');
  assert.equal(db.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(mio).estado,
    'nuevo', 'que no cambie es parte de la prueba, no solo el codigo de error');
});

test('un lider que no es pastor recibe 403 al marcar atendido', async () => {
  const id = mensaje('Algo');
  const res = await atender(SEM.lider, id);
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(id).estado, 'nuevo');
});

// ---------- Escapado en la pantalla ----------

test('la bandeja escapa el nombre y el mensaje del visitante', () => {
  const src = readFileSync(new URL('../../web/app.js', import.meta.url), 'utf8');
  const i = src.indexOf('function filaMensajePortal');
  assert.ok(i > 0, 'falta filaMensajePortal en web/app.js');
  // Se mira solo el cuerpo de esa funcion, no el archivo entero.
  const cuerpo = src.slice(i, src.indexOf('\n}', i));
  assert.match(cuerpo, /escHtml\(m\.nombre\)/, 'el nombre lo escribe un desconocido de internet');
  assert.match(cuerpo, /escHtml\(m\.mensaje\)/, 'el mensaje tambien');
  assert.doesNotMatch(cuerpo, /\$\{m\.nombre\}/, 'nunca el nombre crudo');
  assert.doesNotMatch(cuerpo, /\$\{m\.mensaje\}/, 'nunca el mensaje crudo');
});

// 🔴 De esta linea depende que la notificacion 📬 del portal se pueda pulsar:
// sin el mapeo 'contacto_publico' -> 'mensajes_portal', _destinoNotif()
// devuelve '' y abrirNotif() no navega a ningun lado (es el unico camino por
// el que el pastor llega de verdad a la bandeja desde el aviso).
test('_destinoNotif manda "contacto_publico" a la bandeja del portal', () => {
  const src = readFileSync(new URL('../../web/app.js', import.meta.url), 'utf8');
  const i = src.indexOf('function _destinoNotif');
  assert.ok(i > 0, 'falta _destinoNotif en web/app.js');
  const cuerpo = src.slice(i, src.indexOf('\n}', i));
  assert.match(cuerpo, /contacto_publico\s*:\s*'mensajes_portal'/,
    'sin este mapeo la notificacion del portal no se puede pulsar');
});

// ---------- Tanda E: borrar un mensaje ----------
// Spec: docs/superpowers/specs/2026-08-06-bandeja-borrar-y-bloque-design.md

const borrar = (persona, id, iglesiaId) => fetch(base + '/api/publico/mensajes/' + id, {
  method: 'DELETE', headers: H(persona, iglesiaId)
});

test('el pastor borra un mensaje: la fila desaparece y queda apunte con el nombre', async () => {
  const id = mensaje('Quiero saber los horarios');

  const res = await borrar(SEM.pastor, id);
  assert.equal(res.status, 200);

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contacto_publico WHERE id = ?').get(id).n,
    0, 'la fila ya no esta');
  const apunte = db.prepare(
    "SELECT * FROM auditoria WHERE accion = 'borrar_mensaje_portal'").all();
  assert.equal(apunte.length, 1, 'la unica destruccion sin vuelta de la bandeja deja rastro');
  assert.ok(apunte[0].detalle.includes('Visitante Quiero saber los horarios'),
    'el apunte dice de quien era el mensaje que ya no se puede leer');
});

test('borrar vale para cualquier estado: tambien un atendido y un previo', async () => {
  const atendido = mensaje('Resuelto', SEM.iglesiaId, 'atendido');
  const previo = mensaje('De hace meses', SEM.iglesiaId, 'previo');
  assert.equal((await borrar(SEM.pastor, atendido)).status, 200);
  assert.equal((await borrar(SEM.pastor, previo)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contacto_publico').get().n, 0);
});

test('el pastor de OTRA iglesia recibe 404 al borrar y la fila sigue', async () => {
  const otraIg = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRADEL')").run().lastInsertRowid);
  const pastor2 = { id: Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,'p2d','Pastor Dos','x',1,1)"
  ).run(otraIg).lastInsertRowid) };
  const mio = mensaje('Mio');

  const res = await borrar(pastor2, mio, otraIg);
  assert.equal(res.status, 404, 'un 403 confirmaria que ese id existe en alguna parte');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contacto_publico WHERE id = ?').get(mio).n,
    1, 'que la fila siga es parte de la prueba, no solo el codigo de error');
});

test('un miembro sin rol de pastor no puede borrar: 403 y la fila sigue', async () => {
  const id = mensaje('Hola');
  const res = await borrar(SEM.miembro1, id);
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contacto_publico WHERE id = ?').get(id).n, 1);
});
