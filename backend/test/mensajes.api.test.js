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
beforeEach(() => { reiniciar(db); SEM = sembrarMinimo(db); });

// Headers con token de una persona (mint directo, sin pasar por /api/login).
const H = (p) => ({ 'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: SEM.iglesiaId }) });

test('esquema: existen las tablas del chat', () => {
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  assert.deepEqual(cols('conversacion').sort(),
    ['creado_en','creado_por','grupo_id','iglesia_id','id','tipo','titulo'].sort());
  assert.deepEqual(cols('conversacion_miembro').sort(),
    ['conversacion_id','persona_id','rol','silenciado','ultimo_leido_mensaje_id'].sort());
  assert.deepEqual(cols('mensaje').sort(),
    ['adjunto_tipo','adjunto_url','borrado','conversacion_id','creado_en','id','persona_id','texto'].sort());
});

test('el app responde /api/health', async () => {
  const r = await fetch(base + '/api/health');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('1:1 + envio + listado', async () => {
  // lider abre 1:1 con miembro1
  let res = await fetch(base + '/api/mensajes/directo', {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ persona_id: SEM.miembro1.id }) });
  assert.equal(res.status, 200);
  const conv = await res.json();
  assert.ok(conv.id);

  // llamar de nuevo devuelve la MISMA conversacion (no duplica)
  res = await fetch(base + '/api/mensajes/directo', {
    method: 'POST', headers: H(SEM.miembro1), body: JSON.stringify({ persona_id: SEM.lider.id }) });
  assert.equal((await res.json()).id, conv.id);

  // ajeno NO puede abrir 1:1 con miembro1
  res = await fetch(base + '/api/mensajes/directo', {
    method: 'POST', headers: H(SEM.ajeno), body: JSON.stringify({ persona_id: SEM.miembro1.id }) });
  assert.equal(res.status, 403);

  // enviar mensaje
  res = await fetch(base + `/api/mensajes/conversacion/${conv.id}`, {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ texto: 'Hola!' }) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).mensaje.texto, 'Hola!');

  // mensaje vacio sin adjunto -> 400
  res = await fetch(base + `/api/mensajes/conversacion/${conv.id}`, {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ texto: '   ' }) });
  assert.equal(res.status, 400);

  // no-miembro no puede leer la conversacion
  res = await fetch(base + `/api/mensajes/conversacion/${conv.id}`, { headers: H(SEM.ajeno) });
  assert.equal(res.status, 403);

  // listar: el miembro ve el mensaje
  res = await fetch(base + `/api/mensajes/conversacion/${conv.id}`, { headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.mensajes.length, 1);
  assert.equal(data.mensajes[0].texto, 'Hola!');
});

test('conversaciones: auto-provisiona canal de grupo y cuenta no-leidos', async () => {
  // miembro1 entra a Mensajes -> debe aparecer el canal de Jovenes
  let res = await fetch(base + '/api/mensajes/conversaciones', { headers: H(SEM.miembro1) });
  let lista = await res.json();
  const canal = lista.find(c => c.tipo === 'grupo' && c.grupo_id === SEM.grupoId);
  assert.ok(canal, 'existe el canal del grupo');

  // lider (tambien miembro del grupo) manda un mensaje al canal
  res = await fetch(base + '/api/mensajes/conversaciones', { headers: H(SEM.lider) }); // provisiona para lider
  await res.json();
  await fetch(base + `/api/mensajes/conversacion/${canal.id}`, {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ texto: 'Reunion el sabado' }) });

  // miembro2 ve 1 no-leido en el canal
  res = await fetch(base + '/api/mensajes/conversaciones', { headers: H(SEM.miembro2) });
  lista = await res.json();
  const c2 = lista.find(c => c.id === canal.id);
  assert.equal(c2.no_leidos, 1);
  assert.equal(c2.ultimo.texto, 'Reunion el sabado');

  // ajeno (no es del grupo) NO ve el canal
  res = await fetch(base + '/api/mensajes/conversaciones', { headers: H(SEM.ajeno) });
  lista = await res.json();
  assert.equal(lista.find(c => c.id === canal.id), undefined);
});

