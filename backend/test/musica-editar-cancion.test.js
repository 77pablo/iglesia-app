// ============================================================
//  Editar una canción: los campos que no se tocan viajan como null.
//
//  El visor de acordes (web/app.js, guardarLetraCancion) reenvía la canción
//  entera desde su copia en memoria — titulo, autor, enlace — y solo cambia
//  tono y letra. Las canciones sembradas tienen autor/enlace NULL, así que el
//  PATCH llega con nulos de verdad. El handler ya estaba escrito para eso
//  (`autor ?? c.autor` = "si no viene, deja lo que había"), pero el esquema no:
//  z.string().optional() admite ausente o cadena, NO nulo. Resultado: guardar
//  los acordes devolvía 400 y el líder de música no podía guardar nada.
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

const tok = (personaId, iglesiaId) => signToken({ id: personaId, iglesia_id: iglesiaId });

// Una iglesia con su líder de música y una canción sembrada como las de verdad:
// con autor y enlace en NULL, que es justo el caso que rompía.
function sembrarMusica(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const lid = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)")
    .run(iglesiaId, 'mus_' + codigo, 'Lider de Musica', 'x');
  const liderId = Number(lid.lastInsertRowid);
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Musica', '#2f7')").run(iglesiaId);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'lider_musica')")
    .run(liderId, Number(g.lastInsertRowid));
  const c = db.prepare('INSERT INTO cancion (iglesia_id, titulo, autor, tono, enlace, letra) VALUES (?,?,NULL,?,NULL,NULL)')
    .run(iglesiaId, 'Sublime Gracia', 'RE');
  return { iglesiaId, liderId, cancionId: Number(c.lastInsertRowid) };
}

const patch = (b, S, body) => fetch(b + '/api/musica/canciones/' + S.cancionId, {
  method: 'PATCH',
  headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

test('guardar acordes reenviando autor/enlace nulos: se guarda y no los pisa', async () => {
  const b = await servidor();
  const S = sembrarMusica('MUS1');
  // Exactamente lo que manda guardarLetraCancion de una canción sembrada.
  const res = await patch(b, S, {
    titulo: 'Sublime Gracia', autor: null, enlace: null,
    tono: 'MI', letra: 'RE          SOL\nSublime gracia'
  });
  assert.equal(res.status, 200, 'guardar los acordes no puede dar 400 por reenviar nulos');

  const c = db.prepare('SELECT * FROM cancion WHERE id = ?').get(S.cancionId);
  assert.equal(c.tono, 'MI');
  assert.match(c.letra, /Sublime gracia/);
  // El nulo significa "no lo toques", no "bórralo": aquí ya eran null y siguen null.
  assert.equal(c.autor, null);
  assert.equal(c.enlace, null);
});

test('un nulo NO borra el valor que ya existía', async () => {
  const b = await servidor();
  const S = sembrarMusica('MUS2');
  db.prepare("UPDATE cancion SET autor = 'John Newton', enlace = 'https://youtu.be/abc' WHERE id = ?").run(S.cancionId);

  const res = await patch(b, S, { titulo: 'Sublime Gracia', autor: null, enlace: null, tono: 'FA', letra: 'x' });
  assert.equal(res.status, 200);

  const c = db.prepare('SELECT * FROM cancion WHERE id = ?').get(S.cancionId);
  assert.equal(c.tono, 'FA');
  assert.equal(c.autor, 'John Newton', 'el autor existente no se pierde al guardar acordes');
  assert.equal(c.enlace, 'https://youtu.be/abc', 'el enlace existente no se pierde al guardar acordes');
});

test('el candado del enlace externo sigue puesto: un enlace no nulo se valida igual', async () => {
  const b = await servidor();
  const S = sembrarMusica('MUS3');
  const res = await patch(b, S, { titulo: 'Sublime Gracia', enlace: 'javascript:alert(1)', tono: 'SOL' });
  assert.equal(res.status, 400, 'admitir null no puede abrir la puerta a cualquier cadena');

  const ok = await patch(b, S, { titulo: 'Sublime Gracia', enlace: 'https://youtu.be/xyz', tono: 'SOL' });
  assert.equal(ok.status, 200);
  assert.equal(db.prepare('SELECT enlace FROM cancion WHERE id = ?').get(S.cancionId).enlace, 'https://youtu.be/xyz');
});

test('crear una canción mandando autor/enlace nulos tampoco falla', async () => {
  const b = await servidor();
  const S = sembrarMusica('MUS4');
  const res = await fetch(b + '/api/musica/canciones', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo: 'Cancion Nueva', autor: null, tono: null, enlace: null, letra: null })
  });
  assert.equal(res.status, 200);
  const { id } = await res.json();
  const c = db.prepare('SELECT * FROM cancion WHERE id = ?').get(id);
  assert.equal(c.titulo, 'Cancion Nueva');
  assert.equal(c.autor, null);
});
