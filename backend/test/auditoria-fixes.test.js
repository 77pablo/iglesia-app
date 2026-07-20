// ============================================================
//  Regresion de los hallazgos de la auditoria de backend
//  (.superpowers/audit/backend.md). Un archivo por brevedad,
//  cubriendo admin.js, eventos.js, anuncios.js, cuenta.js,
//  asistencia.js y ninos.js.
// ============================================================
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

// Necesario para que /api/cuenta/recuperar no corte en el 503 temprano
// (mailActivo se calcula al cargar mailer.js). Nunca se llega a enviarCorreo()
// en los tests de aqui: el caso probado (correo compartido) retorna ANTES.
process.env.SMTP_USER = process.env.SMTP_USER || 'test@example.com';
process.env.SMTP_PASS = process.env.SMTP_PASS || 'app-password-de-prueba';

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
// persona/iglesia. Aqui usamos ademas evento/anuncio/notificacion/asistencia/
// ninos/reset_codigo, asi que los limpiamos tambien entre tests.
function limpiarExtra() {
  // Orden: hijos antes que padres (evento y clase_ed tienen FK entrantes).
  for (const t of ['asistencia', 'asistencia_nino', 'evento', 'nino', 'clase_ed',
                    'anuncio', 'notificacion', 'reset_codigo', 'aprobacion_log', 'auditoria'])
    db.exec('DELETE FROM ' + t);
}
beforeEach(() => { limpiarExtra(); reiniciar(db); SEM = sembrarMinimo(db); });

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

// ------------------------------------------------------------
// 1. admin.js — el obispo NUNCA administra; solo pastor/super_admin.
// ------------------------------------------------------------
test('admin.js: el obispo (rol_global=obispo) NO puede leer ni escribir en Administracion', async () => {
  db.prepare("UPDATE persona SET rol_global = 'obispo' WHERE id = ?").run(SEM.ajeno.id);

  let res = await fetch(base + '/api/admin/datos', { headers: H(SEM.ajeno) });
  assert.equal(res.status, 403);

  res = await fetch(base + '/api/admin/usuarios', {
    method: 'POST', headers: H(SEM.ajeno),
    body: JSON.stringify({ nombre: 'Intento Obispo', usuario: 'intento_obispo', password: '1234' })
  });
  assert.equal(res.status, 403);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM persona WHERE usuario='intento_obispo'").get().n, 0);
});

test('admin.js: el pastor SI puede administrar', async () => {
  const res = await fetch(base + '/api/admin/datos', { headers: H(SEM.pastor) });
  assert.equal(res.status, 200);
});

test('admin.js: el super_admin SI puede administrar', async () => {
  const ig2 = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra2','OTRA2')").run().lastInsertRowid);
  const superId = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, es_pastor, activo) VALUES (?,?,?,?,?,0,1)"
  ).run(ig2, 'super', 'Super Admin', 'x', 'super_admin').lastInsertRowid);

  const res = await fetch(base + '/api/admin/datos', { headers: H({ id: superId }, ig2) });
  assert.equal(res.status, 200);
});

// ------------------------------------------------------------
// 2. eventos.js GET /:id — mismo filtro de visibilidad que el listado.
// ------------------------------------------------------------
test('eventos.js: el detalle de un evento pendiente NO es visible para un feligres sin calendario completo', async () => {
  let res = await fetch(base + '/api/eventos', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ grupo_id: SEM.grupoId, titulo: 'Culto de Jovenes', fecha: '2026-09-01' })
  });
  const ev = await res.json();
  assert.equal(ev.estado, 'pendiente');

  // feligres (miembro del grupo, sin rol de liderazgo): NO debe verlo
  res = await fetch(base + `/api/eventos/${ev.id}`, { headers: H(SEM.miembro1) });
  assert.equal(res.status, 404);

  // el creador (lider) y el pastor si lo ven
  res = await fetch(base + `/api/eventos/${ev.id}`, { headers: H(SEM.lider) });
  assert.equal(res.status, 200);
  res = await fetch(base + `/api/eventos/${ev.id}`, { headers: H(SEM.pastor) });
  assert.equal(res.status, 200);

  // una vez aprobado, el feligres ya lo puede ver
  res = await fetch(base + `/api/eventos/${ev.id}/aprobar`, { method: 'PATCH', headers: H(SEM.pastor) });
  assert.equal(res.status, 200);
  res = await fetch(base + `/api/eventos/${ev.id}`, { headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
});

