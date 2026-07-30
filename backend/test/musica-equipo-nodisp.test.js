// ============================================================
//  El equipo de musica tambien debe avisar si la persona marco
//  "no disponible" para la fecha del evento.
//
//  Habia DOS caminos por los que a alguien le asignan servir, y solo
//  uno consultaba fecha_no_disp: POST /api/asignaciones (asignaciones.js:51-54)
//  si la consulta y devuelve `aviso`; POST /api/musica/plan/:eventoId/equipo
//  no la consultaba nunca. Y musica es justo donde mas rota la gente.
//
//  Avisa, NUNCA bloquea: el integrante se agrega igual, solo cambia el
//  aviso que recibe quien arma el equipo (el lider de musica).
// ============================================================
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar } from './helpers.js';

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

beforeEach(() => reiniciar(db));

// Una iglesia con su lider de musica, un musico y un evento (culto del domingo).
function sembrar() {
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Test','TEST')").run();
  const iglesiaId = Number(ig.lastInsertRowid);
  const insP = db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)"
  );
  const lider = Number(insP.run(iglesiaId, 'lidermus', 'Lider Musica', 'x').lastInsertRowid);
  const musico = Number(insP.run(iglesiaId, 'musico1', 'Musico Uno', 'x').lastInsertRowid);
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Musica', '#2f7')").run(iglesiaId);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'lider_musica')")
    .run(lider, Number(g.lastInsertRowid));
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha, estado) VALUES (?,?,?,'aprobado')")
    .run(iglesiaId, 'Culto', '2026-08-09');
  const eventoId = Number(ev.lastInsertRowid);
  return { iglesiaId, lider, musico, eventoId };
}

const tok = (id, iglesiaId) => signToken({ id, iglesia_id: iglesiaId });

const agregar = (S, instrumento = 'Voz') => fetch(base + '/api/musica/plan/' + S.eventoId + '/equipo', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok(S.lider, S.iglesiaId) },
  body: JSON.stringify({ persona_id: S.musico, instrumento })
});

test('marco no disponible esa fecha -> al agregarlo al equipo llega el aviso, y se agrega igual', async () => {
  const S = sembrar();
  db.prepare('INSERT INTO fecha_no_disp (persona_id, desde, hasta, motivo) VALUES (?,?,?,?)')
    .run(S.musico, '2026-08-05', '2026-08-12', 'Viaje');

  const res = await agregar(S);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.aviso || '', /no disponible/i);
  assert.match(body.aviso, /Viaje/);

  const n = db.prepare('SELECT COUNT(*) AS n FROM equipo_musica WHERE evento_id=? AND persona_id=?')
    .get(S.eventoId, S.musico).n;
  assert.equal(n, 1, 'el aviso no bloquea: el integrante se agrega igual');
});

test('sin marcar nada -> sin aviso', async () => {
  const S = sembrar();
  const res = await agregar(S);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.aviso, null);
});
