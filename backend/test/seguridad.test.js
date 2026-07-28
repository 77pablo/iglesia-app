// ============================================================
//  Pruebas de seguridad (Fase 6) - runner nativo node:test
//  Arranca el servidor real como proceso hijo (server.js no expone
//  el objeto `app`, solo hace app.listen), con una BD temporal propia
//  y SEED_ON_EMPTY=1 para tener credenciales conocidas.
//  Cubre: cabeceras de helmet, 400 por validacion zod, y 429 tras
//  exceder el limite de login (5 req/IP/15min).
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, '..', 'src', 'server.js');
const PORT = 3931;
// Se usa la IP literal, NO "localhost": limiterLogin cuenta por IP, y "localhost"
// resuelve a ::1 y a 127.0.0.1 a la vez. Node trae autoSelectFamily activado por
// defecto, asi que cada conexion nueva compite entre ambas familias y puede
// salir por una u otra. El servidor ve entonces "::1" o "::ffff:127.0.0.1", que
// para express-rate-limit son DOS cubos distintos: los intentos se repartirian
// entre dos contadores y el 429 llegaria mas tarde de lo previsto (o nunca).
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;
// El limite declarado en src/seguridad.js para limiterLogin.
const LIMITE_LOGIN = 5;
const DB_PATH = path.join(os.tmpdir(), `iglesia-test-seguridad-${Date.now()}.db`);

let servidor;

async function esperarListo(intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* aun no levanta */ }
    await new Promise(res => setTimeout(res, 250));
  }
  throw new Error('El servidor de pruebas no respondio a tiempo');
}

before(async () => {
  servidor = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET: 'secreto-de-pruebas-no-usar-en-produccion',
      DB_PATH,
      SEED_ON_EMPTY: '1',
      NODE_ENV: '',   // desarrollo: permite el fallback de JWT_SECRET si hiciera falta
      CORS_ORIGIN: '',
      DISABLE_RATE_LIMIT: ''   // este test SI verifica el rate-limit real (429)
    },
    stdio: 'pipe'
  });
  // Descomenta para depurar el arranque del servidor de pruebas:
  // servidor.stdout.on('data', d => process.stdout.write(`[srv] ${d}`));
  // servidor.stderr.on('data', d => process.stderr.write(`[srv-err] ${d}`));
  await esperarListo();
});

after(async () => {
  if (servidor) servidor.kill();
  try { fs.unlinkSync(DB_PATH); } catch { /* puede no existir */ }
  try { fs.unlinkSync(DB_PATH + '-journal'); } catch { /* idem */ }
});

test('GET /api/health responde 200 con las cabeceras de seguridad de helmet', async () => {
  const r = await fetch(`${BASE}/api/health`);
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('content-security-policy'), 'falta Content-Security-Policy');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.ok(r.headers.get('strict-transport-security'), 'falta Strict-Transport-Security');
});

test('GET / (index.html) responde 200', async () => {
  const r = await fetch(`${BASE}/`);
  assert.equal(r.status, 200);
  const texto = await r.text();
  assert.match(texto, /Iglesia App/);
});

test('POST /api/login con body invalido responde 400 (validacion zod)', async () => {
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iglesia: '' })   // faltan usuario y password
  });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.ok(body.error);
});

test('POST /api/login con credenciales correctas funciona (200 + token)', async () => {
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iglesia: 'MONTESION', usuario: 'pastor', password: '1234' })
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(body.token);
  assert.equal(body.persona.usuario, 'pastor');
});

test('POST /api/admin/usuarios con body invalido responde 400 (validacion zod en endpoint sensible)', async () => {
  const login = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iglesia: 'MONTESION', usuario: 'pastor', password: '1234' })
  });
  const { token } = await login.json();
  // Falta la contraseña (y tiene menos de 4 caracteres si se completara vacia).
  const r = await fetch(`${BASE}/api/admin/usuarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nombre: 'Sin Password', usuario: 'sinpass' })
  });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.ok(body.error);
});

const intentoDeLogin = () => fetch(`${BASE}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ iglesia: 'MONTESION', usuario: 'pastor', password: 'incorrecta' })
});

