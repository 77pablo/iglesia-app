// ============================================================
//  Barrido: interpolaciones ${...} dentro de MANEJADORES de evento
//  (onclick=, onchange=...) y de href="javascript:...".
//
//  Es la primera de las dos categorias que el barrido de atributos del 5-ago
//  dejo fuera a proposito (tanda G del 6-ago). Aqui el dato interpolado entra
//  en CODIGO JS dentro de un atributo: basta una comilla doble para salirse
//  del atributo (igual que en cualquier atributo), y ademas una comilla
//  simple basta para salirse del literal JS '...' que suele envolverlo.
//
//  Mismo tokenizador y mismas reglas mecanicas que el barrido de atributos
//  (xss-analisis.js). La mayoria de los ~110 sitios pasan solos porque
//  interpolan ids numericos (la tanda G envolvio con Number() los que eran
//  numericos pero no demostrables por forma, p.ej. guardarAporte(${id}) de
//  un parametro local). Lo que no se puede demostrar por forma esta en
//  EXCEPCIONES con motivo, y los motivos que cargan mas peso tienen su
//  propia prueba mas abajo (la leccion del barrido de atributos: una
//  afirmacion en un comentario no protege nada; una prueba si).
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clasificarInterpolaciones, esExprSegura } from './xss-analisis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
// CRLF -> LF: git puede sacar web/app.js con uno u otro fin de linea segun
// la maquina, y las firmas del barrido llevan posiciones/contexto del texto
// (sin normalizar, el mismo codigo daria firmas distintas segun el checkout).
const fuente = fs.readFileSync(APP_JS, 'utf8').replace(/\r\n/g, '\n');

// Cada entrada se valida por la FIRMA (atributo + texto completo del valor),
// igual que en el barrido de atributos y por el mismo motivo: que una futura
// interpolacion distinta con el mismo nombre de variable no quede blanqueada.
const EXCEPCIONES = [
  {
    firma: "onchange::fechaSelectAjustarDias('${prefijo}')",
    motivo: 'prefijo es el parametro de fechaSelectHTML(prefijo,...); en cada llamada del archivo se le pasa un literal fijo (\'en\',\'ev\',\'dp-cumple\'...), nunca un dato que escriba una persona. Mismo motivo que las excepciones id::${prefijo}-dia/-mes/-anio del barrido de atributos.'
  },
  {
    firma: "onclick::verDia('${fecha}')",
    motivo: 'renderCalendario(): fecha se construye dos lineas arriba como `${y}-${pad(m+1)}-${pad(dia)}` con enteros del propio bucle del calendario; nunca un dato que escriba una persona. Hay una prueba abajo que fija esa construccion.'
  },
  {
    firma: "onclick::pedirFecha('${fecha}')",
    motivo: 'verDia(fecha): su unico llamador es el onclick del calendario de arriba, asi que fecha es el mismo `${y}-${pad(m+1)}-${pad(dia)}` de enteros del bucle.'
  },
  {
    firma: "onclick::abrirNotif('${n.tipo}')",
    motivo: 'filaNotif(): este onclick solo se pinta cuando dest=_destinoNotif(n.tipo) es verdadero, y _destinoNotif devuelve \'\' para cualquier tipo fuera de su mapa fijo de claves — un tipo raro pinta la rama <div> SIN onclick. Hay una prueba abajo que fija esa guarda.'
  },
  {
    firma: "onclick::guardarMov('${tipo}')",
    motivo: 'formMov(tipo): las dos unicas llamadas del archivo son formMov(\'ingreso\') y formMov(\'gasto\'), literales. Hay una prueba abajo.'
  },
  {
    firma: 'href::javascript:${reintentar}',
    motivo: 'errCargar(reintentar,...): todas las llamadas del archivo pasan como reintentar un literal de codigo escrito ahi mismo (\'cargarNoDisp()\', \'verPredica(\'+Number(id)+\')\'...), nunca texto de una persona. Hay una prueba abajo que fija la forma de cada llamada.'
  },
  {
    firma: 'onclick::${editFn}(${id})',
    motivo: 'accionesBtns(editFn,delFn,id): editFn/delFn son nombres de funcion literales en cada llamada (lo fija la prueba de accionesBtns del barrido de atributos) y el id es siempre algo.id o un entero (lo fija la prueba de abajo).'
  },
  {
    firma: 'onclick::${delFn}(${id})',
    motivo: 'mismo accionesBtns() de arriba, boton de borrar.'
  },
  {
    firma: "onclick::setAjuste('${g}','${val}')",
    motivo: 'vistaAjustes(): opt(g,val,...) es una funcion flecha local y todas sus llamadas pasan literales (\'tema\',\'light\'...). Hay una prueba abajo.'
  },
  {
    firma: "onclick::setAjuste('acento','${k}')",
    motivo: 'vistaAjustes(): k recorre Object.entries(ACENTOS), la constante de paleta declarada en este mismo archivo; sus claves son identificadores fijos (\'cielo\',\'pino\'...), no datos de una iglesia.'
  }
];
const EXCEPCIONES_MAP = new Map(EXCEPCIONES.map(e => [e.firma, e]));

