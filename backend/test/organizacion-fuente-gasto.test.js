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
