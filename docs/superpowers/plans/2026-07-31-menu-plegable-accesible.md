# Menú del móvil plegable y accesible — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En el móvil, cada tema del menú se abre y se cierra (uno a la vez), y todo el menú pasa a ser usable con el teclado.

**Architecture:** `buildNav()` deja de pintar una sola forma. En escritorio pinta la lista plana en orden `NAV` de siempre; en móvil con menú largo pinta un `<button>` encabezado por tema seguido de un `<div class="nav-grupo">` con sus entradas dentro. Con contenedores reales el orden del DOM vuelve a ser el orden visual, así que **desaparecen `--ord` y la regla `order`** que hoy sostienen el agrupamiento.

**Tech Stack:** JavaScript de navegador sin framework (`web/app.js`, ~4600 líneas), CSS a mano (`web/styles.css`), pruebas con `node:test` en `backend/test/` que leen el TEXTO FUENTE de esos archivos (este proyecto no tiene banco de pruebas de navegador).

**Spec:** `docs/superpowers/specs/2026-07-31-menu-plegable-accesible-design.md`

## Global Constraints

- **En escritorio no puede cambiar nada de lo que se ve.** Mismas 19 entradas, mismo orden, mismo aspecto. Es la restricción que manda, y ya se rompió una vez el 31 de julio.
- **Sí cambia el DOM del escritorio en una cosa invisible:** desaparecen los `style="--ord:N"`, que allí nunca hicieron nada. No digas "DOM idéntico" en ningún comentario ni prueba: es falso y la prueba fallaría.
- **Todo el CSS del plegado vive DENTRO de `@media (max-width:900px)`.** Una regla de plegado fuera de ahí ocultaría entradas en escritorio. Es exactamente el fallo del 31 de julio.
- **El número del breakpoint sale de un solo sitio** (`NAV_MOVIL_MAX` en `web/app.js`) y una prueba comprueba que el `@media` de la hoja usa ese mismo número.
- **Umbral de agrupación:** `NAV_UMBRAL_GRUPOS = 12`, ya existe. Por debajo no se agrupa y por tanto no se pliega.
- **Acordeón:** exactamente un tema abierto como máximo. Abrir uno cierra el anterior.
- **Al abrir el cajón** se calcula desde cero: abierto el tema de la pantalla activa; si no hay ninguna activa, el primero.
- **Nada se guarda entre visitas.** No uses `localStorage`.
- **Commits en español, en minúscula**, formato `tipo(ámbito): efecto para la persona`, **sin coautoría ni mención de Claude ni de ninguna IA**.
- **`escHtml` en todo dato de usuario** que llegue a `innerHTML` o a un atributo. Las etiquetas del menú vienen de `labelDe()`, que son textos fijos del código; aun así, no metas datos de usuario en el menú.
- **Nunca uses `scripts/with_server.py`**: en Windows deja el node huérfano y la siguiente ejecución lee una base de datos vieja. Para probar a mano, levanta el servidor tú en un puerto poco común y mátalo al terminar.
- **Suite:** `cd backend && npm test` (~80 s). Hoy son **536** y nunca puede bajar.

## Estructura de archivos

| Archivo | Responsabilidad | Qué le pasa |
|---|---|---|
| `web/app.js` | Todo el JS de la app | Se modifica `buildNav()` y `toggleSidebar()`; se añaden `NAV_MOVIL_MAX`, `esMovil()`, `crearEntradaNav()`, `abrirGrupo()`, `alternarGrupo()`, `grupoActivo()`, `marcarGrupoConSinLeer()` |
| `web/styles.css` | Estilos | Se neutraliza el aspecto de botón en `.nav-item`/`.nav-sec`; se añaden `.nav-grupo` y el punto; se **borra** la regla `order:var(--ord,0)` |
| `backend/test/menu-agrupado.test.js` | Pruebas del agrupamiento (existe) | Su arnés pasa a ejecutar `buildNav()` en los dos modos; dos pruebas suyas cambian de contenido |
| `backend/test/menu-plegable.test.js` | Pruebas del plegado y la accesibilidad | **Nuevo** |
| `ESTADO.md` | Estado del proyecto | Se documenta el mecanismo nuevo |

---

### Task 1: El breakpoint en un solo sitio

**Files:**
- Modify: `web/app.js` (justo encima de `function buildNav(){`, hoy en la línea 647)
- Test: `backend/test/menu-plegable.test.js` (crear)

