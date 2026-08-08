// ============================================================
//  Cabo 2 (agosto): corregir un nombre AVISA donde sigue escrito el viejo
//  (nino.autorizados, predica.predicador, sermon.predicador). La app nunca
//  reescribe un texto libre: busca y avisa. Autoservicio ve CONTEOS (un LIKE
//  con un nombre comun puede casar fichas ajenas); el pastor ve el detalle.
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
  const nueva = (usuario, nombre, pastor = 0) => Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,'x',?,1)"
  ).run(iglesiaId, usuario + '_' + codigo, nombre, pastor).lastInsertRowid);
  return { iglesiaId, pastorId: nueva('pas', 'Pastor', 1), rosaId: nueva('ros', 'Rosa Diaz') };
}

function sembrarRastros(S) {
  db.prepare('INSERT INTO nino (iglesia_id, nombre, autorizados) VALUES (?,?,?)')
    .run(S.iglesiaId, 'Pedrito', 'Rosa Diaz, tia Carmen');
  db.prepare('INSERT INTO predica (iglesia_id, titulo, predicador) VALUES (?,?,?)')
    .run(S.iglesiaId, 'La fe', 'Rosa Diaz');
  db.prepare('INSERT INTO sermon (iglesia_id, titulo, predicador) VALUES (?,?,?)')
    .run(S.iglesiaId, 'Bosquejo', 'Rosa Diaz');
}

test('autoservicio: el PATCH /perfil que cambia el nombre responde CONTEOS, sin nombres de ninos', async () => {
  const b = await servidor();
  const S = sembrar('AP1');
  sembrarRastros(S);
  const res = await fetch(b + '/api/directorio/perfil', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.rosaId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Rosa Diaz Perez' })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.apariciones, { ninos: 1, predicas: 2 },
    'un nino la autoriza y su nombre esta en una predica y un sermon');
  assert.equal(typeof data.apariciones.ninos, 'number', 'al autoservicio NUNCA le llegan fichas, solo numeros');
});

test('autoservicio: sin rastros, los conteos van en cero (el aviso no inventa nada)', async () => {
  const b = await servidor();
  const S = sembrar('AP2');
  const res = await fetch(b + '/api/directorio/perfil', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.rosaId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Rosa Cambiada' })
  });
  assert.deepEqual((await res.json()).apariciones, { ninos: 0, predicas: 0 });
});

test('reenviar el MISMO nombre no busca nada: la respuesta no trae apariciones', async () => {
  const b = await servidor();
  const S = sembrar('AP3');
  sembrarRastros(S);
  const res = await fetch(b + '/api/directorio/perfil', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.rosaId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Rosa Diaz' })
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).apariciones, undefined,
    '"Mi perfil" manda el nombre en cada guardado; sin cambio real no hay aviso');
});

test('acotado por iglesia: el nino de OTRA congregacion no aparece en el conteo', async () => {
  const b = await servidor();
  const S = sembrar('AP4');
  const Otra = sembrar('AP4B');
  db.prepare('INSERT INTO nino (iglesia_id, nombre, autorizados) VALUES (?,?,?)')
    .run(Otra.iglesiaId, 'Ajeno', 'Rosa Diaz');
  const res = await fetch(b + '/api/directorio/perfil', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.rosaId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Rosa Distinta' })
  });
  assert.deepEqual((await res.json()).apariciones, { ninos: 0, predicas: 0 });
});

