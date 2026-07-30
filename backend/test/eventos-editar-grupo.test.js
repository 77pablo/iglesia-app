// ============================================================
//  Cambiar de grupo un evento: decia "Evento actualizado" y no cambiaba nada.
//
//  El formulario de edicion pinta el desplegable de Grupo y guardarEvento()
//  manda grupo_id tanto al crear como al editar. Pero editarEventoSchema no
//  declaraba grupo_id, y validar() hace safeParse sobre un z.object() sin
//  .strict() y luego reemplaza req.body por resultado.data: las claves que el
//  esquema no conoce se DESCARTAN EN SILENCIO, sin 400.
//
//  Resultado para el pastor: abre el evento de Jovenes, elige Alabanza, guarda,
//  sale el toast "Evento actualizado", se cierra el formulario, se recarga el
//  calendario... y el evento sigue en Jovenes, con el mismo color. Ningun error
//  en ninguna parte. Es el peor tipo de fallo: el que te dice que funciono.
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

// Una iglesia con pastor, dos grupos y un lider que solo manda en el primero.
function sembrar(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const persona = (u, esPastor = 0) => Number(db.prepare(
    'INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,?,1)'
  ).run(iglesiaId, u + '_' + codigo, u, 'x', esPastor).lastInsertRowid);
  const grupo = nombre => Number(db.prepare(
    'INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?,?,?)'
  ).run(iglesiaId, nombre, '#2f7f2f').lastInsertRowid);

  const pastorId = persona('pastor', 1);
  const liderId = persona('lider');
  const jovenes = grupo('Jovenes'), alabanza = grupo('Alabanza');
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(liderId, jovenes);

  const ev = db.prepare(
    "INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, estado, creado_por) VALUES (?,?,?,?, 'aprobado', ?)"
  ).run(iglesiaId, jovenes, 'Culto de jovenes', '2026-08-15', pastorId);
  return { iglesiaId, pastorId, liderId, jovenes, alabanza, eventoId: Number(ev.lastInsertRowid) };
}

const patch = (b, S, quien, body) => fetch(b + '/api/eventos/' + S.eventoId, {
  method: 'PATCH',
  headers: { Authorization: 'Bearer ' + tok(quien, S.iglesiaId), 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
const grupoDe = id => db.prepare('SELECT grupo_id FROM evento WHERE id = ?').get(id).grupo_id;

test('el pastor cambia el grupo de un evento y el cambio se guarda', async () => {
  const b = await servidor();
  const S = sembrar('EV1');
  const res = await patch(b, S, S.pastorId, { titulo: 'Culto de jovenes', grupo_id: S.alabanza });
  assert.equal(res.status, 200);
  assert.equal(grupoDe(S.eventoId), S.alabanza, 'el evento tenia que quedar en Alabanza');
});

test('no mandar grupo_id deja el que ya tenia (el PATCH sigue siendo parcial)', async () => {
  const b = await servidor();
  const S = sembrar('EV2');
  const res = await patch(b, S, S.pastorId, { titulo: 'Otro titulo' });
  assert.equal(res.status, 200);
  assert.equal(grupoDe(S.eventoId), S.jovenes, 'sin grupo_id no se toca el grupo');
  assert.equal(db.prepare('SELECT titulo FROM evento WHERE id = ?').get(S.eventoId).titulo, 'Otro titulo');
});

test('un lider no puede mover un evento a un grupo que no dirige', async () => {
  // Si no se revalidase, cambiar de grupo seria una forma de colar un evento en
  // el grupo de otro: el permiso se comprueba al crear, no al editar.
  const b = await servidor();
  const S = sembrar('EV3');
  // El evento pasa a ser suyo para que puedaGestionar le deje editarlo.
  db.prepare('UPDATE evento SET creado_por = ?, estado = ? WHERE id = ?').run(S.liderId, 'pendiente', S.eventoId);
  const res = await patch(b, S, S.liderId, { grupo_id: S.alabanza });
  assert.equal(res.status, 403);
  assert.equal(grupoDe(S.eventoId), S.jovenes, 'el evento no se movio');
});

test('un grupo de OTRA iglesia no cuela', async () => {
  const b = await servidor();
  const A = sembrar('EV4'), B = sembrar('EV5');
  const res = await patch(b, A, A.pastorId, { grupo_id: B.alabanza });
  assert.equal(res.status, 403);
  assert.equal(grupoDe(A.eventoId), A.jovenes);
});
