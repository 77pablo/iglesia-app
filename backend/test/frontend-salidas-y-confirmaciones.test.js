// ============================================================
//  Que se pueda salir, que se entienda el fallo, y que lo grave se pregunte.
//
//   1. De Notificaciones no habia salida: se llega tocando la campana, la vista
//      apaga el resaltado del menu, y no habia ningun "volver".
//   2. Siete pantallas fallaban diciendo solo "Error." y se quedaban muertas,
//      mientras el mismo archivo ya resolvia esto bien en otros ocho sitios.
//   3. Borrar un gasto de Organizacion no preguntaba. Un gasto lleva el monto y
//      quien puso el dinero: es el registro con el que se le devuelve la plata a
//      esa persona. Iba a un toque, en un boton pequeno, en un telefono.
//
//  Y un guardian que no existia: modalConfirm() mete su mensaje CRUDO en
//  innerHTML, asi que cualquier dato que se le interpole tiene que ir escapado.
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

test('errCargar dice que fallo y ofrece reintentar', () => {
  const errCargar = new Function(`${recortar('errCargar')}\nreturn errCargar;`)();
  const html = errCargar('vistaServicio()', 'los servicios');
  assert.match(html, /No se pudo cargar los servicios/);
  assert.match(html, /Reintentar/);
  assert.match(html, /javascript:vistaServicio\(\)/, 'el enlace tiene que volver a llamar a la vista');
  // Sin detalle sigue teniendo sentido.
  assert.match(errCargar('cargarX()'), /No se pudo cargar ·/);
});

test('ya no queda ninguna pantalla que falle diciendo solo "Error."', () => {
  const sospechosos = lineas
    .map((l, i) => [i + 1, l.trim()])
    .filter(([, l]) => !/^\s*(\/\/|\*)/.test(l))
    .filter(([, l]) => /class="error"[^>]*>\s*Error\.?\s*</.test(l));
  assert.deepEqual(sospechosos, [], '"Error." no dice que fallo, ni de quien es la culpa, ni que hacer');
});

test('las siete pantallas arregladas usan errCargar con su propia recarga', () => {
  for (const fn of ['vistaServicio()', 'vistaAsistencia()', 'cargarAvisosGrupo()',
                    'cargarRecursosGrupo()', 'cargarMiembrosGrupo()', 'cargarSetlist(']) {
    assert.ok(fuente.includes(`errCargar('${fn}`),
      `falta el reintentar de ${fn}`);
  }
  assert.match(fuente, /errCargar\('verPredica\(/, 'falta el reintentar de la predica');
});

test('de Notificaciones se puede salir', () => {
  const i = lineas.findIndex(l => l.includes('async function verNotificaciones'));
  assert.ok(i >= 0, 'no se encontro verNotificaciones()');
  const vista = lineas.slice(i, i + 14).join('\n');
  assert.match(vista, /navTo\('inicio'\)/, 'necesita un "volver" como el resto de sub-pantallas');
  assert.match(vista, /‹/, 'con la misma forma que los demas: "‹ Inicio"');
});

test('borrar un gasto y borrar una cosa preguntan antes', () => {
  for (const [nombre, debe] of [['borrarGasto', /No queda registro/], ['borrarCosa', /¿Quitar/]]) {
    const i = lineas.findIndex(l => new RegExp(`async ${nombre}\\(`).test(l));
    assert.ok(i >= 0, `no se encontro ${nombre}()`);
    const cuerpo = lineas.slice(i, i + 14).join('\n');
    assert.match(cuerpo, /modalConfirm\(/, `${nombre} tiene que preguntar antes de borrar`);
    assert.match(cuerpo, /danger:\s*true/, `${nombre} es destructivo: el boton va en rojo`);
    assert.match(cuerpo, debe);
  }
});

// --- el guardian general ---
test('ningun modalConfirm interpola datos sin escapar', () => {
  // modalConfirm() escribe su mensaje con innerHTML (sin escapar: es HTML a
  // proposito, varios mensajes llevan <b>). Todo lo que se le interpole viene de
  // la base de datos —el nombre de una iglesia, el concepto de un gasto, el
  // nombre de una cosa que escribe cualquier lider— y necesita escHtml().
  const sinEscapar = [];
  let desde = 0;
  for (;;) {
    const i = fuente.indexOf('modalConfirm(', desde);
    if (i < 0) break;
    desde = i + 1;
    if (/function\s+modalConfirm/.test(fuente.slice(Math.max(0, i - 20), i + 13))) continue;

    // Primer argumento: se recorre hasta la coma de nivel cero, saltando
    // comillas y literales de plantilla (una coma dentro de un texto no separa).
    let j = i + 'modalConfirm('.length, prof = 0, cita = null, arg = '';
    for (; j < fuente.length; j++) {
      const c = fuente[j], ant = fuente[j - 1];
      if (cita) {
        if (c === cita && ant !== '\\') cita = null;
      } else if (c === '"' || c === "'" || c === '`') {
        cita = c;
      } else if ('([{'.includes(c)) prof++;
      else if (')]}'.includes(c)) { if (prof === 0) break; prof--; }
      else if (c === ',' && prof === 0) break;
      arg += c;
    }
    const linea = fuente.slice(0, i).split('\n').length;
    const interpola = /\$\{/.test(arg) || /['"`]\s*\+/.test(arg);
    if (interpola && !arg.includes('escHtml')) sinEscapar.push(`${linea}: ${arg.trim().slice(0, 90)}`);
  }
  assert.deepEqual(sinEscapar, [], 'usa escHtml() en lo que interpoles a modalConfirm');
});
