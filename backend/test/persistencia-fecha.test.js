// ============================================================
//  La clave del aviso diario cuenta DIAS LOCALES, no dias UTC.
//
//  avisarSiMal gasta una clave por dia ('persistencia:mal:YYYY-MM-DD') para no
//  repetir el aviso. Si ese YYYY-MM-DD se saca con toISOString(), es el dia en
//  UTC, y Chile va cuatro horas por detras: a las 20:00 locales ya cambio el dia
//  en UTC. Consecuencia: un corte que empieza a las 19:00 y sigue a las 21:00
//  gasta DOS claves en el mismo dia local -> dos avisos por lo mismo, que es
//  justo el ruido que hace que las alarmas se aprendan a ignorar.
//
//  TZ se fija ANTES de importar nada que use fechas (cada archivo de test corre
//  en su propio proceso). Sin esto, el test solo demostraria el fallo en
//  maquinas que ya esten en una zona al oeste de UTC, o solo a partir de las
//  20:00 de Chile -- que es como se escondio este mismo error dos veces antes.
// ============================================================
process.env.TZ = 'America/Santiago';

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';
import { avisarSiMal } from '../src/persistencia.js';
import { fechaLocal } from '../src/fechas.js';

let db, superId;
before(async () => {
  db = await cargarDb();
  superId = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (NULL,'super_tz','Super','x','super_admin',1)"
  ).run().lastInsertRowid);
});

const MAL = {
  modo: 'litestream', ok: false,
  bd: { estado: 'mal', motivo: 'sin_generaciones', ultimo: null, retraso_seg: null },
  uploads: { estado: 'ok', motivo: null, ultimo: null }
};

const clave = dia => db.prepare('SELECT clave FROM aviso_sistema WHERE clave = ?').get('persistencia:mal:' + dia);
const avisos = () => db.prepare("SELECT COUNT(*) n FROM notificacion WHERE persona_id = ? AND tipo = 'sistema'").get(superId).n;

test('fechaLocal sigue disponible desde el modulo compartido', () => {
  // 28 de julio, 22:32 en Santiago: en UTC ya es el 29.
  const nocheEnChile = new Date(2026, 6, 28, 22, 32, 0);
  assert.equal(nocheEnChile.toISOString().slice(0, 10), '2026-07-29',
    'comprobacion del propio test: a esa hora UTC ya va un dia por delante');
  assert.equal(fechaLocal(nocheEnChile), '2026-07-28');
});

test('la clave del aviso usa el dia LOCAL aunque en UTC ya sea el dia siguiente', t => {
  // 21:00 del 29 de julio en Santiago = 01:00 del 30 en UTC.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-07-30T01:00:00.000Z') });
  assert.equal(new Date().toISOString().slice(0, 10), '2026-07-30',
    'comprobacion del propio test: en UTC ese instante ya es dia 30');

  assert.equal(avisarSiMal(MAL), 1);
  assert.ok(clave('2026-07-29'), 'para quien vive en Chile ese aviso es del dia 29');
  assert.equal(clave('2026-07-30'), undefined, 'el dia 30 local todavia no ha empezado: su clave debe seguir libre');
});

test('un corte que cruza la medianoche UTC no duplica el aviso dentro del mismo dia local', t => {
  // Dos comprobaciones del MISMO dia local (31 de julio en Santiago) a caballo
  // de la medianoche UTC: 19:00 local = 23:00Z del 31, 21:00 local = 01:00Z del 1.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-07-31T23:00:00.000Z') });
  const antes = avisos();
  assert.equal(avisarSiMal(MAL), 1, 'el primer aviso del dia si se manda');

  t.mock.timers.setTime(Date.parse('2026-08-01T01:00:00.000Z'));
  assert.equal(avisarSiMal(MAL), 0, 'sigue siendo el mismo dia para quien lo lee: un solo aviso');
  assert.equal(avisos(), antes + 1);
});

test('al dia siguiente LOCAL si vuelve a avisar', t => {
  // 10:00 del 1 de agosto en Santiago = 14:00Z del mismo dia (aqui UTC y local
  // coinciden). Sirve de control: el arreglo no bloquea el aviso del dia nuevo.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-08-01T14:00:00.000Z') });
  const antes = avisos();
  assert.equal(avisarSiMal(MAL), 1);
  assert.equal(avisos(), antes + 1);
  assert.ok(clave('2026-08-01'));
});
