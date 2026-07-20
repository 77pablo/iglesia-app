import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, sem, puedeIniciarChatCon, verificarToken, signToken;

before(async () => {
  db = await cargarDb();
  ({ puedeIniciarChatCon, verificarToken, signToken } = await import('../src/auth.js'));
});
beforeEach(() => { reiniciar(db); sem = sembrarMinimo(db); });

test('lider puede iniciar chat con cualquiera de su iglesia', () => {
  assert.equal(puedeIniciarChatCon(sem.lider.id, sem.ajeno.id), true);
  assert.equal(puedeIniciarChatCon(sem.lider.id, sem.miembro1.id), true);
});

test('feligres del grupo puede escribir a su lider y a otro miembro del grupo', () => {
  assert.equal(puedeIniciarChatCon(sem.miembro1.id, sem.lider.id), true);   // a su liderazgo
  assert.equal(puedeIniciarChatCon(sem.miembro1.id, sem.miembro2.id), true); // comparten grupo
});

test('feligres NO puede escribir a alguien con quien no comparte grupo ni es su lider', () => {
  assert.equal(puedeIniciarChatCon(sem.ajeno.id, sem.miembro1.id), false);
});

test('no se puede iniciar chat consigo mismo', () => {
  assert.equal(puedeIniciarChatCon(sem.lider.id, sem.lider.id), false);
});

test('verificarToken devuelve payload valido y null si es basura', () => {
  const t = signToken({ id: sem.lider.id, iglesia_id: sem.iglesiaId });
  assert.equal(verificarToken(t).persona_id, sem.lider.id);
  assert.equal(verificarToken('basura'), null);
});
