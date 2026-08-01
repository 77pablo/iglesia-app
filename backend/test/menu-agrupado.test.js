// ============================================================
//  El menu del movil, agrupado por temas.
//
//  En el telefono el menu es un cajon a pantalla completa y el pastor ve 19
//  entradas. Se agrupan bajo encabezados, y SOLO para quien tiene el menu largo:
//  a un feligres (9 entradas) cuatro encabezados le dejarian 13 lineas donde
//  antes tenia 9, o sea le empeorarian el menu para resolver un problema que no
//  tiene.
//
//  Se ejecuta la funcion REAL sacada de web/app.js. La prueba de cobertura es la
//  que de verdad importa: si alguien anade un modulo al NAV y olvida meterlo en
//  un grupo, esa entrada DESAPARECERIA del menu agrupado sin dar ningun error —
//  el pastor dejaria de ver un modulo y nadie se enteraria.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
const fuente = fs.readFileSync(APP_JS, 'utf8');

// Recorta un bloque `const NOMBRE = [ ... ];` de nivel superior balanceando
// corchetes. Si NO lo encuentra, revienta en voz alta en vez de devolver vacio.
function recortarLista(nombre) {
  const i = fuente.indexOf(`const ${nombre} = [`);
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('[', i); j < fuente.length; j++) {
    if (fuente[j] === '[') saldo++;
    else if (fuente[j] === ']') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, `no se pudo cerrar el literal de ${nombre}`);
  return fuente.slice(fuente.indexOf('[', i), fin);
}

