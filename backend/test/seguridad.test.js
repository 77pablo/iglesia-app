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
const BASE = `http://localhost:${PORT}`;
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

test('POST /api/login: al superar 5 peticiones/IP en la ventana, responde 429', async () => {
  // Ya se hicieron 2 peticiones a /api/login en los tests anteriores (una
  // invalida y una valida), que cuentan contra el mismo limitador. Con 4
  // intentos mas alcanzamos y superamos el limite de 5.
  const intento = () => fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iglesia: 'MONTESION', usuario: 'pastor', password: 'incorrecta' })
  });
  let ultimoStatus;
  for (let i = 0; i < 4; i++) {
    const r = await intento();
    ultimoStatus = r.status;
  }
  assert.equal(ultimoStatus, 429);
  const r = await intento();
  assert.equal(r.status, 429);
  const body = await r.json();
  assert.ok(body.error);
});

test('POST /api/cuenta/recuperar comparte el limitador de login (5/IP/15min) y ya esta agotado', async () => {
  // cuenta.js monta limiterLogin (el mismo limitador de /api/login, no una
  // copia) en /recuperar y /recuperar/confirmar: son rutas PUBLICAS y con el
  // mismo perfil de riesgo (fuerza bruta / enumeracion) que el login. Como
  // express-rate-limit cuenta por IP (no por ruta), y el test anterior ya
  // agoto la ventana de esta IP contra /api/login, esta peticion a
  // /recuperar debe llegar YA bloqueada con 429 -- lo que demuestra que el
  // limitador esta realmente activo en esta ruta (y no solo en login).
  const r = await fetch(`${BASE}/api/cuenta/recuperar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'no-es-un-correo' })
  });
  assert.equal(r.status, 429);
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
