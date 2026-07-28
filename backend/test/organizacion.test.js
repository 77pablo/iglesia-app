// ============================================================
//  Organización de eventos: hoja (cosas + gastos), permisos y cascadas.
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';
// helpers.js se importa ANTES (fija DB_PATH/JWT_SECRET al evaluarse), asi que
// auth.js/db.js quedan apuntando a la BD temporal de este proceso de test.
import { signToken } from '../src/auth.js';

let db;
before(async () => { db = await cargarDb(); });

test('el esquema crea las 3 tablas y el índice único por evento', () => {
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['evento_org', 'evento_org_cosa', 'evento_org_gasto'])
    assert.ok(tablas.includes(t), 'falta la tabla ' + t);

  db.exec('PRAGMA foreign_keys = ON');
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Org A','ORGA')").run();
  const iglesiaId = Number(ig.lastInsertRowid);
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha) VALUES (?, 'Culto', '2026-08-01')").run(iglesiaId);
  const eventoId = Number(ev.lastInsertRowid);
  db.prepare('INSERT INTO evento_org (iglesia_id, evento_id) VALUES (?,?)').run(iglesiaId, eventoId);
  // Segunda hoja para el MISMO evento: debe fallar por el índice único.
  assert.throws(() => db.prepare('INSERT INTO evento_org (iglesia_id, evento_id) VALUES (?,?)').run(iglesiaId, eventoId));
  // Dos hojas SUELTAS (evento_id NULL) sí conviven (índice parcial).
  db.prepare("INSERT INTO evento_org (iglesia_id, titulo) VALUES (?, 'Suelta 1')").run(iglesiaId);
  db.prepare("INSERT INTO evento_org (iglesia_id, titulo) VALUES (?, 'Suelta 2')").run(iglesiaId);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org WHERE evento_id IS NULL AND iglesia_id = ?').get(iglesiaId).n, 2);
});

// Arranca el server HTTP real una vez para los tests de endpoints.
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

// Siembra una iglesia con un líder (admin de grupo) y un feligrés común.
function sembrarOrg(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const pas = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,1,1)").run(iglesiaId, 'pas_' + codigo, 'Pastor', 'x');
  const lid = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)").run(iglesiaId, 'lid_' + codigo, 'Lider', 'x');
  const fel = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)").run(iglesiaId, 'fel_' + codigo, 'Feligres', 'x');
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  const grupoId = Number(g.lastInsertRowid);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(Number(lid.lastInsertRowid), grupoId);
  return { iglesiaId, pastorId: Number(pas.lastInsertRowid), liderId: Number(lid.lastInsertRowid), feligresId: Number(fel.lastInsertRowid), grupoId };
}

test('hoja suelta: crear, leer, gate de visibilidad y edición', async () => {
  const b = await servidor();
  const S = sembrarOrg('SUEL');
  // feligrés común NO ve la organización
  let res = await fetch(b + '/api/organizacion', { headers: { Authorization: 'Bearer ' + tok(S.feligresId, S.iglesiaId) } });
  assert.equal(res.status, 403);
  // líder crea una hoja suelta
  res = await fetch(b + '/api/organizacion', { method: 'POST', headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'Almuerzo', hora_llegada: '12:30' }) });
  assert.equal(res.status, 200);
  const { id } = await res.json();
  // la lee y trae puede_editar=true para el creador
  res = await fetch(b + '/api/organizacion/' + id, { headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId) } });
  const hoja = await res.json();
  assert.equal(hoja.titulo, 'Almuerzo');
  assert.equal(hoja.hora_llegada, '12:30');
  assert.equal(hoja.total_gastado, 0);
  assert.deepEqual(hoja.cosas, []);
  assert.equal(hoja.puede_editar, true);
});

test('hoja de evento: se crea sola al abrirla; una por evento; otra iglesia no la ve', async () => {
  const b = await servidor();
  const S = sembrarOrg('EVEN');
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha, grupo_id) VALUES (?, 'Retiro', '2026-08-10', ?)").run(S.iglesiaId, S.grupoId);
  const eventoId = Number(ev.lastInsertRowid);
  // 1a apertura crea la hoja
  let res = await fetch(b + '/api/organizacion/evento/' + eventoId, { headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId) } });
  assert.equal(res.status, 200);
  const h1 = await res.json();
  assert.equal(h1.evento_id, eventoId);
  assert.equal(h1.evento.titulo, 'Retiro');
  // 2a apertura devuelve la MISMA (no duplica)
  res = await fetch(b + '/api/organizacion/evento/' + eventoId, { headers: { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId) } });
  const h2 = await res.json();
  assert.equal(h2.id, h1.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org WHERE evento_id = ?').get(eventoId).n, 1);
  // otra iglesia no puede abrir ese evento
  const O = sembrarOrg('OTRA');
  res = await fetch(b + '/api/organizacion/evento/' + eventoId, { headers: { Authorization: 'Bearer ' + tok(O.liderId, O.iglesiaId) } });
  assert.equal(res.status, 404);
});

