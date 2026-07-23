import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, SEM, CONSENT_VERSION, tieneConsentimientoVigente, registrarConsentimiento;

before(async () => {
  db = await cargarDb();
  ({ CONSENT_VERSION, tieneConsentimientoVigente, registrarConsentimiento } = await import('../src/consentimiento.js'));
});
beforeEach(() => { reiniciar(db); SEM = sembrarMinimo(db); });

test('sin filas: no hay consentimiento vigente', () => {
  assert.equal(tieneConsentimientoVigente(SEM.miembro1.id), false);
});

test('tras registrar otorgado con la version vigente: vigente=true', () => {
  registrarConsentimiento(SEM.miembro1.id, SEM.iglesiaId, 'otorgado');
  assert.equal(tieneConsentimientoVigente(SEM.miembro1.id), true);
  const fila = db.prepare('SELECT * FROM consentimiento WHERE persona_id = ?').get(SEM.miembro1.id);
  assert.equal(fila.accion, 'otorgado');
  assert.equal(fila.version, CONSENT_VERSION);
  assert.ok(fila.fecha);
});

test('la ultima accion manda: otorgado -> revocado => vigente=false', () => {
  registrarConsentimiento(SEM.miembro1.id, SEM.iglesiaId, 'otorgado');
  registrarConsentimiento(SEM.miembro1.id, SEM.iglesiaId, 'revocado');
  assert.equal(tieneConsentimientoVigente(SEM.miembro1.id), false);
});

test('una version distinta a la vigente no cuenta como vigente', () => {
  db.prepare("INSERT INTO consentimiento (iglesia_id, persona_id, tipo, version, accion, fecha) VALUES (?,?,?,?,?,datetime('now'))")
    .run(SEM.iglesiaId, SEM.miembro1.id, 'general', 'vieja-0.0', 'otorgado');
  assert.equal(tieneConsentimientoVigente(SEM.miembro1.id), false);
});
