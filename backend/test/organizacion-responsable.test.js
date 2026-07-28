// ============================================================
//  Organizacion v2: responsable por cosa, aviso y "Mi parte".
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

function tok(personaId, iglesiaId) { return signToken({ id: personaId, iglesia_id: iglesiaId }); }

// Siembra: iglesia + pastor + lider (admin de grupo) + feligres + grupo.
function sembrar(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const nueva = (usuario, nombre, pastor = 0) => Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,'x',?,1)"
  ).run(iglesiaId, usuario + '_' + codigo, nombre, pastor).lastInsertRowid);
  const pastorId = nueva('pas', 'Pastor');
  const liderId = nueva('lid', 'Lider');
  const feligresId = nueva('fel', 'Feligres Juan');
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  const grupoId = Number(g.lastInsertRowid);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(liderId, grupoId);
  return { iglesiaId, pastorId, liderId, feligresId, grupoId };
}

// Crea una hoja suelta con una cosa; devuelve {hojaId, cosaId, auth}.
async function hojaConCosa(b, S, titulo = 'Almuerzo') {
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo }) });
  const hojaId = (await res.json()).id;
  res = await fetch(b + `/api/organizacion/${hojaId}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Jugos nectar', cantidad: 5 }) });
  const cosaId = (await res.json()).id;
  return { hojaId, cosaId, auth };
}

test('el esquema guarda responsable y la hoja lo devuelve con nombre y estado', async () => {
  const b = await servidor();
  const S = sembrar('RESP');
  const { hojaId, cosaId, auth } = await hojaConCosa(b, S);

  // Sin asignar: los campos vienen vacios, no ausentes.
  let hoja = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hoja.cosas[0].responsable_id, null);
  assert.equal(hoja.cosas[0].responsable_nombre, null);

  // Se asigna directo en la BD (el endpoint llega en la Task 2).
  db.prepare('UPDATE evento_org_cosa SET responsable_id = ? WHERE id = ?').run(S.feligresId, cosaId);
  hoja = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hoja.cosas[0].responsable_id, S.feligresId);
  assert.equal(hoja.cosas[0].responsable_nombre, 'Feligres Juan');
  assert.equal(hoja.cosas[0].responsable_activo, 1);

  // Cuenta desactivada: el dato NO se borra, se marca inactivo para que la
  // interfaz pueda decir "reasignar" en vez de dejar la linea huerfana.
  db.prepare('UPDATE persona SET activo = 0 WHERE id = ?').run(S.feligresId);
  hoja = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hoja.cosas[0].responsable_id, S.feligresId);
  assert.equal(hoja.cosas[0].responsable_nombre, 'Feligres Juan');
  assert.equal(hoja.cosas[0].responsable_activo, 0);
});

test('asignar responsable: valida la persona, avisa una sola vez y permite desasignar', async () => {
  const b = await servidor();
  const S = sembrar('ASIG');
  const { cosaId, auth } = await hojaConCosa(b, S);
  const avisos = () => db.prepare("SELECT COUNT(*) n FROM notificacion WHERE persona_id = ? AND tipo = 'organizacion'").get(S.feligresId).n;

  // Asignar a un feligres de la iglesia: 200 + aviso + asignada_en
  let res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });
  assert.equal(res.status, 200);
  const fila = db.prepare('SELECT responsable_id, asignada_en FROM evento_org_cosa WHERE id = ?').get(cosaId);
  assert.equal(fila.responsable_id, S.feligresId);
  assert.ok(fila.asignada_en, 'debe registrar cuando se asigno');
  assert.equal(avisos(), 1);

  // Re-mandar el MISMO responsable no vuelve a avisar (el lider edita la lista
  // muchas veces mientras la arma; no se puede bombardear a la gente).
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });
  assert.equal(res.status, 200);
  assert.equal(avisos(), 1);

  // Cambiar el nombre de la cosa tampoco avisa, ni desasigna.
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ nombre: 'Jugos de naranja' }) });
  assert.equal(res.status, 200);
  assert.equal(avisos(), 1);
  assert.equal(db.prepare('SELECT responsable_id FROM evento_org_cosa WHERE id = ?').get(cosaId).responsable_id, S.feligresId,
    'un PATCH que no menciona responsable_id no debe desasignar');

  // Desasignar con null explicito.
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: null }) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT responsable_id FROM evento_org_cosa WHERE id = ?').get(cosaId).responsable_id, null);
});

test('asignar responsable: rechaza personas de otra iglesia, inactivas o inexistentes', async () => {
  const b = await servidor();
  const A = sembrar('ASGA');
  const B = sembrar('ASGB');
  const { cosaId, auth } = await hojaConCosa(b, A);

  // Persona de OTRA iglesia -> 400
  let res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: B.feligresId }) });
  assert.equal(res.status, 400);

  // Persona inexistente -> 400
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: 999999 }) });
  assert.equal(res.status, 400);

  // Persona desactivada -> 400 (no se asigna a quien no puede entrar)
  db.prepare('UPDATE persona SET activo = 0 WHERE id = ?').run(A.feligresId);
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: A.feligresId }) });
  assert.equal(res.status, 400);
  db.prepare('UPDATE persona SET activo = 1 WHERE id = ?').run(A.feligresId);

  // Y la cosa quedo intacta
  assert.equal(db.prepare('SELECT responsable_id FROM evento_org_cosa WHERE id = ?').get(cosaId).responsable_id, null);
});

test('mis-cosas: el feligres ve SOLO su linea, sin gastos ni cosas de otros', async () => {
  const b = await servidor();
  const S = sembrar('MIAS');
  const { hojaId, cosaId, auth } = await hojaConCosa(b, S, 'Almuerzo de jovenes');
  const authFel = { Authorization: 'Bearer ' + tok(S.feligresId, S.iglesiaId), 'Content-Type': 'application/json' };

  // Una segunda cosa que NO es suya, y un gasto en la misma hoja.
  let res = await fetch(b + `/api/organizacion/${hojaId}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Pan', cantidad: 3 }) });
  const cosaAjena = (await res.json()).id;
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Carbon', monto: 12000 }) });
  await fetch(b + '/api/organizacion/' + hojaId, { method: 'PATCH', headers: auth, body: JSON.stringify({ hora_llegada: '12:30' }) });
  await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });

  // El feligres SIGUE sin poder entrar al modulo por la puerta grande.
  assert.equal((await fetch(b + '/api/organizacion', { headers: authFel })).status, 403);
  assert.equal((await fetch(b + '/api/organizacion/' + hojaId, { headers: authFel })).status, 403);

  // Pero ve lo suyo por la rendija.
  res = await fetch(b + '/api/organizacion/mis-cosas', { headers: authFel });
  assert.equal(res.status, 200);
  const mias = await res.json();
  assert.equal(mias.length, 1, 'solo la linea asignada a el');
  assert.equal(mias[0].id, cosaId);
  assert.equal(mias[0].nombre, 'Jugos nectar');
  assert.equal(mias[0].cantidad, 5);
  assert.equal(mias[0].hoja_titulo, 'Almuerzo de jovenes');
  assert.equal(mias[0].hora_llegada, '12:30');
  // Nada de dinero ni de cosas ajenas en la respuesta.
  const crudo = JSON.stringify(mias);
  assert.ok(!crudo.includes('12000') && !crudo.toLowerCase().includes('gasto'), 'no puede filtrarse ningun gasto');
  assert.ok(!crudo.includes('Pan'), 'no puede ver las cosas de otros');
  assert.ok(!crudo.includes('total'), 'no puede ver totales');

  // Marca "ya lo tengo".
  res = await fetch(b + `/api/organizacion/mis-cosas/${cosaId}`, { method: 'PATCH', headers: authFel, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT listo FROM evento_org_cosa WHERE id = ?').get(cosaId).listo, 1);

  // NO puede tocar la linea de otro (403), ni renombrar la suya.
  res = await fetch(b + `/api/organizacion/mis-cosas/${cosaAjena}`, { method: 'PATCH', headers: authFel, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT listo FROM evento_org_cosa WHERE id = ?').get(cosaAjena).listo, 0);
  await fetch(b + `/api/organizacion/mis-cosas/${cosaId}`, { method: 'PATCH', headers: authFel, body: JSON.stringify({ nombre: 'Otra cosa', listo: true }) });
  assert.equal(db.prepare('SELECT nombre FROM evento_org_cosa WHERE id = ?').get(cosaId).nombre, 'Jugos nectar');
});

test('mis-cosas: exige sesion y no cruza iglesias', async () => {
  const b = await servidor();
  const A = sembrar('MIAA');
  const B = sembrar('MIAB');
  const { cosaId, auth } = await hojaConCosa(b, A);
  await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: A.feligresId }) });

  // Sin token -> 401 (la ruta va DESPUES de authMiddleware, no antes)
  assert.equal((await fetch(b + '/api/organizacion/mis-cosas')).status, 401);

  // Un feligres de otra iglesia no ve nada y no puede marcar la cosa ajena.
  const authB = { Authorization: 'Bearer ' + tok(B.feligresId, B.iglesiaId), 'Content-Type': 'application/json' };
  assert.deepEqual(await (await fetch(b + '/api/organizacion/mis-cosas', { headers: authB })).json(), []);
  const res = await fetch(b + `/api/organizacion/mis-cosas/${cosaId}`, { method: 'PATCH', headers: authB, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 403);
});

