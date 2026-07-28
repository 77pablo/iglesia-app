// ============================================================
//  Organizacion v2: responsable por cosa, aviso y "Mi parte".
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

// Siembra: iglesia + pastor + lider (admin de grupo) + feligres + grupo.
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

// Crea una hoja suelta con una cosa; devuelve {hojaId, cosaId, auth}.
async function hojaConCosa(b, S, titulo = 'Almuerzo') {
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo }) });
  const hojaId = (await res.json()).id;
  res = await fetch(b + `/api/organizacion/${hojaId}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Jugos nectar', cantidad: 5 }) });
  const cosaId = (await res.json()).id;
  return { hojaId, cosaId, auth };
}

test('el esquema guarda responsable y la hoja lo devuelve con nombre y estado', async () => {
  const b = await servidor();
  const S = sembrar('RESP');
  const { hojaId, cosaId, auth } = await hojaConCosa(b, S);

  // Sin asignar: los campos vienen vacios, no ausentes.
  let hoja = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hoja.cosas[0].responsable_id, null);
  assert.equal(hoja.cosas[0].responsable_nombre, null);

  // Se asigna directo en la BD (el endpoint llega en la Task 2).
  db.prepare('UPDATE evento_org_cosa SET responsable_id = ? WHERE id = ?').run(S.feligresId, cosaId);
  hoja = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hoja.cosas[0].responsable_id, S.feligresId);
  assert.equal(hoja.cosas[0].responsable_nombre, 'Feligres Juan');
  assert.equal(hoja.cosas[0].responsable_activo, 1);

  // Cuenta desactivada: el dato NO se borra, se marca inactivo para que la
  // interfaz pueda decir "reasignar" en vez de dejar la linea huerfana.
  db.prepare('UPDATE persona SET activo = 0 WHERE id = ?').run(S.feligresId);
  hoja = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hoja.cosas[0].responsable_id, S.feligresId);
  assert.equal(hoja.cosas[0].responsable_nombre, 'Feligres Juan');
  assert.equal(hoja.cosas[0].responsable_activo, 0);
});

test('asignar responsable: valida la persona, avisa una sola vez y permite desasignar', async () => {
  const b = await servidor();
  const S = sembrar('ASIG');
  const { cosaId, auth } = await hojaConCosa(b, S);
  const avisos = () => db.prepare("SELECT COUNT(*) n FROM notificacion WHERE persona_id = ? AND tipo = 'organizacion'").get(S.feligresId).n;

  // Asignar a un feligres de la iglesia: 200 + aviso + asignada_en
  let res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });
  assert.equal(res.status, 200);
  const fila = db.prepare('SELECT responsable_id, asignada_en FROM evento_org_cosa WHERE id = ?').get(cosaId);
  assert.equal(fila.responsable_id, S.feligresId);
  assert.ok(fila.asignada_en, 'debe registrar cuando se asigno');
  assert.equal(avisos(), 1);

  // Re-mandar el MISMO responsable no vuelve a avisar (el lider edita la lista
  // muchas veces mientras la arma; no se puede bombardear a la gente).
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });
  assert.equal(res.status, 200);
  assert.equal(avisos(), 1);

  // Cambiar el nombre de la cosa tampoco avisa, ni desasigna.
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ nombre: 'Jugos de naranja' }) });
  assert.equal(res.status, 200);
  assert.equal(avisos(), 1);
  assert.equal(db.prepare('SELECT responsable_id FROM evento_org_cosa WHERE id = ?').get(cosaId).responsable_id, S.feligresId,
    'un PATCH que no menciona responsable_id no debe desasignar');

  // Desasignar con null explicito.
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: null }) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT responsable_id FROM evento_org_cosa WHERE id = ?').get(cosaId).responsable_id, null);
});

test('asignar responsable: rechaza personas de otra iglesia, inactivas o inexistentes', async () => {
  const b = await servidor();
  const A = sembrar('ASGA');
  const B = sembrar('ASGB');
  const { cosaId, auth } = await hojaConCosa(b, A);

  // Persona de OTRA iglesia -> 400
  let res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: B.feligresId }) });
  assert.equal(res.status, 400);

  // Persona inexistente -> 400
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: 999999 }) });
  assert.equal(res.status, 400);

  // Persona desactivada -> 400 (no se asigna a quien no puede entrar)
  db.prepare('UPDATE persona SET activo = 0 WHERE id = ?').run(A.feligresId);
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: A.feligresId }) });
  assert.equal(res.status, 400);
  db.prepare('UPDATE persona SET activo = 1 WHERE id = ?').run(A.feligresId);

  // Y la cosa quedo intacta
  assert.equal(db.prepare('SELECT responsable_id FROM evento_org_cosa WHERE id = ?').get(cosaId).responsable_id, null);
});

test('mis-cosas: el feligres ve SOLO su linea, sin gastos ni cosas de otros', async () => {
  const b = await servidor();
  const S = sembrar('MIAS');
  const { hojaId, cosaId, auth } = await hojaConCosa(b, S, 'Almuerzo de jovenes');
  const authFel = { Authorization: 'Bearer ' + tok(S.feligresId, S.iglesiaId), 'Content-Type': 'application/json' };

  // Una segunda cosa que NO es suya, y un gasto en la misma hoja.
  let res = await fetch(b + `/api/organizacion/${hojaId}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Pan', cantidad: 3 }) });
  const cosaAjena = (await res.json()).id;
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Carbon', monto: 12000 }) });
  await fetch(b + '/api/organizacion/' + hojaId, { method: 'PATCH', headers: auth, body: JSON.stringify({ hora_llegada: '12:30' }) });
  await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });

  // El feligres SIGUE sin poder entrar al modulo por la puerta grande.
  assert.equal((await fetch(b + '/api/organizacion', { headers: authFel })).status, 403);
  assert.equal((await fetch(b + '/api/organizacion/' + hojaId, { headers: authFel })).status, 403);

  // Pero ve lo suyo por la rendija.
  res = await fetch(b + '/api/organizacion/mis-cosas', { headers: authFel });
  assert.equal(res.status, 200);
  const mias = await res.json();
  assert.equal(mias.length, 1, 'solo la linea asignada a el');
  assert.equal(mias[0].id, cosaId);
  assert.equal(mias[0].nombre, 'Jugos nectar');
  assert.equal(mias[0].cantidad, 5);
  assert.equal(mias[0].hoja_titulo, 'Almuerzo de jovenes');
  assert.equal(mias[0].hora_llegada, '12:30');
  // Nada de dinero ni de cosas ajenas en la respuesta.
  const crudo = JSON.stringify(mias);
  assert.ok(!crudo.includes('12000') && !crudo.toLowerCase().includes('gasto'), 'no puede filtrarse ningun gasto');
  assert.ok(!crudo.includes('Pan'), 'no puede ver las cosas de otros');
  assert.ok(!crudo.includes('total'), 'no puede ver totales');

  // Marca "ya lo tengo".
  res = await fetch(b + `/api/organizacion/mis-cosas/${cosaId}`, { method: 'PATCH', headers: authFel, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT listo FROM evento_org_cosa WHERE id = ?').get(cosaId).listo, 1);

  // NO puede tocar la linea de otro (403), ni renombrar la suya.
  res = await fetch(b + `/api/organizacion/mis-cosas/${cosaAjena}`, { method: 'PATCH', headers: authFel, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT listo FROM evento_org_cosa WHERE id = ?').get(cosaAjena).listo, 0);
  await fetch(b + `/api/organizacion/mis-cosas/${cosaId}`, { method: 'PATCH', headers: authFel, body: JSON.stringify({ nombre: 'Otra cosa', listo: true }) });
  assert.equal(db.prepare('SELECT nombre FROM evento_org_cosa WHERE id = ?').get(cosaId).nombre, 'Jugos nectar');
});

test('mis-cosas: exige sesion y no cruza iglesias', async () => {
  const b = await servidor();
  const A = sembrar('MIAA');
  const B = sembrar('MIAB');
  const { cosaId, auth } = await hojaConCosa(b, A);
  await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: A.feligresId }) });

  // Sin token -> 401 (la ruta va DESPUES de authMiddleware, no antes)
  assert.equal((await fetch(b + '/api/organizacion/mis-cosas')).status, 401);

  // Un feligres de otra iglesia no ve nada y no puede marcar la cosa ajena.
  const authB = { Authorization: 'Bearer ' + tok(B.feligresId, B.iglesiaId), 'Content-Type': 'application/json' };
  assert.deepEqual(await (await fetch(b + '/api/organizacion/mis-cosas', { headers: authB })).json(), []);
  const res = await fetch(b + `/api/organizacion/mis-cosas/${cosaId}`, { method: 'PATCH', headers: authB, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 403);
});
