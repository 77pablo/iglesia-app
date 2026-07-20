// ============================================================
//  Portal público (Fase 7) — pruebas
//  Cubre: el endpoint público solo devuelve eventos APROBADOS futuros
//  (nunca pendientes/rechazados ni notas privadas de la prédica),
//  el formulario de contacto guarda + notifica al pastor, editar la
//  info requiere pastor (feligrés 403), y aislamiento estricto entre
//  iglesias (codigo_unico de una NO expone datos de otra).
// ============================================================
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

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
beforeEach(() => {
  reiniciar(db);
  db.exec('DELETE FROM evento');
  db.exec('DELETE FROM predica');
  db.exec('DELETE FROM iglesia_info');
  db.exec('DELETE FROM contacto_publico');
});

const H = (p, iglesiaId) => ({ 'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId }) });

function manana(dias = 1) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
function ayer() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

test('GET /api/publico/:codigo: iglesia no encontrada -> 404', async () => {
  const res = await fetch(base + '/api/publico/NOEXISTE');
  assert.equal(res.status, 404);
});

test('GET /api/publico/:codigo: solo devuelve eventos APROBADOS con fecha futura (nunca pendientes/rechazados/pasados)', async () => {
  const SEM = sembrarMinimo(db);
  const insEv = db.prepare(
    `INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, estado) VALUES (?,?,?,?,?)`
  );
  insEv.run(SEM.iglesiaId, SEM.grupoId, 'Culto de domingo (aprobado, futuro)', manana(3), 'aprobado');
  insEv.run(SEM.iglesiaId, SEM.grupoId, 'Reunion secreta (pendiente)', manana(2), 'pendiente');
  insEv.run(SEM.iglesiaId, SEM.grupoId, 'Actividad rechazada', manana(4), 'rechazado');
  insEv.run(SEM.iglesiaId, SEM.grupoId, 'Culto aprobado pero ya paso', ayer(), 'aprobado');

  const res = await fetch(base + '/api/publico/TEST');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.nombre, 'Test');
  assert.equal(data.eventos.length, 1);
  assert.equal(data.eventos[0].titulo, 'Culto de domingo (aprobado, futuro)');
  // Nunca expone campos internos como estado, grupo_id, creado_por
  assert.equal(data.eventos[0].estado, undefined);
  assert.equal(data.eventos[0].creado_por, undefined);
});

test('GET /api/publico/:codigo: expone la ultima predica SOLO con titulo/fecha/predicador, nunca las notas privadas', async () => {
  const SEM = sembrarMinimo(db);
  db.prepare('INSERT INTO predica (iglesia_id, titulo, fecha, predicador, notas) VALUES (?,?,?,?,?)')
    .run(SEM.iglesiaId, 'Predica antigua', '2020-01-01', 'Pastor Antiguo', 'notas privadas viejas');
  db.prepare('INSERT INTO predica (iglesia_id, titulo, fecha, predicador, notas) VALUES (?,?,?,?,?)')
    .run(SEM.iglesiaId, 'La fe que mueve montañas', '2026-01-05', 'Pastor', 'NOTA PRIVADA: no debe salir en el portal');

  const res = await fetch(base + '/api/publico/TEST');
  const data = await res.json();
  assert.ok(data.predica);
  assert.equal(data.predica.titulo, 'La fe que mueve montañas');
  assert.equal(data.predica.predicador, 'Pastor');
  assert.equal(data.predica.notas, undefined);
  assert.equal(JSON.stringify(data).includes('NOTA PRIVADA'), false);
});

test('GET /api/publico/:codigo: sin eventos/predica/info devuelve estructura vacia segura (placeholders en frontend)', async () => {
  sembrarMinimo(db);
  const res = await fetch(base + '/api/publico/TEST');
  const data = await res.json();
  assert.deepEqual(data.eventos, []);
  assert.equal(data.predica, null);
  assert.equal(data.info.horarios, null);
});

test('GET /api/publico/:codigo: NO expone nada de personas, tesoreria, asistencia ni chat', async () => {
  const SEM = sembrarMinimo(db);
  const res = await fetch(base + '/api/publico/TEST');
  const data = await res.json();
  const texto = JSON.stringify(data);
  assert.ok(!('persona' in data) && !('personas' in data));
  assert.ok(!texto.includes(SEM.pastor.usuario));
  assert.ok(!('movimientos' in data) && !('tesoreria' in data));
  assert.ok(!('asistencia' in data) && !('mensajes' in data));
});

test('POST /api/publico/:codigo/contacto: guarda el mensaje y notifica a los pastores de ESA iglesia', async () => {
  const SEM = sembrarMinimo(db);
  const res = await fetch(base + '/api/publico/TEST/contacto', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Visitante Juan', mensaje: 'Quisiera visitar el próximo domingo' })
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  const fila = db.prepare('SELECT * FROM contacto_publico WHERE iglesia_id = ?').get(SEM.iglesiaId);
  assert.ok(fila);
  assert.equal(fila.nombre, 'Visitante Juan');
  assert.match(fila.mensaje, /visitar/);

  const notif = db.prepare("SELECT * FROM notificacion WHERE persona_id = ? AND tipo = 'contacto_publico'").all(SEM.pastor.id);
  assert.equal(notif.length, 1);
  assert.match(notif[0].texto, /Visitante Juan/);
});

test('POST /api/publico/:codigo/contacto: valida nombre y mensaje no vacios', async () => {
  sembrarMinimo(db);
  const res = await fetch(base + '/api/publico/TEST/contacto', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: '', mensaje: '' })
  });
  assert.equal(res.status, 400);
});

