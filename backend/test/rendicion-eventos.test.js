// ============================================================
//  Rendicion (Camino C): los gastos de eventos llegan al libro de la
//  tesorera CALCULADOS desde las hojas — sin copias que sincronizar.
//  Solo lo que pago la caja descuenta del saldo: lo demas fue voluntario
//  ("la iglesia no devuelve dinero", decision del dueño, 7-ago).
//  Spec: docs/superpowers/specs/2026-08-07-rendicion-eventos-design.md
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
beforeEach(() => {
  reiniciar(db);
  db.exec('DELETE FROM movimiento');
  db.exec('DELETE FROM evento_org_gasto');
  db.exec('DELETE FROM evento_org');
  SEM = sembrarMinimo(db);
});

const H = (p) => ({ 'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: SEM.iglesiaId }) });

function hoja({ titulo = 'Bautismos', fecha = null, iglesia = SEM.iglesiaId } = {}) {
  return Number(db.prepare('INSERT INTO evento_org (iglesia_id, titulo, fecha) VALUES (?,?,?)')
    .run(iglesia, titulo, fecha).lastInsertRowid);
}
function gasto(orgId, monto, fuente, pagadoPor = null) {
  return Number(db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto, fuente, pagado_por) VALUES (?,?,?,?,?)')
    .run(orgId, 'Compra', monto, fuente, pagadoPor).lastInsertRowid);
}
async function hoyLocal() {
  const { fechaLocal } = await import('../src/fechas.js');
  return fechaLocal();
}

// ---------- Tarea 1: el resumen dice la verdad completa ----------

test('el saldo resta SOLO los gastos de eventos que pago la caja; aporte y devuelve no tocan la caja', async () => {
  db.prepare("INSERT INTO movimiento (iglesia_id, tipo, monto) VALUES (?, 'ingreso', 100000)").run(SEM.iglesiaId);
  const h = hoja({});
  gasto(h, 12000, 'caja');
  gasto(h, 5000, 'aporte', SEM.miembro1.id);
  gasto(h, 3000, 'devuelve', SEM.miembro2.id);
  gasto(h, 1000, null);   // historico sin fuente: "no se sabe" — no descuenta

  const d = await (await fetch(base + '/api/tesoreria/resumen', { headers: H(SEM.pastor) })).json();
  assert.equal(d.saldo, 100000 - 12000,
    'la caja pago 12000 en el evento: el libro tiene que descontarlo; lo voluntario y lo no sabido, no');
});

test('gastosEventosMes cuenta el mes de la hoja, y gasMes (el libro) queda intacto', async () => {
  const hoy = await hoyLocal();
  db.prepare("INSERT INTO movimiento (iglesia_id, tipo, monto, categoria) VALUES (?, 'gasto', 7000, 'aseo')").run(SEM.iglesiaId);
  const hEsteMes = hoja({ fecha: hoy });
  gasto(hEsteMes, 12000, 'caja');
  gasto(hEsteMes, 5000, 'aporte');            // voluntario: no cuenta
  const hOtroMes = hoja({ titulo: 'Retiro', fecha: '2020-01-15' });
  gasto(hOtroMes, 99000, 'caja');             // otro mes: no cuenta en el mes

  const d = await (await fetch(base + '/api/tesoreria/resumen', { headers: H(SEM.pastor) })).json();
  assert.equal(d.gastosEventosMes, 12000);
  assert.equal(d.gasMes, 7000, 'el gasto del libro sigue siendo el gasto del libro');
});

test('una hoja sin fecha propia usa la fecha de su evento; sin ninguna, el mes local del creado_en', async () => {
  const hoy = await hoyLocal();
  const evId = Number(db.prepare(
    "INSERT INTO evento (iglesia_id, titulo, fecha, estado) VALUES (?, 'Culto', ?, 'aprobado')")
    .run(SEM.iglesiaId, hoy).lastInsertRowid);
  const hConEvento = Number(db.prepare('INSERT INTO evento_org (iglesia_id, evento_id) VALUES (?,?)')
    .run(SEM.iglesiaId, evId).lastInsertRowid);
  gasto(hConEvento, 4000, 'caja');
  const hSinNada = hoja({ titulo: 'Suelto' });   // sin fecha: cae al creado_en (ahora)
  gasto(hSinNada, 2500, 'caja');

  const d = await (await fetch(base + '/api/tesoreria/resumen', { headers: H(SEM.pastor) })).json();
  assert.equal(d.gastosEventosMes, 6500);
});

test('los gastos de eventos de OTRA iglesia no tocan ni el saldo ni el mes', async () => {
  const otraIg = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRAREND')").run().lastInsertRowid);
  const hAjena = hoja({ iglesia: otraIg });
  gasto(hAjena, 50000, 'caja');

  const d = await (await fetch(base + '/api/tesoreria/resumen', { headers: H(SEM.pastor) })).json();
  assert.equal(d.saldo, 0);
  assert.equal(d.gastosEventosMes, 0);
});