test('recordatorio: avisa el dia antes a quien trae algo, y una sola vez', async () => {
  const b = await servidor();
  const S = sembrar('RECO');
  const { cosaId, auth } = await hojaConCosa(b, S);
  const { generarRecordatorios } = await import('../src/recordatorios.js');

  // La hoja es para mañana.
  const manana = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  await fetch(b + '/api/organizacion/cosas/' + cosaId, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });
  db.prepare('UPDATE evento_org SET fecha = ? WHERE id = (SELECT org_id FROM evento_org_cosa WHERE id = ?)').run(manana, cosaId);

  const recordatorios = () => db.prepare(
    'SELECT COUNT(*) n FROM recordatorio_enviado WHERE persona_id = ? AND clave = ?'
  ).get(S.feligresId, `org_cosa:${cosaId}:dia-1`).n;

  generarRecordatorios(S.iglesiaId);
  assert.equal(recordatorios(), 1, 'debe recordarle el dia antes');

  // Correrlo de nuevo no duplica (dedupe por clave+persona).
  generarRecordatorios(S.iglesiaId);
  assert.equal(recordatorios(), 1);
});

test('recordatorio: no avisa si la hoja no tiene fecha ni evento', async () => {
  const b = await servidor();
  const S = sembrar('RECN');
  const { cosaId, auth } = await hojaConCosa(b, S);
  const { generarRecordatorios } = await import('../src/recordatorios.js');
  await fetch(b + '/api/organizacion/cosas/' + cosaId, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });
  // La hoja se creo sin fecha: no hay contra que contar los dias.
  generarRecordatorios(S.iglesiaId);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM recordatorio_enviado WHERE clave LIKE ?').get(`org_cosa:${cosaId}:%`).n, 0);
});

