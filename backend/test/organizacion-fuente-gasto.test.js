// ============================================================
//  La fuente del gasto: la pago la caja de la iglesia, se le devuelve a quien
//  puso el dinero, o es un aporte que no se devuelve. Y la posibilidad de
//  corregir un gasto ya anotado, dejando quien y cuando en la auditoria.
//  Ver spec: docs/superpowers/specs/2026-07-31-fuente-del-gasto-design.md
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';
import { signToken } from '../src/auth.js';

let db;
before(async () => { db = await cargarDb(); });

let base, srv;
async function servidor() {
  if (srv) return base;
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  return base;
}
after(() => srv && new Promise(r => srv.close(r)));

function tok(personaId, iglesiaId) { return signToken({ id: personaId, iglesia_id: iglesiaId }); }

// Siembra una iglesia con pastor, lider (admin de grupo) y feligres.
function sembrar(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const nueva = (usuario, nombre, pastor = 0) => Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,'x',?,1)"
  ).run(iglesiaId, usuario + '_' + codigo, nombre, pastor).lastInsertRowid);
  const pastorId = nueva('pas', 'Pastor');
  const liderId = nueva('lid', 'Lider');
  const feligresId = nueva('fel', 'Feligres Juan');
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  const grupoId = Number(g.lastInsertRowid);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(liderId, grupoId);
  return { iglesiaId, pastorId, liderId, feligresId, grupoId };
}

// Crea una hoja suelta; devuelve {hojaId, auth}.
async function hoja(b, S, titulo = 'Almuerzo') {
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  const res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo }) });
  return { hojaId: (await res.json()).id, auth };
}

test('la columna fuente existe en evento_org_gasto y nace NULL', async () => {
  const cols = db.prepare('PRAGMA table_info(evento_org_gasto)').all().map(c => c.name);
  assert.ok(cols.includes('fuente'), 'falta la columna fuente');

  const b = await servidor();
  const S = sembrar('COL1');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 3000 }) });
  const { id } = await res.json();
  assert.equal(db.prepare('SELECT fuente FROM evento_org_gasto WHERE id = ?').get(id).fuente, null);
});

test('gasto pagado por la caja: no lleva persona y la fuente queda "caja"', async () => {
  const b = await servidor();
  const S = sembrar('CAJA');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Carne', monto: 30000, fuente: 'caja' }) });
  assert.equal(res.status, 200);
  const { id } = await res.json();
  const fila = db.prepare('SELECT pagado_por, fuente FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.pagado_por, null, 'nadie puso plata de su bolsillo');
  assert.equal(fila.fuente, 'caja');
});

test('gasto de una persona sin indicar fuente: se guarda como antes (compatibilidad)', async () => {
  const b = await servidor();
  const S = sembrar('COMP');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Jugos', monto: 5000 }) });
  const { id } = await res.json();
  const fila = db.prepare('SELECT pagado_por, fuente FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.pagado_por, S.liderId, 'sigue pagando quien registra, como siempre');
  assert.equal(fila.fuente, null, 'sin la casilla, queda "no especificado", igual que antes de que existiera');
});

test('gasto marcado como aporte y como "se devuelve" guardan su fuente', async () => {
  const b = await servidor();
  const S = sembrar('MARC');
  const { hojaId, auth } = await hoja(b, S);
  let res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Bebidas', monto: 8000, pagado_por: S.feligresId, fuente: 'devuelve' }) });
  const bebidas = (await res.json()).id;
  res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 4000, pagado_por: S.feligresId, fuente: 'aporte' }) });
  const pan = (await res.json()).id;
  assert.equal(db.prepare('SELECT fuente FROM evento_org_gasto WHERE id = ?').get(bebidas).fuente, 'devuelve');
  assert.equal(db.prepare('SELECT fuente FROM evento_org_gasto WHERE id = ?').get(pan).fuente, 'aporte');
});

test('fuente invalida -> 400 en castellano, sin nombrar el campo', async () => {
  const b = await servidor();
  const S = sembrar('FINV');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000, fuente: 'donacion' }) });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.doesNotMatch(error, /fuente/, 'no debe soltarle al usuario el nombre tecnico del campo');
});