test('asistido: el pastor recibe el DETALLE — que fichas de ninos y cuantas predicas', async () => {
  const b = await servidor();
  const S = sembrar('AP5');
  sembrarRastros(S);
  const res = await fetch(b + `/api/admin/usuarios/${S.rosaId}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Rosa Diaz Perez' })
  });
  assert.equal(res.status, 200);
  const { apariciones } = await res.json();
  assert.equal(apariciones.ninos.length, 1);
  assert.equal(apariciones.ninos[0].nombre, 'Pedrito', 'el pastor ve QUE ficha revisar');
  assert.equal(apariciones.predicas, 2);
});

// --- Higiene A1: el nombre viaja dentro de un LIKE, y un LIKE tiene comodines.
// Nadie valida que un nombre no lleve % o _ (perfilSchema solo exige 1..120
// caracteres), asi que quien se ponga uno y luego se corrija recibiria el
// recuento de TODAS las fichas y prédicas de su iglesia. Un nombre es texto
// literal: no puede casar mas de lo que casaria escrito tal cual.
function persona(S, usuario, nombre) {
  return Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,'x',0,1)"
  ).run(S.iglesiaId, usuario, nombre).lastInsertRowid);
}

async function renombrarse(b, S, personaId, nombreNuevo) {
  const res = await fetch(b + '/api/directorio/perfil', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(personaId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: nombreNuevo })
  });
  assert.equal(res.status, 200);
  return (await res.json()).apariciones;
}

test('el % de un nombre no es un comodin: no arrastra las fichas ni las predicas de los demas', async () => {
  const b = await servidor();
  const S = sembrar('AP7');
  sembrarRastros(S);   // un nino autoriza a "Rosa Diaz"; una predica y un sermon suyos
  const comodinId = persona(S, 'com_AP7', '%');
  assert.deepEqual(await renombrarse(b, S, comodinId, 'Juana Soto'), { ninos: 0, predicas: 0 },
    'el texto literal "%" no esta escrito en ningun sitio; sin escapar saldrian 1 y 2');
});

test('el _ de un nombre tampoco: "R_sa Diaz" no encuentra a "Rosa Diaz"', async () => {
  const b = await servidor();
  const S = sembrar('AP8');
  sembrarRastros(S);
  const guionId = persona(S, 'gui_AP8', 'R_sa Diaz');
  assert.deepEqual(await renombrarse(b, S, guionId, 'Rosa Diaz'), { ninos: 0, predicas: 0 },
    'el _ casa "cualquier caracter" para SQLite, pero para una persona es solo un guion bajo');
});

// La barra es el caracter de escape, asi que hay que escaparla tambien. Si no,
// "Rosa\Diaz" se buscaria como "RosaDiaz": misma cantidad de fichas, pero las
// equivocadas. Por eso este va por la ruta del pastor, que dice CUAL ficha.
test('escapar no ciega la busqueda: un nombre con \\ encuentra su propio rastro y no el ajeno', async () => {
  const b = await servidor();
  const S = sembrar('AP9');
  db.prepare('INSERT INTO nino (iglesia_id, nombre, autorizados) VALUES (?,?,?)')
    .run(S.iglesiaId, 'Con barra', 'Rosa\\Diaz, tia Carmen');
  db.prepare('INSERT INTO nino (iglesia_id, nombre, autorizados) VALUES (?,?,?)')
    .run(S.iglesiaId, 'Sin barra', 'RosaDiaz');
  // Las predicas y los sermones son la otra consulta (y cada una lleva su
  // propio ESCAPE): un senuelo sin barra en cada tabla para que se note.
  db.prepare('INSERT INTO predica (iglesia_id, titulo, predicador) VALUES (?,?,?)')
    .run(S.iglesiaId, 'La fe', 'Rosa\\Diaz');
  db.prepare('INSERT INTO predica (iglesia_id, titulo, predicador) VALUES (?,?,?)')
    .run(S.iglesiaId, 'Senuelo', 'RosaDiaz');
  db.prepare('INSERT INTO sermon (iglesia_id, titulo, predicador) VALUES (?,?,?)')
    .run(S.iglesiaId, 'Bosquejo', 'Rosa\\Diaz');
  db.prepare('INSERT INTO sermon (iglesia_id, titulo, predicador) VALUES (?,?,?)')
    .run(S.iglesiaId, 'Senuelo', 'RosaDiaz');
  const barraId = persona(S, 'bar_AP9', 'Rosa\\Diaz');
  const res = await fetch(b + `/api/admin/usuarios/${barraId}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Rosa Diaz' })
  });
  assert.equal(res.status, 200);
  const { apariciones } = await res.json();
  assert.deepEqual(apariciones.ninos.map(n => n.nombre), ['Con barra'],
    'la barra es literal: ni se la traga la D ni casa la ficha sin barra');
  assert.equal(apariciones.predicas, 2, 'la predica y el sermon con barra, no los senuelos');
});

test('asistido: activar/desactivar sin tocar el nombre no trae apariciones', async () => {
  const b = await servidor();
  const S = sembrar('AP6');
  sembrarRastros(S);
  const res = await fetch(b + `/api/admin/usuarios/${S.rosaId}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ activo: false })
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).apariciones, undefined);
});
