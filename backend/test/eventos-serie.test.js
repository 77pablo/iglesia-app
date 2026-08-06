// ============================================================
//  Tanda H: eventos que se repiten ("todos los domingos").
//  Series semanales materializadas: filas reales de evento con serie_id,
//  extension automatica al abrir el calendario, y "borrar esta y las
//  siguientes" que apaga la serie (activa=0) para que no resucite.
//  Spec: docs/superpowers/specs/2026-08-06-eventos-serie-design.md
// ============================================================
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, srv, base, signToken, SEM;

before(async () => {
  db = await cargarDb();
  ({ signToken } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));
beforeEach(() => {
  reiniciar(db);
  db.exec('DELETE FROM evento');
  db.exec('DELETE FROM serie');
  SEM = sembrarMinimo(db);
});

const H = (p) => ({ 'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: SEM.iglesiaId }) });

// ---------- Tarea 1: migraciones ----------

test('migraciones: existen serie y evento.serie_id, y fecha_no_disp.repetir YA NO; correrlas dos veces no rompe', async () => {
  const colsEvento = db.prepare('PRAGMA table_info(evento)').all().map(c => c.name);
  assert.ok(colsEvento.includes('serie_id'), 'falta evento.serie_id');

  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='serie'").all();
  assert.equal(tablas.length, 1, 'falta la tabla serie');

  const colsNoDisp = db.prepare('PRAGMA table_info(fecha_no_disp)').all().map(c => c.name);
  assert.ok(!colsNoDisp.includes('repetir'),
    'fecha_no_disp.repetir sigue ahi: nadie la escribio nunca (cero INSERT en la historia del repo) y la tanda H la retira');

  // Idempotencia: simular un segundo arranque contra la MISMA base.
  const { migrarQuitarRepetir } = await import('../src/db.js');
  migrarQuitarRepetir();
  assert.ok(db.prepare('PRAGMA table_info(fecha_no_disp)').all().length >= 4, 'la tabla sobrevive la segunda pasada');
});
