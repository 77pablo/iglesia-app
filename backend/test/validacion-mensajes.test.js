// ============================================================
//  Los mensajes de validacion, en castellano y para personas
//  El middleware validar() respondia 'Datos invalidos: revisa <clave zod>',
//  asi que en la pantalla se leia "revisa hora_inicio" o "revisa persona_id",
//  y de paso TIRABA a la basura los mensajes que los esquemas ya traen
//  escritos en castellano ('falta el titulo', 'hora invalida (usa HH:MM)').
//  Aqui se fija el contrato de lo que ve la PERSONA... y tambien que el log
//  del servidor siga diciendo el nombre tecnico del campo, que es lo unico
//  que sirve para depurar.
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { cargarDb } from './helpers.js';

let validar, srv, base;

before(async () => {
  await cargarDb();
  ({ validar } = await import('../src/seguridad.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));

// Ejecuta el middleware con un req/res de mentira y captura lo que se loguea.
function validarCuerpo(schema, cuerpo, ruta = '/api/algo') {
  const req = { method: 'POST', originalUrl: ruta, body: cuerpo };
  const salida = { estado: null, cuerpo: null, siguio: false, avisos: [] };
  const res = {
    status(c) { salida.estado = c; return this; },
    json(o) { salida.cuerpo = o; return this; }
  };
  const original = console.warn;
  console.warn = (...a) => salida.avisos.push(a.join(' '));
  try {
    validar(schema)(req, res, () => { salida.siguio = true; });
  } finally {
    console.warn = original;
  }
  return salida;
}

test('usa el mensaje en castellano que el esquema ya trae escrito', () => {
  const schema = z.object({ titulo: z.string().trim().min(1, 'falta el titulo') });
  const { estado, cuerpo } = validarCuerpo(schema, { titulo: '' });
  assert.equal(estado, 400);
  assert.match(cuerpo.error, /falta el titulo/, 'el mensaje del esquema se estaba descartando');
});

test('un campo sin mensaje propio se nombra en castellano, no con su clave tecnica', () => {
  const schema = z.object({ hora_inicio: z.string() });
  const { cuerpo } = validarCuerpo(schema, {});
  assert.doesNotMatch(cuerpo.error, /hora_inicio/, 'la persona no debe leer la clave de programador');
  assert.match(cuerpo.error, /hora de inicio/);
});

test('un id de otra tabla se nombra por lo que es, no por su columna', () => {
  const schema = z.object({ persona_id: z.coerce.number().int().positive() });
  const { cuerpo } = validarCuerpo(schema, { persona_id: -1 });
  assert.doesNotMatch(cuerpo.error, /persona_id/);
  assert.match(cuerpo.error, /revisa la persona/);
});

test('los campos se nombran como se habla: con su articulo', () => {
  const schema = z.object({ grupo_id: z.coerce.number().int().positive() });
  const { cuerpo } = validarCuerpo(schema, { grupo_id: 'x' });
  assert.match(cuerpo.error, /revisa el grupo/);
});

test('"invalidos" va con tilde', () => {
  const schema = z.object({ nombre: z.string() });
  const { cuerpo } = validarCuerpo(schema, {});
  assert.match(cuerpo.error, /inválidos/);
});

test('el log del servidor sigue diciendo el nombre tecnico del campo', () => {
  const schema = z.object({ color: z.string().regex(/^#[0-9a-f]{6}$/i) });
  const { avisos, cuerpo } = validarCuerpo(schema, { color: 'red" onmouseover="alert(1)' }, '/api/admin/grupos');
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /\[seguridad\] entrada rechazada: POST \/api\/admin\/grupos - campos invalidos: color/);
  assert.ok(cuerpo.error, 'y la persona sigue recibiendo su mensaje');
});

test('el log tecnico no se contagia del nombre bonito del campo', () => {
  const schema = z.object({ hora_inicio: z.string() });
  const { avisos } = validarCuerpo(schema, {});
  assert.match(avisos[0], /campos invalidos: hora_inicio/);
});

test('un cuerpo valido sigue pasando al handler', () => {
  const schema = z.object({ titulo: z.string().trim().min(1, 'falta el titulo') });
  const { siguio, estado } = validarCuerpo(schema, { titulo: '  Culto  ' });
  assert.equal(siguio, true);
  assert.equal(estado, null);
});

// --- La puerta legal: el consentimiento del registro ---
// registro.js pedia la casilla con z.literal(true, { errorMap: ... }), y en
// zod 4 ese parametro se llama `error`: `errorMap` se ignora EN SILENCIO. El
// que no marcaba la casilla leia "Datos invalidos: revisa acepto".
test('registro sin marcar la casilla: dice que hay que aceptar los terminos', async () => {
  const r = await fetch(base + '/api/registro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: 'NOEXISTE', nombre: 'Nuevo', usuario: 'nuevo_sin_acepto', password: 'clave1234' })
  });
  assert.equal(r.status, 400);
  const cuerpo = await r.json();
  assert.doesNotMatch(cuerpo.error, /acepto/, 'no se le puede enseñar la clave del campo');
  assert.match(cuerpo.error, /aceptar los Términos y la Política de Privacidad/);
});