// Las claves del NAV son el PRIMER elemento de cada terna ['clave','icono','Etiqueta'].
//
// ⚠️ El patron es PERMISIVO ([^']+) a proposito, no [a-z_]+. Si una clave nueva
// usara digitos, mayusculas o guion ('reportes2', 'panel-x'), con el patron
// estricto no entraria siquiera en esta lista —la de "lo que deberia estar
// cubierto"— y entonces podria faltar de todos los grupos sin que nadie la
// echara en falta: la prueba pasaria en verde con esa entrada desaparecida del
// menu. La lista de lo esperado nunca debe filtrar por forma.
const CLAVES_NAV = [...recortarLista('NAV').matchAll(/\['([^']+)'/g)].map(m => m[1]);

// Saca las claves SOLO de los arrays `claves: [...]`, nunca del bloque entero.
//
// ⚠️ Esto NO es quisquillosidad. Barriendo todo el bloque, un titulo tambien
// entraria: hoy no pasa porque los titulos llevan mayusculas, tildes o espacios,
// pero basta que alguien escriba `titulo: 'admin'` — un copy-paste, un grupo
// renombrado — para que esa palabra cuente como "asignada" SIN estarlo en ningun
// `claves: [...]`. Y entonces esta prueba diria que todo esta cubierto justo
// cuando esa entrada ha desaparecido del menu: enmascararia el unico fallo que
// existe para atrapar.
//
// Recibe el texto como parametro para que la prueba de mas abajo pueda ejercer
// ESTA funcion con un caso de colision, en vez de reimplementar sus expresiones
// regulares — una copia no protege de que se rompa el original.
function clavesDeGrupos(bloque) {
  const arrays = [...bloque.matchAll(/claves:\s*\[([^\]]*)\]/g)].map(m => m[1]);
  const cuantosGrupos = [...bloque.matchAll(/titulo\s*:/g)].length;
  assert.ok(arrays.length, 'no se encontro ningun `claves: [...]`');
  // Un reformateo que rompiera la coincidencia de UN grupo (p. ej. `claves :`)
  // lo dejaria fuera en silencio. Esto obliga a que haya tantos arrays como
  // titulos.
  assert.equal(arrays.length, cuantosGrupos,
    'hay grupos cuyo `claves: [...]` no se reconocio: el extractor estaria cubriendo de menos');
  return arrays.flatMap(a => [...a.matchAll(/'([^']+)'/g)].map(m => m[1]));
}

test('cada clave del NAV pertenece a exactamente un grupo', () => {
  const enGrupos = clavesDeGrupos(recortarLista('GRUPOS_NAV'));

  const sinAsignar = CLAVES_NAV.filter(k => !enGrupos.includes(k));
  const inventadas = enGrupos.filter(k => !CLAVES_NAV.includes(k));
  const duplicadas = enGrupos.filter((k, i) => enGrupos.indexOf(k) !== i);

  assert.deepEqual(sinAsignar, [],
    'estas entradas del NAV no estan en ningun grupo: desapareceran del menu agrupado sin dar error');
  assert.deepEqual(inventadas, [],
    'estas claves estan en un grupo pero no existen en el NAV: no pintaran nada');
  assert.deepEqual(duplicadas, [], 'estas entradas estan en dos grupos a la vez');
  assert.equal(enGrupos.length, CLAVES_NAV.length);
});

test('un titulo que coincida con una clave real no puede colar como asignada', () => {
  // Llama a la funcion REAL con un caso de colision. Si alguien le devuelve el
  // barrido del bloque entero, esta prueba se pone roja — que es justo lo que no
  // hacia su primera version, que reimplementaba las regex y por tanto se
  // limitaba a probar su propia copia.
  const sacadas = clavesDeGrupos(`[
    { titulo: 'admin', claves: ['inicio'] },
  ]`);
  assert.deepEqual(sacadas, ['inicio'],
    'el titulo se conto como clave asignada: una entrada que faltase de los grupos pasaria desapercibida');
});

// --- la funcion de reparto, ejecutada de verdad -------------------------------
//
// Nota sobre este arnes (distinto del propuesto en el plan): en vez de
// hardcodear el umbral como parametro de new Function, se recorta tambien la
// linea `const NAV_UMBRAL_GRUPOS = ...` de web/app.js y se evalua tal cual junto
// con GRUPOS_NAV y agruparNav. Asi la prueba corre contra el umbral REAL que
// declara el archivo, no contra un numero copiado a mano que podria quedar
// desincronizado si alguien cambia el original.
function cargarAgrupar() {
  const grupos = recortarLista('GRUPOS_NAV');

  const umbral = fuente.match(/const NAV_UMBRAL_GRUPOS\s*=\s*(\d+)\s*;/);
  assert.ok(umbral, 'no se encontro NAV_UMBRAL_GRUPOS en web/app.js');

  const i = fuente.indexOf('function agruparNav(');
  assert.ok(i >= 0, 'no se encontro agruparNav en web/app.js');
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('{', i); j < fuente.length; j++) {
    if (fuente[j] === '{') saldo++;
    else if (fuente[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, 'no se pudo cerrar agruparNav');

  const cuerpo = `
    const GRUPOS_NAV = ${grupos};
    const NAV_UMBRAL_GRUPOS = ${umbral[1]};
    ${fuente.slice(i, fin)}
    return agruparNav;
  `;
  return new Function(cuerpo)();
}

test('por debajo del umbral devuelve UNA sola seccion sin titulo, en el orden recibido', () => {
  const agruparNav = cargarAgrupar();
  const pocas = ['inicio', 'calendario', 'anuncios', 'mensajes', 'directorio',
                 'mi_servicio', 'mi_grupo', 'predica', 'ajustes'];   // 9 = feligres
  const r = agruparNav(pocas);
  assert.equal(r.length, 1, 'un menu corto no se agrupa');
  assert.equal(r[0].titulo, null, 'sin titulo = sin encabezado que pintar');
  assert.deepEqual(r[0].claves, pocas, 'y conserva el orden que traia');
});

test('en el umbral o por encima devuelve los grupos, con titulo', () => {
  const agruparNav = cargarAgrupar();
  const muchas = CLAVES_NAV.slice();   // todas: es el caso del pastor
  const r = agruparNav(muchas);
  assert.ok(r.length > 1, 'un menu largo se agrupa');
  assert.ok(r.every(g => typeof g.titulo === 'string' && g.titulo.length),
    'todo grupo pintado tiene que llevar encabezado');
  // Ninguna entrada se pierde ni se repite al repartir.
  const repartidas = r.flatMap(g => g.claves);
  assert.deepEqual(repartidas.slice().sort(), muchas.slice().sort());
});

test('el modo agrupado sale en el orden de GRUPOS_NAV, no en el del NAV', () => {
  // ⚠️ La prueba de arriba ordena con .sort() antes de comparar, o sea DESCARTA
  // el orden a proposito — y el orden es justo lo unico que ve la persona. Por
  // ese hueco paso tres commits en verde un fallo que reordenaba el menu del
  // escritorio. Aqui el orden SI se afirma.
  const agruparNav = cargarAgrupar();
  const salida = agruparNav(CLAVES_NAV.slice()).flatMap(g => g.claves);

  // Lo esperado: los grupos en el orden en que estan escritos, y dentro de cada
  // uno sus claves en el orden en que estan escritas.
  assert.deepEqual(salida, clavesDeGrupos(recortarLista('GRUPOS_NAV')),
    'el reparto no respeta el orden de GRUPOS_NAV');

  // Y dos hechos escritos a mano, para que esto no sea comparar el archivo
  // consigo mismo: en el NAV 'mi_servicio' va ANTES que 'predica', y agrupado
  // tiene que ser al reves ("Dia a dia" incluye predica y va antes que "Lo mio").
  assert.ok(CLAVES_NAV.indexOf('mi_servicio') < CLAVES_NAV.indexOf('predica'),
    'cambio el NAV: este caso ya no demuestra lo que pretendia');
  assert.ok(salida.indexOf('predica') < salida.indexOf('mi_servicio'),
    'agrupado sale en el orden del NAV: el reparto por temas no se esta aplicando');
});

test('en el umbral EXACTO ya se agrupa, y ningun grupo vacio se pinta', () => {
  const agruparNav = cargarAgrupar();
  // 12 claves: el umbral exacto, elegidas para que al menos un grupo quede vacio.
  const visibles = CLAVES_NAV.slice(0, 12);
  const r = agruparNav(visibles);
  // Sin estas dos lineas, cambiar `<` por `<=` en agruparNav devolveria el modo
  // PLANO con 12 entradas —un solo "grupo" sin titulo— y la asercion de abajo
  // seguiria en verde, porque ese unico grupo tambien tiene claves.length > 0.
  assert.ok(r.length > 1, 'a 12 entradas ya toca agrupar: el umbral es "12 o mas"');
  assert.ok(r.every(g => typeof g.titulo === 'string' && g.titulo.length),
    'en modo agrupado toda seccion lleva encabezado');
  assert.ok(r.every(g => g.claves.length > 0),
    'un encabezado sin nada debajo es ruido: no debe pintarse');
});

test('a 11 entradas, una menos que el umbral, todavia NO se agrupa', () => {
  // Con solo el 9 de "por debajo" y el 12 del umbral, en medio quedaba un hueco:
  // NAV_UMBRAL_GRUPOS podia valer 10, 11 o 12 y la suite entera seguia en verde.
  // Con el par 11/12 el numero queda clavado por los dos lados.
  //
  // Y el 11 no es un numero cualquiera: un lider de cuerpo esta EXACTAMENTE en
  // 12, al borde. Si mañana pierde un modulo cae a 11, y ahi su menu no debe
  // cambiar de estructura entera.
  const agruparNav = cargarAgrupar();
  const once = CLAVES_NAV.slice(0, 11);
  const r = agruparNav(once);
  assert.equal(r.length, 1, 'a 11 entradas todavia no se agrupa: el umbral es 12');
  assert.equal(r[0].titulo, null, 'sin titulo = sin encabezado que pintar');
  assert.deepEqual(r[0].claves, once, 'y conserva el orden que traia');
});

// --- el cableado de buildNav ---------------------------------------------------
//
// ⚠️ Honestidad sobre lo que sigue: NO prueba el render. Este proyecto no tiene
// banco de pruebas de navegador, asi que lo de abajo mira el TEXTO FUENTE de
// buildNav y de la hoja de estilos. No dice que el menu se pinte bien; solo evita
// que alguien reescriba buildNav y deje las pruebas de arriba en verde
// comparando NAV contra GRUPOS_NAV mientras el menu real hace otra cosa.
function fuenteDeBuildNav() {
  const i = fuente.indexOf('function buildNav(');
  assert.ok(i >= 0, 'no se encontro buildNav en web/app.js');
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('{', i); j < fuente.length; j++) {
    if (fuente[j] === '{') saldo++;
    else if (fuente[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, 'no se pudo cerrar buildNav');
  return fuente.slice(i, fin);
}

test('buildNav sigue llamando a agruparNav y sigue colgando el badge de Mensajes', () => {
  const cuerpo = fuenteDeBuildNav();
  assert.ok(cuerpo.includes('agruparNav('),
    'buildNav ya no llama a agruparNav: lo que prueban las demas pruebas dejaria de ser lo que ve la persona');
  assert.ok(cuerpo.includes('nav-badge-mensajes'),
    'buildNav ya no pinta el badge de mensajes sin leer');
});

test('el orden por temas se aplica SOLO en el movil', () => {
  // El fallo que esto vigila: buildNav pintando el DOM en orden de grupo. Como
  // agruparNav no consulta el ancho de pantalla, eso reordena TAMBIEN el
  // escritorio, y ocultar los encabezados por CSS no deshace un reordenamiento
  // hecho en el DOM. La solucion es `order` de flexbox, y `order` solo puede
  // acotarse a un ancho desde la hoja de estilos.
  const cuerpo = fuenteDeBuildNav();
  assert.ok(cuerpo.includes("setProperty('--ord'"),
    'buildNav ya no marca el orden del movil con --ord');

  const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'styles.css'), 'utf8');
  const i = CSS.indexOf('@media (max-width:900px){');
  assert.ok(i >= 0, 'no se encontro el @media de 900px en web/styles.css');
  let saldo = 0, fin = -1;
  for (let j = CSS.indexOf('{', i); j < CSS.length; j++) {
    if (CSS[j] === '{') saldo++;
    else if (CSS[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, 'no se pudo cerrar el @media de 900px');

  const movil = CSS.slice(i, fin);
  const resto = CSS.slice(0, i) + CSS.slice(fin);
  assert.ok(/order\s*:\s*var\(\s*--ord/.test(movil),
    'el @media del movil ya no convierte --ord en order: el menu no se agrupara en el telefono');
  assert.ok(!resto.includes('--ord'),
    'hay un --ord fuera del @media de 900px: el escritorio quedaria reordenado, que es justo el fallo');
});

// --- el orden REAL que buildNav pinta en el DOM --------------------------------
//
// Todo lo de arriba mira el TEXTO de buildNav: que llame a agruparNav, que
// marque --ord, que solo el @media lo convierta en order. Ninguna de esas
// pruebas EJECUTA buildNav. Eso deja un hueco exacto: alguien podria volver a
// recorrer las SECCIONES agrupadas (en vez de `visibles`, que esta en orden
// NAV) al construir el DOM, conservando intacto todo el mecanismo de --ord.
// Las pruebas de arriba seguirian en verde —siguen viendo `--ord`, siguen
// viendo el @media— y el escritorio volveria a quedar reordenado: es la MISMA
// regresion que ya paso una vez en esta rama, sin nada que la sujete.
//
// Por eso esto ejecuta el buildNav REAL de web/app.js contra un DOM de
// juguete y afirma lo unico que ve una persona en el escritorio: que los
// `.nav-item` salen en el mismo orden que el `NAV`.

// Recorta `const NOMBRE={ ... };` balanceando llaves (para NAV_ICON, que es un
// objeto y no una lista).
function recortarObjeto(nombre) {
  const i = fuente.indexOf(`const ${nombre}={`);
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('{', i); j < fuente.length; j++) {
    if (fuente[j] === '{') saldo++;
    else if (fuente[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, `no se pudo cerrar el objeto de ${nombre}`);
  return fuente.slice(fuente.indexOf('{', i), fin);
}

// Recorta `function nombre(...){ ... }` balanceando llaves. Generico: ya hay
// dos copias de esta misma idea mas arriba (para agruparNav y para buildNav),
// cada una atada a su propio proposito; esta se queda aparte para no volver a
// tocar esas.
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

// Un elemento de DOM de juguete: lo minimo que buildNav toca (className,
// dataset, style.setProperty, setAttribute, innerHTML, onclick).
function crearElementoDeJuguete() {
  return {
    className: '', dataset: {}, innerHTML: '', onclick: null,
    style: { _props: {}, setProperty(k, v) { this._props[k] = v; } },
    setAttribute(k, v) { this[`attr_${k}`] = v; },
  };
}

// Ejecuta el buildNav REAL (no una copia) contra ese DOM de juguete.
//
// NAV, GRUPOS_NAV, NAV_UMBRAL_GRUPOS, NAV_ICON y agruparNav son los reales,
// recortados de web/app.js. Lo unico sustituido es lo que buildNav recibe
// como dependencia externa y no le importa a ESTA prueba:
//  - tieneModulo siempre devuelve true: es el caso del pastor, que ve las 19
//    entradas (el caso donde el fallo original se notaba). Que filtre bien
//    segun el rol ya lo cubren otras pruebas de este archivo (via CLAVES_NAV)
//    y del backend; aqui filtrar de mas o de menos no cambiaria el orden.
//  - labelDe/iconDe/navTo no participan del orden en que se recorren las
//    claves; se dejan en lo minimo que no revienta.
function ejecutarBuildNavReal() {
  const nav = { innerHTML: '', children: [], appendChild(el) { this.children.push(el); } };
  const doc = { createElement: () => crearElementoDeJuguete() };
  // NAV_ICON llama a _ic(...) para cada entrada: sin esa arrow function
  // definida, evaluar el objeto revienta con "_ic is not defined".
  //
  // ⚠️ El `\r?` no es adorno. En JavaScript `.` NO casa con `\r`, y git deja el
  // archivo en disco con finales de linea de Windows (`git ls-files --eol` dice
  // `i/lf  w/crlf`). Sin el `\r?` esta prueba revienta con "no se encontro la
  // definicion de _ic" en cualquier copia normal del repo — y eso es peor que
  // no tenerla: la prueba que sujeta la regresion del orden se caeria sola, y
  // quien la viera roja creeria que el fallo esta en el menu. Paso de verdad al
  // fusionar la rama.
  const lineaIc = fuente.match(/const _ic=.*\r?\n/);
  assert.ok(lineaIc, 'no se encontro la definicion de _ic en web/app.js');

  const cuerpo = `
    ${lineaIc[0]}
    const NAV = ${recortarLista('NAV')};
    const GRUPOS_NAV = ${recortarLista('GRUPOS_NAV')};
    const NAV_UMBRAL_GRUPOS = ${fuente.match(/const NAV_UMBRAL_GRUPOS\s*=\s*(\d+)\s*;/)[1]};
    const NAV_ICON = ${recortarObjeto('NAV_ICON')};
    ${recortarFuncion('agruparNav')}
    ${recortarFuncion('buildNav')}
    return buildNav;
  `;
  const buildNav = new Function('$', 'document', 'tieneModulo', 'labelDe', 'iconDe', 'navTo', cuerpo)(
    (id) => (id === 'nav' ? nav : null),
    doc,
    () => true,
    (k) => k,
    () => '',
    () => {},
  );
  buildNav();
  return nav;
}

test('buildNav pinta el DOM SIEMPRE en el orden del NAV, agrupado o no (ejecutado de verdad)', () => {
  const nav = ejecutarBuildNavReal();
  const clavesPintadas = nav.children
    .filter(el => el.className === 'nav-item')
    .map(el => el.dataset.key);

  // El caso del pastor: 19 entradas, por encima del umbral, se agrupa de
  // verdad. Si buildNav recorriera las secciones agrupadas en vez del NAV
  // (la regresion real), esto saldria en el orden de GRUPOS_NAV y esta
  // asercion caeria.
  assert.deepEqual(clavesPintadas, CLAVES_NAV,
    'buildNav pinto los .nav-item en un orden distinto al del NAV. En escritorio --ord no se ' +
    'convierte en order (eso solo pasa dentro del @media de 900px), asi que manda el orden del DOM: ' +
    'esto es el menu reordenado de verdad, el mismo fallo que ya paso una vez en esta rama');

  // Y los encabezados: cada uno queda oculto al lector de pantalla, a
  // proposito (ver el comentario en buildNav).
  const encabezados = nav.children.filter(el => el.className.startsWith('nav-sec'));
  assert.ok(encabezados.length > 1, 'con 19 entradas por encima del umbral tiene que haber encabezados');
  assert.ok(encabezados.every(h => h['attr_aria-hidden'] === 'true'),
    'un encabezado sin aria-hidden se anunciaria con la clave equivocada al lector de pantalla');
});
