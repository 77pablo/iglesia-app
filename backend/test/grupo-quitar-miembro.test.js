// ============================================================
//  "Quitar" en Mi Grupo no quitaba a nadie que no fuera 'miembro'.
//
//  El pastor le da a Ana el rol "musico" en Alabanza. El lider del grupo la ve
//  en la lista con su boton "Quitar" (el frontend lo pinta para todo el que no
//  es lider), lo pulsa, confirma... y le sale "No es miembro del grupo (o es un
//  lider)". Ana sigue ahi. Lo mismo con "tesorero". El lider no tiene forma de
//  sacarla y el mensaje le dice justo lo contrario de lo que esta viendo.
//
//  Causa: el DELETE borraba solo las filas de pertenencia con rol = 'miembro'.
//  Regla correcta: el lider se lleva TODA pertenencia que no sea de liderazgo
//  ('admin','lider_musica','lider_ed'), que siguen siendo cosa del pastor.
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

const tok = (p, i) => signToken({ id: p, iglesia_id: i });
const cabeceras = (p, i) => ({ Authorization: 'Bearer ' + tok(p, i), 'Content-Type': 'application/json' });

// Una iglesia con el grupo Alabanza: su lider, un co-lider, un miembro raso,
// Ana (musico, el caso del bug) y un feligres que no pertenece al grupo.
function sembrar(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const persona = (usuario, nombre, esPastor = 0) => Number(db.prepare(
    'INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,?,1)'
  ).run(iglesiaId, usuario + '_' + codigo, nombre, 'x', esPastor).lastInsertRowid);
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Alabanza', '#2f7')").run(iglesiaId);
  const grupoId = Number(g.lastInsertRowid);
  const pertenece = db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)');

  const pastorId = persona('pas', 'Pastor', 1);
  const liderId = persona('lid', 'Lider Alabanza');
  const coliderId = persona('col', 'Colider Musica');
  const miembroId = persona('mie', 'Miembro Raso');
  const anaId = persona('ana', 'Ana');
  const ajenoId = persona('aje', 'Feligres Ajeno');
  pertenece.run(liderId, grupoId, 'admin');
  pertenece.run(coliderId, grupoId, 'lider_musica');
  pertenece.run(miembroId, grupoId, 'miembro');
  pertenece.run(anaId, grupoId, 'musico');

  return { iglesiaId, grupoId, pastorId, liderId, coliderId, miembroId, anaId, ajenoId };
}

const rolesDe = (personaId, grupoId) => db.prepare(
  'SELECT rol FROM pertenencia WHERE persona_id = ? AND grupo_id = ? ORDER BY rol'
).all(personaId, grupoId).map(x => x.rol);

test('el lider quita a Ana, que es "musico" y no "miembro" (el bug)', async () => {
  const b = await servidor();
  const S = sembrar('QMUS');
  const auth = cabeceras(S.liderId, S.iglesiaId);

  // La lista se la da con boton "Quitar": no es lider.
  const lista = await (await fetch(b + `/api/grupo/${S.grupoId}/miembros`, { headers: auth })).json();
  const ana = lista.find(m => m.id === S.anaId);
  assert.equal(ana.esLider, false, 'Ana sale sin galon de lider, o sea con boton Quitar');

  const res = await fetch(b + `/api/grupo/${S.grupoId}/miembros/${S.anaId}`, { method: 'DELETE', headers: auth });
  assert.equal(res.status, 200, 'el boton que la pantalla ofrece tiene que funcionar');
  assert.deepEqual(rolesDe(S.anaId, S.grupoId), [], 'Ana ya no pertenece al grupo');

  // Y queda registrado con nombre legible, como las demas acciones del modulo.
  const a = db.prepare("SELECT detalle FROM auditoria WHERE accion = 'grupo_quita_miembro' AND actor_id = ?").get(S.liderId);
  assert.ok(a && a.detalle.includes('Ana') && a.detalle.includes('Alabanza'), 'la auditoria dice a quien y de donde');
});

test('quitar se lleva TODAS las pertenencias no-lider de la persona en ese grupo', async () => {
  // Ana puede ser 'miembro' y 'musico' a la vez (la UNIQUE es persona+grupo+rol).
  // Si el DELETE dejara una fila viva, Ana reaparece en la lista y el lider
  // creeria que el boton no hizo nada.
  const b = await servidor();
  const S = sembrar('QDOB');
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'miembro')").run(S.anaId, S.grupoId);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'tesorero')").run(S.anaId, S.grupoId);
  assert.equal(rolesDe(S.anaId, S.grupoId).length, 3);

  const res = await fetch(b + `/api/grupo/${S.grupoId}/miembros/${S.anaId}`, {
    method: 'DELETE', headers: cabeceras(S.liderId, S.iglesiaId)
  });
  assert.equal(res.status, 200);
  assert.deepEqual(rolesDe(S.anaId, S.grupoId), []);
  const lista = await (await fetch(b + `/api/grupo/${S.grupoId}/miembros`, { headers: cabeceras(S.liderId, S.iglesiaId) })).json();
  assert.ok(!lista.some(m => m.id === S.anaId), 'ya no aparece en la lista del grupo');
});

