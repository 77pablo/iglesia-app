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
