// ============================================================
//  La bandeja de mensajes del portal publico.
//  contacto_publico se escribia y NO la leia nadie: cero SELECT en todo el
//  proyecto fuera de los tests. Aqui se cubre la columna estado (con su
//  migracion de una sola vez), el listado de solo-pastor y el marcar atendido.
//  Ver spec: docs/superpowers/specs/2026-07-31-bandeja-portal-publico-design.md
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

test('un lider que no es pastor recibe 403', async () => {
  mensaje('Algo');
  const res = await fetch(base + '/api/publico/mensajes', { headers: H(SEM.lider) });
  assert.equal(res.status, 403);
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
