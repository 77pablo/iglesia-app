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

// ⚠️ La parada es una heuristica y falla de dos maneras. Quedarse CORTO es
// ruidoso: el trozo sale a medias y revienta como SyntaxError dentro del
// new Function() de mas abajo, se ve. DESBORDARSE no revienta nada: si la
// declaracion no acaba en ';' ni en '}' -- una coma al final, o un comentario
// detras de la llave -- el bucle llega al final del fichero y esto devuelve
// desde la declaracion hasta el final de app.js. Las comprobaciones de abajo
// pasarian a buscar su cadena en medio archivo y dejarian de cubrir lo que
// cubrian, en verde. Por eso el assert del final: el segundo caso tambien
// tiene que hacer ruido.
function recortar(nombre) {
  const i = lineas.findIndex(l => new RegExp(`^(?:async function|function|const|let) ${nombre}\\b`).test(l));
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, trozo = [], cerro = false;
  for (let j = i; j < lineas.length; j++) {
    const l = lineas[j];
    trozo.push(l);
    for (const ch of l) { if (ch === '{') saldo++; else if (ch === '}') saldo--; }
    if (saldo <= 0 && (l.trimEnd().endsWith(';') || l.trimEnd().endsWith('}'))) { cerro = true; break; }
  }
  assert.ok(cerro, `el recorte de ${nombre} llego al final de web/app.js sin cerrar: la parada (saldo a cero en una linea que acaba en ';' o en '}') no disparo nunca, asi que esto devolveria desde la declaracion hasta el final del fichero y las comprobaciones de abajo buscarian su cadena en medio app.js sin enterarse de nada. Mira como termina ${nombre} en web/app.js -- si acaba en ',' o lleva un comentario detras de la '}', lo que hay que arreglar es el corte, no la prueba`);
  return trozo.join('\n');
}

// Monta api() con una red de mentira y un navegador de mentira.
//
// El candado de los botones (_tomarBoton) se recorta REAL, no se simula: solo
// entra en juego con POST/PATCH/PUT/DELETE, y sin el la primera prueba que
// mandara algo distinto de un GET reventaria con un ReferenceError. Lo unico
// simulado es botonActual(), que lee el `event` del navegador y aqui no hay.
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
  const pushCortarDispositivoFn = () => {}; // fire-and-forget, nunca falla
  const botonActual = () => null;           // no hay `event` ni DOM en esta prueba
  const src = ['ERR_CONEXION', 'ERR_SESION', '_avisandoSesion', '_sesionCaducada', '_enVuelo', '_tomarBoton', 'api']
    .map(recortar).join('\n');
  const api = new Function(
    'API', 'token', 'fetch', 'localStorage', '$', 'toast', 'location', 'setTimeout', 'pushCortarDispositivo', 'botonActual',
    `${src}\nreturn api;`
  )('/api', () => estado.guardado, fetch, localStorage, $, toast, location, setTimeout_, pushCortarDispositivoFn, botonActual);
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

// El error que sale de api() no solo se LEE: hay un manejador que necesita
// distinguir un choque de ediciones (dos personas corrigiendo el mismo gasto)
// de cualquier otro fallo, y lo unico que se lo dice es `e.status`. Sin esta
// prueba se podia borrar la linea `err.status=r.status` y la suite entera
// seguia verde: guardarGasto se iba por el `catch` generico y el aviso pasaba
// a ser "No se pudo guardar" — un fallo mudo, de los que solo se descubren con
// dos personas y una hoja de verdad.
test('un choque de ediciones llega con su codigo puesto, no solo con su texto', async () => {
  const { api } = montar({
    responde: { status: 409, cuerpo: { error: 'Alguien cambió este gasto mientras lo mirabas — recarga la hoja' } }
  });
  try {
    await api('/organizacion/gastos/9', { method: 'PATCH', body: '{}' });
    assert.fail('deberia haber lanzado');
  } catch (e) {
    assert.equal(e.status, 409, 'sin el codigo, la pantalla no puede distinguir este caso de un fallo cualquiera');
    assert.equal(e.message, 'Alguien cambió este gasto mientras lo mirabas — recarga la hoja');
  }
});

test('los errores corrientes tambien traen su codigo (no es un apaño solo para el 409)', async () => {
  const { api } = montar({ responde: { status: 500, sinCuerpo: true } });
  try { await api('/me'); assert.fail('deberia haber lanzado'); }
  catch (e) { assert.equal(e.status, 500); }
});

// Los dos errores que NO llevan codigo, porque se lanzan antes: quien escriba
// un manejador nuevo tiene que poder ver aqui donde acaba la garantia.
test('la sesion vencida y el limite de peticiones se lanzan sin codigo', async () => {
  const sinSesion = montar({ responde: { status: 401, cuerpo: {} } });
  try { await sinSesion.api('/me'); } catch (e) { assert.equal(e.status, undefined); }
  const rapido = montar({ responde: { status: 429, cuerpo: {} } });
  try { await rapido.api('/me'); } catch (e) { assert.equal(e.status, undefined); }
});

test('cuando todo va bien, devuelve los datos y no molesta', async () => {
  const { api, estado } = montar({ responde: { status: 200, cuerpo: { persona: { nombre: 'Maria' } } } });
  assert.deepEqual(await api('/me'), { persona: { nombre: 'Maria' } });
  assert.equal(estado.toasts.length, 0);
  assert.equal(estado.recargas, 0);
  assert.equal(estado.guardado, 'tok-123', 'una peticion buena no puede borrar la sesion');
});
