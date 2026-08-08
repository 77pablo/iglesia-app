// ============================================================
//  El aviso de "tu nombre viejo sigue escrito" (cabo 2), en Mi perfil y en la
//  pantalla del pastor.
//
//  El backend ya tiene sus pruebas (corregir-nombre-apariciones.test.js): que
//  los conteos salen, que van en cero sin rastros y que estan acotados por
//  iglesia. Lo que no tenia ninguna es el TEXTO que la persona lee, y ahi el
//  aviso decia dos cosas falsas en los dos casos mas probables:
//
//    "...sigue escrito en 0 ficha(s) de niños (...) y 2 prédica(s)"
//    "...sigue escrito en 1 ficha(s) de niños (...) y 0 prédica(s)"
//
//  La guarda era un OR y el texto un AND. El unico caso que se leia bien era
//  el de ambos lados > 0, que es el menos frecuente.
//
//  HIGIENE B1. El backend responde DOS formas distintas a proposito (es
//  privacidad, esta en la spec): al autoservicio solo cuantos, al pastor
//  cuales. Mientras las dos viajaron bajo la clave `ninos` habia DOS lectores
//  en web/app.js leyendola de forma incompatible (`a.ninos>0` y
//  `a.ninos.length`), y cruzarlos hacia DESAPARECER el aviso: `[{…}] > 0` es
//  false, no lanza, no avisa — justo el aviso que existe para que un nombre
//  viejo no se quede escrito en la ficha de un nino.
//
//  Renombrar a secas no cierra eso (`undefined > 0` tambien es false y tambien
//  calla), asi que el arreglo es de tres piezas y aqui se prueban las tres:
//   1. claves distintas (`ninos_n` numero / `ninos` lista) — su prueba esta en
//      el backend, y aqui la de que el lector exige la que le toca;
//   2. UN SOLO lector, `avisoNombreViejo(apariciones, modo)`, al que cada
//      pantalla le declara que forma espera; una forma que no cuadra con el
//      modo no se ignora, se AVISA en pantalla;
//   3. el candado de abajo: fuera de ese lector, nadie en web/app.js vuelve a
//      leerse la respuesta por su cuenta.
//
//  Se ejecuta la funcion REAL recortada de web/app.js contra un DOM de mentira,
//  igual que organizacion-pagador-selector.test.js: comprobar que el archivo
//  "contiene tal cadena" pasaria igual con el arreglo mal escrito.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
const fuente = fs.readFileSync(APP_JS, 'utf8');

