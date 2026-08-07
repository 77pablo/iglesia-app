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

// ---------- Tarea 2: crear la serie y extenderla ----------

// El "hoy" del servidor es la fecha local de Chile (fechas.js).
async function hoyLocal() {
  const { fechaLocal } = await import('../src/fechas.js');
  return fechaLocal();
}
function sumarDiasISO(f, n) {
  const d = new Date(f + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const crearEvento = (cuerpo, quien = SEM.pastor) =>
  fetch(base + '/api/eventos', { method: 'POST', headers: H(quien), body: JSON.stringify(cuerpo) });

test('el pastor crea "todos los domingos": ~13 fechas aprobadas, 7 dias entre si, mismo serie_id', async () => {
  const hoy = await hoyLocal();
  const res = await crearEvento({ grupo_id: SEM.grupoId, titulo: 'Culto', fecha: hoy, repetir_semanal: true });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.ok(j.creados >= 12 && j.creados <= 14, `~13 fechas en 90 dias, salieron ${j.creados}`);

  const evs = db.prepare('SELECT fecha, estado, serie_id FROM evento ORDER BY fecha').all();
  assert.equal(evs.length, j.creados);
  assert.ok(evs.every(e => e.estado === 'aprobado'), 'todas nacen aprobadas (las crea el pastor)');
  assert.ok(evs.every(e => e.serie_id === evs[0].serie_id && e.serie_id !== null), 'todas de la misma serie');
  for (let i = 1; i < evs.length; i++)
    assert.equal(evs[i].fecha, sumarDiasISO(evs[i - 1].fecha, 7), 'exactamente una semana entre fechas');
  assert.ok(evs[evs.length - 1].fecha <= sumarDiasISO(hoy, 90), 'nada mas alla de 3 meses');

  const serie = db.prepare('SELECT * FROM serie WHERE id = ?').get(evs[0].serie_id);
  assert.equal(serie.activa, 1);
  assert.equal(serie.iglesia_id, SEM.iglesiaId);
});

test('un lider NO puede crear series: 403 y cero eventos', async () => {
  const hoy = await hoyLocal();
  const res = await crearEvento({ grupo_id: SEM.grupoId, titulo: 'Ensayo', fecha: hoy, repetir_semanal: true }, SEM.lider);
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM evento').get().n, 0);
});

test('una fecha de la serie que choca se salta y las demas se crean', async () => {
  const hoy = await hoyLocal();
  const ocupada = sumarDiasISO(hoy, 7);
  await crearEvento({ grupo_id: SEM.grupoId, titulo: 'Otro', fecha: ocupada, lugar: 'Templo', hora_inicio: '10:00', hora_fin: '12:00' });

  const res = await crearEvento({ grupo_id: SEM.grupoId, titulo: 'Culto', fecha: hoy, lugar: 'Templo',
    hora_inicio: '10:00', hora_fin: '12:00', repetir_semanal: true });
  assert.equal(res.status, 200);
  const j = await res.json();

  const serieEvs = db.prepare('SELECT fecha FROM evento WHERE serie_id IS NOT NULL ORDER BY fecha').all();
  assert.equal(serieEvs.length, j.creados);
  assert.ok(!serieEvs.some(e => e.fecha === ocupada), 'la semana ocupada se salto');
});

test('GET /api/eventos extiende una serie activa que se esta quedando corta; una apagada NO', async () => {
  const hoy = await hoyLocal();
  // Serie activa con su ultimo evento a solo 10 dias: le falta horizonte.
  const sA = Number(db.prepare('INSERT INTO serie (iglesia_id) VALUES (?)').run(SEM.iglesiaId).lastInsertRowid);
  db.prepare(`INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, hora_inicio, estado, creado_por, serie_id)
              VALUES (?,?,?,?,?,'aprobado',?,?)`)
    .run(SEM.iglesiaId, SEM.grupoId, 'Culto', sumarDiasISO(hoy, 10), '10:00', SEM.pastor.id, sA);
  // Serie apagada en la misma situacion: la lapida tiene que mandar.
  const sM = Number(db.prepare('INSERT INTO serie (iglesia_id, activa) VALUES (?, 0)').run(SEM.iglesiaId).lastInsertRowid);
  db.prepare(`INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, estado, creado_por, serie_id)
              VALUES (?,?,?,?,'aprobado',?,?)`)
    .run(SEM.iglesiaId, SEM.grupoId, 'Vigilia', sumarDiasISO(hoy, 10), SEM.pastor.id, sM);

  const res = await fetch(base + '/api/eventos', { headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);

  const deA = db.prepare('SELECT fecha, titulo, hora_inicio FROM evento WHERE serie_id = ? ORDER BY fecha').all(sA);
  assert.ok(deA.length > 1, 'la serie activa se extendio');
  assert.ok(deA[deA.length - 1].fecha > sumarDiasISO(hoy, 45), 'quedo con horizonte de sobra');
  assert.ok(deA[deA.length - 1].fecha <= sumarDiasISO(hoy, 90), 'sin pasarse de 3 meses');
  assert.ok(deA.every(e => e.titulo === 'Culto' && e.hora_inicio === '10:00'), 'copia el ultimo evento de la serie');

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM evento WHERE serie_id = ?').get(sM).n, 1,
    'la serie apagada NO resucita');
});

test('una serie activa que se quedo sin eventos se apaga (no hay de donde copiar)', async () => {
  const s = Number(db.prepare('INSERT INTO serie (iglesia_id) VALUES (?)').run(SEM.iglesiaId).lastInsertRowid);
  await fetch(base + '/api/eventos', { headers: H(SEM.miembro1) });
  assert.equal(db.prepare('SELECT activa FROM serie WHERE id = ?').get(s).activa, 0);
});

// ---------- Tarea 3: borrar esta y las siguientes ----------

async function serieSembrada() {
  const hoy = await hoyLocal();
  await crearEvento({ grupo_id: SEM.grupoId, titulo: 'Culto', fecha: sumarDiasISO(hoy, -14), repetir_semanal: true });
  const evs = db.prepare('SELECT id, fecha, serie_id FROM evento ORDER BY fecha').all();
  return { evs, serieId: evs[0].serie_id, hoy };
}

test('borrar la serie desde una fecha: futuras fuera CON su cascada, pasadas quedan, y NO resucita', async () => {
  const { evs, serieId } = await serieSembrada();
  const desde = evs[2].fecha;   // la tercera fecha: quedan dos de historia
  // Una futura tiene una asignacion: la cascada tiene que llevarsela.
  db.prepare("INSERT INTO asignacion (evento_id, persona_id, tipo) VALUES (?,?, 'predicar')")
    .run(evs[3].id, SEM.miembro1.id);

  const res = await fetch(base + `/api/eventos/serie/${serieId}?desde=${desde}`,
    { method: 'DELETE', headers: H(SEM.pastor) });
  assert.equal(res.status, 200);

  const quedan = db.prepare('SELECT fecha FROM evento WHERE serie_id = ? ORDER BY fecha').all(serieId);
  assert.equal(quedan.length, 2, 'solo las dos fechas anteriores a "desde"');
  assert.ok(quedan.every(e => e.fecha < desde));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM asignacion WHERE evento_id = ?').get(evs[3].id).n,
    0, 'la asignacion de la fecha borrada se fue con la cascada');
  assert.equal(db.prepare('SELECT activa FROM serie WHERE id = ?').get(serieId).activa, 0, 'la lapida quedo puesta');

  // El siguiente calendario NO la resucita.
  await fetch(base + '/api/eventos', { headers: H(SEM.miembro1) });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM evento WHERE serie_id = ?').get(serieId).n, 2);
});

test('un lider no puede borrar la serie: 403; y una serie de otra iglesia: 404', async () => {
  const { serieId } = await serieSembrada();
  assert.equal((await fetch(base + `/api/eventos/serie/${serieId}`,
    { method: 'DELETE', headers: H(SEM.lider) })).status, 403);
  const otraIg = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRASER')").run().lastInsertRowid);
  const sAjena = Number(db.prepare('INSERT INTO serie (iglesia_id) VALUES (?)').run(otraIg).lastInsertRowid);
  assert.equal((await fetch(base + `/api/eventos/serie/${sAjena}`,
    { method: 'DELETE', headers: H(SEM.pastor) })).status, 404, 'un 403 confirmaria que existe');
});

test('borrar UNA fecha suelta no toca las demas ni apaga la serie', async () => {
  const { evs, serieId } = await serieSembrada();
  const res = await fetch(base + '/api/eventos/' + evs[3].id, { method: 'DELETE', headers: H(SEM.pastor) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM evento WHERE serie_id = ?').get(serieId).n, evs.length - 1);
  assert.equal(db.prepare('SELECT activa FROM serie WHERE id = ?').get(serieId).activa, 1,
    'el feriado suelto no mata el culto de todas las semanas');
});
