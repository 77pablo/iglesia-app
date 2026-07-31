# El menú del móvil, agrupado por temas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que en el móvil el menú lateral se lea por secciones en vez de como
una lista de 19 entradas seguidas, sin cambiar nada en escritorio y sin que
ninguna entrada aparezca o desaparezca.

**Architecture:** Una tabla de grupos a nivel de módulo (`GRUPOS_NAV`), una
función **pura** que reparte las claves visibles en grupos o las deja planas
según un umbral (`agruparNav`), y `buildNav()` pintando encabezados entre las
entradas. Los encabezados se ocultan por CSS por encima de 900px, el mismo corte
que ya usa el cajón deslizante. **El backend no se toca.**

**Tech Stack:** Frontend vanilla JS (`web/app.js`) · CSS (`web/styles.css`) ·
pruebas `node:test` a nivel de código fuente.

**Spec:** `docs/superpowers/specs/2026-07-31-menu-agrupado-movil-design.md`

## Global Constraints

- **Solo el móvil.** Los encabezados se ocultan por encima de 900px. **En
  escritorio no debe verse ningún cambio.**
- **Ninguna entrada aparece ni desaparece.** Quien veía un módulo lo sigue
  viendo; quien no, sigue sin verlo. Esto es **solo presentación**: no se tocan
  `modulosVisibles`, ni `tieneModulo()`, ni `navTo()`, ni permisos, ni el
  backend.
- **Se agrupa solo si la persona ve 12 entradas o más.** Se cuentan **las
  entradas del `NAV` que sobreviven a `tieneModulo()`** — las que esa persona
  vería pintadas. **No** los módulos que devuelve el backend, que es una lista
  distinta.
- **Un grupo sin entradas visibles no se pinta**, ni su encabezado.
- **El badge de mensajes sin leer** sigue colgando de su entrada
  (`app.js:599`): no se pierde al reorganizar.
- La suite completa (`cd backend && npm test`) está en **526 tests en verde**
  (medido sobre `main` el 31-jul-2026) y no debe bajar: **este plan termina en
  530**.
  > ⚠️ A los planes de este proyecto se les han desfasado las cifras **cuatro
  > veces hoy** porque otro trabajo se fusionó entretanto. **Mídela antes de
  > empezar**; si no coincide, corrige los números de abajo por el mismo desfase.
- Commits en castellano, minúsculas, `tipo(ámbito): efecto para la persona`.
  Sin coautoría ni menciones a Claude.

## Estructura de archivos

| Archivo | Responsabilidad | Tareas |
|---|---|---|
| `web/app.js` | `GRUPOS_NAV`, `NAV_UMBRAL_GRUPOS`, `agruparNav()` y `buildNav()` | 1, 2 |
| `web/styles.css` | Estilo del encabezado, **oculto salvo en móvil** | 2 |
| `backend/test/menu-agrupado.test.js` | Las 4 pruebas (nuevo) | 1, 2 |
| `ESTADO.md` | Dejarlo escrito | 3 |

---

### Task 1: La tabla de grupos y la función que reparte

**Files:**
- Modify: `web/app.js` (junto a `NAV`, que termina en la línea 30)
- Test: `backend/test/menu-agrupado.test.js` (nuevo)

**Interfaces:**
- Produces: `GRUPOS_NAV` (array de `{titulo, claves}`), la constante
  `NAV_UMBRAL_GRUPOS`, y `agruparNav(claves)` → array de
  `{titulo, claves}` donde `titulo` es `null` en modo plano. La Task 2 lo
  consume desde `buildNav()`.

> **Por qué una función pura y no la lógica dentro de `buildNav()`.**
> `buildNav()` toca el DOM y no se puede probar sin navegador. Sacando el
> reparto a una función sin efectos se puede ejecutar de verdad en la suite —
> el mismo patrón que ya usa `backend/test/organizacion-pagador-selector.test.js`
> para las funciones del selector de gastos.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `backend/test/menu-agrupado.test.js`:

