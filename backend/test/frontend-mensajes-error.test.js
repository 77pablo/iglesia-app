// ============================================================
//  Lo que lee la congregacion cuando algo falla.
//
//  Toda la app pide datos por api(), y hay 114 sitios que hacen toast(e.message)
//  o pintan e.message en rojo: lo que salga de esa funcion es, literalmente, lo
//  que lee la gente. Salian tres cosas ilegibles:
//
//   - Sin senal, fetch rechaza con un TypeError cuyo mensaje es "Failed to
//     fetch". Una feligresa sin cobertura tocaba "Acepto" y leia eso, en ingles.
//   - El token dura 30 dias. Al dia 31 salia "Token invalido o expirado" en rojo
//     en mitad de la pantalla y la app se quedaba ahi: la unica salida era saber
//     buscar "Cerrar sesion" en el menu.
//   - Un 429 del limitador sin decir cuanto esperar.
//
//  Se ejecuta la api() REAL sacada de web/app.js con la red simulada.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'app.js'), 'utf8');
const lineas = fuente.split('\n');

function recortar(nombre) {
  const i = lineas.findIndex(l => new RegExp(`^(?:async function|function|const|let) ${nombre}\\b`).test(l));
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, trozo = [];
  for (let j = i; j < lineas.length; j++) {
    const l = lineas[j];
    trozo.push(l);
    for (const ch of l) { if (ch === '{') saldo++; else if (ch === '}') saldo--; }
    if (saldo <= 0 && (l.trimEnd().endsWith(';') || l.trimEnd().endsWith('}'))) break;
  }
  return trozo.join('\n');
}

// Monta api() con una red de mentira y un navegador de mentira.
function montar({ responde, lanza, conToken = true, appVisible = true } = {}) {
  const estado = { toasts: [], recargas: 0, guardado: conToken ? 'tok-123' : null };
  const localStorage = {
    getItem: () => estado.guardado,
    removeItem: () => { estado.guardado = null; },
    setItem: () => {}
  };
  const $ = id => (id === 'app' ? { classList: { contains: () => !appVisible } } : null);
  const toast = m => estado.toasts.push(m);
  const location = { reload: () => estado.recargas++ };
  const setTimeout_ = fn => { fn(); return 0; };   // sin esperas en la prueba
  const fetch = async () => {
    if (lanza) throw new TypeError('Failed to fetch');
    return {
      ok: responde.status >= 200 && responde.status < 300,
      status: responde.status,
      json: async () => { if (responde.sinCuerpo) throw new Error('no json'); return responde.cuerpo || {}; }
    };
  };
  const src = ['ERR_CONEXION', 'ERR_SESION', '_avisandoSesion', '_sesionCaducada', 'api']
    .map(recortar).join('\n');
  const api = new Function(
    'API', 'token', 'fetch', 'localStorage', '$', 'toast', 'location', 'setTimeout',
    `${src}\nreturn api;`
  )('/api', () => estado.guardado, fetch, localStorage, $, toast, location, setTimeout_);
  return { api, estado };
}

const mensaje = async fn => { try { await fn(); assert.fail('deberia haber lanzado'); } catch (e) { return e.message; } };

test('sin conexion: se lee en castellano, no "Failed to fetch"', async () => {
  const { api } = montar({ lanza: true });
  const m = await mensaje(() => api('/me'));
  assert.doesNotMatch(m, /failed to fetch/i, 'no puede salir el mensaje del navegador');
  assert.match(m, /conexi[oó]n/i);
  assert.match(m, /wifi|datos/i, 'tiene que decirle a la persona que mirar');
});

test('sesion vencida: avisa, borra el token y vuelve al login', async () => {
  const { api, estado } = montar({ responde: { status: 401, cuerpo: { error: 'Token invalido o expirado' } } });
  const m = await mensaje(() => api('/me'));
  assert.doesNotMatch(m, /token/i, 'la palabra "token" no significa nada para un feligres');
  assert.match(m, /sesi[oó]n/i);
  assert.equal(estado.guardado, null, 'el token caducado tiene que borrarse');
  assert.equal(estado.recargas, 1, 'tiene que volver al login solo');
  assert.equal(estado.toasts.length, 1);
});

test('sesion vencida durante el arranque: no interrumpe (cargarApp ya enseña el login)', async () => {
  const { api, estado } = montar({ responde: { status: 401, cuerpo: {} }, appVisible: false });
  await mensaje(() => api('/me'));
  assert.equal(estado.recargas, 0, 'arrancando no hay nada que interrumpir');
  assert.equal(estado.toasts.length, 0);
});

test('un 401 sin haber mandado token NO se toma por sesion vencida', async () => {
  // Si no habia sesion que perder, no hay nada que avisar ni que recargar.
  const { api, estado } = montar({ responde: { status: 401, cuerpo: { error: 'Credenciales invalidas' } }, conToken: false });
  const m = await mensaje(() => api('/login'));
  assert.equal(m, 'Credenciales invalidas', 'se respeta el mensaje del backend');
  assert.equal(estado.recargas, 0);
});

test('limite de peticiones: dice que espere, no un numero', async () => {
  const { api } = montar({ responde: { status: 429, cuerpo: { error: 'Demasiadas peticiones' } } });
  const m = await mensaje(() => api('/me'));
  assert.match(m, /espera/i);
});

test('un error del servidor sin cuerpo no muestra un escueto "Error"', async () => {
  const { api } = montar({ responde: { status: 500, sinCuerpo: true } });
  const m = await mensaje(() => api('/me'));
  assert.notEqual(m, 'Error', 'antes salia literalmente "Error"');
  assert.ok(m.length > 20, `mensaje demasiado escueto: "${m}"`);
});

test('los errores que el backend SI escribe bien se respetan tal cual', async () => {
  // El backend escribe mensajes cuidados ("Solo el tesorero puede registrar
  // movimientos"). Esta funcion no puede taparlos con uno generico.
  const { api } = montar({ responde: { status: 403, cuerpo: { error: 'Solo el pastor puede administrar usuarios y roles.' } } });
  assert.equal(await mensaje(() => api('/admin/datos')), 'Solo el pastor puede administrar usuarios y roles.');
});

test('cuando todo va bien, devuelve los datos y no molesta', async () => {
  const { api, estado } = montar({ responde: { status: 200, cuerpo: { persona: { nombre: 'Maria' } } } });
  assert.deepEqual(await api('/me'), { persona: { nombre: 'Maria' } });
  assert.equal(estado.toasts.length, 0);
  assert.equal(estado.recargas, 0);
  assert.equal(estado.guardado, 'tok-123', 'una peticion buena no puede borrar la sesion');
});