test('el resumen separa lo que pago la caja, lo por devolver y los aportes donados', async () => {
  const b = await servidor();
  const S = sembrar('RESU');
  const { hojaId, auth } = await hoja(b, S, 'Asado');
  // El ejemplo del spec: el pastor adelanta la carne, la lider pone las
  // bebidas y se le devuelven, Rosa (aqui: la feligresa) pone el pan y no
  // quiere que se lo devuelvan.
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Carne', monto: 30000, fuente: 'caja' }) });
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Bebidas', monto: 8000, pagado_por: S.liderId, fuente: 'devuelve' }) });
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 4000, pagado_por: S.feligresId, fuente: 'aporte' }) });

  const hojaRes = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hojaRes.total_gastado, 42000);
  assert.equal(hojaRes.total_caja, 30000);
  assert.equal(hojaRes.por_devolver.length, 1);
  assert.deepEqual({ ...hojaRes.por_devolver[0] }, { persona_id: S.liderId, nombre: 'Lider', total: 8000 });
  assert.equal(hojaRes.aportes_donados.length, 1);
  assert.deepEqual({ ...hojaRes.aportes_donados[0] }, { persona_id: S.feligresId, nombre: 'Feligres Juan', total: 4000 });
});

test('gasto antiguo sin persona ni fuente: no aparece en ningun bloque de personas, solo en el total', async () => {
  const b = await servidor();
  const S = sembrar('VIEJ2');
  const { hojaId, auth } = await hoja(b, S, 'Historica');
  db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto) VALUES (?,?,?)').run(hojaId, 'Gasto antiguo', 5000);

  const hojaRes = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hojaRes.total_gastado, 5000);
  assert.equal(hojaRes.total_caja, 0);
  assert.deepEqual(hojaRes.por_devolver, []);
  assert.deepEqual(hojaRes.aportes_donados, []);
});

test('gasto antiguo CON persona pero sin fuente sigue contando como "por devolver"', async () => {
  const b = await servidor();
  const S = sembrar('VIEJ3');
  const { hojaId, auth } = await hoja(b, S, 'De transicion');
  // Asi quedaban los gastos ANTES de que existiera la casilla fuente: con
  // persona, sin fuente. Ese significado (hay que devolverle) no cambia.
  db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto, pagado_por) VALUES (?,?,?,?)')
    .run(hojaId, 'Gasto de transicion', 7000, S.liderId);

  const hojaRes = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hojaRes.por_devolver.length, 1);
  assert.deepEqual({ ...hojaRes.por_devolver[0] }, { persona_id: S.liderId, nombre: 'Lider', total: 7000 });
});

// ---------- Corregir un gasto ----------

test('el creador corrige concepto y monto de un gasto', async () => {
  const b = await servidor();
  const S = sembrar('EDIT');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000 }) });
  const { id } = await res.json();

  const pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ concepto: 'Pan integral', monto: 1500 }) });
  assert.equal(pres.status, 200);
  const fila = db.prepare('SELECT concepto, monto FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.concepto, 'Pan integral');
  assert.equal(fila.monto, 1500);
});

test('cambiar la fuente de una persona a "la caja" limpia el pagado_por', async () => {
  const b = await servidor();
  const S = sembrar('CAM1');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Carne', monto: 20000, pagado_por: S.liderId, fuente: 'devuelve' }) });
  const { id } = await res.json();

  const pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'caja' }) });
  assert.equal(pres.status, 200);
  const fila = db.prepare('SELECT pagado_por, fuente FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.pagado_por, null);
  assert.equal(fila.fuente, 'caja');
});

test('cambiar de la caja a una persona exige indicar quien, si no 400', async () => {
  const b = await servidor();
  const S = sembrar('CAM2');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Carne', monto: 20000, fuente: 'caja' }) });
  const { id } = await res.json();

  let pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'devuelve' }) });
  assert.equal(pres.status, 400, 'no puede quedar "se devuelve" sin nadie a quien devolverle');

  pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'devuelve', pagado_por: S.feligresId }) });
  assert.equal(pres.status, 200);
  const fila = db.prepare('SELECT pagado_por, fuente FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.pagado_por, S.feligresId);
});

test('un lider de OTRA iglesia recibe 404 y no cambia nada', async () => {
  const b = await servidor();
  const S = sembrar('OTR1');
  const O = sembrar('OTR2');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000 }) });
  const { id } = await res.json();

  const authAjeno = { Authorization: 'Bearer ' + tok(O.liderId, O.iglesiaId), 'Content-Type': 'application/json' };
  const pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: authAjeno, body: JSON.stringify({ monto: 9999 }) });
  assert.equal(pres.status, 404);
  assert.equal(db.prepare('SELECT monto FROM evento_org_gasto WHERE id = ?').get(id).monto, 1000);
});