```js
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

const clavesDe = txt => [...txt.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);

// Las claves del NAV son el PRIMER elemento de cada terna ['clave','icono','Etiqueta'].
const CLAVES_NAV = [...recortarLista('NAV').matchAll(/\['([a-z_]+)'/g)].map(m => m[1]);

test('cada clave del NAV pertenece a exactamente un grupo', () => {
  const bloque = recortarLista('GRUPOS_NAV');
  // Dentro de GRUPOS_NAV, los titulos van con comillas tambien; se filtran
  // quedandose solo con lo que existe en el NAV, y luego se comprueba al reves.
  const enGrupos = clavesDe(bloque).filter(c => CLAVES_NAV.includes(c));

  const sinAsignar = CLAVES_NAV.filter(k => !enGrupos.includes(k));
  const duplicadas = enGrupos.filter((k, i) => enGrupos.indexOf(k) !== i);

  assert.deepEqual(sinAsignar, [],
    'estas entradas del NAV no estan en ningun grupo: desapareceran del menu agrupado sin dar error');
  assert.deepEqual(duplicadas, [], 'estas entradas estan en dos grupos a la vez');
  assert.equal(enGrupos.length, CLAVES_NAV.length);
});

// --- la funcion de reparto, ejecutada de verdad -------------------------------

function cargarAgrupar() {
  const i = fuente.indexOf('function agruparNav(');
  assert.ok(i >= 0, 'no se encontro agruparNav en web/app.js');
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('{', i); j < fuente.length; j++) {
    if (fuente[j] === '{') saldo++;
    else if (fuente[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, 'no se pudo cerrar agruparNav');
  const cuerpo = `${recortarLista('GRUPOS_NAV') && ''}
    const GRUPOS_NAV = ${recortarLista('GRUPOS_NAV')};
    ${fuente.slice(i, fin)}
    return agruparNav;`;
  return new Function('NAV_UMBRAL_GRUPOS', cuerpo)(12);
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

test('un grupo sin entradas visibles no se pinta', () => {
  const agruparNav = cargarAgrupar();
  // 12 claves (el umbral exacto) elegidas para que al menos un grupo quede vacio.
  const visibles = CLAVES_NAV.slice(0, 12);
  const r = agruparNav(visibles);
  assert.ok(r.every(g => g.claves.length > 0),
    'un encabezado sin nada debajo es ruido: no debe pintarse');
});
```

- [ ] **Step 2: Correr las pruebas y verlas fallar**

Run: `cd backend && node --test test/menu-agrupado.test.js`
Expected: FALLA — `no se encontro GRUPOS_NAV en web/app.js`.

- [ ] **Step 3: Añadir la tabla y la función**

En `web/app.js`, justo **después** del `];` que cierra `NAV` (línea 30):