**Interfaces:**
- Consume: nada.
- Produce: `NAV_MOVIL_MAX` (número, `900`) y `esMovil()` (devuelve booleano). La Task 2 los usa.

- [ ] **Step 1: Escribir la prueba que falla**

Crea `backend/test/menu-plegable.test.js` con este contenido exacto:

```js
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
```

- [ ] **Step 2: Ejecutarla y ver que falla**

Ejecuta: `cd backend && node --test test/menu-plegable.test.js`
Se espera: **FALLA** con `no se encontro NAV_MOVIL_MAX en web/app.js`.

- [ ] **Step 3: Escribir el código**

En `web/app.js`, inserta esto **justo antes** del bloque de comentario que precede a `function buildNav(){` (hoy empieza en la línea 630 con `// Pinta el menu lateral.`):

```js
// El ancho por debajo del cual el menu se agrupa por temas y se pliega.
//
// ⚠️ TIENE que ser el mismo numero que el `@media` de web/styles.css. Si se
// separan, el JS pinta una forma del menu mientras el CSS aplica los estilos de
// la otra, y no salta ningun error: el menu simplemente aparece roto, y solo en
// los anchos que queden entre los dos numeros. No hay manera de compartir un
// valor entre JS y CSS en este proyecto, asi que lo vigila una prueba
// (backend/test/menu-plegable.test.js).
const NAV_MOVIL_MAX = 900;
function esMovil(){ return window.matchMedia(`(max-width:${NAV_MOVIL_MAX}px)`).matches; }
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Ejecuta: `cd backend && node --test test/menu-plegable.test.js`
Se espera: **2 pruebas, 2 pasan.**

- [ ] **Step 5: Suite completa**

Ejecuta: `cd backend && npm test`
Se espera: **538 tests, 538 pasan, 0 fallan** (536 + las 2 nuevas).

- [ ] **Step 6: Commit**

```bash
git add web/app.js backend/test/menu-plegable.test.js
git commit -m "feat(menu): el ancho del movil se declara una sola vez

El JS necesita saber si esta en movil y el CSS ya tenia su @media. Con el
numero escrito en dos sitios, el dia que alguien cambie uno el menu se rompe
en silencio: el JS pintaria una forma y el CSS aplicaria los estilos de la
otra. Una prueba comprueba que los dos numeros coinciden."
```

---

### Task 2: `buildNav()` con dos formas

Esta es la tarea grande: cambia la forma del DOM. Al terminarla el menú del móvil ya sale con contenedores reales y **todo abierto** (plegar llega en la Task 3), y todo el menú es alcanzable con el teclado.

**Files:**
- Modify: `web/app.js:630-701` (el comentario de `buildNav` y la función entera)
- Modify: `web/styles.css:186-200` (`.nav-sec`, `.nav-item`) y `web/styles.css:386-411` (el `@media`)
- Modify: `backend/test/menu-agrupado.test.js` (el arnés y dos pruebas)
- Test: `backend/test/menu-plegable.test.js` (añadir)

**Interfaces:**
- Consume: `NAV_MOVIL_MAX`, `esMovil()` de la Task 1. `NAV`, `NAV_ICON`, `GRUPOS_NAV`, `agruparNav()`, `tieneModulo()`, `labelDe()`, `iconDe()`, `navTo()`, que ya existen.
- Produce:
  - `crearEntradaNav(key)` → devuelve un `<button class="nav-item" data-key=KEY>`.
  - `buildNav()` sin parámetros; decide la forma con `esMovil()`.
  - En móvil agrupado, cada tema queda como `<button class="nav-sec" aria-controls="nav-g-N">` seguido de `<div class="nav-grupo" id="nav-g-N">`. Los ids `nav-g-1`, `nav-g-2`… son correlativos en el orden de `GRUPOS_NAV` **entre los grupos que se pintan** (un grupo vacío no se pinta y no consume número). Las Tasks 3 y 4 dependen de estos nombres.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añade al final de `backend/test/menu-plegable.test.js`:

```js
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
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Ejecuta: `cd backend && node --test test/menu-plegable.test.js`
Se espera: **FALLAN** varias con `no se encontro crearEntradaNav en web/app.js`.

- [ ] **Step 3: Reescribir `buildNav()`**

En `web/app.js`, **sustituye por completo** el bloque de comentario que hoy empieza en la línea 630 (`// Pinta el menu lateral.`) junto con toda la función `buildNav()` (hasta su `}` de cierre, hoy la línea 701) por esto:

