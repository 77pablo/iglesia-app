// ============================================================
//  Permisos INTRA-iglesia: un rol no debe poder hacer mas de lo
//  que le corresponde DENTRO de su propia iglesia (el aislamiento
//  ENTRE iglesias ya esta cubierto en otros archivos de test).
//  Cubre: cuidado.js, mensajes.js /custom, asignaciones.js,
//  facial.js, anuncios.js + notificaciones.js (segmentacion).
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

// reiniciar() (helpers.js) solo limpia mensaje/conversacion*/pertenencia/grupo/
// persona/iglesia. Aqui usamos ademas evento/asignacion/anuncio/notificacion/
// caso_cuidado/contacto_cuidado, asi que los limpiamos tambien entre tests.
function limpiarExtra() {
  for (const t of ['contacto_cuidado', 'caso_cuidado', 'asignacion', 'evento',
                    'anuncio', 'notificacion', 'auditoria'])
    db.exec('DELETE FROM ' + t);
}
beforeEach(() => { limpiarExtra(); reiniciar(db); SEM = sembrarMinimo(db); });

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

// ------------------------------------------------------------
// 1. cuidado.js — el obispo (solo-lectura) NO crea/edita casos.
// ------------------------------------------------------------
test('cuidado.js: el pastor SI puede crear un caso', async () => {
  const res = await fetch(base + '/api/cuidado', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ persona_id: SEM.miembro1.id, motivo: 'visita' })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('cuidado.js: el obispo (rol_global=obispo) NO puede crear un caso (403), pero SI puede listar (GET)', async () => {
  db.prepare("UPDATE persona SET rol_global = 'obispo' WHERE id = ?").run(SEM.ajeno.id);

  let res = await fetch(base + '/api/cuidado', {
    method: 'POST', headers: H(SEM.ajeno),
    body: JSON.stringify({ persona_id: SEM.miembro1.id, motivo: 'visita' })
  });
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM caso_cuidado').get().n, 0);

  res = await fetch(base + '/api/cuidado', { headers: H(SEM.ajeno) });
  assert.equal(res.status, 200);
});

test('cuidado.js: el obispo tampoco puede registrar contacto ni marcar atendido', async () => {
  db.prepare("UPDATE persona SET rol_global = 'obispo' WHERE id = ?").run(SEM.ajeno.id);
  const casoId = Number(db.prepare(
    "INSERT INTO caso_cuidado (iglesia_id, persona_id, motivo, estado) VALUES (?,?,?, 'abierto')"
  ).run(SEM.iglesiaId, SEM.miembro1.id, 'otro').lastInsertRowid);

  let res = await fetch(base + `/api/cuidado/${casoId}/contacto`, {
    method: 'POST', headers: H(SEM.ajeno), body: JSON.stringify({ tipo: 'llamada' })
  });
  assert.equal(res.status, 403);

  res = await fetch(base + `/api/cuidado/${casoId}/atender`, { method: 'PATCH', headers: H(SEM.ajeno) });
  assert.equal(res.status, 403);
});

// ------------------------------------------------------------
// 2. mensajes.js POST /custom — respeta puedeIniciarChatCon por participante.
// ------------------------------------------------------------
test('mensajes.js /custom: un feligres que no comparte grupo ni lidera queda sin destinatario valido -> 400', async () => {
  // SEM.ajeno no pertenece a ningun grupo: no comparte grupo con miembro1 ni
  // es su lider ni el pastor -> no puede iniciar chat con el.
  const res = await fetch(base + '/api/mensajes/custom', {
    method: 'POST', headers: H(SEM.ajeno),
    body: JSON.stringify({ titulo: 'Grupo a medida', participantes: [SEM.miembro1.id] })
  });
  assert.equal(res.status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM conversacion WHERE tipo='custom'").get().n, 0);
});

test('mensajes.js /custom: filtra participantes invalidos y conserva los validos (el pastor siempre es contactable)', async () => {
  // ajeno no puede chatear con miembro1 (se filtra), pero SI puede con el
  // pastor (regla existente: un feligres siempre puede escribir a su pastor).
  const res = await fetch(base + '/api/mensajes/custom', {
    method: 'POST', headers: H(SEM.ajeno),
    body: JSON.stringify({ titulo: 'Grupo a medida', participantes: [SEM.miembro1.id, SEM.pastor.id] })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  const miembros = db.prepare('SELECT persona_id FROM conversacion_miembro WHERE conversacion_id = ?')
    .all(body.id).map(x => x.persona_id).sort((a, b) => a - b);
  assert.deepEqual(miembros.sort((a, b) => a - b), [SEM.ajeno.id, SEM.pastor.id].sort((a, b) => a - b));
});

test('mensajes.js /custom: el lider (que puede chatear con cualquiera de su iglesia) crea el grupo sin filtrar', async () => {
  const res = await fetch(base + '/api/mensajes/custom', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ titulo: 'Grupo del lider', participantes: [SEM.ajeno.id] })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  const miembros = db.prepare('SELECT persona_id FROM conversacion_miembro WHERE conversacion_id = ?')
    .all(body.id).map(x => x.persona_id);
  assert.ok(miembros.includes(SEM.ajeno.id));
  assert.ok(miembros.includes(SEM.lider.id));
});

// ------------------------------------------------------------
// 3. asignaciones.js POST / — solo el encargado del grupo del evento (o pastor).
// ------------------------------------------------------------
function crearEventoDirecto(grupoId, titulo = 'Culto', fecha = '2026-08-09') {
  return Number(db.prepare(
    "INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, estado, creado_por) VALUES (?,?,?,?, 'aprobado', ?)"
  ).run(SEM.iglesiaId, grupoId, titulo, fecha, SEM.pastor.id).lastInsertRowid);
}

test('asignaciones.js: el lider de Jovenes asigna un servicio en un evento de Jovenes -> OK', async () => {
  const evId = crearEventoDirecto(SEM.grupoId);
  const res = await fetch(base + '/api/asignaciones', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ evento_id: evId, persona_id: SEM.miembro1.id, tipo: 'aseo' })
  });
  assert.equal(res.status, 200);
});