// Recorta una funcion de nivel superior balanceando llaves (mismo mecanismo
// que usan los otros arneses de frontend). Acepta las `async` y las normales:
// el lector del aviso no es async.
function recortarFuncionTop(nombre) {
  let i = fuente.indexOf(`async function ${nombre}(`);
  if (i < 0) i = fuente.indexOf(`function ${nombre}(`);
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('{', i); j < fuente.length; j++) {
    if (fuente[j] === '{') saldo++;
    else if (fuente[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, `no se pudo cerrar ${nombre}`);
  return fuente.slice(i, fin);
}
const GUARDAR_PERFIL = recortarFuncionTop('guardarPerfilDirectorio');
const AVISO = recortarFuncionTop('avisoNombreViejo');
const ESC_HTML = recortarFuncionTop('escHtml');

// ------------------------------------------------------------
//  Arnes del lector solo: se le pasa la respuesta y el modo, tal cual.
// ------------------------------------------------------------
function montarLector() {
  const modales = [];
  const contexto = { modalAviso: (texto, titulo) => modales.push({ texto, titulo }) };
  const claves = Object.keys(contexto);
  const aviso = new Function(...claves, `${ESC_HTML}\n${AVISO}\nreturn avisoNombreViejo;`)(
    ...claves.map(k => contexto[k]));
  return { aviso, modales };
}

// ------------------------------------------------------------
//  Arnes de "Mi perfil" entero: guardarPerfilDirectorio llamando al lector
//  REAL, no a un doble. `apariciones` es lo que contesta el PATCH; al
//  autoservicio le llegan CONTEOS (`ninos_n`), no fichas.
// ------------------------------------------------------------
function montar(apariciones) {
  const modales = [];
  const toasts = [];
  const campo = (v) => ({ value: v, checked: false });
  const nodos = {
    'dp-nombre': campo('Ana Pérez'),
    'dp-tel': campo(''),
    'dp-email': campo(''),
    'dp-mostrar-tel': campo(''),
    'dp-mostrar-email': campo(''),
    'dp-foto': { files: [] }
  };
  const contexto = {
    $: id => nodos[id] || null,
    fechaSelectValor: () => '',
    conBoton: async (_b, fn) => fn(),
    botonActual: () => null,
    uploadArchivo: async () => '',
    api: async () => (apariciones === undefined ? {} : { apariciones }),
    ME: { persona: { id: 1, nombre: 'Ana' } },
    pintarUsuarioLateral: () => {},
    vistaDirectorio: () => {},
    toast: t => toasts.push(t),
    modalAviso: (texto, titulo) => modales.push({ texto, titulo })
  };
  const claves = Object.keys(contexto);
  const guardar = new Function(...claves,
    `${ESC_HTML}\n${AVISO}\n${GUARDAR_PERFIL}\nreturn guardarPerfilDirectorio;`)(
    ...claves.map(k => contexto[k]));
  return { guardar, modales, toasts };
}

// ------------------------------------------------------------
//  El texto que lee la persona (autoservicio).
// ------------------------------------------------------------
test('solo fichas de niños: el aviso NO nombra las prédicas (ni dice "y 0 prédica(s)")', async () => {
  const { guardar, modales } = montar({ ninos_n: 1, predicas: 0 });
  await guardar();

  assert.equal(modales.length, 1, 'con rastros hay aviso');
  const t = modales[0].texto;
  assert.match(t, /1 ficha\(s\) de niños/, 'lo que si hay se nombra con su numero');
  assert.doesNotMatch(t, /prédica/i, 'lo que no hay no se nombra');
  assert.doesNotMatch(t, /\b0\b/, 'y no aparece ningun cero: "0 prédica(s)" es ruido que hace dudar del resto');
  assert.doesNotMatch(t, / y \./, 'ni una "y" colgando sin segundo trozo');
});

test('solo prédicas: el aviso NO nombra las fichas de niños (ni dice "0 ficha(s)")', async () => {
  const { guardar, modales } = montar({ ninos_n: 0, predicas: 2 });
  await guardar();

  assert.equal(modales.length, 1);
  const t = modales[0].texto;
  assert.match(t, /2 prédica\(s\)/);
  assert.doesNotMatch(t, /ficha\(s\)/, 'lo que no hay no se nombra');
  assert.doesNotMatch(t, /\b0\b/);
  assert.doesNotMatch(t, /escrito en y /, 'ni una "y" al principio, sin primer trozo');
});

test('los dos lados: se nombran los dos, unidos por una "y"', async () => {
  const { guardar, modales } = montar({ ninos_n: 3, predicas: 2 });
  await guardar();

  assert.equal(modales.length, 1);
  assert.match(modales[0].texto, /3 ficha\(s\) de niños.* y 2 prédica\(s\)/);
});

test('sin rastros no hay aviso: el modal no aparece a decir que no pasa nada', async () => {
  const { guardar, modales, toasts } = montar({ ninos_n: 0, predicas: 0 });
  await guardar();

  assert.equal(modales.length, 0);
  assert.ok(toasts.some(t => /Perfil actualizado/.test(t)), 'el "guardado" de siempre si sale');
});

test('si el backend no manda apariciones (reenviar el mismo nombre), tampoco hay aviso', async () => {
  const { guardar, modales } = montar(undefined);
  await guardar();

  assert.equal(modales.length, 0);
});

// ------------------------------------------------------------
//  El texto que lee el pastor (detalle). No tenia prueba propia: el arnes
//  anterior solo recortaba guardarPerfilDirectorio.
// ------------------------------------------------------------
test('pastor: el aviso nombra CADA ficha y escapa el nombre del niño', () => {
  const { aviso, modales } = montarLector();
  const mostro = aviso({ ninos: [{ id: 1, nombre: '<b>Pedrito' }, { id: 2, nombre: 'Ana' }], predicas: 2 }, 'detalle');

  assert.equal(mostro, true);
  assert.equal(modales.length, 1);
  const t = modales[0].texto;
  assert.match(t, /la ficha de <b>&lt;b&gt;Pedrito<\/b>/, 'el nombre del niño va escapado; las negritas del aviso son del aviso');
  assert.match(t, /Ana/);
  assert.match(t, / y 2 prédica\(s\)/);
});

test('pastor sin rastros: tampoco hay aviso', () => {
  const { aviso, modales } = montarLector();
  assert.equal(aviso({ ninos: [], predicas: 0 }, 'detalle'), false);
  assert.equal(modales.length, 0);
});

// ------------------------------------------------------------
//  B1: cruzar las dos formas ya no puede pasar en silencio.
// ------------------------------------------------------------
test('B1: la lista del pastor leida en modo conteo AVISA en vez de callarse (y no filtra ningún nombre)', () => {
  const { aviso, modales } = montarLector();
  const mostro = aviso({ ninos: [{ id: 1, nombre: 'Pedrito' }], predicas: 2 }, 'conteo');

  assert.equal(mostro, true, 'antes esto devolvia false sin decir nada: `[{…}] > 0`');
  assert.equal(modales.length, 1, 'el fallo se ve en pantalla');
  assert.match(modales[0].texto, /no pudo comprobar/i);
  assert.doesNotMatch(modales[0].texto, /Pedrito/,
    'y el modo conteo no nombra fichas ni cuando le llega la lista: eso es la privacidad de la spec');
});

test('B1: el número del autoservicio leido en modo detalle AVISA en vez de reventar o callarse', () => {
  const { aviso, modales } = montarLector();
  const mostro = aviso({ ninos_n: 3, predicas: 2 }, 'detalle');

  assert.equal(mostro, true);
  assert.equal(modales.length, 1);
  assert.match(modales[0].texto, /no pudo comprobar/i);
});

test('B1: una respuesta con las DOS claves no se da por buena en ningún modo', () => {
  for (const modo of ['conteo', 'detalle']) {
    const { aviso, modales } = montarLector();
    assert.equal(aviso({ ninos_n: 1, ninos: [{ id: 1, nombre: 'Pedrito' }], predicas: 0 }, modo), true, modo);
    assert.match(modales[0].texto, /no pudo comprobar/i, modo);
  }
});

test('B1: un modo mal escrito no pasa de largo (ni muestra el aviso equivocado)', () => {
  const { aviso, modales } = montarLector();
  assert.equal(aviso({ ninos_n: 1, predicas: 0 }, 'conteos'), true);
  assert.match(modales[0].texto, /no pudo comprobar/i);
});

test('B1: `predicas` que no es un número tampoco se da por bueno', () => {
  const { aviso, modales } = montarLector();
  assert.equal(aviso({ ninos_n: 1 }, 'conteo'), true);
  assert.match(modales[0].texto, /no pudo comprobar/i);
});

test('sin respuesta el lector calla en los dos modos: es el caso legítimo de reenviar el mismo nombre', () => {
  for (const modo of ['conteo', 'detalle']) {
    const { aviso, modales } = montarLector();
    assert.equal(aviso(undefined, modo), false, modo);
    assert.equal(aviso(null, modo), false, modo);
    assert.equal(modales.length, 0, modo);
  }
});

// ------------------------------------------------------------
//  El candado. Las dos piezas de arriba (claves distintas + un lector que
//  grita) solo cierran el caso mientras NO vuelva a haber un segundo lector:
//  si alguien re-escribe `a.ninos.length` dentro de un manejador, vuelve el
//  fallo silencioso de siempre. Esto lo prohibe por escrito.
//
//  Compara la linea NORMALIZADA, no la linea tal cual. La primera version
//  comparaba el texto crudo y se ponia roja porque alguien separase los
//  argumentos con un espacio o dejase un comentario al final — y encima
//  acusaba de "hay un segundo lector" a quien solo habia reformateado, que es
//  la peor forma de fallar: manda al siguiente a buscar un lector que no
//  existe. Lo que se normaliza es SOLO presentacion (espacios y comentarios
//  fuera de las comillas); lo que se compara —a quien se llama, que se le pasa
//  y con que modo— no se toca.
// ------------------------------------------------------------

// Quita comentarios y espacios de una linea de codigo, respetando las
// comillas: dentro de un texto, un // es parte del texto y un espacio tambien.
// (Un /* ... */ repartido en varias lineas no lo entiende, y hoy no hay
// ninguno en web/app.js; si algun dia lo hay, esta prueba lo dira gritando.)
function normalizarLinea(linea) {
  let salida = '';
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < linea.length) {
        if (linea[j] === '\\') { j += 2; continue; }
        if (linea[j] === c) break;
        j++;
      }
      salida += linea.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === '/' && linea[i + 1] === '/') break;              // comentario al final: fuera
    if (c === '/' && linea[i + 1] === '*') {
      const fin = linea.indexOf('*/', i + 2);
      if (fin === -1) break;
      i = fin + 1;
      continue;
    }
    if (/\s/.test(c)) continue;                                 // espacios de presentacion: fuera
    salida += c;
  }
  return salida;
}