```js
// Pinta el menu lateral. Tiene DOS formas segun el ancho de pantalla.
//
// Escritorio: la lista plana en el orden del NAV, sin encabezados. Es la de
// siempre.
//
// Movil con el menu largo (>= NAV_UMBRAL_GRUPOS entradas): cada tema es un
// <button> encabezado seguido de un <div class="nav-grupo"> con sus entradas
// DENTRO. Con contenedores de verdad el orden del DOM vuelve a ser el orden
// visual, y por eso aqui ya no hay ningun `--ord`: el truco de `order` que
// sostenia el agrupamiento anterior se retiro entero.
//
// ⚠️ Historia que conviene no repetir: la primera version del menu agrupado
// pintaba en orden de grupo SIN mirar el ancho, y ocultaba los encabezados por
// CSS. Eso reordenaba tambien el escritorio (12 de las 19 entradas del pastor
// cambiaban de sitio), porque el CSS no puede deshacer un reordenamiento hecho
// en el DOM. De ahi que la decision de la forma se tome aqui, con esMovil().
function buildNav(){
  const nav=$('nav'); nav.innerHTML='';
  const visibles=NAV.filter(n=>tieneModulo(n[0])).map(n=>n[0]);
  const secciones=agruparNav(visibles);
  // Se agrupa solo en el movil Y solo si el menu es largo. agruparNav() decide
  // lo segundo (devuelve una sola seccion sin titulo por debajo del umbral).
  const agrupado=esMovil() && secciones.some(s=>s.titulo);

  if(!agrupado){
    visibles.forEach(key=>nav.appendChild(crearEntradaNav(key)));
    return;
  }

  secciones.forEach((seccion,i)=>{
    const id=`nav-g-${i+1}`;
    const h=document.createElement('button');
    h.type='button';
    h.className='nav-sec';
    // textContent, no innerHTML: los titulos son fijos, pero no hay motivo para
    // abrir esa puerta en el menu.
    h.textContent=seccion.titulo;
    h.setAttribute('aria-controls',id);
    h.setAttribute('aria-expanded','true');
    nav.appendChild(h);

    const cont=document.createElement('div');
    cont.className='nav-grupo';
    cont.id=id;
    seccion.claves.forEach(k=>cont.appendChild(crearEntradaNav(k)));
    nav.appendChild(cont);
  });
}

// Una entrada del menu. Es un <button> de verdad, no un <div onclick>: asi se
// alcanza con Tab, se activa con Enter y con Espacio, y un lector de pantalla la
// anuncia como el control que es.
function crearEntradaNav(key){
  const el=document.createElement('button');
  el.type='button';   // sin esto, dentro de un formulario lo enviaria
  el.className='nav-item';
  el.dataset.key=key;
  el.innerHTML=`<span class="ic">${NAV_ICON[key]||iconDe(key)}</span> ${labelDe(key)}${key==='mensajes'?'<span id="nav-badge-mensajes" class="badge hidden">0</span>':''}`;
  el.onclick=()=>navTo(key);
  return el;
}
```

- [ ] **Step 4: Repintar al cruzar el breakpoint**

En `web/app.js`, **justo debajo** de `function esMovil(){...}` (Task 1), añade:

```js
// Girar el telefono o cambiar el tamano de la ventana no puede dejar el menu con
// la forma del otro modo. El guardia evita registrar el oyente dos veces si se
// vuelve a entrar en la app sin recargar la pagina.
function vigilarAnchoDelMenu(){
  if(vigilarAnchoDelMenu._puesto) return;
  vigilarAnchoDelMenu._puesto=true;
  window.matchMedia(`(max-width:${NAV_MOVIL_MAX}px)`)
    .addEventListener('change', ()=>{ if($('nav')) buildNav(); });
}
```

Y en `web/app.js:469`, cambia la línea `  buildNav();` por:

```js
  buildNav();
  vigilarAnchoDelMenu();
```

- [ ] **Step 5: El CSS**

En `web/styles.css`, **sustituye** el bloque de las líneas 186-200 (desde el comentario `/* Encabezado de seccion del menu...` hasta `.nav-item .ic svg{...}`) por:

