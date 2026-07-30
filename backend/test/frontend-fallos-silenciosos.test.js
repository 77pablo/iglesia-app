// ============================================================
//  Cuatro fallos del frontend que no daban ningun error.
//
//  Los cuatro comparten forma: la app sigue funcionando, no sale nada en rojo,
//  y lo que la persona ve es simplemente falso.
//
//   1. Una lista de personas vacia se quedaba cacheada para siempre.
//   2. "Altas este mes" se ponia a 0 las ultimas horas de cada mes.
//   3. El contador de mensajes del menu no subia si no estabas en Mensajes.
//   4. "Orden del servicio" se quedaba en "…" para siempre si no habia eventos.
//
//  Se ejecutan las funciones REALES sacadas de web/app.js. Comprobar que el
//  archivo "ya no contiene tal cadena" pasaria igual con el arreglo mal escrito.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
const fuente = fs.readFileSync(APP_JS, 'utf8');
const lineas = fuente.split('\n');

function recortar(nombre) {
  const i = lineas.findIndex(l => new RegExp(`^(?:async function|function|const) ${nombre}\\b`).test(l));
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

// --- 1) la lista de personas ---
function cargarPersonas(respuestas) {
  // `api` y `window` se le inyectan; devuelve la funcion lista para usar.
  let llamadas = 0;
  const win = {};
  const api = async () => { const r = respuestas[Math.min(llamadas++, respuestas.length - 1)]; if (r instanceof Error) throw r; return r; };
  const fn = new Function('window', 'api', `${recortar('_personas')}\nreturn _personas;`)(win, api);
  return { fn, win, veces: () => llamadas };
}

test('una lista de personas vacia NO se queda cacheada para siempre', async () => {
  // Un fallo puntual devolvia [] y el `||` lo daba por bueno: hasta recargar la
  // pagina, los desplegables de equipo de musica y de predicadores salian en
  // blanco. El lider concluia que en la iglesia no hay nadie.
  const { fn, veces } = cargarPersonas([[], [{ id: 1, nombre: 'Maria' }]]);
  assert.deepEqual(await fn(), [], 'la primera vez falla y devuelve vacio');
  const segunda = await fn();
  assert.equal(segunda.length, 1, 'la segunda vez tiene que volver a preguntar');
  assert.equal(veces(), 2, 'no puede haberse quedado con el vacio');
});

test('una lista con gente SI se cachea (no se pide en cada pantalla)', async () => {
  const { fn, veces } = cargarPersonas([[{ id: 1, nombre: 'Maria' }]]);
  await fn(); await fn(); await fn();
  assert.equal(veces(), 1, 'con datos buenos solo se pide una vez');
});

// --- 2) el mes en curso ---
test('"Altas este mes" usa el mes de Chile, no el de UTC', () => {
  const mesLocal = new Function(`${recortar('mesLocal')}\nreturn mesLocal;`)();
  const tz = process.env.TZ;
  try {
    // 1 de agosto 01:00 UTC = 31 de julio, 21:00 en Chile.
    const instante = new Date('2026-08-01T01:00:00Z');
    process.env.TZ = 'America/Santiago';
    assert.equal(mesLocal(new Date(instante)), '2026-07', 'en Chile ese instante sigue siendo julio');
    process.env.TZ = 'UTC';
    assert.equal(mesLocal(new Date(instante)), '2026-08', 'y en UTC ya es agosto: por eso salia 0');
  } finally {
    if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
  }
  assert.doesNotMatch(fuente.match(/const mesActual\s*=.*/)[0], /toISOString/,
    'el mes del informe no puede volver a calcularse con toISOString');
});

// --- 3) el contador de mensajes ---
test('el contador del menu se actualiza aunque no estes en Mensajes', () => {
  // cargarLista() es lo unico que mueve el badge, y la llama el manejador de SSE
  // con cada mensaje que entra. Si actualizarBadgeNav va DESPUES del
  // `if(!cont) return`, solo sube estando ya dentro de Mensajes, que es
  // exactamente cuando no hace falta.
  const i = lineas.findIndex(l => /async cargarLista\(\)/.test(l));
  assert.ok(i >= 0, 'no se encontro cargarLista()');
  const cuerpo = lineas.slice(i, i + 30).join('\n');
  const posBadge = cuerpo.indexOf('actualizarBadgeNav');
  const posReturn = cuerpo.indexOf("$('chatLista'); if(!cont) return");
  assert.ok(posBadge > 0 && posReturn > 0, 'no se encontraron las dos lineas clave');
  assert.ok(posBadge < posReturn,
    'actualizarBadgeNav tiene que ir ANTES de salir cuando la vista no esta montada');
});

// --- 4) el orden del servicio sin eventos ---
test('sin eventos, "Orden del servicio" explica que hacer en vez de quedarse en "…"', () => {
  const i = lineas.findIndex(l => l.includes("Todavía no hay eventos"));
  assert.ok(i >= 0, 'el desplegable deberia decir "Todavía no hay eventos", no "(sin eventos)"');
  const bloque = lineas.slice(i, i + 12).join('\n');
  assert.match(bloque, /\$\('setlist'\)/,
    'la rama sin eventos tiene que tocar #setlist, que arranca con "…" y si no se queda asi para siempre');
});
