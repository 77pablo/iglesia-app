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
// El `document` de juguete para buildNav ahora tambien resuelve
// querySelector/querySelectorAll: sin ellos, el guardia de :724 salta entero
// el estado inicial del acordeon (abrirGrupo(grupoActivo()||'nav-g-1')) y
// ninguna prueba lo ejercita de verdad. Los selectores que hacen falta son
// solo los que grupoActivo()/abrirGrupo() usan de verdad -- ver el mismo
// patron, mas completo, en documentoConGrupos() mas abajo.
function ejecutarBuildNav(movil) {
  const nav = { innerHTML: '', children: [], appendChild(el) { this.children.push(el); return el; } };
  const doc = {
    createElement: (tag) => crearElementoDeJuguete(tag),
    // Ninguna entrada empieza con .active en este arnes (es el primer
    // pintado): no hace falta rastrear una de verdad para que grupoActivo()
    // funcione, el null es la respuesta correcta.
    querySelector(sel) {
      if (sel === '.nav-item.active') return null;
      const m = sel.match(/\.nav-sec\[aria-controls="([^"]+)"\]/);
      if (m) return nav.children.find(e => e.className === 'nav-sec' && e.getAttribute('aria-controls') === m[1]) || null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '#nav .nav-grupo') return nav.children.filter(e => e.className === 'nav-grupo');
      if (sel === '#nav .nav-sec') return nav.children.filter(e => e.className === 'nav-sec');
      return [];
    },
    getElementById(id) { return nav.children.find(e => e.id === id) || null; },
  };
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
    ${recortarFuncion('grupoActivo')}
    ${recortarFuncion('abrirGrupo')}
    ${recortarFuncion('alternarGrupo')}
    ${recortarFuncion('buildNav')}
    return buildNav;
  `;
  const fn = new Function('$', 'document', 'tieneModulo', 'labelDe', 'iconDe', 'navTo', 'esMovil', cuerpo)(
    (id) => (id === 'nav' ? nav : null),
    doc,
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

test('en MOVIL buildNav conecta el clic de cada encabezado con alternarGrupo', () => {
  // Sin el onclick, un encabezado es un boton muerto: se ve, se puede
  // enfocar, pero tocarlo (o darle Enter) no hace nada. Nada mas en esta
  // suite revienta si se borra la linea `h.onclick=()=>alternarGrupo(id);`.
  const nav = ejecutarBuildNav(true);
  const encabezados = nav.children.filter(e => e.className === 'nav-sec');
  assert.ok(encabezados.length > 1, 'con 19 entradas tiene que haber varios temas');
  assert.ok(encabezados.every(h => typeof h.onclick === 'function'),
    'algun encabezado se pinto sin onclick: no se podria plegar ni con el mouse ni con el teclado');
});

test('en MOVIL buildNav deja UN solo tema abierto al pintar, no los cinco', () => {
  // Sin el `abrirGrupo(grupoActivo()||'nav-g-1')` de :724, buildNav pinta los
  // temas pero nunca los cierra: el menu quedaria tan largo como antes del
  // acordeon, solo que ahora con encabezados encima. En este arnes ninguna
  // entrada llega marcada .active (es el primer pintado), asi que el que
  // tiene que quedar abierto es el primero.
  const nav = ejecutarBuildNav(true);
  const grupos = nav.children.filter(e => e.className === 'nav-grupo');
  const abiertos = grupos.filter(g => g.hidden === false);
  assert.equal(abiertos.length, 1,
    'buildNav tiene que dejar exactamente un tema abierto al pintar, no todos ni ninguno');
  assert.equal(abiertos[0], grupos[0],
    'sin ninguna entrada activa, el tema que se abre de entrada tiene que ser el primero');
});

test('en MOVIL el onclick de un encabezado de verdad abre y cierra su tema', () => {
  // Comprobacion de que el onclick de arriba no es solo "una funcion", sino
  // la funcion correcta: llamarlo tiene que producir el mismo efecto que
  // tocar el encabezado en la pantalla.
  const nav = ejecutarBuildNav(true);
  const grupos = nav.children.filter(e => e.className === 'nav-grupo');
  const encabezados = nav.children.filter(e => e.className === 'nav-sec');
  assert.ok(grupos.length > 2, 'hacen falta al menos tres temas para esta prueba');

  // El primero ya esta abierto (ver la prueba anterior). Tocar el segundo
  // tiene que abrirlo a el y cerrar el primero.
  encabezados[1].onclick();
  assert.equal(grupos[0].hidden, true, 'el clic en otro tema no cerro el que estaba abierto');
  assert.equal(grupos[1].hidden, false, 'el clic en el encabezado no abrio su propio tema');

  // Y volver a tocar el mismo encabezado lo cierra (no deja el menu sin
  // ningun tema visible por accidente: eso lo prueba el hidden en true).
  encabezados[1].onclick();
  assert.equal(grupos[1].hidden, true, 'tocar dos veces el mismo encabezado tiene que cerrarlo');
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

// --- el acordeon --------------------------------------------------------------

// Un documento de juguete que soporta los selectores que usa el acordeon.
function documentoConGrupos(cuantos, claveActiva) {
  const grupos = [], encabezados = [];
  for (let i = 1; i <= cuantos; i++) {
    const g = crearElementoDeJuguete('div');
    g.className = 'nav-grupo'; g.id = `nav-g-${i}`; g.hidden = true;
    const h = crearElementoDeJuguete('button');
    h.className = 'nav-sec'; h.setAttribute('aria-controls', g.id);
    h.setAttribute('aria-expanded', 'false');
    grupos.push(g); encabezados.push(h);
  }
  // La entrada activa vive en el segundo grupo, para que "el tema actual" no
  // coincida por casualidad con "el primero".
  const activa = crearElementoDeJuguete('button');
  activa.className = 'nav-item active'; activa.dataset.key = claveActiva || 'x';
  activa._grupo = grupos[1];
  grupos[1].children.push(activa);

  const doc = {
    querySelector(sel) {
      if (sel === '.nav-item.active') return claveActiva ? activa : null;
      const m = sel.match(/\.nav-sec\[aria-controls="([^"]+)"\]/);
      if (m) return encabezados.find(h => h.getAttribute('aria-controls') === m[1]) || null;
      if (sel === '#nav .nav-grupo') return grupos[0] || null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '#nav .nav-grupo') return grupos;
      if (sel === '#nav .nav-sec') return encabezados;
      return [];
    },
    getElementById(id) { return grupos.find(g => g.id === id) || null; },
    activeElement: null,
  };
  // closest() de juguete: solo lo que usa el acordeon.
  activa.closest = (sel) => (sel === '.nav-grupo' ? activa._grupo : null);
  return { doc, grupos, encabezados, activa };
}

function cargarAcordeon(doc) {
  const cuerpo = `
    ${recortarFuncion('grupoActivo')}
    ${recortarFuncion('abrirGrupo')}
    ${recortarFuncion('alternarGrupo')}
    return { grupoActivo, abrirGrupo, alternarGrupo };
  `;
  return new Function('document', cuerpo)(doc);
}

test('abrir un tema cierra todos los demas', () => {
  const { doc, grupos, encabezados } = documentoConGrupos(5, 'x');
  const a = cargarAcordeon(doc);
  a.abrirGrupo('nav-g-3');
  assert.deepEqual(grupos.map(g => g.hidden), [true, true, false, true, true],
    'tiene que quedar exactamente un tema abierto: es lo unico que garantiza que el menu no vuelva a ser largo');
  assert.deepEqual(encabezados.map(h => h.getAttribute('aria-expanded')),
    ['false', 'false', 'true', 'false', 'false'],
    'aria-expanded tiene que decir la verdad sobre cada tema, no un valor fijo');
});

test('abrirGrupo(null) los cierra todos', () => {
  const { doc, grupos } = documentoConGrupos(5, 'x');
  const a = cargarAcordeon(doc);
  a.abrirGrupo('nav-g-2');
  a.abrirGrupo(null);
  assert.ok(grupos.every(g => g.hidden), 'con null no debe quedar ninguno abierto');
});

test('tocar el tema abierto lo cierra', () => {
  const { doc, grupos } = documentoConGrupos(5, 'x');
  const a = cargarAcordeon(doc);
  a.abrirGrupo('nav-g-2');
  a.alternarGrupo('nav-g-2');
  assert.ok(grupos.every(g => g.hidden),
    'tocar el tema que ya estaba abierto tiene que cerrarlo');
});

test('el tema que se abre solo es el de la pantalla actual, no el primero', () => {
  const { doc } = documentoConGrupos(5, 'mi_grupo');
  const a = cargarAcordeon(doc);
  assert.equal(a.grupoActivo(), 'nav-g-2',
    'se abrio un tema que no es el de la pantalla en la que esta');
});

test('si NINGUNA entrada esta activa, grupoActivo devuelve null', () => {
  // Caso real: en app.js se quita el .active de todas las entradas en algunas
  // pantallas. Sin este caso cubierto, el menu se abriria con los cinco temas
  // cerrados y sin nada que mirar.
  const { doc } = documentoConGrupos(5, null);
  const a = cargarAcordeon(doc);
  assert.equal(a.grupoActivo(), null,
    'sin entrada activa no hay tema actual: quien llame tiene que poder recurrir al primero');
});

test('al cerrar un tema con el foco dentro, el foco va a su encabezado', () => {
  // Sin esto, quien navegue con teclado se queda con el foco en un elemento
  // oculto y el navegador lo devuelve al principio de la pagina.
  const { doc, grupos, encabezados, activa } = documentoConGrupos(5, 'x');
  const a = cargarAcordeon(doc);
  a.abrirGrupo('nav-g-2');
  doc.activeElement = activa;
  grupos[1].contains = (el) => el === activa;
  let enfocado = null;
  encabezados[1].focus = () => { enfocado = encabezados[1]; };
  a.alternarGrupo('nav-g-2');
  assert.equal(enfocado, encabezados[1],
    'el foco se quedo dentro de un tema cerrado');
});

// Un classList de juguete: lo minimo que toggleSidebar necesita (add/remove/
// toggle/contains sobre un conjunto).
function crearClassList(clases) {
  const set = new Set(clases);
  return {
    contains: (c) => set.has(c),
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c) => { if (set.has(c)) { set.delete(c); return false; } set.add(c); return true; },
  };
}

// Ejecuta el toggleSidebar REAL, con grupoActivo/abrirGrupo de verdad detras
// (no de mentira): asi una prueba puede comprobar el EFECTO -- que tema queda
// abierto -- y no solo que el texto fuente menciona los nombres correctos.
function cargarToggleSidebar(doc, sidebar, overlay) {
  const cuerpo = `
    ${recortarFuncion('grupoActivo')}
    ${recortarFuncion('abrirGrupo')}
    ${recortarFuncion('toggleSidebar')}
    return toggleSidebar;
  `;
  const $ = (id) => (id === 'sidebar' ? sidebar : id === 'overlay' ? overlay : null);
  return new Function('$', 'document', cuerpo)($, doc);
}

test('toggleSidebar, al ABRIR el cajon, recalcula que tema mostrar', () => {
  // Es lo que hace innecesario guardar nada entre visitas: navTo() cierra el
  // cajon, asi que cada apertura parte del mismo estado predecible.
  const { doc, grupos } = documentoConGrupos(5, 'x'); // la activa vive en el segundo tema
  const sidebar = { classList: crearClassList([]) };  // cerrado
  const overlay = { classList: crearClassList([]) };
  const toggleSidebar = cargarToggleSidebar(doc, sidebar, overlay);

  toggleSidebar(); // abre

  assert.ok(sidebar.classList.contains('open'), 'toggleSidebar no marco el cajon como abierto');
  const abiertos = grupos.filter(g => !g.hidden).map(g => g.id);
  assert.deepEqual(abiertos, ['nav-g-2'],
    'al abrir el cajon tiene que quedar abierto el tema de la pantalla actual, y ningun otro');
});

test('toggleSidebar, al CERRAR el cajon, NO recalcula nada', () => {
  // La distincion abrir-vs-cerrar es el punto de este test: si se pierde (por
  // ejemplo llamando a abrirGrupo() sin el `if(abriendo)`), cerrar el cajon
  // tambien reordena los temas, y eso es un efecto que nadie pidio.
  const { doc, grupos } = documentoConGrupos(5, 'x');
  // Un estado que abrirGrupo() jamas dejaria (dos temas "abiertos" a la vez):
  // si toggleSidebar llamara a abrirGrupo() al cerrar, este estado se
  // corregiria solo, y no se podria distinguir "no llamo" de "llamo pero no
  // cambio nada".
  grupos[0].hidden = false; grupos[2].hidden = false;
  const sidebar = { classList: crearClassList(['open']) }; // ya esta abierto
  const overlay = { classList: crearClassList(['show']) };
  const toggleSidebar = cargarToggleSidebar(doc, sidebar, overlay);

  toggleSidebar(); // cierra

  assert.ok(!sidebar.classList.contains('open'), 'toggleSidebar no cerro el cajon');
  assert.deepEqual(grupos.map(g => g.hidden), [false, true, false, true, true],
    'al cerrar el cajon, toggleSidebar toco los grupos: solo tiene que tocarlos al abrir');
});

// --- el punto de mensajes sin leer -------------------------------------------

// actualizarBadgeNav NO es `function nombre(...)`: es un metodo de un objeto
// (`async actualizarBadgeNav(n){`), asi que recortarFuncion() no lo encuentra
// —revienta con su propio assert— y hace falta un recorte propio.
function recortarMetodo(nombre) {
  const i = fuente.indexOf(`async ${nombre}(`);
  assert.ok(i >= 0, `no se encontro el metodo ${nombre} en web/app.js`);
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('{', i); j < fuente.length; j++) {
    if (fuente[j] === '{') saldo++;
    else if (fuente[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, `no se pudo cerrar el metodo ${nombre}`);
  return fuente.slice(i, fin);
}

test('el punto sale del MISMO dato que el badge, no de una cuenta aparte', () => {
  // Dos fuentes para el mismo numero se desincronizan: el badge diria 3 y el
  // punto no estaria, o al reves. actualizarBadgeNav es el unico sitio por
  // donde entra ese dato.
  const cuerpo = recortarMetodo('actualizarBadgeNav');
  assert.ok(cuerpo.includes('marcarGrupoConSinLeer'),
    'actualizarBadgeNav no marca el tema: con su tema cerrado, tener mensajes sin leer dejaria de verse');
});

test('sin mensajes sin leer no se marca ningun tema', () => {
  const { doc, encabezados } = documentoConGrupos(5, 'x');
  const fn = new Function('document', `${recortarFuncion('marcarGrupoConSinLeer')}
    return marcarGrupoConSinLeer;`)(doc);
  encabezados.forEach(h => { h.classList = { _c: new Set(), add(c){this._c.add(c);}, remove(c){this._c.delete(c);} }; });
  fn(null, 0);
  assert.ok(encabezados.every(h => h.classList._c.size === 0),
    'se marco un tema sin haber nada sin leer');
});

test('con mensajes sin leer se marca EXACTAMENTE el tema de la entrada, y ningun otro', () => {
  const { doc, grupos, encabezados } = documentoConGrupos(5, 'x');
  const fn = new Function('document', `${recortarFuncion('marcarGrupoConSinLeer')}
    return marcarGrupoConSinLeer;`)(doc);
  encabezados.forEach(h => { h.classList = { _c: new Set(), add(c){this._c.add(c);}, remove(c){this._c.delete(c);} }; });
  // El badge vive dentro del segundo tema, igual que la entrada activa del
  // arnes de mas arriba (documentoConGrupos): closest() de juguete solo
  // conoce '.nav-grupo'.
  const badge = crearElementoDeJuguete('span');
  badge.closest = (sel) => (sel === '.nav-grupo' ? grupos[1] : null);
  fn(badge, 3);
  encabezados.forEach((h, i) => {
    const marcado = h.classList._c.has('con-sin-leer');
    if (grupos[i] === grupos[1]) {
      assert.ok(marcado, 'el tema que SI tiene mensajes sin leer no quedo marcado');
    } else {
      assert.ok(!marcado, `se marco el tema ${grupos[i].id}, que no tiene mensajes sin leer`);
    }
  });
});

test('una marca de una llamada anterior no sobrevive si ya no hay mensajes sin leer', () => {
  const { doc, encabezados } = documentoConGrupos(5, 'x');
  const fn = new Function('document', `${recortarFuncion('marcarGrupoConSinLeer')}
    return marcarGrupoConSinLeer;`)(doc);
  encabezados.forEach(h => { h.classList = { _c: new Set(), add(c){this._c.add(c);}, remove(c){this._c.delete(c);} }; });
  // Estado obsoleto: un tema quedo marcado en una llamada previa.
  encabezados[1].classList.add('con-sin-leer');
  fn(null, 0);
  assert.ok(encabezados.every(h => !h.classList._c.has('con-sin-leer')),
    'la marca de una llamada anterior siguio puesta aunque ya no hay nada sin leer');
});

test('el CSS del punto vive dentro del @media y se calla con el tema abierto', () => {
  const n = anchoMovilDelJs();
  const i = hoja.indexOf(`@media (max-width:${n}px){`);
  let saldo = 0, fin = -1;
  for (let j = hoja.indexOf('{', i); j < hoja.length; j++) {
    if (hoja[j] === '{') saldo++;
    else if (hoja[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  const movil = hoja.slice(i, fin);
  const resto = hoja.slice(0, i) + hoja.slice(fin);
  assert.ok(movil.includes('con-sin-leer'), 'el punto no esta estilizado en el @media del movil');
  assert.ok(!resto.includes('con-sin-leer'),
    'hay una regla del punto fuera del @media: apareceria tambien en escritorio');
  assert.ok(/aria-expanded="true"\][^{]*\.con-sin-leer|\.con-sin-leer[^{]*\[aria-expanded="true"\]/.test(movil),
    'el punto no se oculta con el tema abierto: se veria a la vez que el badge, diciendo lo mismo dos veces');
});