```js
// Los cinco temas del menu. Cada clave del NAV pertenece a EXACTAMENTE uno; hay
// una prueba que lo fija, porque una clave sin grupo desapareceria del menu
// agrupado sin dar ningun error.
//
// Dos asignaciones que no son obvias y son deliberadas:
//  - 'predica' va en "Dia a dia", no en "Ministerios": la ve TODO el mundo
//    (tieneModulo la deja pasar siempre), no es el ministerio de nadie.
//  - 'ajustes' va en "Lo mio", no en "Administracion": es el tema y el color de
//    quien mira, no administracion de la iglesia.
const GRUPOS_NAV = [
  { titulo: 'Día a día',      claves: ['inicio','calendario','anuncios','mensajes','directorio','predica'] },
  { titulo: 'Lo mío',         claves: ['mi_servicio','mi_grupo','ajustes'] },
  { titulo: 'Pastoreo',       claves: ['panel_pastor','cuidado_pastoral','mensajes_portal','asistencia','reportes','panel_obispo'] },
  { titulo: 'Ministerios',    claves: ['servicio_gestion','musicos','ninos','organizacion'] },
  { titulo: 'Administración', claves: ['tesoreria','admin','superadmin'] },
];

// A partir de cuantas entradas VISIBLES se agrupa. Es un numero elegido, no una
// verdad: los encabezados existen para resolver un problema de LARGO, asi que
// solo aparecen donde hay largo. Por debajo cuestan mas de lo que ahorran — a un
// feligres (9 entradas) le convertirian 9 lineas en 13.
const NAV_UMBRAL_GRUPOS = 12;

// Reparte las claves YA filtradas por tieneModulo(). Devuelve secciones:
// titulo === null significa "sin encabezado" (modo plano, como siempre).
// Funcion pura a proposito: buildNav toca el DOM y no se puede probar sin
// navegador; esto si.
function agruparNav(claves){
  if(claves.length < NAV_UMBRAL_GRUPOS) return [{titulo:null, claves}];
  return GRUPOS_NAV
    .map(g=>({titulo:g.titulo, claves:g.claves.filter(k=>claves.includes(k))}))
    .filter(g=>g.claves.length);   // un encabezado sin nada debajo es ruido
}
```

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd backend && node --test test/menu-agrupado.test.js`
Expected: PASA — 4 tests.

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **530 tests, 0 fail** (526 + 4).

- [ ] **Step 6: Commit**

```bash
git add web/app.js backend/test/menu-agrupado.test.js
git commit -m "feat(menu): repartir las entradas del menu en cinco temas"
```

---

### Task 2: Pintar los encabezados, y solo en el móvil

**Files:**
- Modify: `web/app.js` — `buildNav()` (líneas 594-603)
- Modify: `web/styles.css` — junto a `.nav-item` (línea 186) y dentro del
  `@media (max-width:900px)` (línea 380)

**Interfaces:**
- Consumes: `agruparNav()` de la Task 1.

⚠️ **El JS y el CSS van en la MISMA tarea, a propósito.** Publicar el JS sin el
CSS haría aparecer los encabezados **también en escritorio**, que es justo lo que
el spec descarta. No los separes.

- [ ] **Step 1: Reescribir `buildNav()`**

En `web/app.js`, reemplazar:

```js
function buildNav(){
  const nav=$('nav'); nav.innerHTML='';
  NAV.filter(n=>tieneModulo(n[0])).forEach(([key,ic,label])=>{
    const el=document.createElement('div');
    el.className='nav-item'; el.dataset.key=key;
    el.innerHTML=`<span class="ic">${NAV_ICON[key]||ic}</span> ${labelDe(key)}${key==='mensajes'?'<span id="nav-badge-mensajes" class="badge hidden">0</span>':''}`;
    el.onclick=()=>navTo(key);
    nav.appendChild(el);
  });
}
```

por:

```js
function buildNav(){
  const nav=$('nav'); nav.innerHTML='';
  const visibles=NAV.filter(n=>tieneModulo(n[0])).map(n=>n[0]);
  agruparNav(visibles).forEach(seccion=>{
    // titulo null = modo plano: no se pinta encabezado ninguno.
    if(seccion.titulo){
      const h=document.createElement('div');
      h.className='nav-sec';
      // textContent, no innerHTML: los titulos son fijos, pero no hay motivo
      // para abrir esa puerta en el menu.
      h.textContent=seccion.titulo;
      nav.appendChild(h);
    }
    seccion.claves.forEach(key=>{
      const el=document.createElement('div');
      el.className='nav-item'; el.dataset.key=key;
      el.innerHTML=`<span class="ic">${NAV_ICON[key]||iconDe(key)}</span> ${labelDe(key)}${key==='mensajes'?'<span id="nav-badge-mensajes" class="badge hidden">0</span>':''}`;
      el.onclick=()=>navTo(key);
      nav.appendChild(el);
    });
  });
}
```

⚠️ El icono de repuesto pasa de `ic` (el segundo elemento de la terna del `NAV`,
que ya no se desestructura) a **`iconDe(key)`**, que hace exactamente lo mismo
buscándolo en el `NAV` (`app.js:212`). Sin ese cambio, un módulo sin entrada en
`NAV_ICON` se quedaría sin icono.

- [ ] **Step 2: El estilo del encabezado**

En `web/styles.css`, justo **antes** de `.nav-item` (línea 186), añadir:

```css
/* Encabezado de seccion del menu. OCULTO por defecto: solo aparece en el movil
   (ver el @media de 900px), que es donde el cajon obliga a desplazarse. En
   escritorio caben las 19 entradas de golpe y verlas juntas ayuda. */