test('un lider que no creo la hoja (ni pastor) recibe 403', async () => {
  const b = await servidor();
  const S = sembrar('PERM');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000 }) });
  const { id } = await res.json();

  const lid2 = Number(db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)")
    .run(S.iglesiaId, 'lid2_PERM', 'Lider2', 'x').lastInsertRowid);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(lid2, S.grupoId);
  const authOtro = { Authorization: 'Bearer ' + tok(lid2, S.iglesiaId), 'Content-Type': 'application/json' };
  const pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: authOtro, body: JSON.stringify({ monto: 9999 }) });
  assert.equal(pres.status, 403);
});

test('corregir un gasto queda auditado con quien y que cambio', async () => {
  const b = await servidor();
  const S = sembrar('AUDI');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000 }) });
  const { id } = await res.json();

  await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 1200 }) });

  // ORDER BY id DESC: este archivo comparte un solo db entre tests (un solo
  // before()), y para cuando llega aqui ya hubo otros PATCH /gastos exitosos
  // (EDIT, CAM1, CAM2) que tambien dejaron su propio rastro de 'editar_gasto'.
  // Sin esto, .get() agarra el PRIMERO que exista en la tabla, no el de esta
  // prueba (mismo patron que usa eliminar-iglesia.test.js).
  const log = db.prepare("SELECT actor_id, detalle FROM auditoria WHERE accion = 'editar_gasto' ORDER BY id DESC LIMIT 1").get();
  assert.ok(log, 'corregir un gasto tiene que dejar rastro');
  assert.equal(log.actor_id, S.liderId);
  // Con separador de miles: este texto se le muestra a la gente en la hoja
  // (Task 6), asi que se guarda ya formateado.
  assert.match(log.detalle, /\$1\.000/);
  assert.match(log.detalle, /\$1\.200/);
});

test('monto invalido al corregir -> 400', async () => {
  const b = await servidor();
  const S = sembrar('MINV');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000 }) });
  const { id } = await res.json();

  const pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ monto: -5 }) });
  assert.equal(pres.status, 400);
});

// ---------- El gasto historico "no se sabe quien puso" ----------
// Estas dos pruebas existen por un fallo real que traia este mismo plan: exigia
// pagador SIEMPRE que la fuente final no fuera 'caja', asi que un gasto
// historico (fuente y pagado_por vacios) no se podia ni corregir de ortografia.

test('corregir SOLO el concepto de un gasto historico no le inventa un pagador', async () => {
  const b = await servidor();
  const S = sembrar('HIST1');
  const { hojaId, auth } = await hoja(b, S);
  // Asi son los gastos mas antiguos: sin pagador y sin fuente.
  const id = Number(db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto) VALUES (?,?,?)')
    .run(hojaId, 'Pna', 5000).lastInsertRowid);

  const pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ concepto: 'Pan' }) });
  assert.equal(pres.status, 200, 'arreglar una falta de ortografia no puede fallar');

  const fila = db.prepare('SELECT concepto, pagado_por, fuente FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.concepto, 'Pan');
  assert.equal(fila.pagado_por, null, 'sigue sin saberse quien puso: nadie le presto plata a la iglesia por corregir un texto');
  assert.equal(fila.fuente, null);

  // Y el resumen sigue contandolo como "sin registrar", no como una deuda.
  const hojaRes = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.deepEqual(hojaRes.por_devolver, []);
  assert.deepEqual(hojaRes.aportes_donados, []);
  assert.equal(hojaRes.total_gastado, 5000);
});

test('pero si el PATCH SI toca la fuente, entonces si exige pagador', async () => {
  const b = await servidor();
  const S = sembrar('HIST2');
  const { hojaId, auth } = await hoja(b, S);
  const id = Number(db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto) VALUES (?,?,?)')
    .run(hojaId, 'Pan', 5000).lastInsertRowid);

  let pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'devuelve' }) });
  assert.equal(pres.status, 400, 'no puede quedar "se devuelve" sin nadie a quien devolverle');

  pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'devuelve', pagado_por: S.feligresId }) });
  assert.equal(pres.status, 200);
  assert.equal(db.prepare('SELECT pagado_por FROM evento_org_gasto WHERE id = ?').get(id).pagado_por, S.feligresId);
});
