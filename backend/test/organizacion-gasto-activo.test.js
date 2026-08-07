// ============================================================
//  Cabo 1 (agosto): un gasto no se atribuye a una cuenta inactiva.
//  Alta: la persona debe estar activa. Correccion: solo se exige si el
//  pagador CAMBIA — el gasto historico de alguien que se dio de baja se
//  corrige (concepto/monto) sin tocar su atribucion.
//  Spec: docs/superpowers/specs/2026-08-07-cabos-agosto-design.md
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

function sembrar(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const nueva = (usuario, nombre, activo = 1) => Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,'x',0,?)"
  ).run(iglesiaId, usuario + '_' + codigo, nombre, activo).lastInsertRowid);
  const liderId = nueva('lid', 'Lider');
  const activaId = nueva('act', 'Ana Activa');
  const inactivaId = nueva('ina', 'Ines Inactiva', 0);
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(liderId, Number(g.lastInsertRowid));
  return { iglesiaId, liderId, activaId, inactivaId };
}

async function hoja(b, S) {
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  const res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Almuerzo' }) });
  return { hojaId: (await res.json()).id, auth };
}

test('alta: un gasto nuevo NO se puede atribuir a una cuenta inactiva', async () => {
  const b = await servidor();
  const S = sembrar('GA1');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ concepto: 'Pan', monto: 3000, fuente: 'devuelve', pagado_por: S.inactivaId })
  });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /inactiva/, 'el mensaje debe decir que la cuenta esta inactiva');
});

test('correccion: tocar solo el monto de un gasto cuyo pagador se dio de baja sigue funcionando', async () => {
  const b = await servidor();
  const S = sembrar('GA2');
  const { hojaId, auth } = await hoja(b, S);
  // El gasto nace cuando Ana estaba activa…
  const alta = await fetch(b + `/api/organizacion/${hojaId}/gastos`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ concepto: 'Carne', monto: 20000, fuente: 'devuelve', pagado_por: S.activaId })
  });
  const { id } = await alta.json();
  // …y despues Ana se da de baja.
  db.prepare('UPDATE persona SET activo = 0 WHERE id = ?').run(S.activaId);
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 25000 })
  });
  assert.equal(res.status, 200, 'corregir el monto no obliga a quitarle la atribucion a quien se fue');
  const fila = db.prepare('SELECT monto, pagado_por FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.monto, 25000);
  assert.equal(fila.pagado_por, S.activaId, 'la atribucion historica se conserva');
});

test('correccion: CAMBIAR el pagador a una cuenta inactiva se rechaza con 400', async () => {
  const b = await servidor();
  const S = sembrar('GA3');
  const { hojaId, auth } = await hoja(b, S);
  const alta = await fetch(b + `/api/organizacion/${hojaId}/gastos`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ concepto: 'Bebidas', monto: 8000, fuente: 'devuelve', pagado_por: S.activaId })
  });
  const { id } = await alta.json();
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ fuente: 'devuelve', pagado_por: S.inactivaId })
  });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /inactiva/);
  assert.equal(db.prepare('SELECT pagado_por FROM evento_org_gasto WHERE id = ?').get(id).pagado_por, S.activaId);
});