test('todas las excepciones tienen un motivo real (no solo un nombre)', () => {
  for (const exc of EXCEPCIONES) {
    assert.ok(exc.motivo && exc.motivo.trim().length >= 20,
      `excepción sin motivo suficiente: ${JSON.stringify(exc.firma)}`);
  }
});

test('barrido: toda interpolación ${...} dentro de un manejador de evento pasa por un ayudante seguro, es numérica demostrable, o tiene una excepción con motivo', () => {
  const { manejador } = clasificarInterpolaciones(fuente);
  assert.ok(manejador.length > 60, 'el barrido debería encontrar decenas de manejadores con interpolación; si encuentra muy pocos, el tokenizador se rompió');

  const sinClasificar = [];
  const firmasUsadas = new Set();
  for (const g of manejador) {
    for (const item of g.items) {
      if (esExprSegura(item.expr)) continue;
      const exc = EXCEPCIONES_MAP.get(g.firma);
      if (exc) { firmasUsadas.add(g.firma); continue; }
      sinClasificar.push(`línea ${g.linea}: ${g.nombreAttr}="${g.textoValor}" (expresión sin escapar: ${JSON.stringify(item.expr)})`);
    }
  }
  assert.deepEqual(sinClasificar, [],
    'hay interpolaciones dentro de un manejador que no pasan por un ayudante seguro ni tienen excepción justificada:\n' + sinClasificar.join('\n'));

  // Una excepción que ya no encuentra su sitio es una excepción que blanquea
  // de más: si el código cambió, la lista tiene que encoger con él.
  const sobrantes = EXCEPCIONES.filter(e => !firmasUsadas.has(e.firma));
  assert.deepEqual(sobrantes.map(e => e.firma), [],
    'excepciones que ya no corresponden a ningún sitio del código: bórralas');
});

// ------------------------------------------------------------
//  Verificación REAL de los motivos que cargan más peso.
// ------------------------------------------------------------

test('renderCalendario: la fecha del onclick del calendario se construye con enteros del bucle', () => {
  assert.ok(/const fecha=`\$\{y\}-\$\{pad\(m\+1\)\}-\$\{pad\(dia\)\}`;/.test(fuente),
    'la fecha del calendario ya no es `${y}-${pad(m+1)}-${pad(dia)}`: revisar si sigue siendo de enteros antes de mantener las excepciones de verDia/pedirFecha');
});

test('filaNotif: el onclick con n.tipo solo se pinta si _destinoNotif(n.tipo) lo aprobó', () => {
  const i = fuente.indexOf('function filaNotif');
  assert.ok(i > 0, 'falta filaNotif en web/app.js');
  const cuerpo = fuente.slice(i, fuente.indexOf('\n}', i));
  assert.ok(cuerpo.includes("const dest=_destinoNotif(n.tipo)"),
    'filaNotif ya no consulta _destinoNotif: revisar la guarda antes de mantener la excepción de abrirNotif');
  assert.match(cuerpo, /\$\{dest\?`[^`]*onclick="abrirNotif\('\$\{n\.tipo\}'\)"/,
    'el onclick de abrirNotif ya no está detrás de la guarda ${dest?...}: sin ella, un tipo raro llegaría crudo al onclick');
});

test('formMov: solo se llama con los literales ingreso/gasto', () => {
  const llamadas = [...fuente.matchAll(/formMov\(([^)]*)\)/g)]
    .filter(m => !/^function/.test(fuente.slice(m.index - 9, m.index)));
  assert.ok(llamadas.length >= 2, 'no se encontraron llamadas a formMov(); si se renombró, esta prueba hay que actualizarla, no borrarla');
  for (const m of llamadas) {
    assert.match(m[1], /^'(ingreso|gasto)'$/,
      `formMov se llama con algo distinto de un literal: ${m[1]}`);
  }
});