test('normalizarLinea solo borra presentación: espacios y comentarios de fuera de las comillas', () => {
  assert.equal(normalizarLinea("  f( a && b , 'x' );  "), "f(a&&b,'x');");
  assert.equal(normalizarLinea("f(a,'x'); // ojo con esto"), "f(a,'x');");
  assert.equal(normalizarLinea("f(a,'x'); /* ojo */"), "f(a,'x');");
  assert.equal(normalizarLinea("   // linea entera de comentario"), '');
  assert.equal(normalizarLinea("f('a // b', 'c d');"), "f('a // b','c d');",
    'dentro de las comillas no se toca nada: ni el // ni los espacios');
});

test('B1: en web/app.js solo hay UN lector de la respuesta; las pantallas se limitan a pasarla con su modo', () => {
  const sinLector = fuente.replace(AVISO, '');
  const lineas = sinLector.split('\n')
    .map(normalizarLinea)
    .filter(l => l.includes('apariciones') || l.includes('ninos_n'));

  assert.equal(lineas.length, 2,
    'fuera de avisoNombreViejo la respuesta del aviso solo puede aparecer en las DOS llamadas (Mi perfil y la del pastor).\n' +
    'Lineas encontradas (ya sin espacios ni comentarios, o sea: esto es codigo de verdad, no formato):\n' + lineas.join('\n'));
  const modos = [];
  for (const l of lineas) {
    const m = l.match(/^avisoNombreViejo\(resp&&resp\.apariciones,'(conteo|detalle)'\);$/);
    assert.ok(m,
      'esta linea toca la respuesta del aviso sin limitarse a pasarsela al lector (o el lector cambio de nombre).\n' +
      'No es un problema de formato: la comparacion ya ignora espacios y comentarios.\n' +
      `Linea normalizada: ${l}`);
    modos.push(m[1]);
  }
  assert.deepEqual(modos.sort(), ['conteo', 'detalle'],
    'una llamada por pantalla: Mi perfil pide conteo y la del pastor pide detalle. Si salen dos iguales, hay una pantalla leyendo la respuesta de la otra — que es exactamente el fallo silencioso que este cabo vino a cerrar');
});
