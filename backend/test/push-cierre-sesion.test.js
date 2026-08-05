// -----------------------------------------------------------------------------
//  El push muere con la sesion (spec 2026-08-04-push-dispositivo-compartido).
//
//  Igual que menu-plegable.test.js, esto lee el TEXTO FUENTE de web/app.js:
//  el proyecto no tiene banco de pruebas de navegador. Regla de la casa:
//  \r? antes de cada \n en los regex, o [\s\S] — el archivo vive con CRLF.
// -----------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'app.js'), 'utf8');

// Recorta el cuerpo de una funcion de nivel superior: desde su cabecera hasta
// la primera llave de cierre en columna 0.
function cuerpoDe(cabecera) {
  const re = new RegExp(cabecera.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?\\r?\\n\\}');
  const m = fuente.match(re);
  assert.ok(m, `no se encontro "${cabecera}" en web/app.js`);
  return m[0];
}

test('la baja del push vive en un solo sitio: pushCortarDispositivo', () => {
  // Si /push/baja se llama desde mas de un punto, la proxima correccion se
  // aplicara en uno y no en el otro — exactamente lo que este helper evita.
  const usos = fuente.match(/\/push\/baja/g) || [];
  assert.equal(usos.length, 1,
    `/push/baja aparece ${usos.length} veces en web/app.js; debe aparecer solo ` +
    'dentro de pushCortarDispositivo()');
  const helper = cuerpoDe('async function pushCortarDispositivo');
  assert.ok(helper.includes('pushSoportado()'),
    'pushCortarDispositivo() no comprueba pushSoportado(): en un navegador viejo reventaria');
  assert.ok(helper.includes('getSubscription'),
    'pushCortarDispositivo() no mira la suscripcion actual');
  assert.ok(helper.includes('avisarServidor'),
    'pushCortarDispositivo() perdio el interruptor avisarServidor: el camino del 401 ' +
    'llamaria al servidor con un token muerto');
  assert.ok(helper.includes('/push/baja'), 'pushCortarDispositivo() ya no da de baja en el servidor');
  assert.ok(helper.includes('unsubscribe()'),
    'pushCortarDispositivo() ya no des-suscribe el navegador: el corte real es ese');
});

test('desactivarPush usa el helper, no su propia copia de la baja', () => {
  const f = cuerpoDe('async function desactivarPush');
  assert.ok(f.includes('pushCortarDispositivo('),
    'desactivarPush() no pasa por pushCortarDispositivo(): dos copias de la baja');
});

test('salir() corta el push y el logout va en un finally', () => {
  // El corte es cortesia con timeout; borrar el token y recargar es la orden,
  // y el finally garantiza que ocurre aunque la red o el push service fallen.
  const f = cuerpoDe('async function salir');
  assert.ok(f.includes('pushCortarDispositivo('),
    'salir() ya no corta el push: las notificaciones del que se fue seguirian ' +
    'llegando al dispositivo (el hallazgo de la auditoria, reabierto)');
  assert.ok(f.includes('Promise.race'),
    'salir() espera el corte sin timeout: sin red, cerrar sesion se quedaria colgado');
  assert.ok(/finally\s*\{[^}]*localStorage\.removeItem\('token'\)[^}]*location\.reload\(\)[^}]*\}/.test(f),
    'salir() no garantiza el logout en un finally con removeItem + reload');
});

test('_sesionCaducada corta el push local antes de su early-return, sin llamar al servidor', () => {
  const f = cuerpoDe('function _sesionCaducada');
  const corte = f.indexOf('pushCortarDispositivo({avisarServidor:false})');
  assert.ok(corte >= 0,
    '_sesionCaducada() no corta el push, o lo corta llamando al servidor con un ' +
    'token que acaba de caducar (avisarServidor debe ser false)');
  assert.ok(!/await\s+pushCortarDispositivo/.test(f),
    '_sesionCaducada() hace await del corte: es fire-and-forget, la funcion es sincrona');
  // 'return;' con punto y coma: busca la sentencia real, no la palabra suelta
  // en un comentario.
  const early = f.indexOf('return;');
  assert.ok(early < 0 || corte < early,
    'el corte esta despues de un return: al arrancar con un token viejo (app aun ' +
    'oculta) el push del dueño anterior quedaria vivo');
});
