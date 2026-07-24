import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrar, emitir, estaConectada } from '../src/sse.js';

function resFake() {
  return { escrito: [], terminada: false, write(s) { this.escrito.push(s); }, end() { this.terminada = true; } };
}

test('emitir escribe el evento SSE a las personas conectadas', () => {
  const a = resFake(), b = resFake();
  registrar(1, a);
  registrar(2, b);
  emitir([1, 2], 'mensaje', { hola: 'mundo' });
  const esperado = 'event: mensaje\ndata: {"hola":"mundo"}\n\n';
  assert.equal(a.escrito.at(-1), esperado);
  assert.equal(b.escrito.at(-1), esperado);
});

test('estaConectada refleja registro y baja', () => {
  const a = resFake();
  const baja = registrar(10, a);
  assert.equal(estaConectada(10), true);
  baja();
  assert.equal(estaConectada(10), false);
});

test('emitir ignora personas no conectadas sin error', () => {
  assert.doesNotThrow(() => emitir([999], 'mensaje', { x: 1 }));
});

// --- Fix: cap de conexiones simultaneas por persona ---
test('registrar: tope de 5 conexiones por persona; la 6a cierra la mas antigua', () => {
  const conexs = Array.from({ length: 6 }, () => resFake());
  const bajas = conexs.map(c => registrar(20, c));

  emitir([20], 'ping', { n: 1 });
  // Solo deben quedar 5 conexiones recibiendo el evento: la primera (mas antigua) fue cerrada.
  const recibieron = conexs.filter(c => c.escrito.length > 0);
  assert.equal(recibieron.length, 5, 'solo 5 conexiones siguen activas y reciben el evento');
  assert.equal(conexs[0].terminada, true, 'la conexion mas antigua se cerro (res.end())');
  assert.equal(conexs[0].escrito.length, 0, 'la conexion cerrada no recibe el evento');
  for (let i = 1; i < 6; i++) assert.equal(conexs[i].terminada, false);

  for (const baja of bajas) baja();
});

test('una persona con 2 conexiones recibe en ambas', () => {
  const a = resFake(), b = resFake();
  registrar(5, a); registrar(5, b);
  emitir([5], 'leido', { c: 1 });
  assert.equal(a.escrito.at(-1), b.escrito.at(-1));
  assert.match(a.escrito.at(-1), /event: leido/);
});