```css
/* Encabezado de tema del menu. OCULTO por defecto: solo aparece en el movil (ver
   el @media), que es donde el cajon obliga a desplazarse. En escritorio caben
   las 19 entradas de golpe y verlas juntas ayuda.
   Es un <button> de verdad para poder plegarlo con el teclado, asi que hay que
   neutralizarle el aspecto que el navegador da a los botones. */
.nav-sec{display:none;background:none;border:none;font-family:inherit;
  -webkit-appearance:none;appearance:none;text-align:left;width:100%;cursor:pointer;}
/* Las entradas tambien son <button>: alcanzables con Tab y activables con Enter
   y Espacio. El aspecto tiene que quedar EXACTAMENTE como cuando eran <div>. */
.nav-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;
  cursor:pointer;color:rgba(255,255,255,.6);font-size:0.9rem;font-weight:500;letter-spacing:-.01em;
  position:relative;transition:background .15s var(--ease),color .15s var(--ease);
  background:none;border:none;font-family:inherit;text-align:left;width:100%;
  -webkit-appearance:none;appearance:none;}
.nav-item:hover{background:rgba(255,255,255,.07);color:rgba(255,255,255,.92);}
.nav-item.active{background:rgba(255,255,255,.12);color:#fff;font-weight:600;}
.nav-item.active::before{content:"";position:absolute;left:-12px;top:50%;transform:translateY(-50%);
  width:3px;height:22px;border-radius:0 3px 3px 0;background:var(--gold);}
.nav-item .ic{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}
.nav-item .ic svg{width:19px;height:19px;}
```

Después, en el `@media (max-width:900px){` (hoy línea 386), **sustituye** las líneas que van desde el comentario `/* El agrupamiento por temas, SOLO aqui...` hasta `.nav-sec.nav-sec-primero{padding-top:4px;}` por:

```css
  /* Los temas del menu, SOLO aqui. En escritorio no existen ni los encabezados
     ni los contenedores, asi que todo esto vive dentro del @media: una regla de
     estas suelta fuera ocultaria entradas del menu de escritorio. */
  .nav-sec{display:block;font-size:0.6875rem;font-weight:700;letter-spacing:.08em;
    text-transform:uppercase;color:rgba(255,255,255,.45);
    padding:14px 12px 6px;}
  /* Ahora el primer encabezado SI es el primer hijo del nav (con contenedores
     reales el orden del DOM es el visual), asi que ya no hace falta la clase que
     lo marcaba. */
  .nav-sec:first-child{padding-top:4px;}
  /* El contenedor de un tema. Repite el gap del .nav para que las entradas se
     vean igual de separadas que cuando colgaban directamente del nav. */
  .nav-grupo{display:flex;flex-direction:column;gap:2px;}
  /* ⚠️ Esta regla NO es redundante. `hidden` oculta porque la hoja del navegador
     le pone display:none, y el display:flex de arriba le gana. Sin esto, los
     temas cerrados se verian igual y no saltaria ningun error. */
  .nav-grupo[hidden]{display:none;}
```

- [ ] **Step 6: Adaptar `menu-agrupado.test.js`**

Ese archivo tiene pruebas escritas contra el mecanismo que acabas de retirar. **No las borres sin leerlas**: dos hay que cambiarlas y el resto sigue valiendo.

1. En `ejecutarBuildNavReal()` (hoy línea 329), añade `esMovil` a la lista de dependencias inyectadas y a los argumentos, devolviendo `true`, y añade `crearEntradaNav` a los recortes:

```js
    ${recortarFuncion('agruparNav')}
    ${recortarFuncion('crearEntradaNav')}
    ${recortarFuncion('buildNav')}
```

```js
  const buildNav = new Function('$', 'document', 'tieneModulo', 'labelDe', 'iconDe', 'navTo', 'esMovil', cuerpo)(
```

y añade `() => true,` como último argumento. Además, `crearElementoDeJuguete()` tiene que aceptar el tag y guardar `textContent`, `id`, `hidden` y `type` (copia la version de `menu-plegable.test.js`).

2. **Borra** la prueba `'buildNav pinta el DOM SIEMPRE en el orden del NAV, agrupado o no (ejecutado de verdad)'` (hoy línea 359). Lo que afirmaba —que el DOM sale siempre en orden `NAV`— **ya no es cierto en móvil**, y esa garantía ahora la cubre `'en ESCRITORIO pinta la lista plana en orden NAV, sin encabezados'` de `menu-plegable.test.js`.