// Deja la ventana de esta IP agotada pidiendo logins hasta ver el 429, en vez de
// suponer cuantas peticiones de login hicieron los tests anteriores del archivo
// (ese acoplamiento era la causa del test intermitente: bastaba con que una
// peticion previa no llegara a contar para que el 429 se corriera un intento y
// la asercion fallara). El tope de intentos sale de la cabecera RateLimit-Limit
// que devuelve el propio servidor, asi que si el limitador estuviera apagado o
// mal configurado el bucle se agota y el test falla, no se cuelga.
// Es idempotente: si la ventana ya estaba agotada, la primera respuesta ya es 429.
async function agotarLimiteDeLogin() {
  let respuesta = await intentoDeLogin();
  const limite = Number(respuesta.headers.get('ratelimit-limit'));
  assert.equal(
    limite, LIMITE_LOGIN,
    `el servidor de pruebas debe tener limiterLogin activo con limite ${LIMITE_LOGIN} ` +
    `(RateLimit-Limit recibido: ${respuesta.headers.get('ratelimit-limit')})`
  );
  let intentos = 1;
  // Peor caso: ventana recien empezada -> 'limite' pasan y el siguiente bloquea.
  while (respuesta.status !== 429 && intentos <= limite) {
    respuesta = await intentoDeLogin();
    intentos++;
  }
  assert.equal(
    respuesta.status, 429,
    `el limitador debia bloquear como muy tarde en el intento ${limite + 1} de la ventana, ` +
    `pero tras ${intentos} intentos seguidos el estado sigue siendo ${respuesta.status}`
  );
  return { respuesta, intentos };
}

test('POST /api/login: al superar el limite de peticiones/IP en la ventana, responde 429', async () => {
  const { respuesta } = await agotarLimiteDeLogin();
  assert.equal(respuesta.headers.get('ratelimit-remaining'), '0', 'el cubo de esta IP debe quedar a cero');
  // El bloqueo se MANTIENE: no es un 429 suelto, la ventana sigue cerrada.
  const otra = await intentoDeLogin();
  assert.equal(otra.status, 429);
  const body = await otra.json();
  assert.ok(body.error);
});

test('POST /api/cuenta/recuperar comparte el limitador de login (5/IP/15min)', async () => {
  // cuenta.js monta limiterLogin (el mismo limitador de /api/login, no una
  // copia) en /recuperar y /recuperar/confirmar: son rutas PUBLICAS y con el
  // mismo perfil de riesgo (fuerza bruta / enumeracion) que el login.
  // La ventana se agota AQUI y solo contra /api/login, sin depender de lo que
  // hayan hecho los tests anteriores. Como esta es la primera peticion del
  // archivo a /recuperar, si el limitador de esa ruta fuera una instancia
  // propia su contador estaria a cero y responderia 400; que responda 429
  // demuestra que el contador es el mismo que el de /api/login.
  await agotarLimiteDeLogin();
  const r = await fetch(`${BASE}/api/cuenta/recuperar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'no-es-un-correo' })
  });
  assert.equal(r.status, 429, 'la primera peticion a /recuperar ya debe llegar bloqueada por el gasto hecho en /api/login');
  // Y el que bloquea es el limitador de LOGIN (limite 5), no el general (100).
  assert.equal(r.headers.get('ratelimit-limit'), String(LIMITE_LOGIN));
  assert.equal(r.headers.get('ratelimit-remaining'), '0');
  const body = await r.json();
  assert.ok(body.error);
});

test('el limitador general cuenta por PERSONA: agotar la cuota de una no bloquea a otra desde la misma IP', async () => {
  // Prueba de integracion del keyGenerator: no basta con que claveLimitador()
  // devuelva la clave correcta (eso ya lo cubre rate-limit-por-persona.test.js),
  // hay que verificar que express-rate-limit la esta usando de verdad.
  const { DatabaseSync } = await import('node:sqlite');
  const jwt = (await import('jsonwebtoken')).default;
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const personas = db.prepare(
    'SELECT id, iglesia_id FROM persona WHERE activo = 1 AND iglesia_id IS NOT NULL ORDER BY id LIMIT 2'
  ).all();
  db.close();
  assert.equal(personas.length, 2, 'la siembra debe dejar al menos dos personas activas');

  const SECRETO = 'secreto-de-pruebas-no-usar-en-produccion';
  const tokenDe = (p) => jwt.sign({ persona_id: p.id, iglesia_id: p.iglesia_id }, SECRETO, { expiresIn: '1h' });
  const pedirComo = (token) => fetch(`${BASE}/api/me`, { headers: { Authorization: `Bearer ${token}` } });

  // Se agota la cuota de la primera persona (limite general: 100 / 15 min).
  const tokenA = tokenDe(personas[0]);
  let ultimo;
  for (let i = 0; i < 101; i++) ultimo = (await pedirComo(tokenA)).status;
  assert.equal(ultimo, 429, 'la persona que supera su cuota debe recibir 429');

  // La segunda persona, desde la MISMA IP, sigue trabajando sin problemas.
  const res = await pedirComo(tokenDe(personas[1]));
  assert.equal(res.status, 200, 'otra persona tras la misma IP no debe heredar el bloqueo');
});
