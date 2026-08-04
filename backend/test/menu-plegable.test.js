// -----------------------------------------------------------------------------
//  El menu del movil: temas plegables y entradas usables con teclado.
//
//  Igual que menu-agrupado.test.js, esto lee el TEXTO FUENTE de web/app.js y de
//  web/styles.css: el proyecto no tiene banco de pruebas de navegador.
// -----------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
const CSS = path.join(__dirname, '..', '..', 'web', 'styles.css');
const fuente = fs.readFileSync(APP_JS, 'utf8');
const hoja = fs.readFileSync(CSS, 'utf8');

// El numero del breakpoint, sacado del JS.
function anchoMovilDelJs() {
  const m = fuente.match(/const NAV_MOVIL_MAX\s*=\s*(\d+)\s*;/);
  assert.ok(m, 'no se encontro NAV_MOVIL_MAX en web/app.js');
  return Number(m[1]);
}

test('el @media de la hoja usa el MISMO ancho que NAV_MOVIL_MAX', () => {
  // Si estos dos numeros se separan, el JS pinta una forma del menu y el CSS
  // aplica los estilos de la otra. No da ningun error: simplemente el menu
  // aparece roto, y solo en los anchos que quedan entre los dos numeros.
  // No hay forma de compartir un valor entre JS y CSS en este proyecto (no hay
  // compilador ni preprocesador), asi que esta prueba es la unica red.
  const n = anchoMovilDelJs();
  assert.ok(hoja.includes(`@media (max-width:${n}px){`),
    `web/app.js declara NAV_MOVIL_MAX=${n} pero web/styles.css no tiene ningun ` +
    `@media (max-width:${n}px). Los estilos del movil y la forma que pinta el JS ` +
    'dejarian de coincidir.');
});

test('esMovil consulta el ancho de verdad, no lo adivina', () => {
  // Si alguien lo cambia por `window.innerWidth < X` deja de reaccionar a los
  // cambios de zoom y de orientacion igual que el CSS, y el menu se desincroniza
  // de sus propios estilos.
  const m = fuente.match(/function esMovil\(\)\{[^}]*\}/);
  assert.ok(m, 'no se encontro esMovil() en web/app.js');
  assert.ok(m[0].includes('matchMedia'),
    'esMovil() ya no usa matchMedia: dejaria de coincidir con el @media del CSS');
  assert.ok(m[0].includes('NAV_MOVIL_MAX'),
    'esMovil() no usa NAV_MOVIL_MAX: el numero estaria escrito dos veces');
});

// --- la forma del DOM, ejecutando buildNav de verdad -------------------------

// Recorta `const NOMBRE = [ ... ];` balanceando corchetes.
function recortarLista(nombre) {
  const i = fuente.indexOf(`const ${nombre} = [`);
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('[', i); j < fuente.length; j++) {
    if (fuente[j] === '[') saldo++;
    else if (fuente[j] === ']') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, `no se pudo cerrar ${nombre}`);
  return fuente.slice(fuente.indexOf('[', i), fin);
}

// Recorta `const NOMBRE={ ... };` balanceando llaves.
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

// Recorta `function nombre(...){ ... }` balanceando llaves.
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

