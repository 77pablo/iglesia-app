// Validacion de entrada (zod) del chat: /api/mensajes era el ultimo router que
// leia req.body a pelo. Sin esquema, un objeto o un numero se colaban por
// String(...) y quedaban guardados como "[object Object]" en la conversacion.
// Estos tests fijan el contrato: cuerpo con tipos raros -> 400, y las entradas
// validas de siempre (texto vacio + adjunto, leido con id) siguen funcionando.
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

const H = (p) => ({ 'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: SEM.iglesiaId }) });

const post = (ruta, persona, cuerpo) =>
  fetch(base + ruta, { method: 'POST', headers: H(persona), body: JSON.stringify(cuerpo) });

// Abre el 1:1 lider <-> miembro1 y devuelve su id.
async function conv1a1() {
  const r = await post('/api/mensajes/directo', SEM.lider, { persona_id: SEM.miembro1.id });
  return (await r.json()).id;
}

// ---------- POST /directo ----------
test('POST /directo: persona_id negativo -> 400 (no 403)', async () => {
  const r = await post('/api/mensajes/directo', SEM.lider, { persona_id: -1 });
  assert.equal(r.status, 400);
});

test('POST /directo: persona_id como array se rechaza -> 400', async () => {
  // Number([3]) === 3: sin esquema, un array se colaba como si fuera el id 3.
  const r = await post('/api/mensajes/directo', SEM.lider, { persona_id: [SEM.miembro1.id] });
  assert.equal(r.status, 400);
});

test('POST /directo: persona_id decimal -> 400', async () => {
  const r = await post('/api/mensajes/directo', SEM.lider, { persona_id: 1.5 });
  assert.equal(r.status, 400);
});

test('POST /directo: persona_id valido (numero o su texto) sigue abriendo el 1:1', async () => {
  const a = await post('/api/mensajes/directo', SEM.lider, { persona_id: SEM.miembro1.id });
  assert.equal(a.status, 200);
  const b = await post('/api/mensajes/directo', SEM.lider, { persona_id: String(SEM.miembro1.id) });
  assert.equal(b.status, 200);
  assert.equal((await b.json()).id, (await a.json()).id, 'no duplica la conversacion');
});

// ---------- POST /conversacion/:id ----------
test('POST /conversacion/:id: texto que no es cadena -> 400', async () => {
  const id = await conv1a1();
  const r = await post(`/api/mensajes/conversacion/${id}`, SEM.lider, { texto: 123 });
  assert.equal(r.status, 400);
});

test('POST /conversacion/:id: un objeto como texto no se guarda como "[object Object]"', async () => {
  const id = await conv1a1();
  const r = await post(`/api/mensajes/conversacion/${id}`, SEM.lider, { texto: { a: 1 } });
  assert.equal(r.status, 400);
  const n = db.prepare('SELECT COUNT(*) AS n FROM mensaje WHERE conversacion_id = ?').get(id).n;
  assert.equal(n, 0, 'no debe quedar ningun mensaje guardado');
});

test('POST /conversacion/:id: adjunto_url que no es cadena -> 400', async () => {
  const id = await conv1a1();
  const r = await post(`/api/mensajes/conversacion/${id}`, SEM.lider, { texto: '', adjunto_url: { u: 1 } });
  assert.equal(r.status, 400);
});

test('POST /conversacion/:id: texto vacio con adjunto sigue siendo valido', async () => {
  const id = await conv1a1();
  const r = await post(`/api/mensajes/conversacion/${id}`, SEM.lider,
    { texto: '', adjunto_url: '/uploads/x.pdf', adjunto_tipo: 'archivo' });
  assert.equal(r.status, 200);
  const m = (await r.json()).mensaje;
  assert.equal(m.texto, '');
  assert.equal(m.adjunto_url, '/uploads/x.pdf');
});

test('POST /conversacion/:id: mensaje vacio sin adjunto sigue dando 400', async () => {
  const id = await conv1a1();
  const r = await post(`/api/mensajes/conversacion/${id}`, SEM.lider, { texto: '   ' });
  assert.equal(r.status, 400);
});

test('POST /conversacion/:id: mensaje demasiado largo sigue dando 400 con su mensaje', async () => {
  const id = await conv1a1();
  const r = await post(`/api/mensajes/conversacion/${id}`, SEM.lider, { texto: 'a'.repeat(4001) });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'Mensaje demasiado largo');
});

// ---------- POST /conversacion/:id/leido ----------
test('POST /leido: mensaje_id que no es numero -> 400', async () => {
  const id = await conv1a1();
  const r = await post(`/api/mensajes/conversacion/${id}/leido`, SEM.miembro1, { mensaje_id: 'abc' });
  assert.equal(r.status, 400);
});

test('POST /leido: sin mensaje_id sigue respondiendo 200 (no avanza el puntero)', async () => {
  const id = await conv1a1();
  const r = await post(`/api/mensajes/conversacion/${id}/leido`, SEM.miembro1, {});
  assert.equal(r.status, 200);
});

// ---------- POST /custom ----------
test('POST /custom: titulo que no es cadena -> 400', async () => {
  const r = await post('/api/mensajes/custom', SEM.lider,
    { titulo: { t: 1 }, participantes: [SEM.miembro1.id] });
  assert.equal(r.status, 400);
  const n = db.prepare("SELECT COUNT(*) AS n FROM conversacion WHERE tipo = 'custom'").get().n;
  assert.equal(n, 0, 'no debe crearse la conversacion');
});

test('POST /custom: participantes con basura dentro -> 400', async () => {
  const r = await post('/api/mensajes/custom', SEM.lider,
    { titulo: 'Comision', participantes: [SEM.miembro1.id, 'abc'] });
  assert.equal(r.status, 400);
});

test('POST /custom: titulo y participantes validos siguen creando el grupo', async () => {
  const r = await post('/api/mensajes/custom', SEM.lider,
    { titulo: 'Comision', participantes: [SEM.miembro1.id, SEM.miembro2.id] });
  assert.equal(r.status, 200);
  assert.ok((await r.json()).id);
});