test('errCargar: el fragmento reintentar de cada llamada es un literal de código (o literal + Number())', () => {
  // Formas admitidas para el PRIMER argumento: cadena de literales '...'
  // opcionalmente intercalados con Number(...) — p.ej. 'cargarNoDisp()' o
  // 'verPredica('+Number(id)+')'. El literal puede llevar paréntesis dentro,
  // así que no vale cortar en el primer ')': se valida la CABEZA de cada
  // llamada contra la forma segura completa, hasta la coma o el cierre.
  const cabezaSegura = /^errCargar\(\s*'[^']*'(?:\s*\+\s*(?:Number\([\w$.]+\)|'[^']*'))*\s*[,)]/;
  const sitios = [...fuente.matchAll(/errCargar\(/g)]
    .filter(m => !/function $/.test(fuente.slice(Math.max(0, m.index - 9), m.index)));
  assert.ok(sitios.length >= 5, 'no se encontraron llamadas a errCargar(); si se renombró, esta prueba hay que actualizarla, no borrarla');
  for (const m of sitios) {
    const cabeza = fuente.slice(m.index, m.index + 160);
    assert.ok(cabezaSegura.test(cabeza),
      `errCargar: el fragmento reintentar no es un literal de código: ${cabeza.split('\n')[0]}`);
  }
});

test('accionesBtns: el tercer argumento (id) es siempre algo.id o un entero', () => {
  const llamadas = [...fuente.matchAll(/accionesBtns\([^,]+,[^,]+,([^)]+)\)/g)]
    .filter(m => !/function $/.test(fuente.slice(Math.max(0, m.index - 9), m.index)));
  assert.ok(llamadas.length > 0, 'no se encontró ninguna llamada a accionesBtns(); si se renombró, esta prueba hay que actualizarla, no borrarla');
  const formaSegura = /^\s*(?:[A-Za-z_$][\w$]*\.id|\d+|Number\([\w$.]+\))\s*$/;
  for (const m of llamadas) {
    assert.ok(formaSegura.test(m[1]),
      `accionesBtns: tercer argumento no es un id numérico: ${m[1]}`);
  }
});

test('vistaAjustes: opt() solo se llama con literales', () => {
  const llamadas = [...fuente.matchAll(/\$\{opt\(([^)]*)\)\}/g)];
  assert.ok(llamadas.length >= 3, 'no se encontraron llamadas a opt() en vistaAjustes; si se renombró, esta prueba hay que actualizarla, no borrarla');
  for (const m of llamadas) {
    const [g, val] = m[1].split(',');
    assert.match(g.trim(), /^'[\w]+'$/, `opt: primer argumento no es literal: ${g}`);
    assert.match(val.trim(), /^'[\w]+'$/, `opt: segundo argumento no es literal: ${val}`);
  }
});

// ------------------------------------------------------------
//  Autocomprobación: el clasificador tiene que VER un ataque de mentira.
// ------------------------------------------------------------

test('autocomprobación: el clasificador SÍ marca un dato crudo dentro de un onclick', () => {
  const fuenteFalsa = 'const x = `<button onclick="abrir(\'${persona.nombre}\')">x</button>`;';
  const { manejador } = clasificarInterpolaciones(fuenteFalsa);
  assert.equal(manejador.length, 1);
  assert.equal(esExprSegura(manejador[0].items[0].expr), false,
    'persona.nombre crudo dentro de un onclick tiene que marcarse como inseguro');
});

test('autocomprobación: el mismo onclick con Number() o escJsAttr() pasa', () => {
  const fuenteFalsa = 'const x = `<button onclick="abrir(${Number(persona.id)},${escJsAttr(p.nombre)})">x</button>`;';
  const { manejador } = clasificarInterpolaciones(fuenteFalsa);
  for (const item of manejador[0].items) assert.equal(esExprSegura(item.expr), true);
});

test('autocomprobación: href="javascript:..." cuenta como manejador, no como atributo normal', () => {
  const fuenteFalsa = 'const x = `<a href="javascript:${accion}">x</a>`;';
  const { manejador, atributo } = clasificarInterpolaciones(fuenteFalsa);
  assert.equal(manejador.length, 1);
  assert.equal(atributo.length, 0);
});
