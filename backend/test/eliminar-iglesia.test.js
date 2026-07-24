// ============================================================
//  Eliminar iglesia: borrado en cascada, transaccional y aislado.
// ============================================================
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';

let db, borrarDatosIglesia;

before(async () => {
  db = await cargarDb();
  ({ borrarDatosIglesia } = await import('../src/eliminarIglesia.js'));
});

// Siembra una iglesia con datos cruzados en varias tablas y devuelve sus ids.
function sembrarIglesiaRica(db, nombre, codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run(nombre, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const pas = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,1,1)")
    .run(iglesiaId, 'pastor_' + codigo, 'Pastor', 'x');
  const pastorId = Number(pas.lastInsertRowid);
  const mie = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)")
    .run(iglesiaId, 'm_' + codigo, 'Miembro', 'x');
  const miembroId = Number(mie.lastInsertRowid);
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  const grupoId = Number(g.lastInsertRowid);
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(miembroId, grupoId, 'miembro');
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha, grupo_id) VALUES (?, 'Culto', '2026-07-30', ?)").run(iglesiaId, grupoId);
  const eventoId = Number(ev.lastInsertRowid);
  db.prepare('INSERT INTO asistencia (evento_id, persona_id) VALUES (?,?)').run(eventoId, miembroId);
  db.prepare("INSERT INTO movimiento (iglesia_id, tipo, monto, descripcion) VALUES (?, 'ingreso', 100, 'Ofrenda')").run(iglesiaId);
  const cv = db.prepare("INSERT INTO conversacion (iglesia_id, tipo, creado_por) VALUES (?, 'directo', ?)").run(iglesiaId, pastorId);
  const convId = Number(cv.lastInsertRowid);
  db.prepare('INSERT INTO conversacion_miembro (conversacion_id, persona_id) VALUES (?,?)').run(convId, pastorId);
  db.prepare('INSERT INTO mensaje (conversacion_id, persona_id, texto) VALUES (?,?,?)').run(convId, pastorId, 'hola');
  return { iglesiaId, pastorId, miembroId, grupoId, eventoId, convId };
}

