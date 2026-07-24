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