3. **Borra** la prueba `'el orden por temas se aplica SOLO en el movil'` (hoy línea 235): comprueba `--ord` y el `@media`, que es justo lo que se retiró. Su sustituta es `'el CSS del plegado vive TODO dentro del @media del movil'`.

4. En la prueba `'buildNav sigue llamando a agruparNav y sigue colgando el badge de Mensajes'` (hoy línea 227), la aserción del badge sigue valiendo tal cual.

- [ ] **Step 7: Suite completa**

Ejecuta: `cd backend && npm test`
Se espera: **0 fallan.** El total sube respecto a los 538 de la Task 1 (9 pruebas nuevas menos 2 borradas).

- [ ] **Step 8: Comprobar a mano en un navegador**

Levanta el servidor tú (**no uses `scripts/with_server.py`**), en un puerto poco común y con una base de datos de usar y tirar. Entra con `MONTESION` / `1234`.

Comprueba, **y anota el resultado de cada punto en tu informe**:
1. **En escritorio** (ventana ancha), con `pastor`: las 19 entradas, en el mismo orden de siempre, sin encabezados y con el mismo aspecto. Compara con una captura previa si puedes.
2. **En escritorio, con el teclado**: Tab recorre las entradas del menú y Enter entra en la que esté enfocada.
3. **A 390px de ancho**, con `pastor`: se ven los cinco encabezados y las entradas agrupadas debajo de cada uno, todas visibles (plegar es la Task 3).
4. **A 390px con `maria`** (9 entradas): lista plana, sin encabezados.
5. **Estira y encoge la ventana** cruzando los 900px: el menú cambia de forma solo y no se queda a medias.

- [ ] **Step 9: Commit**

```bash
git add web/app.js web/styles.css backend/test/menu-plegable.test.js backend/test/menu-agrupado.test.js
git commit -m "feat(menu): cada tema es un bloque de verdad, y el menu se usa con el teclado

Las entradas eran <div onclick>: no se alcanzaban con Tab ni las anunciaba un
lector de pantalla. Ahora son botones, en el movil y en el escritorio.

Y cada tema pasa a ser un contenedor real en lugar de un reparto visual hecho
con `order` de flexbox. Con eso el orden del DOM vuelve a ser el orden visual y
desaparece el truco de --ord, que es el que hizo que el escritorio se
reordenara sin que nadie lo notara.

En escritorio no cambia nada de lo que se ve. Cambia una cosa invisible: ya no
se escribe style=--ord en cada elemento, que alli nunca hizo nada."
```

---

### Task 3: El acordeón

**Files:**
- Modify: `web/app.js` (añadir tres funciones junto a `buildNav`, y modificar `toggleSidebar` en la línea 731)
- Test: `backend/test/menu-plegable.test.js` (añadir)

**Interfaces:**
- Consume: la forma del DOM de la Task 2 (`.nav-grupo` con `id`, `.nav-sec` con `aria-controls`).
- Produce: `grupoActivo()`, `abrirGrupo(id)`, `alternarGrupo(id)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añade al final de `backend/test/menu-plegable.test.js`:

```js
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