.nav-sec{display:none;}
```

Y **dentro** del `@media (max-width:900px)` que empieza en la línea 380, junto a
las reglas de `.sidebar`:

```css
  .nav-sec{display:block;font-size:0.6875rem;font-weight:700;letter-spacing:.08em;
    text-transform:uppercase;color:rgba(255,255,255,.45);
    padding:14px 12px 6px;}
  .nav-sec:first-child{padding-top:4px;}
```

- [ ] **Step 3: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **530, 0 fail** — esta tarea no toca backend; si el número cambia,
algo se salió de alcance.

- [ ] **Step 4: Probarlo en el navegador**

Servidor propio en un puerto poco común, `DISABLE_RATE_LIMIT=1`,
`JWT_SECRET=local`, `DB_PATH` a una BD de usar y tirar. Siembra con
`node src/seed.js`. Iglesia `MONTESION`, clave `1234`.

⚠️ **NO uses `scripts/with_server.py`**: en Windows deja el node huérfano y la
corrida siguiente lee su BD vieja. Mata tu proceso al terminar.

Con el navegador **a 390px de ancho**:

- Como **`pastor`** (19 entradas): salen los **cinco encabezados**, todas sus
  entradas debajo del suyo, y **navegar sigue funcionando** (pulsa dos o tres y
  comprueba que la pantalla cambia y que la entrada queda resaltada).
- Como **`maria`** (9 entradas, feligresa): **lista plana, sin ningún
  encabezado**. Es el caso que el umbral protege.
- Como **`abel`** (12 entradas, líder de cuerpo): **sí agrupa** — es el umbral
  exacto.
- **El badge de Mensajes** sigue apareciendo sobre su entrada (manda un mensaje
  desde otra cuenta si hace falta para que salga).

Y **ensanchando la ventana a escritorio**: los encabezados **desaparecen** y el
menú se ve exactamente como hoy.

- [ ] **Step 5: Commit**

```bash
git add web/app.js web/styles.css
git commit -m "feat(menu): agrupar el menu por temas en el movil"
```

---

### Task 3: Dejarlo escrito

**Files:**
- Modify: `ESTADO.md`

- [ ] **Step 1: Actualizar `ESTADO.md`**

Anotar qué se construyó (los cinco temas, el umbral de 12, encabezados solo en
móvil), el número nuevo de tests, y **lo que sigue sin resolver**:

1. **Esto mejora buscar, no acorta el scroll.** Las 19 entradas siguen ahí, más
   cinco encabezados. Si el uso real demuestra que lo que molesta es la
   **longitud**, la respuesta es la opción descartada —**secciones plegables**—
   y este trabajo es su paso previo: los grupos ya están definidos.
2. **Dos personas de la misma iglesia ven el menú con estructura distinta**,
   según crucen o no el umbral de 12. Es un paso pequeño sobre algo que ya
   pasaba (cada rol ve entradas distintas), pero conviene tenerlo escrito antes
   de que alguien lo reporte como fallo.
3. **El umbral de 12 es un número elegido**, no medido. Nadie sabe todavía cómo
   usa el pastor la app en el teléfono; cuando haya ese dato, se puede ajustar
   —o sustituir todo esto por accesos rápidos a lo que de verdad se usa.

⚠️ **Respeta el criterio de las cabeceras** de `ESTADO.md` (líneas 2 y ~539):
están redactadas para **no** afirmar cifras que caducan al fusionar, sino para
mandar comprobarlas. No metas un número suelto que caduque. Léelas antes de
escribir.

⚠️ **Esto NO está fusionado a `main` ni subido ni desplegado** cuando escribes
esto. Y **`main` puede tener commits sin subir** de trabajos anteriores: mira
qué dice ya el documento y **no lo contradigas ni lo dupliques**.

- [ ] **Step 2: Commit**

```bash
git add ESTADO.md
git commit -m "docs(estado): el menu agrupado del movil, cerrado"
```