test('quitar a un "miembro" de toda la vida sigue funcionando (no se rompio lo que iba)', async () => {
  const b = await servidor();
  const S = sembrar('QMIE');
  const res = await fetch(b + `/api/grupo/${S.grupoId}/miembros/${S.miembroId}`, {
    method: 'DELETE', headers: cabeceras(S.liderId, S.iglesiaId)
  });
  assert.equal(res.status, 200);
  assert.deepEqual(rolesDe(S.miembroId, S.grupoId), []);
});

test('un lider NO puede quitar a otro lider del grupo', async () => {
  const b = await servidor();
  const S = sembrar('QLID');
  const auth = cabeceras(S.liderId, S.iglesiaId);

  // El co-lider sale marcado como lider: la pantalla no le pone boton "Quitar".
  const lista = await (await fetch(b + `/api/grupo/${S.grupoId}/miembros`, { headers: auth })).json();
  assert.equal(lista.find(m => m.id === S.coliderId).esLider, true);

  const res = await fetch(b + `/api/grupo/${S.grupoId}/miembros/${S.coliderId}`, { method: 'DELETE', headers: auth });
  assert.equal(res.status, 403, 'el liderazgo lo mueve el pastor, no un par');
  assert.deepEqual(rolesDe(S.coliderId, S.grupoId), ['lider_musica'], 'sigue en su puesto');

  // Ni por la puerta de atras: tampoco puede auto-degradarse ni echarse a si mismo.
  const propio = await fetch(b + `/api/grupo/${S.grupoId}/miembros/${S.liderId}`, { method: 'DELETE', headers: auth });
  assert.equal(propio.status, 403);
  assert.deepEqual(rolesDe(S.liderId, S.grupoId), ['admin']);
});

test('quien no es el lider del grupo no puede quitar a nadie', async () => {
  const b = await servidor();
  const S = sembrar('Q403');

  // Un miembro raso del grupo: 403.
  let res = await fetch(b + `/api/grupo/${S.grupoId}/miembros/${S.anaId}`, {
    method: 'DELETE', headers: cabeceras(S.miembroId, S.iglesiaId)
  });
  assert.equal(res.status, 403);

  // Un feligres que ni pertenece: 403.
  res = await fetch(b + `/api/grupo/${S.grupoId}/miembros/${S.anaId}`, {
    method: 'DELETE', headers: cabeceras(S.ajenoId, S.iglesiaId)
  });
  assert.equal(res.status, 403);

  // Y el PASTOR tampoco: la regla de oro del proyecto es que ve todo pero no
  // edita lo de cada grupo; el que saca gente es el encargado.
  res = await fetch(b + `/api/grupo/${S.grupoId}/miembros/${S.anaId}`, {
    method: 'DELETE', headers: cabeceras(S.pastorId, S.iglesiaId)
  });
  assert.equal(res.status, 403);

  assert.deepEqual(rolesDe(S.anaId, S.grupoId), ['musico'], 'Ana no se movio');
});

test('aislamiento: el lider de una iglesia no toca a la gente de otra', async () => {
  const b = await servidor();
  const A = sembrar('QAIS');
  const B = sembrar('QBIS');
  const authA = cabeceras(A.liderId, A.iglesiaId);

  // Con el gid ajeno: el grupo ni existe para el.
  let res = await fetch(b + `/api/grupo/${B.grupoId}/miembros/${B.anaId}`, { method: 'DELETE', headers: authA });
  assert.equal(res.status, 404);

  // Con SU gid pero una persona de la otra iglesia: tampoco.
  res = await fetch(b + `/api/grupo/${A.grupoId}/miembros/${B.anaId}`, { method: 'DELETE', headers: authA });
  assert.equal(res.status, 404);

  assert.deepEqual(rolesDe(B.anaId, B.grupoId), ['musico'], 'la Ana de la otra iglesia sigue intacta');
  assert.deepEqual(rolesDe(A.anaId, A.grupoId), ['musico'], 'y la propia no se toco por error');
});
