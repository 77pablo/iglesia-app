import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, SEM, CONSENT_VERSION, tieneConsentimientoVigente, registrarConsentimiento;

let srv, base, signToken;
before(async () => {
  db = await cargarDb();
  ({ CONSENT_VERSION, tieneConsentimientoVigente, registrarConsentimiento } = await import('../src/consentimiento.js'));
  ({ signToken } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));

const H = (p) => ({ 'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: SEM.iglesiaId }) });

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

test('GET /api/consentimiento/estado: pendiente cuando no hay consentimiento', async () => {
  const res = await fetch(base + '/api/consentimiento/estado', { headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.vigente, false);
});

test('POST /api/consentimiento/aceptar: registra otorgado y luego estado=vigente', async () => {
  let res = await fetch(base + '/api/consentimiento/aceptar', { method: 'POST', headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  res = await fetch(base + '/api/consentimiento/estado', { headers: H(SEM.miembro1) });
  const j = await res.json();
  assert.equal(j.vigente, true);
  assert.equal(j.version, CONSENT_VERSION);
});

test('GET /api/me: consentimiento_pendiente refleja el estado', async () => {
  let res = await fetch(base + '/api/me', { headers: H(SEM.miembro1) });
  let j = await res.json();
  assert.equal(j.consentimiento_pendiente, true);
  await fetch(base + '/api/consentimiento/aceptar', { method: 'POST', headers: H(SEM.miembro1) });
  res = await fetch(base + '/api/me', { headers: H(SEM.miembro1) });
  j = await res.json();
  assert.equal(j.consentimiento_pendiente, false);
});
