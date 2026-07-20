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