test('POST /api/publico/:codigo/contacto: iglesia no encontrada -> 404 (no crea filas huerfanas)', async () => {
  const res = await fetch(base + '/api/publico/NOEXISTE/contacto', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'X', mensaje: 'Y' })
  });
  assert.equal(res.status, 404);
  const n = db.prepare('SELECT COUNT(*) AS n FROM contacto_publico').get().n;
  assert.equal(n, 0);
});

test('GET /api/publico/info: requiere sesion (401 sin token)', async () => {
  const res = await fetch(base + '/api/publico/info');
  assert.equal(res.status, 401);
});

test('GET /api/publico/info y PATCH /api/publico/info: solo el pastor; un feligres recibe 403', async () => {
  const SEM = sembrarMinimo(db);
  let res = await fetch(base + '/api/publico/info', { headers: H(SEM.miembro1, SEM.iglesiaId) });
  assert.equal(res.status, 403);

  res = await fetch(base + '/api/publico/info', {
    method: 'PATCH', headers: H(SEM.miembro1, SEM.iglesiaId),
    body: JSON.stringify({ horarios: 'Domingos 10:00' })
  });
  assert.equal(res.status, 403);

  res = await fetch(base + '/api/publico/info', { headers: H(SEM.pastor, SEM.iglesiaId) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).horarios, null);
});

test('PATCH /api/publico/info (pastor): guarda y el portal publico refleja los cambios', async () => {
  const SEM = sembrarMinimo(db);
  const res = await fetch(base + '/api/publico/info', {
    method: 'PATCH', headers: H(SEM.pastor, SEM.iglesiaId),
    body: JSON.stringify({
      horarios: 'Domingos 10:00 y 18:00',
      direccion: 'Calle Falsa 123',
      telefono: '+56911112222',
      descripcion: 'Una familia que te espera con los brazos abiertos.'
    })
  });
  assert.equal(res.status, 200);

  const pub = await (await fetch(base + '/api/publico/TEST')).json();
  assert.equal(pub.info.horarios, 'Domingos 10:00 y 18:00');
  assert.equal(pub.info.direccion, 'Calle Falsa 123');
  assert.equal(pub.info.telefono, '+56911112222');
  assert.match(pub.info.descripcion, /familia/);

  // PATCH parcial: un segundo cambio de un solo campo no borra los demas
  const res2 = await fetch(base + '/api/publico/info', {
    method: 'PATCH', headers: H(SEM.pastor, SEM.iglesiaId),
    body: JSON.stringify({ telefono: '+56933334444' })
  });
  assert.equal(res2.status, 200);
  const pub2 = await (await fetch(base + '/api/publico/TEST')).json();
  assert.equal(pub2.info.telefono, '+56933334444');
  assert.equal(pub2.info.direccion, 'Calle Falsa 123');
});

test('aislamiento estricto: el portal de una iglesia NUNCA expone eventos, predica ni info de otra iglesia', async () => {
  const SEM = sembrarMinimo(db);
  const ig2 = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra Iglesia','OTRA2')").run();
  const iglesia2Id = Number(ig2.lastInsertRowid);
  const pastor2 = db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,1,1)"
  ).run(iglesia2Id, 'pastor2', 'Pastor Dos', 'x');

  db.prepare('INSERT INTO evento (iglesia_id, titulo, fecha, estado) VALUES (?,?,?,?)')
    .run(iglesia2Id, 'Evento secreto de otra iglesia', manana(2), 'aprobado');
  db.prepare('INSERT INTO predica (iglesia_id, titulo, fecha, predicador) VALUES (?,?,?,?)')
    .run(iglesia2Id, 'Predica de otra iglesia', '2026-01-01', 'Pastor Dos');
  db.prepare('INSERT INTO iglesia_info (iglesia_id, horarios) VALUES (?,?)').run(iglesia2Id, 'Horario secreto');

  db.prepare('INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, estado) VALUES (?,?,?,?,?)')
    .run(SEM.iglesiaId, SEM.grupoId, 'Evento de TEST', manana(2), 'aprobado');

  const res = await fetch(base + '/api/publico/TEST');
  const data = await res.json();
  assert.equal(data.eventos.length, 1);
  assert.equal(data.eventos[0].titulo, 'Evento de TEST');
  assert.equal(data.predica, null);
  assert.equal(data.info.horarios, null);
  assert.ok(!JSON.stringify(data).includes('otra iglesia'));
  assert.ok(!JSON.stringify(data).includes('secreto'));

  // Contacto enviado al codigo TEST solo notifica al pastor de TEST, no al de OTRA2
  await fetch(base + '/api/publico/TEST/contacto', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Visitante', mensaje: 'Hola' })
  });
  const notifOtro = db.prepare("SELECT * FROM notificacion WHERE persona_id = ? AND tipo = 'contacto_publico'")
    .all(Number(pastor2.lastInsertRowid));
  assert.equal(notifOtro.length, 0);
});