// ------------------------------------------------------------
// 3. eventos.js PATCH — parcial no borra campos ausentes.
// ------------------------------------------------------------
test('eventos.js: PATCH parcial conserva hora/lugar/descripcion no enviados', async () => {
  let res = await fetch(base + '/api/eventos', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({
      grupo_id: SEM.grupoId, titulo: 'Culto Especial', fecha: '2026-09-10',
      hora_inicio: '19:00', hora_fin: '21:00', lugar: 'Salon principal', descripcion: 'Con invitados'
    })
  });
  const ev = await res.json();

  res = await fetch(base + `/api/eventos/${ev.id}`, {
    method: 'PATCH', headers: H(SEM.pastor),
    body: JSON.stringify({ titulo: 'Culto Especial (actualizado)' })
  });
  assert.equal(res.status, 200);

  const row = db.prepare('SELECT * FROM evento WHERE id = ?').get(ev.id);
  assert.equal(row.titulo, 'Culto Especial (actualizado)');
  assert.equal(row.hora_inicio, '19:00');
  assert.equal(row.hora_fin, '21:00');
  assert.equal(row.lugar, 'Salon principal');
  assert.equal(row.descripcion, 'Con invitados');
});

// ------------------------------------------------------------
// 4. eventos.js limpiarSolicitud — no borra notificaciones de otra iglesia.
// ------------------------------------------------------------
test('eventos.js: aprobar un evento NO borra la notificacion "Solicitud de fecha" de OTRA iglesia con el mismo titulo+fecha', async () => {
  const igB = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('IglesiaB','IGB')").run().lastInsertRowid);
  const insP = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,?,1)");
  const pastorB = { id: Number(insP.run(igB, 'pastorB', 'Pastor B', 'x', 1).lastInsertRowid) };
  const liderB = { id: Number(insP.run(igB, 'liderB', 'Lider B', 'x', 0).lastInsertRowid) };
  const grupoB = Number(db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'GrupoB', '#000')").run(igB).lastInsertRowid);
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(liderB.id, grupoB, 'admin');

  const titulo = 'Culto Especial';
  const fecha = '2026-12-24';

  let res = await fetch(base + '/api/eventos', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ grupo_id: SEM.grupoId, titulo, fecha })
  });
  const evA = await res.json();

  res = await fetch(base + '/api/eventos', {
    method: 'POST', headers: H(liderB, igB),
    body: JSON.stringify({ grupo_id: grupoB, titulo, fecha })
  });
  assert.equal(res.status, 200);

  const notiBAntes = db.prepare("SELECT id FROM notificacion WHERE persona_id = ? AND titulo = 'Solicitud de fecha'").all(pastorB.id);
  assert.equal(notiBAntes.length, 1);

  res = await fetch(base + `/api/eventos/${evA.id}/aprobar`, { method: 'PATCH', headers: H(SEM.pastor) });
  assert.equal(res.status, 200);

  const notiBDespues = db.prepare("SELECT id FROM notificacion WHERE persona_id = ? AND titulo = 'Solicitud de fecha'").all(pastorB.id);
  assert.equal(notiBDespues.length, 1, 'la notificacion del pastor de la otra iglesia debe seguir ahi');
});

// ------------------------------------------------------------
// 3b. anuncios.js PATCH — parcial no borra texto ni desmarca urgente.
// ------------------------------------------------------------
test('anuncios.js: PATCH parcial conserva texto y el flag urgente', async () => {
  let res = await fetch(base + '/api/anuncios', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ titulo: 'Aviso', texto: 'Cuerpo completo del aviso', urgente: true })
  });
  const creado = await res.json();

  res = await fetch(base + `/api/anuncios/${creado.id}`, {
    method: 'PATCH', headers: H(SEM.pastor),
    body: JSON.stringify({ titulo: 'Aviso (editado)' })
  });
  assert.equal(res.status, 200);

  const row = db.prepare('SELECT * FROM anuncio WHERE id = ?').get(creado.id);
  assert.equal(row.titulo, 'Aviso (editado)');
  assert.equal(row.texto, 'Cuerpo completo del aviso');
  assert.equal(row.urgente, 1);
});

