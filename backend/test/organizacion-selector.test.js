// ----------------------------------------------------------------------------
//  El selector "quien puso el dinero" (Organizacion): la opcion inyectada
//  "(cuenta inactiva)" es provisional mientras /directorio no responde. Si su
//  gemela real llega, la inyectada debe irse SIEMPRE -- no solo cuando esta
//  seleccionada (pendiente 7 de la fuente del gasto, ESTADO.md).
//
//  Lee el TEXTO FUENTE de web/app.js, como menu-plegable.test.js: el proyecto
//  no tiene banco de pruebas de navegador.
// ----------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'app.js'), 'utf8');

// Recorta `function nombre(...){ ... }` balanceando llaves (mismo helper que
// menu-plegable.test.js; se repite porque cada suite es autonoma).
function recortarFuncion(nombre) {
  const i = fuente.indexOf(`function ${nombre}(`);
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('{', i); j < fuente.length; j++) {
    if (fuente[j] === '{') saldo++;
    else if (fuente[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, `no se pudo cerrar ${nombre}`);
  return fuente.slice(i, fin);
}

const quitarAusenteDuplicada = new Function(
  `${recortarFuncion('quitarAusenteDuplicada')}; return quitarAusenteDuplicada;`)();

// Un <select> de juguete que imita lo que importa del real: asignar un value
// que ninguna opcion tiene deja '' (selectedIndex=-1), y quitar la opcion
// seleccionada resetea a la primera. Sin esas dos reglas el test pasaria
// aunque el codigo dejara el selector en blanco -- que es JUSTO el fallo
// historico de esta pantalla.
function selectDeJuguete(opciones) {
  const sel = {
    options: [],
    querySelector(s) {
      return s === 'option[data-ausente]'
        ? sel.options.find(o => o.dataset.ausente) || null : null;
    },
    _value: '',
    get value() { return this._value; },
    set value(v) { this._value = this.options.some(o => o.value === v) ? v : ''; },
  };
  for (const [value, etiqueta, ausente] of opciones) {
    const o = {
      value, textContent: etiqueta, dataset: ausente ? { ausente: '1' } : {},
      remove() {
        sel.options.splice(sel.options.indexOf(o), 1);
        if (sel._value === value && !sel.options.some(x => x.value === value))
          sel._value = sel.options.length ? sel.options[0].value : '';
      },
    };
    sel.options.push(o);
  }
  return sel;
}

test('con la gemela real en la lista, la inyectada se va aunque NO este seleccionada', () => {
  // El caso que el arreglo viejo dejaba fuera: la persona cambio el selector a
  // mano mientras el directorio viajaba.
  const sel = selectDeJuguete([
    ['', 'Lo puse yo'], ['caja', 'La caja de la iglesia'],
    ['7', 'Maria Perez (cuenta inactiva)', true],   // la inyectada
    ['5', 'Pedro Soto'], ['7', 'Maria Perez'],      // la gemela real llego
  ]);
  sel.value = '5';                                   // eleccion a mano
  quitarAusenteDuplicada(sel);
  assert.equal(sel.querySelector('option[data-ausente]'), null,
    'la inyectada sigue en la lista: el rotulo "(cuenta inactiva)" miente y el nombre sale dos veces');
  assert.equal(sel.value, '5', 'quitar la inyectada piso la eleccion de la persona');
  assert.equal(sel.options.filter(o => o.value === '7').length, 1, 'Maria sigue dos veces');
});

test('si la inyectada era la SELECCIONADA, la seleccion cae en su gemela real', () => {
  const sel = selectDeJuguete([
    ['', 'Lo puse yo'], ['caja', 'La caja de la iglesia'],
    ['7', 'Maria Perez (cuenta inactiva)', true],
    ['7', 'Maria Perez'],
  ]);
  sel.value = '7';
  quitarAusenteDuplicada(sel);
  assert.equal(sel.querySelector('option[data-ausente]'), null, 'la inyectada no se fue');
  assert.equal(sel.value, '7',
    'la seleccion no cayo en la gemela real: el selector quedo apuntando a otra cosa');
});

test('sin gemela (la persona SI esta inactiva), la inyectada se queda: ahi el rotulo es verdad', () => {
  const sel = selectDeJuguete([
    ['', 'Lo puse yo'], ['caja', 'La caja de la iglesia'],
    ['7', 'Maria Perez (cuenta inactiva)', true],
    ['5', 'Pedro Soto'],
  ]);
  sel.value = '7';
  quitarAusenteDuplicada(sel);
  assert.ok(sel.querySelector('option[data-ausente]'),
    'se quito la opcion de una persona DE VERDAD inactiva: vuelve el selector en blanco');
  assert.equal(sel.value, '7');
});

test('_llenarQuienPago la llama despues de poblar el directorio', () => {
  // El candado del cableado: la funcion puede ser perfecta y no llamarse nunca.
  const llenar = fuente.match(/_llenarQuienPago\(\)\{[\s\S]*?\n  \},/);
  assert.ok(llenar, 'no se encontro _llenarQuienPago en web/app.js');
  assert.ok(llenar[0].includes('quitarAusenteDuplicada(sel)'),
    '_llenarQuienPago ya no reconcilia la opcion inyectada al llegar el directorio');
});
