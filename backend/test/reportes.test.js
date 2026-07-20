// ============================================================
//  Reportes y estadisticas del pastor — pruebas
//  Cubre: agregaciones correctas (asistencia/tesoreria/crecimiento)
//  con datos sembrados, acceso exclusivo del pastor (feligres -> 403),
//  aislamiento por iglesia_id y exportacion a CSV.
// ============================================================
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, srv, base, signToken;

before(async () => {
  db = await cargarDb();
  ({ signToken } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));
beforeEach(() => { reiniciar(db); });

const H = (personaId, iglesiaId) => ({
  Authorization: 'Bearer ' + signToken({ id: personaId, iglesia_id: iglesiaId })
});

// Crea un evento con fecha explicita en la iglesia dada.
function crearEvento(iglesiaId, grupoId, titulo, fecha) {
  const r = db.prepare(
    "INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, estado) VALUES (?,?,?,?, 'aprobado')"
  ).run(iglesiaId, grupoId, titulo, fecha);
  return Number(r.lastInsertRowid);
}
function marcarAsistencia(eventoId, personaId) {
  db.prepare('INSERT INTO asistencia (evento_id, persona_id) VALUES (?,?)').run(eventoId, personaId);
}
function crearMovimiento(iglesiaId, tipo, monto, fecha) {
  db.prepare('INSERT INTO movimiento (iglesia_id, tipo, monto, fecha) VALUES (?,?,?,?)')
    .run(iglesiaId, tipo, monto, fecha);
}

test('GET /api/reportes/asistencia: agrega correctamente por mes y por grupo', async () => {
  const SEM = sembrarMinimo(db);
  const e1 = crearEvento(SEM.iglesiaId, SEM.grupoId, 'Reunion Jovenes Enero', '2026-01-05');
  const e2 = crearEvento(SEM.iglesiaId, SEM.grupoId, 'Reunion Jovenes Enero 2', '2026-01-12');
  const e3 = crearEvento(SEM.iglesiaId, null, 'Culto general Febrero', '2026-02-02');
  marcarAsistencia(e1, SEM.miembro1.id);
  marcarAsistencia(e1, SEM.miembro2.id);
  marcarAsistencia(e2, SEM.miembro1.id);
  marcarAsistencia(e3, SEM.miembro1.id);
  marcarAsistencia(e3, SEM.miembro2.id);
  marcarAsistencia(e3, SEM.lider.id);

  const res = await fetch(base + '/api/reportes/asistencia', { headers: H(SEM.pastor.id, SEM.iglesiaId) });
  assert.equal(res.status, 200);
  const d = await res.json();

  const enero = d.mensual.find(m => m.mes === '2026-01');
  const febrero = d.mensual.find(m => m.mes === '2026-02');
  assert.equal(enero.total, 3);   // e1 (2) + e2 (1)
  assert.equal(febrero.total, 3); // e3 (3)

  const eneroJovenes = d.porGrupo.find(g => g.mes === '2026-01' && g.grupo === 'Jovenes');
  assert.equal(eneroJovenes.total, 3);
  const febreroGeneral = d.porGrupo.find(g => g.mes === '2026-02' && g.grupo === 'General');
  assert.equal(febreroGeneral.total, 3);
});

test('GET /api/reportes/tesoreria: ingresos/gastos por mes y saldo correctos', async () => {
  const SEM = sembrarMinimo(db);
  crearMovimiento(SEM.iglesiaId, 'ingreso', 1000, '2026-01-10');
  crearMovimiento(SEM.iglesiaId, 'ingreso', 500, '2026-01-20');
  crearMovimiento(SEM.iglesiaId, 'gasto', 300, '2026-01-25');
  crearMovimiento(SEM.iglesiaId, 'ingreso', 200, '2026-02-01');
  crearMovimiento(SEM.iglesiaId, 'gasto', 900, '2026-02-05');

  const res = await fetch(base + '/api/reportes/tesoreria', { headers: H(SEM.pastor.id, SEM.iglesiaId) });
  assert.equal(res.status, 200);
  const d = await res.json();

  const enero = d.mensual.find(m => m.mes === '2026-01');
  const febrero = d.mensual.find(m => m.mes === '2026-02');
  assert.equal(enero.ingresos, 1500);
  assert.equal(enero.gastos, 300);
  assert.equal(enero.saldo, 1200);
  assert.equal(febrero.ingresos, 200);
  assert.equal(febrero.gastos, 900);
  assert.equal(febrero.saldo, -700);
  assert.equal(d.saldoTotal, 500); // 1200 + (-700)
});

test('GET /api/reportes/crecimiento: altas por mes y total de miembros activos', async () => {
  const SEM = sembrarMinimo(db);
  // sembrarMinimo crea 5 personas "ahora"; les fijamos fechas de alta especificas.
  db.prepare("UPDATE persona SET creada_en = '2026-01-03 10:00:00' WHERE id = ?").run(SEM.pastor.id);
  db.prepare("UPDATE persona SET creada_en = '2026-01-15 10:00:00' WHERE id = ?").run(SEM.lider.id);
  db.prepare("UPDATE persona SET creada_en = '2026-02-01 10:00:00' WHERE id = ?").run(SEM.miembro1.id);
  db.prepare("UPDATE persona SET creada_en = '2026-02-20 10:00:00' WHERE id = ?").run(SEM.miembro2.id);
  db.prepare("UPDATE persona SET creada_en = '2026-02-20 10:00:00' WHERE id = ?").run(SEM.ajeno.id);
  // Un miembro inactivo (dado de baja) sigue contando como "alta" historica pero no como activo.
  db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo, creada_en) VALUES (?,?,?,?,0,'2026-01-20 10:00:00')"
  ).run(SEM.iglesiaId, 'inactivo', 'Inactivo', 'x');

  const res = await fetch(base + '/api/reportes/crecimiento', { headers: H(SEM.pastor.id, SEM.iglesiaId) });
  assert.equal(res.status, 200);
  const d = await res.json();

  const enero = d.mensual.find(m => m.mes === '2026-01');
  const febrero = d.mensual.find(m => m.mes === '2026-02');
  assert.equal(enero.altas, 3);   // pastor, lider, inactivo
  assert.equal(febrero.altas, 3); // miembro1, miembro2, ajeno
  assert.equal(d.totalActivos, 5); // los 5 sembrados activos (el inactivo no cuenta)
});