test('anuncios.js: PATCH puede desmarcar urgente explicitamente (false real, no ausente)', async () => {
  let res = await fetch(base + '/api/anuncios', {
    method: 'POST', headers: H(SEM.pastor),
    body: JSON.stringify({ titulo: 'Aviso urgente', texto: 'Texto', urgente: true })
  });
  const creado = await res.json();

  res = await fetch(base + `/api/anuncios/${creado.id}`, {
    method: 'PATCH', headers: H(SEM.pastor),
    body: JSON.stringify({ urgente: false })
  });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT urgente FROM anuncio WHERE id = ?').get(creado.id).urgente, 0);
});

// ------------------------------------------------------------
// 5. cuenta.js /recuperar — correo compartido por 2+ cuentas: no adivina.
// ------------------------------------------------------------
test('cuenta.js: /recuperar no genera codigo si el correo pertenece a mas de una cuenta activa', async () => {
  const email = 'compartido@ejemplo.com';
  db.prepare('UPDATE persona SET email = ? WHERE id = ?').run(email, SEM.pastor.id);
  db.prepare('UPDATE persona SET email = ? WHERE id = ?').run(email, SEM.ajeno.id);

  const res = await fetch(base + '/api/cuenta/recuperar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reset_codigo').get().n, 0,
    'no debe generarse ningun codigo mientras el correo sea ambiguo');
});

// ------------------------------------------------------------
// 6. asistencia.js — los ids de "presentes" se validan contra el grupo del evento.
// ------------------------------------------------------------
test('asistencia.js: un persona_id ajeno al grupo del evento se descarta silenciosamente', async () => {
  const evId = Number(db.prepare(
    "INSERT INTO evento (iglesia_id, grupo_id, titulo, fecha, estado, creado_por) VALUES (?,?,?,?, 'aprobado', ?)"
  ).run(SEM.iglesiaId, SEM.grupoId, 'Reunion Jovenes', '2026-08-01', SEM.lider.id).lastInsertRowid);

  const res = await fetch(base + `/api/asistencia/evento/${evId}`, {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ presentes: [SEM.miembro1.id, SEM.ajeno.id] }) // ajeno NO pertenece al grupo
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 1, 'solo se cuenta al miembro que si pertenece al grupo');

  const guardados = db.prepare('SELECT persona_id FROM asistencia WHERE evento_id = ?').all(evId).map(x => x.persona_id);
  assert.deepEqual(guardados, [SEM.miembro1.id]);
});

// ------------------------------------------------------------
// 6b. ninos.js — los nino_id de "presentes" se validan contra la clase.
// ------------------------------------------------------------
test('ninos.js: un nino_id que pertenece a OTRA clase se descarta silenciosamente', async () => {
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(SEM.lider.id, SEM.grupoId, 'lider_ed');

  const claseA = Number(db.prepare("INSERT INTO clase_ed (iglesia_id, nombre) VALUES (?, 'Parvulos')").run(SEM.iglesiaId).lastInsertRowid);
  const claseB = Number(db.prepare("INSERT INTO clase_ed (iglesia_id, nombre) VALUES (?, 'Primaria')").run(SEM.iglesiaId).lastInsertRowid);
  const ninoA = Number(db.prepare("INSERT INTO nino (iglesia_id, clase_id, nombre) VALUES (?,?, 'Nino A')").run(SEM.iglesiaId, claseA).lastInsertRowid);
  const ninoB = Number(db.prepare("INSERT INTO nino (iglesia_id, clase_id, nombre) VALUES (?,?, 'Nino B')").run(SEM.iglesiaId, claseB).lastInsertRowid);

  const res = await fetch(base + '/api/ninos/asistencia', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ clase_id: claseA, fecha: '2026-08-02', presentes: [{ nino_id: ninoA }, { nino_id: ninoB }] })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 1);

  const guardados = db.prepare('SELECT nino_id FROM asistencia_nino WHERE clase_id = ?').all(claseA).map(x => x.nino_id);
  assert.deepEqual(guardados, [ninoA]);
});