test('asignaciones.js: el lider de Jovenes NO puede asignar en un evento de OTRO grupo -> 403', async () => {
  const grupoBId = Number(db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Musica', '#00f')")
    .run(SEM.iglesiaId).lastInsertRowid);
  const otroLider = { id: Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,0,1)"
  ).run(SEM.iglesiaId, 'liderB', 'Lider Musica', 'x').lastInsertRowid) };
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(otroLider.id, grupoBId, 'lider_musica');

  const evId = crearEventoDirecto(grupoBId, 'Ensayo Musica');
  const res = await fetch(base + '/api/asignaciones', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ evento_id: evId, persona_id: SEM.miembro1.id, tipo: 'musica' })
  });
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM asignacion WHERE evento_id = ?').get(evId).n, 0);
});

test('asignaciones.js: el pastor SI puede asignar en cualquier grupo', async () => {
  const evId = crearEventoDirecto(SEM.grupoId);
  const res = await fetch(base + '/api/asignaciones', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ evento_id: evId, persona_id: SEM.miembro1.id, tipo: 'aseo' })
  });
  assert.equal(res.status, 200);
});

// ------------------------------------------------------------
// 4. facial.js — /reconocer y /inscritos solo para lideres/admin.
// ------------------------------------------------------------
test('facial.js: un feligres NO puede usar /reconocer (403) ni ver /inscritos (403)', async () => {
  let res = await fetch(base + '/api/facial/reconocer', {
    method: 'POST', headers: H(SEM.miembro1), body: JSON.stringify({ image: 'x'.repeat(20) })
  });
  assert.equal(res.status, 403);

  res = await fetch(base + '/api/facial/inscritos', { headers: H(SEM.miembro1) });
  assert.equal(res.status, 403);
});

test('facial.js: el lider SI pasa el candado de /reconocer (falla despues por el servicio, no por 403)', async () => {
  const res = await fetch(base + '/api/facial/reconocer', {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ image: 'x'.repeat(20) })
  });
  assert.notEqual(res.status, 403);
});

test('facial.js: el lider SI puede ver /inscritos', async () => {
  const res = await fetch(base + '/api/facial/inscritos', { headers: H(SEM.lider) });
  assert.equal(res.status, 200);
});

// ------------------------------------------------------------
// 5. anuncios.js + notificaciones.js — segmentacion acotada al alcance.
// ------------------------------------------------------------
test('notificaciones.js /segmentada: el lider a SU grupo -> OK', async () => {
  const res = await fetch(base + '/api/notificaciones/segmentada', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ titulo: 'Aviso Jovenes', segmento: { tipo: 'grupo', grupo_id: SEM.grupoId } })
  });
  assert.equal(res.status, 200);
});

test('notificaciones.js /segmentada: el lider a "todos" -> 403', async () => {
  const res = await fetch(base + '/api/notificaciones/segmentada', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ titulo: 'Aviso general', segmento: { tipo: 'todos' } })
  });
  assert.equal(res.status, 403);
});

test('notificaciones.js /segmentada: el lider por "rol" -> 403', async () => {
  const res = await fetch(base + '/api/notificaciones/segmentada', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ titulo: 'Aviso tesoreros', segmento: { tipo: 'rol', rol: 'tesorero' } })
  });
  assert.equal(res.status, 403);
});

test('notificaciones.js /segmentada: el pastor a "todos" -> OK', async () => {
  const res = await fetch(base + '/api/notificaciones/segmentada', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ titulo: 'Aviso general', segmento: { tipo: 'todos' } })
  });
  assert.equal(res.status, 200);
});

test('notificaciones.js /segmentada: el lider NO puede segmentar el grupo de OTRO lider', async () => {
  const grupoBId = Number(db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Musica', '#00f')")
    .run(SEM.iglesiaId).lastInsertRowid);
  const res = await fetch(base + '/api/notificaciones/segmentada', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ titulo: 'Aviso Musica', segmento: { tipo: 'grupo', grupo_id: grupoBId } })
  });
  assert.equal(res.status, 403);
});

test('anuncios.js: el lider publica en SU grupo -> OK; a "todos" -> 403; el pastor a "todos" -> OK', async () => {
  let res = await fetch(base + '/api/anuncios', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ titulo: 'Aviso Jovenes', segmento: { tipo: 'grupo', grupo_id: SEM.grupoId } })
  });
  assert.equal(res.status, 200);

  res = await fetch(base + '/api/anuncios', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ titulo: 'Aviso a toda la iglesia' })
  });
  assert.equal(res.status, 403);

  res = await fetch(base + '/api/anuncios', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ titulo: 'Aviso pastoral a toda la iglesia' })
  });
  assert.equal(res.status, 200);
});