test('toggleSidebar recalcula que tema abrir CADA vez que se abre el cajon', () => {
  // Es lo que hace innecesario guardar nada entre visitas: navTo() cierra el
  // cajon, asi que cada apertura parte del mismo estado predecible.
  const cuerpo = recortarFuncion('toggleSidebar');
  assert.ok(cuerpo.includes('abrirGrupo'),
    'toggleSidebar ya no fija el tema abierto: el menu se abriria como lo dejo la vez anterior');
  assert.ok(cuerpo.includes('grupoActivo'),
    'toggleSidebar no consulta cual es el tema de la pantalla actual');
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Ejecuta: `cd backend && node --test test/menu-plegable.test.js`
Se espera: **FALLAN** con `no se encontro grupoActivo en web/app.js`.

- [ ] **Step 3: Escribir el acordeón**

En `web/app.js`, **justo debajo** de `function crearEntradaNav(key){...}` (Task 2), añade:

```js
// El tema que contiene la pantalla en la que esta. Devuelve null si no hay
// ninguna entrada marcada como activa: pasa de verdad, hay pantallas que no
// tienen entrada en el menu.
function grupoActivo(){
  const activa=document.querySelector('.nav-item.active');
  const cont=activa&&activa.closest('.nav-grupo');
  return cont?cont.id:null;
}

// Deja abierto exactamente el tema `id` y cierra los demas. Con null, cierra
// todos. `aria-expanded` sale del estado real, no de un valor fijo: si mintiera,
// un lector de pantalla anunciaria como abierto algo que esta cerrado.
function abrirGrupo(id){
  document.querySelectorAll('#nav .nav-grupo').forEach(g=>{
    const abierto=(g.id===id);
    g.hidden=!abierto;
    const h=document.querySelector(`.nav-sec[aria-controls="${g.id}"]`);
    if(h) h.setAttribute('aria-expanded',abierto?'true':'false');
  });
}

// Lo que hace tocar un encabezado: si estaba abierto lo cierra, y si no, lo abre
// cerrando el anterior.
function alternarGrupo(id){
  const g=document.getElementById(id);
  if(!g) return;
  const seCierra=!g.hidden;
  // Si el foco esta dentro del tema que se cierra hay que rescatarlo: un foco en
  // un elemento oculto se pierde y el navegador lo manda al principio de la
  // pagina, que para quien navega con teclado es volver a empezar.
  if(seCierra&&g.contains&&g.contains(document.activeElement)){
    const h=document.querySelector(`.nav-sec[aria-controls="${id}"]`);
    if(h&&h.focus) h.focus();
  }
  abrirGrupo(seCierra?null:id);
}
```

- [ ] **Step 4: Engancharlo**

1. En `buildNav()`, dentro del `secciones.forEach(...)`, añade el `onclick` al encabezado, justo después de la línea `h.setAttribute('aria-expanded','true');`:

```js
    h.onclick=()=>alternarGrupo(id);
```

2. Al final de `buildNav()`, **después** del `secciones.forEach(...)`, añade:

```js
  // Estado inicial: abierto solo el tema de la pantalla actual. Si no hay
  // ninguna activa, el primero — nunca los cinco cerrados de entrada.
  abrirGrupo(grupoActivo()||'nav-g-1');
```

3. Cambia `web/app.js:731` de:

```js
function toggleSidebar(){ $('sidebar').classList.toggle('open'); $('overlay').classList.toggle('show'); }
```

a:

```js
// Al ABRIR el cajon se recalcula que tema dejar abierto. Por eso no hace falta
// guardar nada entre visitas: navTo() cierra el cajon al navegar, asi que cada
// apertura parte del mismo estado predecible.
function toggleSidebar(){
  const abriendo=!$('sidebar').classList.contains('open');
  $('sidebar').classList.toggle('open'); $('overlay').classList.toggle('show');
  if(abriendo) abrirGrupo(grupoActivo()||'nav-g-1');
}
```

- [ ] **Step 5: Ejecutar y ver que pasan**

Ejecuta: `cd backend && node --test test/menu-plegable.test.js`
Se espera: **todas pasan.**

- [ ] **Step 6: Comprobar que las pruebas MUERDEN**

No basta con verlas en verde. Para cada una de estas dos, rompe el código a propósito, ejecuta, confirma que **esa** prueba se pone roja, y **deshaz** el cambio:

1. En `abrirGrupo`, cambia `const abierto=(g.id===id);` por `const abierto=true;`
   → tiene que fallar `'abrir un tema cierra todos los demas'`.
2. En `alternarGrupo`, borra el bloque del foco (el `if(seCierra&&g.contains...)`)
   → tiene que fallar `'al cerrar un tema con el foco dentro, el foco va a su encabezado'`.

**Anota en tu informe el resultado de las dos comprobaciones.** Una prueba que no se ha visto fallar no cuenta como prueba.

- [ ] **Step 7: Suite completa y comprobación a mano**

Ejecuta: `cd backend && npm test` → **0 fallan.**

Y en el navegador a 390px, con `pastor`:
1. Al abrir el cajón se ve **un solo tema abierto**, el de la pantalla en la que estás.
2. Tocar otro tema lo abre y cierra el anterior.
3. Tocar el tema abierto lo cierra y quedan solo los encabezados.
4. Navega a otra pantalla y vuelve a abrir el cajón: se abre el tema de la pantalla nueva.
5. **Solo con el teclado:** Tab llega a los encabezados, Enter y Espacio los pliegan, y al cerrar un tema con el foco dentro el foco queda en su encabezado (no se pierde).

- [ ] **Step 8: Commit**

```bash
git add web/app.js backend/test/menu-plegable.test.js
git commit -m "feat(menu): los temas del movil se abren y se cierran, uno a la vez

El pastor veia sus 19 entradas seguidas y tenia que desplazarse para llegar a
casi todo. Ahora al abrir el cajon ve abierto solo el tema de la pantalla en la
que esta: unas 11 lineas en el peor caso.

Uno a la vez a proposito: es lo unico que garantiza que el menu no vuelva a ser
largo. Con varios abiertos el peor caso serian 24 lineas, mas que ahora.

No se guarda nada entre visitas. Al navegar el cajon se cierra, asi que cada
apertura parte del mismo sitio y nadie se encuentra el menu como lo dejo hace
tres dias."
```

---

### Task 4: El punto de los mensajes sin leer

Sin esto, el trabajo introduce una pérdida real: hoy el badge de mensajes se ve siempre que abras el cajón, y con su tema cerrado dejaría de verse.

**Files:**
- Modify: `web/app.js` (añadir `marcarGrupoConSinLeer()` junto al acordeón; modificar `Chat.actualizarBadgeNav`, hoy en la línea 4153)
- Modify: `web/styles.css` (dentro del `@media`)
- Test: `backend/test/menu-plegable.test.js` (añadir)

**Interfaces:**
- Consume: `abrirGrupo`/`grupoActivo` de la Task 3; la clase `.nav-grupo` y `aria-controls` de la Task 2.
- Produce: `marcarGrupoConSinLeer(entradaBadge, n)` y la clase CSS `.nav-sec.con-sin-leer`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añade al final de `backend/test/menu-plegable.test.js`:

```js
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
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Ejecuta: `cd backend && node --test test/menu-plegable.test.js`
Se espera: **FALLAN** con `no se encontro marcarGrupoConSinLeer en web/app.js`.

- [ ] **Step 3: Escribir el código**

En `web/app.js`, **justo debajo** de `function alternarGrupo(id){...}`, añade:

```js
// Un tema cerrado esconde el badge de su entrada. Sin esto, tener mensajes sin
// leer dejaria de verse en cuanto su tema no fuera el abierto — una perdida real
// respecto a como funcionaba antes de plegar el menu.
//
// El punto NO cuenta nada por su cuenta: sale del mismo numero que ya gobierna
// el badge, para que no haya dos verdades que mantener.
function marcarGrupoConSinLeer(entradaBadge, n){
  document.querySelectorAll('#nav .nav-sec').forEach(h=>h.classList.remove('con-sin-leer'));
  if(!n||!entradaBadge||!entradaBadge.closest) return;
  const cont=entradaBadge.closest('.nav-grupo');
  if(!cont) return;   // menu plano (escritorio o menu corto): el badge ya se ve
  const h=document.querySelector(`.nav-sec[aria-controls="${cont.id}"]`);
  if(h) h.classList.add('con-sin-leer');
}
```

Y **sustituye** `Chat.actualizarBadgeNav` (hoy en `web/app.js:4153`) por:

```js
  async actualizarBadgeNav(n){
    this._sinLeer=n;   // se reaplica si el menu se repinta al cambiar de ancho
    const b=$('nav-badge-mensajes');
    if(b){ b.classList.toggle('hidden', !n); b.textContent=n; }
    marcarGrupoConSinLeer(b, n);
  },
```

Y al final de `buildNav()`, **después** de la línea `abrirGrupo(...)` de la Task 3, añade:

```js
  // El menu se acaba de repintar: el punto de sin-leer se perdio con el DOM
  // anterior. Se reaplica con el ultimo dato conocido, sin volver a pedirlo.
  if(typeof Chat!=='undefined'&&Chat._sinLeer) Chat.actualizarBadgeNav(Chat._sinLeer);
```

- [ ] **Step 4: El CSS**

Dentro del `@media (max-width:900px){` de `web/styles.css`, **justo después** de la regla `.nav-grupo[hidden]{display:none;}`, añade:

```css
  /* Un tema cerrado con algo sin leer dentro. No dice cuantos son: el numero
     exacto sigue en el badge de su entrada. Solo avisa de que ahi hay algo. */
  .nav-sec.con-sin-leer::after{content:"";display:inline-block;width:6px;height:6px;
    border-radius:50%;background:var(--gold);margin-left:7px;vertical-align:middle;}
  /* Con el tema abierto el badge ya se ve: el punto diria lo mismo dos veces. */
  .nav-sec[aria-expanded="true"].con-sin-leer::after{display:none;}
```

- [ ] **Step 5: Ejecutar y ver que pasan**

Ejecuta: `cd backend && node --test test/menu-plegable.test.js` → **todas pasan.**
Ejecuta: `cd backend && npm test` → **0 fallan.**

- [ ] **Step 6: Comprobar a mano**

En el navegador a 390px, con dos cuentas y una conversación con mensajes sin leer:
1. Con el tema de Mensajes **cerrado**: se ve el punto en su encabezado.
2. Al abrir ese tema: el punto desaparece y se ve el badge con el número.
3. Al leer los mensajes: desaparecen los dos.

- [ ] **Step 7: Commit**

```bash
git add web/app.js web/styles.css backend/test/menu-plegable.test.js
git commit -m "fix(menu): tener mensajes sin leer se sigue viendo con el tema cerrado

Al plegar los temas, el badge de mensajes sin leer quedaba escondido dentro de
su tema: la persona dejaba de enterarse de que tenia mensajes. El codigo no
fallaba, y por eso habria pasado desapercibido.

Ahora el encabezado de un tema cerrado con algo sin leer muestra un punto. No
dice cuantos son —el numero sigue en su entrada— y sale del mismo dato que el
badge, para que no haya dos cuentas que mantener."
```

---

### Task 5: Dejarlo escrito en ESTADO.md

**Files:**
- Modify: `ESTADO.md` (la sección del 31 de julio sobre el menú, hoy alrededor de la línea 6)

- [ ] **Step 1: Reescribir la sección del menú**

En `ESTADO.md`, en la sección `## 🆕 31 DE JULIO DE 2026 — el menú del móvil, agrupado por temas`, el párrafo que empieza por `**El mecanismo real (no "el CSS oculta los encabezados"):**` describe un mecanismo **que ya no existe**. Sustitúyelo por una descripción del actual, que debe decir:

- Que en el móvil cada tema es un `<div class="nav-grupo">` de verdad con sus entradas dentro, precedido por un `<button class="nav-sec">`.
- Que `buildNav()` decide la forma con `esMovil()`, y que en escritorio pinta la lista plana de siempre.
- Que **`--ord` y la regla `order` ya no existen**, y por qué se retiraron (con contenedores reales el orden del DOM es el visual).
- Que el número del breakpoint sale de `NAV_MOVIL_MAX` y que una prueba comprueba que el `@media` usa el mismo.
- Que se pliega en acordeón: un tema abierto a la vez, el de la pantalla actual al abrir el cajón, sin guardar nada entre visitas.
- Que las entradas y los encabezados son `<button>` de verdad, usables con teclado, y que **el resto de la app sigue teniendo 16 elementos `<div onclick>` sin arreglar**.
- Que un tema cerrado con mensajes sin leer muestra un punto en su encabezado.

Actualiza también el número de la suite (`Suite en **536 tests**` → el número real que salga) y añade a la lista de "sigue sin resolver" que el resto de la app no es accesible por teclado.

- [ ] **Step 2: Comprobar que no quedan afirmaciones falsas**

Busca en `ESTADO.md` cualquier mención a `--ord` o a `order` de flexbox que haya quedado describiendo el mecanismo viejo:

```bash
grep -n "\-\-ord\|order.*flexbox\|nav-sec-primero" ESTADO.md
```

Se espera: solo menciones **en pasado**, explicando que se retiró. Ninguna que describa el mecanismo actual.

⚠️ Este archivo tiene un historial documentado de afirmaciones falsas en los dos sentidos. No escribas ninguna cifra que no hayas comprobado en ese mismo momento.

- [ ] **Step 3: Commit**

```bash
git add ESTADO.md
git commit -m "docs(estado): el menu del movil se pliega, y el truco de order ya no existe

La seccion describia el mecanismo de --ord con flexbox, que se retiro entero al
meter contenedores reales por tema. Un documento de estado que explica un
mecanismo que ya no existe es peor que uno que no lo explica."
```

---

## Verificación final de la rama

Antes de dar el trabajo por terminado:

1. `cd backend && npm test` → **0 fallan**, y el total no bajó de 536.
2. En un navegador de verdad, **a 390px y en escritorio**, con los tres roles del seed (`pastor` 19 entradas, `abel` 12, `maria` 9).
3. **Recorriendo el menú entero solo con el teclado.** Ninguna prueba de este proyecto puede comprobarlo, y es la mitad del encargo.
4. `git log --oneline` — ningún commit menciona a Claude ni a ninguna IA.