test('gastos: se registra quien puso el dinero y la hoja resume cuanto puso cada uno', async () => {
  const b = await servidor();
  const S = sembrar('PAGO');
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Asado' }) });
  const hojaId = (await res.json()).id;

  // Sin indicar quien pago: queda a nombre de quien registra el gasto.
  res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Carne', monto: 20000 }) });
  assert.equal(res.status, 200);

  // Indicando a otra persona de la iglesia.
  res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Bebidas', monto: 8000, pagado_por: S.feligresId }) });
  assert.equal(res.status, 200);
  // Y un segundo gasto de la misma persona, para comprobar que el resumen suma.
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Hielo', monto: 2500, pagado_por: S.feligresId }) });

  const hoja = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hoja.total_gastado, 30500);
  const carne = hoja.gastos.find(g => g.concepto === 'Carne');
  assert.equal(carne.pagado_por, S.liderId, 'por defecto paga quien registra');
  assert.equal(carne.pagado_por_nombre, 'Lider');
  assert.equal(hoja.gastos.find(g => g.concepto === 'Bebidas').pagado_por_nombre, 'Feligres Juan');

  // Resumen "quien puso que": una fila por persona, de mayor a menor.
  assert.equal(hoja.aportes.length, 2);
  assert.deepEqual({ ...hoja.aportes[0] }, { persona_id: S.liderId, nombre: 'Lider', total: 20000 });
  assert.deepEqual({ ...hoja.aportes[1] }, { persona_id: S.feligresId, nombre: 'Feligres Juan', total: 10500 });
});