// Cuenta cuántas filas hay en TODA tabla con iglesia_id para una iglesia dada.
function filasDirectas(db, iglesiaId) {
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  let total = 0;
  for (const t of tablas) {
    if (t === 'iglesia') continue;
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    if (cols.includes('iglesia_id')) total += db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE iglesia_id = ?`).get(iglesiaId).n;
  }
  return total;
}

test('borra TODOS los datos de la iglesia y deja las demás intactas', () => {
  db.exec('PRAGMA foreign_keys = ON');
  const A = sembrarIglesiaRica(db, 'Iglesia A', 'AAA');
  const B = sembrarIglesiaRica(db, 'Iglesia B', 'BBB');

  const bAntes = filasDirectas(db, B.iglesiaId);
  const bMsgAntes = db.prepare('SELECT COUNT(*) n FROM mensaje WHERE conversacion_id = ?').get(B.convId).n;

  borrarDatosIglesia(A.iglesiaId);

  // A: nada queda
  assert.equal(db.prepare('SELECT COUNT(*) n FROM iglesia WHERE id = ?').get(A.iglesiaId).n, 0);
  assert.equal(filasDirectas(db, A.iglesiaId), 0, 'quedaron filas con iglesia_id de A');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pertenencia WHERE persona_id = ?').get(A.miembroId).n, 0, 'pertenencia huérfana de A');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM asistencia WHERE evento_id = ?').get(A.eventoId).n, 0, 'asistencia huérfana de A');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM mensaje WHERE conversacion_id = ?').get(A.convId).n, 0, 'mensaje huérfano de A');

  // Sin referencias rotas en toda la BD
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0, 'quedaron referencias huérfanas');

  // B: intacta
  assert.equal(filasDirectas(db, B.iglesiaId), bAntes, 'se tocó la iglesia B');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM mensaje WHERE conversacion_id = ?').get(B.convId).n, bMsgAntes);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('recolectarArchivos: solo /uploads/ de la iglesia', async () => {
  const { recolectarArchivos } = await import('../src/eliminarIglesia.js');
  db.exec('PRAGMA foreign_keys = ON');
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Con Fotos','FOTOS')").run();
  const iglesiaId = Number(ig.lastInsertRowid);
  // foto subida (cuenta) + asset del sistema (NO cuenta) + externo (NO cuenta)
  db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo, foto_url) VALUES (?,?,?,?,1,?)")
    .run(iglesiaId, 'con_foto', 'Con Foto', 'x', '/uploads/foto1.jpg');
  db.prepare("INSERT INTO material_musica (iglesia_id, titulo, archivo_url) VALUES (?, 'Himno', '/assets/himnario-nuevo.pdf')").run(iglesiaId);
  db.prepare("INSERT INTO material_musica (iglesia_id, titulo, archivo_url) VALUES (?, 'Partitura', '/uploads/part.pdf')").run(iglesiaId);

  const urls = recolectarArchivos(iglesiaId).sort();
  assert.deepEqual(urls, ['/uploads/foto1.jpg', '/uploads/part.pdf']);
});

test('eliminarIglesiaCompleta: borra datos y archivos; null si no existe', async () => {
  const { eliminarIglesiaCompleta } = await import('../src/eliminarIglesia.js');
  // UPLOADS_DIR temporal con dos archivos reales
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
  process.env.UPLOADS_DIR = dir;
  fs.writeFileSync(path.join(dir, 'foto1.jpg'), 'x');
  fs.writeFileSync(path.join(dir, 'part.pdf'), 'x');

  db.exec('PRAGMA foreign_keys = ON');
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Borrar','BORRAR')").run();
  const iglesiaId = Number(ig.lastInsertRowid);
  db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo, foto_url) VALUES (?,?,?,?,1,?)")
    .run(iglesiaId, 'x', 'X', 'x', '/uploads/foto1.jpg');
  db.prepare("INSERT INTO material_musica (iglesia_id, titulo, archivo_url) VALUES (?, 'P', '/uploads/part.pdf')").run(iglesiaId);

  const res = eliminarIglesiaCompleta(iglesiaId);
  assert.equal(res.nombre, 'Borrar');
  assert.equal(res.codigo, 'BORRAR');
  assert.equal(res.archivosBorrados, 2);
  assert.equal(fs.existsSync(path.join(dir, 'foto1.jpg')), false);
  assert.equal(fs.existsSync(path.join(dir, 'part.pdf')), false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM iglesia WHERE id = ?').get(iglesiaId).n, 0);

  assert.equal(eliminarIglesiaCompleta(999999), null);
});

test('endpoint DELETE: gate, 404, borrado y auditoría a nivel sistema', async () => {
  const { signToken } = await import('../src/auth.js');
  const { app } = await import('../src/server.js');
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    db.exec('PRAGMA foreign_keys = ON');
    // super-admin
    const sa = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (NULL,'sa_del','SA','x','super_admin',1)").run();
    const saTok = signToken({ id: Number(sa.lastInsertRowid), iglesia_id: null });
    // iglesia con un pastor (feligrés normal, para probar el gate 403)
    const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Del','DEL')").run();
    const iglesiaId = Number(ig.lastInsertRowid);
    const pas = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,1,1)").run(iglesiaId, 'p', 'P', 'x');
    const pastorTok = signToken({ id: Number(pas.lastInsertRowid), iglesia_id: iglesiaId });

    // 403: un pastor no puede
    let res = await fetch(base + '/api/superadmin/iglesias/' + iglesiaId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + pastorTok } });
    assert.equal(res.status, 403);

    // 404: iglesia inexistente
    res = await fetch(base + '/api/superadmin/iglesias/999999', { method: 'DELETE', headers: { Authorization: 'Bearer ' + saTok } });
    assert.equal(res.status, 404);

    // 200: super-admin elimina
    res = await fetch(base + '/api/superadmin/iglesias/' + iglesiaId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + saTok } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.eliminada.codigo, 'DEL');

    // La iglesia ya no existe
    assert.equal(db.prepare('SELECT COUNT(*) n FROM iglesia WHERE id = ?').get(iglesiaId).n, 0);
    // Auditoría a nivel sistema (iglesia_id = NULL) sobrevive
    const log = db.prepare("SELECT * FROM auditoria WHERE accion = 'superadmin_eliminar_iglesia' AND iglesia_id IS NULL ORDER BY id DESC LIMIT 1").get();
    assert.ok(log, 'no se registró la auditoría del borrado');
  } finally {
    await new Promise(r => srv.close(r));
  }
});