test('solo el pastor accede a los reportes: feligres -> 403', async () => {
  const SEM = sembrarMinimo(db);
  for (const ruta of ['/api/reportes/asistencia', '/api/reportes/tesoreria', '/api/reportes/crecimiento', '/api/reportes/export.csv?tipo=asistencia']) {
    const res = await fetch(base + ruta, { headers: H(SEM.miembro1.id, SEM.iglesiaId) });
    assert.equal(res.status, 403, ruta);
  }
});

test('solo el pastor accede a los reportes: lider de grupo (no pastor) -> 403', async () => {
  const SEM = sembrarMinimo(db);
  const res = await fetch(base + '/api/reportes/asistencia', { headers: H(SEM.lider.id, SEM.iglesiaId) });
  assert.equal(res.status, 403);
});

test('aislamiento por iglesia: los movimientos/asistencia de otra iglesia no se mezclan', async () => {
  const SEM = sembrarMinimo(db);
  crearMovimiento(SEM.iglesiaId, 'ingreso', 100, '2026-03-01');

  const ig2 = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA-REP')").run();
  const iglesia2Id = Number(ig2.lastInsertRowid);
  const p2 = db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,1,1)"
  ).run(iglesia2Id, 'pastor2', 'Pastor Dos', 'x');
  const pastor2Id = Number(p2.lastInsertRowid);
  crearMovimiento(iglesia2Id, 'ingreso', 99999, '2026-03-01');

  const res = await fetch(base + '/api/reportes/tesoreria', { headers: H(pastor2Id, iglesia2Id) });
  const d = await res.json();
  const marzo = d.mensual.find(m => m.mes === '2026-03');
  assert.equal(marzo.ingresos, 99999); // NO ve los 100 de la iglesia SEM

  const res2 = await fetch(base + '/api/reportes/tesoreria', { headers: H(SEM.pastor.id, SEM.iglesiaId) });
  const d2 = await res2.json();
  const marzo2 = d2.mensual.find(m => m.mes === '2026-03');
  assert.equal(marzo2.ingresos, 100); // NO ve los 99999 de la otra iglesia
});

test('GET /api/reportes/export.csv: exporta con BOM y encabezados; tipo invalido -> 400', async () => {
  const SEM = sembrarMinimo(db);
  crearMovimiento(SEM.iglesiaId, 'ingreso', 100, '2026-04-01');

  const res = await fetch(base + '/api/reportes/export.csv?tipo=tesoreria', { headers: H(SEM.pastor.id, SEM.iglesiaId) });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /reporte-tesoreria\.csv/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf[0], 0xEF); assert.equal(buf[1], 0xBB); assert.equal(buf[2], 0xBF); // BOM UTF-8
  const texto = buf.toString('utf8');
  assert.match(texto, /Mes,Ingresos,Gastos,Saldo/);
  assert.match(texto, /2026-04,100,0,100/);

  const malo = await fetch(base + '/api/reportes/export.csv?tipo=no-existe', { headers: H(SEM.pastor.id, SEM.iglesiaId) });
  assert.equal(malo.status, 400);
});
