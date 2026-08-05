// ----------------------------------------------------------------------------
//  Limpieza de lo muerto (spec 2026-08-05-pulido-agosto):
//   - la tabla `recurso` no existe (nada la escribio jamas; se dropea);
//   - `dispositivo_push` SI existe (puede tener filas reales; solo murio
//     su puerta de escritura);
//   - POST /api/dispositivo -> 404 (endpoint legacy eliminado; el push real
//     usa push_sub via /api/push/*).
// ----------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { cargarDb } from './helpers.js';
import { puertoLibre } from './puerto-libre.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, '..', 'src', 'server.js');

test('la tabla recurso ya no existe y dispositivo_push sigue', async () => {
  const db = await cargarDb();
  const tablas = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  assert.ok(!tablas.includes('recurso'),
    'la tabla `recurso` sigue existiendo: nada la escribio jamas y la spec la retira');
  assert.ok(tablas.includes('dispositivo_push'),
    '`dispositivo_push` NO debia borrarse: puede tener filas reales en produccion');
});

test('la migracion que la dropea es idempotente', async () => {
  await cargarDb();
  const { migrarQuitarRecurso } = await import('../src/db.js');
  migrarQuitarRecurso();
  migrarQuitarRecurso();   // segunda llamada: no debe reventar ni hacer nada
});

test('POST /api/dispositivo -> 404 (endpoint legacy eliminado)', async (t) => {
  const PORT = await puertoLibre();
  const BASE = `http://127.0.0.1:${PORT}`;
  const DB_PATH = path.join(os.tmpdir(), `iglesia-test-limpieza-${Date.now()}.db`);
  const servidor = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...process.env, PORT: String(PORT), DB_PATH,
      JWT_SECRET: 'secreto-de-pruebas-no-usar-en-produccion',
      SEED_ON_EMPTY: '1', NODE_ENV: '', DISABLE_RATE_LIMIT: '1'
    },
    stdio: 'pipe'
  });
  t.after(() => {
    servidor.kill();
    try { fs.unlinkSync(DB_PATH); } catch { /* puede no existir */ }
    try { fs.unlinkSync(DB_PATH + '-journal'); } catch { /* idem */ }
  });
  let listo = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) { listo = true; break; } }
    catch { /* aun no levanta */ }
    await new Promise(r => setTimeout(r, 250));
  }
  if (!listo) throw new Error('El servidor de pruebas no respondio a tiempo');
  const login = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iglesia: 'MONTESION', usuario: 'pastor', password: '1234' })
  });
  const { token } = await login.json();
  assert.ok(token, 'no se pudo iniciar sesion en el servidor de pruebas');
  const r = await fetch(`${BASE}/api/dispositivo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ token: 'token-viejo', plataforma: 'android' })
  });
  assert.equal(r.status, 404,
    'POST /api/dispositivo sigue vivo: es la puerta de escritura del push legacy');
});
