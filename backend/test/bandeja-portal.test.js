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
