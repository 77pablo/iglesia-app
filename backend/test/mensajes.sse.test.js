import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrar, emitir, estaConectada } from '../src/sse.js';

function resFake() {
  return { escrito: [], write(s) { this.escrito.push(s); } };
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

test('una persona con 2 conexiones recibe en ambas', () => {
  const a = resFake(), b = resFake();
  registrar(5, a); registrar(5, b);
  emitir([5], 'leido', { c: 1 });
  assert.equal(a.escrito.at(-1), b.escrito.at(-1));
  assert.match(a.escrito.at(-1), /event: leido/);
});