test('aislamiento por iglesia: una hoja de otra iglesia no se ve ni se edita (404)', async () => {
  const b = await servidor();
  const A = sembrarOrg('AISA');
  const B = sembrarOrg('AISB');
  const authA = { Authorization: 'Bearer ' + tok(A.liderId, A.iglesiaId), 'Content-Type': 'application/json' };
  // el pastor de B es pastor, pero de OTRA iglesia: no debe alcanzar la hoja de A
  const authB = { Authorization: 'Bearer ' + tok(B.pastorId, B.iglesiaId), 'Content-Type': 'application/json' };
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: authA, body: JSON.stringify({ titulo: 'Solo de A' }) });
  const { id } = await res.json();

  for (const [metodo, ruta, cuerpo] of [
    ['GET', '/api/organizacion/' + id, null],
    ['PATCH', '/api/organizacion/' + id, { titulo: 'Robada' }],
    ['DELETE', '/api/organizacion/' + id, null]
  ]) {
    res = await fetch(b + ruta, { method: metodo, headers: authB, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    assert.equal(res.status, 404, `${metodo} ${ruta} deberia ser 404 para otra iglesia`);
  }
  // sigue intacta y no aparece en el listado de la otra iglesia
  assert.equal(db.prepare('SELECT titulo FROM evento_org WHERE id = ?').get(id).titulo, 'Solo de A');
  res = await fetch(b + '/api/organizacion', { headers: authB });
  const hojasB = await res.json();
  assert.equal(hojasB.filter(h => h.id === id).length, 0, 'la hoja de otra iglesia no debe listarse');
});

test('editar/borrar hoja: solo creador o pastor; otro líder 403', async () => {
  const b = await servidor();
  const S = sembrarOrg('EDIT');
  // otro líder de la misma iglesia
  const lid2 = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)").run(S.iglesiaId, 'lid2', 'Lider2', 'x');
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(Number(lid2.lastInsertRowid), S.grupoId);
  const lid2Id = Number(lid2.lastInsertRowid);
  // líder crea
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'Mia' }) });
  const { id } = await res.json();
  // otro líder SÍ la ve (lectura abierta a líderes) pero sin puede_editar
  res = await fetch(b + '/api/organizacion/' + id, { headers: { Authorization: 'Bearer ' + tok(lid2Id, S.iglesiaId) } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).puede_editar, false);
  // otro líder NO puede editar
  res = await fetch(b + '/api/organizacion/' + id, { method: 'PATCH', headers: { Authorization: 'Bearer ' + tok(lid2Id, S.iglesiaId), 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'Hackeada' }) });
  assert.equal(res.status, 403);
  // el pastor SÍ puede editar
  res = await fetch(b + '/api/organizacion/' + id, { method: 'PATCH', headers: { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId), 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'Por el pastor' }) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT titulo FROM evento_org WHERE id = ?').get(id).titulo, 'Por el pastor');
  // el creador borra
  res = await fetch(b + '/api/organizacion/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId) } });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org WHERE id = ?').get(id).n, 0);
});

test('cosas: añadir, marcar listo y borrar (con permiso)', async () => {
  const b = await servidor();
  const S = sembrarOrg('COSA');
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Lista' }) });
  const { id } = await res.json();

  // añadir cosa con cantidad
  res = await fetch(b + `/api/organizacion/${id}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Jugos nectar', cantidad: 5 }) });
  assert.equal(res.status, 200);
  const cosaId = (await res.json()).id;
  // se ve en la hoja
  res = await fetch(b + '/api/organizacion/' + id, { headers: auth });
  const hoja = await res.json();
  assert.equal(hoja.cosas.length, 1);
  assert.equal(hoja.cosas[0].nombre, 'Jugos nectar');
  assert.equal(hoja.cosas[0].cantidad, 5);
  assert.equal(hoja.cosas[0].listo, 0);
  // sin nombre → 400 (no se cuelan cosas en blanco)
  res = await fetch(b + `/api/organizacion/${id}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: '  ' }) });
  assert.equal(res.status, 400);
  // marcar listo, y desmarcar (el PATCH parcial no pierde el toggle)
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT listo FROM evento_org_cosa WHERE id = ?').get(cosaId).listo, 1);
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ listo: false }) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT listo FROM evento_org_cosa WHERE id = ?').get(cosaId).listo, 0);
  // el creador la borra
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'DELETE', headers: auth });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org_cosa WHERE id = ?').get(cosaId).n, 0);
});

