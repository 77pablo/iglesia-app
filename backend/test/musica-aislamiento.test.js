// ============================================================
//  Borrar una cancion no puede tocar el orden del servicio de OTRA iglesia.
//
//  DELETE /api/musica/canciones/:id hacia esto:
//
//      DELETE FROM setlist_item WHERE cancion_id = ?      <- id CRUDO de la URL
//      DELETE FROM cancion WHERE id = ? AND iglesia_id = ?  <- el filtro, tarde
//
//  El aislamiento estaba en la segunda linea, y la primera ya habia borrado.
//  Un lider de musica de la iglesia A que pusiera en la URL el id de una cancion
//  de la iglesia B recibia un 404 —"Cancion no encontrada", o sea "aqui no ha
//  pasado nada"— mientras el orden del servicio del domingo de B desaparecia.
//  La cancion de B sobrevivia, asi que ni siquiera quedaba rastro visible: el
//  domingo el lider de B abre su setlist y esta vacio, sin explicacion.
//
//  El mismo patron ya estaba bien resuelto en DELETE /setlist/item/:id
//  (musica.js:107), que acota con IN (SELECT ... WHERE iglesia_id = ?).
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

// Una iglesia con su lider de musica, una cancion, un evento y esa cancion ya
// puesta en el orden del servicio de ese evento.
function sembrarIglesiaConSetlist(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const lid = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)")
    .run(iglesiaId, 'mus_' + codigo, 'Lider de Musica ' + codigo, 'x');
  const liderId = Number(lid.lastInsertRowid);
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Musica', '#2f7')").run(iglesiaId);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'lider_musica')")
    .run(liderId, Number(g.lastInsertRowid));
  const c = db.prepare('INSERT INTO cancion (iglesia_id, titulo, tono) VALUES (?,?,?)')
    .run(iglesiaId, 'Sublime Gracia ' + codigo, 'RE');
  const cancionId = Number(c.lastInsertRowid);
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha, estado) VALUES (?,?,?,'aprobado')")
    .run(iglesiaId, 'Culto ' + codigo, '2026-08-02');
  const eventoId = Number(ev.lastInsertRowid);
  db.prepare('INSERT INTO setlist_item (evento_id, cancion_id, orden, tono_dia) VALUES (?,?,1,?)')
    .run(eventoId, cancionId, 'RE');
  return { iglesiaId, liderId, cancionId, eventoId };
}

const itemsDe = eventoId =>
  db.prepare('SELECT COUNT(*) AS n FROM setlist_item WHERE evento_id = ?').get(eventoId).n;

test('un lider de musica NO puede vaciar el orden del servicio de otra iglesia', async () => {
  const b = await servidor();
  const A = sembrarIglesiaConSetlist('MUSA');
  const B = sembrarIglesiaConSetlist('MUSB');

  assert.equal(itemsDe(B.eventoId), 1, 'el setlist de B empieza con su cancion');

  // El lider de A pide borrar una cancion de B poniendo su id en la URL.
  const res = await fetch(b + '/api/musica/canciones/' + B.cancionId, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + tok(A.liderId, A.iglesiaId) }
  });

  assert.equal(res.status, 404, 'para A esa cancion no existe');
  assert.equal(
    itemsDe(B.eventoId), 1,
    'el orden del servicio de B tiene que seguir intacto: un 404 no puede haber borrado nada'
  );
  const cancionB = db.prepare('SELECT id FROM cancion WHERE id = ?').get(B.cancionId);
  assert.ok(cancionB, 'la cancion de B tampoco se toca');
});

test('el lider SI puede borrar su propia cancion, y se lleva su linea del setlist', async () => {
  // Control positivo: el arreglo no puede consistir en no borrar nunca.
  const b = await servidor();
  const A = sembrarIglesiaConSetlist('MUSC');

  const res = await fetch(b + '/api/musica/canciones/' + A.cancionId, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + tok(A.liderId, A.iglesiaId) }
  });

  assert.equal(res.status, 200);
  assert.equal(itemsDe(A.eventoId), 0, 'su cancion sale tambien del orden del servicio');
  assert.equal(db.prepare('SELECT id FROM cancion WHERE id = ?').get(A.cancionId), undefined);
});

test('borrar una cancion que no existe da 404 y no revienta', async () => {
  const b = await servidor();
  const A = sembrarIglesiaConSetlist('MUSD');
  const res = await fetch(b + '/api/musica/canciones/999999', {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + tok(A.liderId, A.iglesiaId) }
  });
  assert.equal(res.status, 404);
  assert.equal(itemsDe(A.eventoId), 1, 'el setlist propio no se toca por un id inexistente');
});
