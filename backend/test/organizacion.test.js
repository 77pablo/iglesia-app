// ============================================================
//  Organización de eventos: hoja (cosas + gastos), permisos y cascadas.
// ============================================================
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';

let db;
before(async () => { db = await cargarDb(); });

test('el esquema crea las 3 tablas y el índice único por evento', () => {
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['evento_org', 'evento_org_cosa', 'evento_org_gasto'])
    assert.ok(tablas.includes(t), 'falta la tabla ' + t);

  db.exec('PRAGMA foreign_keys = ON');
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Org A','ORGA')").run();
  const iglesiaId = Number(ig.lastInsertRowid);
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha) VALUES (?, 'Culto', '2026-08-01')").run(iglesiaId);
  const eventoId = Number(ev.lastInsertRowid);
  db.prepare('INSERT INTO evento_org (iglesia_id, evento_id) VALUES (?,?)').run(iglesiaId, eventoId);
  // Segunda hoja para el MISMO evento: debe fallar por el índice único.
  assert.throws(() => db.prepare('INSERT INTO evento_org (iglesia_id, evento_id) VALUES (?,?)').run(iglesiaId, eventoId));
  // Dos hojas SUELTAS (evento_id NULL) sí conviven (índice parcial).
  db.prepare("INSERT INTO evento_org (iglesia_id, titulo) VALUES (?, 'Suelta 1')").run(iglesiaId);
  db.prepare("INSERT INTO evento_org (iglesia_id, titulo) VALUES (?, 'Suelta 2')").run(iglesiaId);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org WHERE evento_id IS NULL AND iglesia_id = ?').get(iglesiaId).n, 2);
});