test('cosas: quién NO puede tocarlas (gate, permiso de edición y otra iglesia)', async () => {
  const b = await servidor();
  const S = sembrarOrg('COSP');
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Con dueño' }) });
  const { id } = await res.json();
  res = await fetch(b + `/api/organizacion/${id}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Sillas', cantidad: 2 }) });
  const cosaId = (await res.json()).id;

  // 1) feligrés: lo frena el GATE de visibilidad del router, antes de mirar la cosa
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok(S.feligresId, S.iglesiaId) } });
  assert.equal(res.status, 403);
  // 2) otro líder de la MISMA iglesia: pasa el gate, pero no es creador ni pastor
  //    → aquí sí se prueba el permiso de edición de la hoja.
  const lid2 = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)").run(S.iglesiaId, 'lid2_COSP', 'Lider2', 'x');
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(Number(lid2.lastInsertRowid), S.grupoId);
  const auth2 = { Authorization: 'Bearer ' + tok(Number(lid2.lastInsertRowid), S.iglesiaId), 'Content-Type': 'application/json' };
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth2, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 403);
  res = await fetch(b + `/api/organizacion/${id}/cosas`, { method: 'POST', headers: auth2, body: JSON.stringify({ nombre: 'Colada' }) });
  assert.equal(res.status, 403);
  // 3) líder de OTRA iglesia: 404, ni siquiera confirma que la cosa exista
  const O = sembrarOrg('COSQ');
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok(O.liderId, O.iglesiaId) } });
  assert.equal(res.status, 404);
  // 4) el pastor de la iglesia SÍ puede (no es el creador, pero es pastor)
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId), 'Content-Type': 'application/json' }, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 200);
  // nada de lo anterior alteró la cosa salvo el pastor
  // (los rows de node:sqlite tienen prototipo nulo: se copian con spread para comparar)
  const fila = db.prepare('SELECT nombre, cantidad, listo FROM evento_org_cosa WHERE id = ?').get(cosaId);
  assert.deepEqual({ ...fila }, { nombre: 'Sillas', cantidad: 2, listo: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org_cosa WHERE org_id = ?').get(id).n, 1);
});

test('gastos: dos gastos suman el total; borrar uno recalcula; monto>0', async () => {
  const b = await servidor();
  const S = sembrarOrg('GAST');
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Cuentas' }) });
  const { id } = await res.json();

  // monto inválido (0 y negativo) → 400
  res = await fetch(b + `/api/organizacion/${id}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Nada', monto: 0 }) });
  assert.equal(res.status, 400);
  res = await fetch(b + `/api/organizacion/${id}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Devolucion', monto: -500 }) });
  assert.equal(res.status, 400);

  // dos gastos
  res = await fetch(b + `/api/organizacion/${id}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Jugos', monto: 8000 }) });
  assert.equal(res.status, 200);
  res = await fetch(b + `/api/organizacion/${id}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 5000 }) });
  const gasto2 = (await res.json()).id;

  // total = 13000, y el listado de hojas muestra el mismo total
  res = await fetch(b + '/api/organizacion/' + id, { headers: auth });
  let hoja = await res.json();
  assert.equal(hoja.total_gastado, 13000);
  assert.equal(hoja.gastos.length, 2);
  res = await fetch(b + '/api/organizacion', { headers: auth });
  assert.equal((await res.json()).find(h => h.id === id).total_gastado, 13000);

  // borrar uno → total = 8000 (se recalcula, no se persiste)
  res = await fetch(b + `/api/organizacion/gastos/${gasto2}`, { method: 'DELETE', headers: auth });
  assert.equal(res.status, 200);
  res = await fetch(b + '/api/organizacion/' + id, { headers: auth });
  hoja = await res.json();
  assert.equal(hoja.total_gastado, 8000);
  assert.equal(hoja.gastos.length, 1);
});

test('gastos: el gate y el permiso de edición también aplican', async () => {
  const b = await servidor();
  const S = sembrarOrg('GASP');
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Caja' }) });
  const { id } = await res.json();
  res = await fetch(b + `/api/organizacion/${id}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Arriendo', monto: 20000 }) });
  const gastoId = (await res.json()).id;

  // feligrés: lo frena el gate de visibilidad
  res = await fetch(b + `/api/organizacion/gastos/${gastoId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok(S.feligresId, S.iglesiaId) } });
  assert.equal(res.status, 403);
  // otro líder de la misma iglesia: pasa el gate, pero no puede editar la hoja
  const lid2 = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)").run(S.iglesiaId, 'lid2_GASP', 'Lider2', 'x');
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(Number(lid2.lastInsertRowid), S.grupoId);
  res = await fetch(b + `/api/organizacion/gastos/${gastoId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok(Number(lid2.lastInsertRowid), S.iglesiaId) } });
  assert.equal(res.status, 403);
  // líder de otra iglesia: 404
  const O = sembrarOrg('GASQ');
  res = await fetch(b + `/api/organizacion/gastos/${gastoId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok(O.liderId, O.iglesiaId) } });
  assert.equal(res.status, 404);
  // el gasto sigue ahí y el total intacto
  res = await fetch(b + '/api/organizacion/' + id, { headers: auth });
  assert.equal((await res.json()).total_gastado, 20000);
});

test('borrar la hoja arrastra sus cosas y gastos (transacción con hijos)', async () => {
  const b = await servidor();
  const S = sembrarOrg('HIJO');
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Con hijos' }) });
  const { id } = await res.json();
  await fetch(b + `/api/organizacion/${id}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Vasos', cantidad: 30 }) });
  await fetch(b + `/api/organizacion/${id}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Bebidas', monto: 12000 }) });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org_cosa WHERE org_id = ?').get(id).n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org_gasto WHERE org_id = ?').get(id).n, 1);

  res = await fetch(b + '/api/organizacion/' + id, { method: 'DELETE', headers: auth });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org WHERE id = ?').get(id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org_cosa WHERE org_id = ?').get(id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org_gasto WHERE org_id = ?').get(id).n, 0);
});

// El índice único de evento_org(evento_id) es GLOBAL, no por iglesia. Si el INSERT
// perezoso choca (fila de otra iglesia, o una hoja creada por otro proceso entre el
// SELECT y el INSERT), el endpoint no debe responder 500 ni entregar la hoja ajena.
test('hoja de evento: el choque del índice único no da 500 ni filtra la hoja ajena', async () => {
  const b = await servidor();
  const A = sembrarOrg('RACA');
  const B = sembrarOrg('RACB');
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha) VALUES (?, 'Vigilia', '2026-09-01')").run(A.iglesiaId);
  const eventoId = Number(ev.lastInsertRowid);
  // Fila inconsistente: misma evento_id, pero colgando de la OTRA iglesia.
  const ajena = db.prepare('INSERT INTO evento_org (iglesia_id, evento_id, titulo) VALUES (?,?,?)')
    .run(B.iglesiaId, eventoId, 'Hoja ajena');
  const ajenaId = Number(ajena.lastInsertRowid);

  // El líder de A abre la hoja de SU evento: el SELECT (acotado a su iglesia) no la
  // encuentra y el INSERT choca contra el índice único.
  const res = await fetch(b + '/api/organizacion/evento/' + eventoId, { headers: { Authorization: 'Bearer ' + tok(A.liderId, A.iglesiaId) } });
  assert.notEqual(res.status, 500, 'el choque del índice no debe reventar como 500');
  if (res.status === 200) {
    const hoja = await res.json();
    assert.notEqual(hoja.id, ajenaId, 'nunca debe devolver la hoja de otra iglesia');
    assert.equal(hoja.iglesia_id, A.iglesiaId);
  }
  // y la hoja ajena queda intacta
  assert.equal(db.prepare('SELECT titulo FROM evento_org WHERE id = ?').get(ajenaId).titulo, 'Hoja ajena');
});

test('borrar el evento borra su hoja de organización (cascada)', async () => {
  const b = await servidor();
  const S = sembrarOrg('CASC');
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha, grupo_id, estado, creado_por) VALUES (?, 'Borrable', '2026-08-20', ?, 'aprobado', ?)").run(S.iglesiaId, S.grupoId, S.pastorId);
  const eventoId = Number(ev.lastInsertRowid);
  const auth = { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId), 'Content-Type': 'application/json' };
  // abrir hoja (la crea) + una cosa + un gasto
  let res = await fetch(b + '/api/organizacion/evento/' + eventoId, { headers: auth });
  const hojaId = (await res.json()).id;
  await fetch(b + `/api/organizacion/${hojaId}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Sillas', cantidad: 10 }) });
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Arriendo', monto: 20000 }) });

  // borrar el evento vía su endpoint (el pastor puede)
  res = await fetch(b + '/api/eventos/' + eventoId, { method: 'DELETE', headers: auth });
  assert.equal(res.status, 200);

  // no queda ni la hoja ni sus hijos, ni referencias rotas
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org WHERE id = ?').get(hojaId).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org_cosa WHERE org_id = ?').get(hojaId).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org_gasto WHERE org_id = ?').get(hojaId).n, 0);
  db.exec('PRAGMA foreign_keys = ON');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0, 'quedaron referencias huérfanas');
});