test('leido, contactos y grupo a medida', async () => {
  // 1:1 lider<->miembro1 con un mensaje del lider
  let conv = await (await fetch(base + '/api/mensajes/directo', {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ persona_id: SEM.miembro1.id }) })).json();
  const m = await (await fetch(base + `/api/mensajes/conversacion/${conv.id}`, {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ texto: 'hey' }) })).json();

  // miembro1 marca leido
  let res = await fetch(base + `/api/mensajes/conversacion/${conv.id}/leido`, {
    method: 'POST', headers: H(SEM.miembro1), body: JSON.stringify({ mensaje_id: m.mensaje.id }) });
  assert.equal(res.status, 200);
  // ahora miembro1 no tiene no-leidos en esa conv
  const lista = await (await fetch(base + '/api/mensajes/conversaciones', { headers: H(SEM.miembro1) })).json();
  assert.equal(lista.find(c => c.id === conv.id).no_leidos, 0);

  // contactos del ajeno: no incluye a miembro1
  const contactos = await (await fetch(base + '/api/mensajes/contactos', { headers: H(SEM.ajeno) })).json();
  assert.equal(contactos.find(c => c.id === SEM.miembro1.id), undefined);

  // grupo a medida creado por el lider con 2 participantes
  res = await fetch(base + '/api/mensajes/custom', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ titulo: 'Comision', participantes: [SEM.miembro1.id, SEM.miembro2.id] }) });
  assert.equal(res.status, 200);
  const custom = await res.json();
  // los 3 lo ven en su lista
  for (const p of [SEM.lider, SEM.miembro1, SEM.miembro2]) {
    const l = await (await fetch(base + '/api/mensajes/conversaciones', { headers: H(p) })).json();
    assert.ok(l.find(c => c.id === custom.id), `${p.usuario} ve el grupo a medida`);
  }
});

test('moderacion: pastor borra en grupo pero no en 1:1', async () => {
  // canal de grupo + un mensaje del miembro1
  const canal = (await (await fetch(base + '/api/mensajes/conversaciones', { headers: H(SEM.miembro1) })).json())
    .find(c => c.tipo === 'grupo');
  const gm = await (await fetch(base + `/api/mensajes/conversacion/${canal.id}`, {
    method: 'POST', headers: H(SEM.miembro1), body: JSON.stringify({ texto: 'inapropiado' }) })).json();

  // pastor borra (soft)
  let res = await fetch(base + `/api/mensajes/${gm.mensaje.id}`, { method: 'DELETE', headers: H(SEM.pastor) });
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT borrado FROM mensaje WHERE id = ?').get(gm.mensaje.id);
  assert.equal(row.borrado, 1);

  // 1:1 lider<->miembro1: pastor NO puede borrar
  const conv = await (await fetch(base + '/api/mensajes/directo', {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ persona_id: SEM.miembro1.id }) })).json();
  const dm = await (await fetch(base + `/api/mensajes/conversacion/${conv.id}`, {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ texto: 'privado' }) })).json();
  res = await fetch(base + `/api/mensajes/${dm.mensaje.id}`, { method: 'DELETE', headers: H(SEM.pastor) });
  assert.equal(res.status, 403);

  // un feligres tampoco puede moderar
  res = await fetch(base + `/api/mensajes/${gm.mensaje.id}`, { method: 'DELETE', headers: H(SEM.miembro2) });
  assert.equal(res.status, 403);
});

test('SSE entrega en vivo un mensaje nuevo', async () => {
  // 1:1 lider<->miembro1
  const conv = await (await fetch(base + '/api/mensajes/directo', {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ persona_id: SEM.miembro1.id }) })).json();

  // miembro1 abre el stream (token por query, como hace el frontend)
  const tk = signToken({ id: SEM.miembro1.id, iglesia_id: SEM.iglesiaId });
  const ac = new AbortController();
  const streamResp = await fetch(base + '/api/mensajes/stream?token=' + tk, { signal: ac.signal });
  assert.match(streamResp.headers.get('content-type'), /text\/event-stream/);
  const reader = streamResp.body.getReader();
  const dec = new TextDecoder();

  // dar un tick para que el server registre la conexion
  await new Promise(r => setTimeout(r, 50));

  // lider envia
  await fetch(base + `/api/mensajes/conversacion/${conv.id}`, {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ texto: 'en vivo' }) });

  // leer hasta encontrar el evento 'mensaje'
  let buf = '', encontrado = false;
  for (let i = 0; i < 20 && !encontrado; i++) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    if (/event: mensaje/.test(buf) && /en vivo/.test(buf)) encontrado = true;
  }
  ac.abort();
  assert.ok(encontrado, 'llego el evento SSE con el mensaje');
});
