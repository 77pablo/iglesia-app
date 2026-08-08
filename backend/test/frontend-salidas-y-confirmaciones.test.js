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

// Recorta un metodo del literal `const Org = {` contando llaves, igual que
// organizacion-pagador-selector.test.js:68. Sustituye a un `slice(i, i + 14)`
// —una ventana de 14 lineas— que se rompio en cuanto borrarCosa crecio: el
// `danger:true` se salio por abajo y el test acuso al codigo de un defecto que
// no tenia. Un numero magico de lineas mide el tamano del metodo, no lo que
// dice; esto para donde el metodo acaba de verdad, y avisa si se desborda.
function recortarMetodoDeOrg(nombre) {
  const i = lineas.findIndex(l => new RegExp(`^  (?:async )?${nombre}\\s*\\(`).test(l));
  assert.ok(i >= 0, `no se encontro el metodo ${nombre} en el literal Org de web/app.js`);
  let saldo = 0, abierta = false, cerro = false;
  const trozo = [];
  for (let j = i; j < lineas.length; j++) {
    trozo.push(lineas[j]);
    for (const ch of lineas[j]) { if (ch === '{') { saldo++; abierta = true; } else if (ch === '}') saldo--; }
    if (abierta && saldo <= 0) { cerro = true; break; }
  }
  assert.ok(cerro, `el recorte del metodo ${nombre} llego al final de web/app.js sin cerrar: devolveria medio fichero y las comprobaciones de abajo dejarian de cubrir lo que cubren, en verde`);
  const hermanos = trozo.slice(1).filter(l => /^ {2}(?:async )?[a-zA-Z_$][\w$]*\s*\(/.test(l));
  assert.deepEqual(hermanos, [], `el recorte de ${nombre} se comio otro(s) metodo(s) de Org: ${hermanos.join(' | ')}`);
  return trozo.join('\n');
}

test('borrar un gasto y borrar una cosa preguntan antes', () => {
  for (const [nombre, debe] of [['borrarGasto', /No queda registro/], ['borrarCosa', /¿Quitar/]]) {
    const cuerpo = recortarMetodoDeOrg(nombre);
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
