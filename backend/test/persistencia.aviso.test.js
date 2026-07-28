// ============================================================
//  El aviso: se crea UNA vez al dia aunque el estado siga mal.
//  El registro de "ya avise" vive en la misma BD cuya perdida se intenta
//  prevenir, asi que si la BD es efimera se pierde en cada reinicio. Por eso
//  la clave es por DIA: en el peor caso, un aviso al dia, no uno por reinicio.
// ============================================================
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';
import { avisarSiMal } from '../src/persistencia.js';

let db, superId;
before(async () => {
  db = await cargarDb();
  const r = db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (NULL,'super','Super','x','super_admin',1)"
  ).run();
  superId = Number(r.lastInsertRowid);
});

const MAL = { modo: 'litestream', ok: false,
  bd: { estado: 'mal', motivo: 'retraso_alto', ultimo: null, retraso_seg: 1800 },
  uploads: { estado: 'ok', motivo: null, ultimo: null } };
const BIEN = { modo: 'litestream', ok: true,
  bd: { estado: 'ok', motivo: null, ultimo: null, retraso_seg: 1 },
  uploads: { estado: 'ok', motivo: null, ultimo: null } };
const GRIS = { modo: 'litestream', ok: false,
  bd: { estado: 'desconocido', motivo: 'tiempo_agotado', ultimo: null, retraso_seg: null },
  uploads: { estado: 'ok', motivo: null, ultimo: null } };

const avisos = () => db.prepare("SELECT COUNT(*) n FROM notificacion WHERE persona_id = ? AND tipo = 'sistema'").get(superId).n;

test('el estado malo crea el aviso al super-admin', () => {
  const antes = avisos();
  assert.equal(avisarSiMal(MAL, '2026-08-01'), 1);
  assert.equal(avisos(), antes + 1);
});

test('el mismo dia no vuelve a avisar aunque siga mal', () => {
  const antes = avisos();
  assert.equal(avisarSiMal(MAL, '2026-08-01'), 0);
  assert.equal(avisos(), antes, 'un aviso por dia, no uno por comprobacion');
});

test('caer, recuperarse y volver a caer el mismo dia tampoco duplica', () => {
  avisarSiMal(BIEN, '2026-08-01');
  const antes = avisos();
  assert.equal(avisarSiMal(MAL, '2026-08-01'), 0);
  assert.equal(avisos(), antes);
});

test('al dia siguiente si vuelve a avisar', () => {
  const antes = avisos();
  assert.equal(avisarSiMal(MAL, '2026-08-02'), 1);
  assert.equal(avisos(), antes + 1);
});

test('el estado bueno no avisa', () => {
  const antes = avisos();
  assert.equal(avisarSiMal(BIEN, '2026-08-03'), 0);
  assert.equal(avisos(), antes);
});

test('"no pude comprobarlo" NO avisa: un corte de red no es perdida de datos', () => {
  const antes = avisos();
  assert.equal(avisarSiMal(GRIS, '2026-08-04'), 0);
  assert.equal(avisos(), antes);
});

test('sin ningun super-admin activo no avisa y NO consume la clave del dia', () => {
  const dia = '2026-08-05';
  db.prepare('UPDATE persona SET activo = 0 WHERE id = ?').run(superId);
  try {
    assert.equal(avisarSiMal(MAL, dia), 0);
    const clave = db.prepare('SELECT * FROM aviso_sistema WHERE clave = ?').get('persistencia:mal:' + dia);
    assert.equal(clave, undefined, 'sin admins, la clave del dia debe seguir libre');
  } finally {
    db.prepare('UPDATE persona SET activo = 1 WHERE id = ?').run(superId);
  }

  // Reactivado el super-admin, el mismo dia si debe avisar: la clave no se gasto arriba.
  const antes = avisos();
  assert.equal(avisarSiMal(MAL, dia), 1);
  assert.equal(avisos(), antes + 1);
});

test('con dos super-admins activos, un aviso crea una notificacion por cada uno', () => {
  const r = db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (NULL,'super2','Super Dos','x','super_admin',1)"
  ).run();
  const super2Id = Number(r.lastInsertRowid);
  try {
    const avisos2 = () => db.prepare("SELECT COUNT(*) n FROM notificacion WHERE persona_id = ? AND tipo = 'sistema'").get(super2Id).n;
    const antes1 = avisos();
    const antes2 = avisos2();
    assert.equal(avisarSiMal(MAL, '2026-08-06'), 2);
    assert.equal(avisos(), antes1 + 1);
    assert.equal(avisos2(), antes2 + 1);
  } finally {
    // Primero las notificaciones que le llegaron (FK persona_id NOT NULL), luego la persona.
    db.prepare('DELETE FROM notificacion WHERE persona_id = ?').run(super2Id);
    db.prepare('DELETE FROM persona WHERE id = ?').run(super2Id);
  }
});