test('gastos: no se puede atribuir el pago a alguien de otra iglesia', async () => {
  const b = await servidor();
  const A = sembrar('PAGA');
  const B = sembrar('PAGB');
  const auth = { Authorization: 'Bearer ' + tok(A.liderId, A.iglesiaId), 'Content-Type': 'application/json' };
  const hojaId = (await (await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Once' }) })).json()).id;

  let res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Te', monto: 3000, pagado_por: B.feligresId }) });
  assert.equal(res.status, 400);
  res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Te', monto: 3000, pagado_por: 999999 }) });
  assert.equal(res.status, 400);

  // No se registro ningun gasto.
  const hoja = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hoja.gastos.length, 0);
  assert.deepEqual(hoja.aportes, []);
});

test('gastos antiguos sin pagador: cuentan en el total pero no en el resumen', async () => {
  // Los gastos creados antes de que existiera pagado_por tienen la columna en
  // NULL. Deben seguir sumando al total (es plata que se gasto) pero no pueden
  // inventar un aportante. El frontend se apoya en esta diferencia para mostrar
  // la linea "sin registrar quien puso".
  const b = await servidor();
  const S = sembrar('VIEJ');
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  const hojaId = (await (await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Historica' }) })).json()).id;

  db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto) VALUES (?,?,?)').run(hojaId, 'Gasto antiguo', 5000);
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Nuevo', monto: 3000 }) });

  const hoja = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hoja.total_gastado, 8000, 'el gasto antiguo sigue sumando');
  assert.equal(hoja.gastos.length, 2);
  assert.equal(hoja.gastos.find(g => g.concepto === 'Gasto antiguo').pagado_por, null);
  assert.equal(hoja.aportes.length, 1, 'solo el gasto con pagador aparece en el resumen');
  assert.equal(hoja.aportes[0].total, 3000);
});

test('duplicar: copia las cosas en limpio, nunca los gastos, y queda a nombre de quien duplica', async () => {
  const b = await servidor();
  const S = sembrar('DUPL');
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  // Hoja de un EVENTO, con cosas asignadas y marcadas, y con gastos.
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha, grupo_id) VALUES (?, 'Retiro 2025', '2025-08-10', ?)").run(S.iglesiaId, S.grupoId);
  const eventoId = Number(ev.lastInsertRowid);
  const original = await (await fetch(b + '/api/organizacion/evento/' + eventoId, { headers: auth })).json();
  await fetch(b + '/api/organizacion/' + original.id, { method: 'PATCH', headers: auth, body: JSON.stringify({ hora_llegada: '09:30' }) });
  let res = await fetch(b + `/api/organizacion/${original.id}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Carpas', cantidad: 4 }) });
  const cosaId = (await res.json()).id;
  await fetch(b + `/api/organizacion/${original.id}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Sacos', cantidad: 12 }) });
  await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId, listo: true }) });
  await fetch(b + `/api/organizacion/${original.id}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Bus', monto: 90000 }) });

  // Duplicar
  res = await fetch(b + `/api/organizacion/${original.id}/duplicar`, { method: 'POST', headers: auth });
  assert.equal(res.status, 200);
  const { id: copiaId } = await res.json();
  assert.notEqual(copiaId, original.id);

  const copia = await (await fetch(b + '/api/organizacion/' + copiaId, { headers: auth })).json();
  assert.match(copia.titulo, /^Copia de /, 'el titulo debe decir que es una copia');
  assert.equal(copia.hora_llegada, '09:30', 'la hora de llegada se conserva');
  assert.equal(copia.evento_id, null, 'la copia es una lista SUELTA, no se pega al evento viejo');

  // Las cosas se copian en limpio: sin responsable y sin marcar.
  assert.equal(copia.cosas.length, 2);
  assert.deepEqual(copia.cosas.map(c => c.nombre).sort(), ['Carpas', 'Sacos']);
  assert.equal(copia.cosas.find(c => c.nombre === 'Carpas').cantidad, 4);
  for (const c of copia.cosas) {
    assert.equal(c.listo, 0, 'nada llega marcado en la copia');
    assert.equal(c.responsable_id, null, 'nadie hereda el compromiso del ano pasado');
  }
  // Los gastos pertenecen al evento pasado: no se copian NUNCA.
  assert.deepEqual(copia.gastos, []);
  assert.equal(copia.total_gastado, 0);
  assert.deepEqual(copia.aportes, []);

  // Y el original queda intacto.
  const revisada = await (await fetch(b + '/api/organizacion/' + original.id, { headers: auth })).json();
  assert.equal(revisada.gastos.length, 1);
  assert.equal(revisada.cosas.find(c => c.nombre === 'Carpas').listo, 1);
});

test('duplicar: puede hacerlo cualquier lider que VEA la hoja; otra iglesia 404; feligres 403', async () => {
  const b = await servidor();
  const S = sembrar('DUPP');
  const O = sembrar('DUPO');
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  const hojaId = (await (await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Once de damas' }) })).json()).id;
  await fetch(b + `/api/organizacion/${hojaId}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Te', cantidad: 1 }) });

  // Otro lider de la MISMA iglesia: no puede editarla, pero si duplicarla, y la
  // copia queda a su nombre (asi se hace la suya sin tocar la ajena).
  const lid2 = Number(db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,'x',1)").run(S.iglesiaId, 'lid2_DUPP', 'Lider Dos').lastInsertRowid);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(lid2, S.grupoId);
  const auth2 = { Authorization: 'Bearer ' + tok(lid2, S.iglesiaId), 'Content-Type': 'application/json' };
  assert.equal((await fetch(b + '/api/organizacion/' + hojaId, { method: 'PATCH', headers: auth2, body: JSON.stringify({ titulo: 'Mia' }) })).status, 403);
  let res = await fetch(b + `/api/organizacion/${hojaId}/duplicar`, { method: 'POST', headers: auth2 });
  assert.equal(res.status, 200);
  const copiaId = (await res.json()).id;
  assert.equal(db.prepare('SELECT creado_por FROM evento_org WHERE id = ?').get(copiaId).creado_por, lid2);
  // Y sobre SU copia si manda.
  assert.equal((await fetch(b + '/api/organizacion/' + copiaId, { method: 'PATCH', headers: auth2, body: JSON.stringify({ titulo: 'Once de damas 2026' }) })).status, 200);

  // Un lider de otra iglesia no puede duplicar lo ajeno.
  const authO = { Authorization: 'Bearer ' + tok(O.liderId, O.iglesiaId), 'Content-Type': 'application/json' };
  assert.equal((await fetch(b + `/api/organizacion/${hojaId}/duplicar`, { method: 'POST', headers: authO })).status, 404);
  // Un feligres tampoco: lo frena el gate de visibilidad.
  const authF = { Authorization: 'Bearer ' + tok(S.feligresId, S.iglesiaId), 'Content-Type': 'application/json' };
  assert.equal((await fetch(b + `/api/organizacion/${hojaId}/duplicar`, { method: 'POST', headers: authF })).status, 403);
});