const CLAVES_NAV = [...recortarLista('NAV').matchAll(/\['([^']+)'/g)].map(m => m[1]);

// Un elemento de DOM de juguete: lo minimo que buildNav toca.
function crearElementoDeJuguete(tag) {
  return {
    tag, className: '', dataset: {}, innerHTML: '', textContent: '',
    onclick: null, id: '', hidden: false, type: '', children: [],
    appendChild(el) { this.children.push(el); return el; },
    setAttribute(k, v) { this[`attr_${k}`] = v; },
    getAttribute(k) { return this[`attr_${k}`]; },
    style: { _props: {}, setProperty(k, v) { this._props[k] = v; } },
  };
}

// Ejecuta el buildNav REAL contra un DOM de juguete, en el modo que se pida.
//
// ⚠️ El `\r?` de la primera expresion no es adorno: en JavaScript `.` no casa
// con `\r`, y git deja los archivos en disco con finales de linea de Windows.
// Sin el, este recorte no encuentra nada y la prueba revienta sola. Ya paso.
function ejecutarBuildNav(movil) {
  const nav = { innerHTML: '', children: [], appendChild(el) { this.children.push(el); return el; } };
  const lineaIc = fuente.match(/const _ic=.*\r?\n/);
  assert.ok(lineaIc, 'no se encontro la definicion de _ic en web/app.js');

  const cuerpo = `
    ${lineaIc[0]}
    const NAV = ${recortarLista('NAV')};
    const GRUPOS_NAV = ${recortarLista('GRUPOS_NAV')};
    const NAV_UMBRAL_GRUPOS = ${fuente.match(/const NAV_UMBRAL_GRUPOS\s*=\s*(\d+)\s*;/)[1]};
    const NAV_ICON = ${recortarObjeto('NAV_ICON')};
    ${recortarFuncion('agruparNav')}
    ${recortarFuncion('crearEntradaNav')}
    ${recortarFuncion('buildNav')}
    return buildNav;
  `;
  const fn = new Function('$', 'document', 'tieneModulo', 'labelDe', 'iconDe', 'navTo', 'esMovil', cuerpo)(
    (id) => (id === 'nav' ? nav : null),
    { createElement: (tag) => crearElementoDeJuguete(tag) },
    () => true,            // el pastor: ve las 19 entradas
    (k) => k,
    () => '',
    () => {},
    () => movil,
  );
  fn();
  return nav;
}

const clavesDe = (els) => els.filter(e => e.className === 'nav-item').map(e => e.dataset.key);

test('en ESCRITORIO pinta la lista plana en orden NAV, sin encabezados', () => {
  const nav = ejecutarBuildNav(false);
  assert.deepEqual(clavesDe(nav.children), CLAVES_NAV,
    'el menu de escritorio cambio de orden: es el fallo que ya paso una vez');
  assert.equal(nav.children.filter(e => e.className.startsWith('nav-sec')).length, 0,
    'en escritorio no se pinta ningun encabezado');
  assert.equal(nav.children.filter(e => e.className === 'nav-grupo').length, 0,
    'en escritorio no se pinta ningun contenedor de tema');
});

test('en ESCRITORIO ya no se marca ningun --ord', () => {
  // El truco de `order` desaparece con los contenedores reales. Si alguien lo
  // reintroduce, vuelve el riesgo de reordenar el escritorio sin querer.
  const nav = ejecutarBuildNav(false);
  assert.ok(nav.children.every(e => !('--ord' in e.style._props)),
    'buildNav sigue marcando --ord: el mecanismo viejo no se retiro');
});

test('en MOVIL cada tema es un contenedor de verdad con sus entradas dentro', () => {
  const nav = ejecutarBuildNav(true);
  const encabezados = nav.children.filter(e => e.className === 'nav-sec');
  const grupos = nav.children.filter(e => e.className === 'nav-grupo');

  assert.ok(encabezados.length > 1, 'con 19 entradas tiene que haber varios temas');
  assert.equal(encabezados.length, grupos.length,
    'cada encabezado necesita su contenedor: uno suelto no podria plegarse');

  // Ninguna entrada se pierde ni se repite al repartirlas en contenedores.
  const repartidas = grupos.flatMap(g => clavesDe(g.children));
  assert.deepEqual([...repartidas].sort(), [...CLAVES_NAV].sort(),
    'al meter las entradas en contenedores se perdio o se repitio alguna');

  // Ninguna entrada queda suelta fuera de un contenedor.
  assert.equal(clavesDe(nav.children).length, 0,
    'hay entradas fuera de todo contenedor: no se podrian plegar');
});

test('en MOVIL cada encabezado apunta al id de SU contenedor', () => {
  // Sin esto, `aria-controls` mentiria: un lector de pantalla anunciaria que el
  // boton controla algo que no controla.
  const nav = ejecutarBuildNav(true);
  const encabezados = nav.children.filter(e => e.className === 'nav-sec');
  const grupos = nav.children.filter(e => e.className === 'nav-grupo');
  const ids = grupos.map(g => g.id);

  assert.ok(ids.every(id => id), 'algun contenedor se quedo sin id');
  assert.equal(new Set(ids).size, ids.length, 'hay ids repetidos: aria-controls apuntaria mal');
  encabezados.forEach((h, i) => {
    assert.equal(h.getAttribute('aria-controls'), ids[i],
      `el encabezado "${h.textContent}" no apunta a su propio contenedor`);
  });
});

test('las entradas y los encabezados son BOTONES de verdad', () => {
  // Un <div onclick> no se alcanza con Tab ni se anuncia como control. Este es
  // el motivo de la mitad de este trabajo: no lo relajes.
  const nav = ejecutarBuildNav(true);
  const grupos = nav.children.filter(e => e.className === 'nav-grupo');
  const entradas = grupos.flatMap(g => g.children.filter(e => e.className === 'nav-item'));

  assert.ok(entradas.length > 0, 'no se pinto ninguna entrada');
  assert.ok(entradas.every(e => e.tag === 'button'),
    'alguna entrada sigue siendo un <div>: no se puede usar con el teclado');
  assert.ok(entradas.every(e => e.type === 'button'),
    'un <button> sin type="button" dentro de un formulario lo enviaria');
  assert.ok(nav.children.filter(e => e.className === 'nav-sec').every(h => h.tag === 'button'),
    'algun encabezado sigue sin ser un boton: no se podria plegar con el teclado');
});

test('los encabezados ya NO llevan aria-hidden', () => {
  // Existia para tapar el desajuste entre el orden del DOM y el visual. Con
  // contenedores reales ese desajuste no existe, y un boton que se puede pulsar
  // no puede estar oculto al lector de pantalla.
  const nav = ejecutarBuildNav(true);
  const encabezados = nav.children.filter(e => e.className === 'nav-sec');
  assert.ok(encabezados.every(h => h.getAttribute('aria-hidden') === undefined),
    'un encabezado con aria-hidden es un boton invisible para el lector de pantalla');
});

test('el badge de mensajes sin leer sigue colgando de su entrada', () => {
  const nav = ejecutarBuildNav(true);
  const grupos = nav.children.filter(e => e.className === 'nav-grupo');
  const todas = grupos.flatMap(g => g.children);
  const mensajes = todas.find(e => e.dataset.key === 'mensajes');
  assert.ok(mensajes, 'no se pinto la entrada de Mensajes');
  assert.ok(mensajes.innerHTML.includes('nav-badge-mensajes'),
    'se perdio el badge de mensajes sin leer al reorganizar el menu');
});

test('el CSS del plegado vive TODO dentro del @media del movil', () => {
  // El fallo del 31 de julio en una linea: una regla de menu fuera del @media
  // afecta al escritorio. Aqui una regla de plegado suelta ocultaria entradas.
  const n = anchoMovilDelJs();
  const i = hoja.indexOf(`@media (max-width:${n}px){`);
  assert.ok(i >= 0, 'no se encontro el @media del movil');
  let saldo = 0, fin = -1;
  for (let j = hoja.indexOf('{', i); j < hoja.length; j++) {
    if (hoja[j] === '{') saldo++;
    else if (hoja[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, 'no se pudo cerrar el @media del movil');
  const movil = hoja.slice(i, fin);
  const resto = hoja.slice(0, i) + hoja.slice(fin);

  assert.ok(movil.includes('.nav-grupo'), 'el @media del movil no estiliza los contenedores de tema');
  assert.ok(!resto.includes('.nav-grupo'),
    'hay una regla .nav-grupo fuera del @media: podria ocultar entradas en escritorio');
  assert.ok(!hoja.includes('--ord'),
    'sigue habiendo --ord en la hoja: el mecanismo viejo no se retiro del todo');
});

test('un tema oculto no puede reaparecer porque alguien le ponga display', () => {
  // `hidden` oculta porque la hoja del NAVEGADOR le pone display:none, y
  // cualquier display que escribamos nosotros le gana. Sin la regla explicita,
  // el dia que alguien escriba `.nav-grupo{display:flex}` los temas cerrados
  // vuelven a verse y no salta ningun error.
  assert.ok(/\.nav-grupo\[hidden\]\s*\{[^}]*display\s*:\s*none/.test(hoja),
    'falta la regla .nav-grupo[hidden]{display:none}: un display posterior la anularia');
});
