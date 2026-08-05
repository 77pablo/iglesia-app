# Botones de verdad fuera del menú — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los 21 controles `<div onclick>`/`<span onclick>` fuera del menú pasan a `<button type="button">` reales, usables con Tab/Enter/Espacio, sin cambio visual.

**Architecture:** Una clase de reseteo `.btn-plano` en `web/styles.css` neutraliza la apariencia nativa del botón; cada conversión conserva las clases y el `onclick` existentes. Un barrido-candado (`backend/test/botones-reales.test.js`) lleva una lista `PENDIENTES` con la deuda: cada tarea quita sus entradas (RED) y convierte (GREEN); al final la lista queda vacía y el candado impide `<div onclick>` nuevos para siempre.

**Tech Stack:** Vanilla JS, tests `node:test` que leen el texto fuente (sin banco de navegador).

**Spec:** `docs/superpowers/specs/2026-08-05-botones-reales-design.md` — léela antes de empezar.

## Global Constraints

- Rama de trabajo: `feat/botones-reales`, desde `main`.
- Mensajes de commit en castellano, **sin tildes**. Comentarios de código en castellano (con tildes, como sus vecinos).
- ⚠️ Regex de test que lea `web/app.js`: `\r?` antes de cada `\n`, o `[\s\S]` — el archivo vive con CRLF.
- ⚠️ Ningún comentario nuevo puede contener el texto `<div onclick=` ni `<span onclick=` (el barrido escanea líneas completas; `<div onclick>` sin `=` es inofensivo).
- Suite: `cd backend && npm test` (**621** al partir). Test dirigido: `cd backend && node --test test/botones-reales.test.js`.
- Solo se tocan `web/app.js`, `web/styles.css`, `backend/test/botones-reales.test.js` y (última tarea) `ESTADO.md`.
- Cada conversión: `<div` → `<button type="button"`, se añade `btn-plano` **al principio** de `class`, se quita `cursor:pointer` del `style` (si el style queda vacío, se quita entero), el resto de atributos se conserva, y **el cierre `</div>` de ese mismo elemento pasa a `</button>`** (búscalo leyendo el template completo; en templates multilínea suele estar 1-5 líneas más abajo).

## File Structure

- **Create:** `backend/test/botones-reales.test.js` — barrido + candado CSS (Task 1; las tareas 2-4 solo quitan entradas de `PENDIENTES`).
- **Modify:** `web/styles.css` (Task 1, `.btn-plano`), `web/app.js` (Tasks 2-4, las 21 conversiones), `ESTADO.md` (Task 5).

---

### Task 1: La clase `.btn-plano` y el barrido con la deuda completa

**Files:**
- Create: `backend/test/botones-reales.test.js`
- Modify: `web/styles.css`

**Interfaces:**
- Produces: la clase CSS `.btn-plano` (+ `:focus-visible`) que usan todas las conversiones, y el array `PENDIENTES` del test, cuyas entradas exactas quitan las Tasks 2-4.

- [ ] **Step 1: Crear la rama**

```bash
git checkout main && git checkout -b feat/botones-reales
```

- [ ] **Step 2: Escribir el test que falla**

Crear `backend/test/botones-reales.test.js` con este contenido completo:

```js
// -----------------------------------------------------------------------------
//  Botones de verdad fuera del menu (spec 2026-08-05-botones-reales).
//
//  Barrido de fuente: todo control clicable debe ser un <button>, no un
//  <div onclick=...>. PENDIENTES es la deuda que las tareas del plan van
//  vaciando; cuando este vacia, este archivo es el candado que impide que
//  vuelvan. Regla de la casa: \r? antes de cada \n en los regex (CRLF).
// -----------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'app.js'), 'utf8');
const hoja = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'styles.css'), 'utf8');

// Deuda de conversion. Cada entrada es un trozo LITERAL de la etiqueta que
// TODAVIA es <div>/<span> clicable. Las tareas del plan las quitan al
// convertir; no agregues entradas: un control nuevo nace <button>.
const PENDIENTES = [
  `"widget" style="cursor:pointer" onclick="navTo('calendario')"`,
  `onclick="navTo('mi_servicio')"`,
  `onclick="verNotificaciones()"`,
  `"mini-item" style="cursor:pointer" onclick="navTo('calendario')"`,
  `onclick="navTo('anuncios')"`,
  `onclick="verDia('`,
  `onclick="abrirNotif('`,
  `onclick="hojaAsistencia(`,
  `onclick="togglePresente(`,
  `onclick="abrirVisorCancion(`,
  `onclick="abrirVisorSetlist(`,
  `onclick="quitarIntegrante(`,
  `onclick="himnarioSel(`,
  `onclick="verCaso(`,
  `onclick="vistaClase(`,
  `onclick="verPredica(`,
  `onclick="verIglesiaObispo(`,
  `onclick="obAsistencia(`,
  `onclick="obTesoreria(`,
  `onclick="obPredica(`,
  `onclick="Org.abrir(`,
];

// Cada <div ...onclick= / <span ...onclick= con lo que le sigue en su linea.
function tagsClicables() {
  return fuente.match(/<(?:div|span)[^\r\n>]*onclick=[^\r\n]*/g) || [];
}

test('ningun <div>/<span> clicable fuera de la deuda declarada', () => {
  const usados = new Set();
  for (const tag of tagsClicables()) {
    if (tag.includes('stopPropagation')) continue;   // se cuentan aparte abajo
    const p = PENDIENTES.find(p => tag.includes(p));
    assert.ok(p,
      'Control clicable nuevo como <div>/<span>:\n  ' + tag.slice(0, 120) +
      '\nUsa <button type="button" class="btn-plano ..."> — Tab, Enter y el ' +
      'lector de pantalla vienen gratis. No agregues entradas a PENDIENTES.');
    usados.add(p);
  }
  for (const p of PENDIENTES) {
    assert.ok(usados.has(p),
      `La entrada ya se convirtio (o cambio de forma): quitala de PENDIENTES -> ${p}`);
  }
});

test('los onclick de stopPropagation son exactamente los 6 de los modales', () => {
  // No son controles: solo evitan que el clic dentro del modal lo cierre.
  // Si agregas un modal nuevo con esta tecnica, sube el numero A PROPOSITO.
  const n = tagsClicables().filter(t => t.includes('stopPropagation')).length;
  assert.equal(n, 6,
    `hay ${n} onclick de stopPropagation y se esperaban 6 — si es un modal ` +
    'nuevo legitimo, actualiza este numero; si no, algo se colo');
});

test('.btn-plano existe y tiene foco visible', () => {
  assert.ok(/\.btn-plano\s*\{[^}]*appearance\s*:\s*none/.test(hoja),
    'web/styles.css no tiene .btn-plano con appearance:none — los botones ' +
    'convertidos se verian con el estilo nativo del navegador');
  assert.ok(/\.btn-plano:focus-visible\s*\{[^}]*outline/.test(hoja),
    '.btn-plano:focus-visible sin outline: quien navega con Tab no ve donde esta');
});
```

- [ ] **Step 3: Verificar que falla**

Run: `cd backend && node --test test/botones-reales.test.js`
Expected: FAIL — el test de CSS (`.btn-plano` no existe todavía). Los otros dos PASAN (la deuda está declarada completa y los stopPropagation son 6). Si el barrido falla aquí, una entrada de `PENDIENTES` no coincide con el fuente: corrígela ANTES de seguir (cotéjala con `grep -n onclick web/app.js`).

- [ ] **Step 4: Implementar el CSS**

En `web/styles.css`, junto a los estilos de botones existentes, añadir:

```css
/* Botones que se visten con las clases de la tarjeta que envuelven:
   el reseteo deja que .widget, .item-card, .cal-cell... manden. */
.btn-plano{appearance:none;-webkit-appearance:none;background:none;border:0;font:inherit;color:inherit;text-align:inherit;padding:0;cursor:pointer}
.btn-plano:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
```

- [ ] **Step 5: Verificar que pasa**

Run: `cd backend && node --test test/botones-reales.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Suite completa**

Run: `cd backend && npm test`
Expected: verde (621 + 3).

- [ ] **Step 7: Commit**

```bash
git add web/styles.css backend/test/botones-reales.test.js
git commit -m "test(a11y): el barrido declara la deuda de divs clicables, y nace .btn-plano"
```

---

### Task 2: Panel de inicio, calendario y notificaciones (7 controles)

**Files:**
- Modify: `web/app.js` (~líneas 893-932, 1080, 1494 del commit `58e221c`)
- Modify: `backend/test/botones-reales.test.js` (solo quitar entradas de `PENDIENTES`)

**Interfaces:**
- Consumes: `.btn-plano` de la Task 1.

- [ ] **Step 1: RED — quitar de `PENDIENTES` estas 7 entradas**

```
`"widget" style="cursor:pointer" onclick="navTo('calendario')"`,
`onclick="navTo('mi_servicio')"`,
`onclick="verNotificaciones()"`,
`"mini-item" style="cursor:pointer" onclick="navTo('calendario')"`,
`onclick="navTo('anuncios')"`,
`onclick="verDia('`,
`onclick="abrirNotif('`,
```

Run: `cd backend && node --test test/botones-reales.test.js`
Expected: FAIL con "Control clicable nuevo como <div>/<span>" para cada uno de los 7.

- [ ] **Step 2: Convertir los 7**

En cada caso, el `</div>` que cierra ese mismo elemento pasa a `</button>` (léelo en el template completo).

Los 3 widgets del panel (antes → después):

```
<div class="widget" style="cursor:pointer" onclick="navTo('calendario')">
<button type="button" class="btn-plano widget" onclick="navTo('calendario')">

<div class="widget" style="cursor:pointer" onclick="navTo('mi_servicio')">
<button type="button" class="btn-plano widget" onclick="navTo('mi_servicio')">

<div class="widget" style="cursor:pointer" onclick="verNotificaciones()">
<button type="button" class="btn-plano widget" onclick="verNotificaciones()">
```

Los 2 mini-items:

```
<div class="mini-item" style="cursor:pointer" onclick="navTo('calendario')">
<button type="button" class="btn-plano mini-item" onclick="navTo('calendario')">

<div class="mini-item" style="cursor:pointer" onclick="navTo('anuncios')">
<button type="button" class="btn-plano mini-item" onclick="navTo('anuncios')">
```

La celda del calendario (el template arma muchas):

```
celdas+=`<div class="cal-cell${esHoy?' today':''}${finde?' finde':''}${sel?' sel':''}${delDia.length?' tiene':''}" onclick="verDia('${fecha}')">
celdas+=`<button type="button" class="btn-plano cal-cell${esHoy?' today':''}${finde?' finde':''}${sel?' sel':''}${delDia.length?' tiene':''}" onclick="verDia('${fecha}')">
```

La notificación — botón solo cuando es navegable (`dest`); nota que la clase se repite en las dos ramas:

```
return `<div class="notif-item ${n.leida?'':'no-leida'}" ${dest?`style="cursor:pointer" onclick="abrirNotif('${n.tipo}')"`:''}>
return `${dest?`<button type="button" class="btn-plano notif-item ${n.leida?'':'no-leida'}" onclick="abrirNotif('${n.tipo}')">`:`<div class="notif-item ${n.leida?'':'no-leida'}">`}
```

y su cierre pasa a `${dest?'</button>':'</div>'}`.

- [ ] **Step 3: GREEN**

Run: `cd backend && node --test test/botones-reales.test.js`
Expected: PASS.

- [ ] **Step 4: Suite completa**

Run: `cd backend && npm test`
Expected: verde. Ojo con los tests de XSS de atributos: si alguno se queja de una interpolación en la etiqueta nueva, es que cambiaste algo más que la etiqueta — las interpolaciones deben quedar idénticas.

- [ ] **Step 5: Commit**

```bash
git add web/app.js backend/test/botones-reales.test.js
git commit -m "feat(a11y): panel, calendario y notificaciones se usan con teclado"
```

---

### Task 3: Asistencia, cuidado, predicas, Escuela Dominical y Organizacion (6 controles)

**Files:**
- Modify: `web/app.js` (~líneas 1539, 1577, 2308, 2756, 3154, 4612 del commit `58e221c`)
- Modify: `backend/test/botones-reales.test.js` (solo quitar entradas)

**Interfaces:**
- Consumes: `.btn-plano` de la Task 1.

- [ ] **Step 1: RED — quitar de `PENDIENTES` estas 6 entradas**

```
`onclick="hojaAsistencia(`,
`onclick="togglePresente(`,
`onclick="verCaso(`,
`onclick="vistaClase(`,
`onclick="verPredica(`,
`onclick="Org.abrir(`,
```

Run: `cd backend && node --test test/botones-reales.test.js`
Expected: FAIL para los 6.

- [ ] **Step 2: Convertir los 6**

Tarjetas simples (cierre `</div>` → `</button>` en cada template):

```
<div class="item-card flex" style="cursor:pointer" onclick="hojaAsistencia(${e.id})">
<button type="button" class="btn-plano item-card flex" onclick="hojaAsistencia(${e.id})">

<div class="item-card flex" style="cursor:pointer" onclick="verCaso(${c.id})">
<button type="button" class="btn-plano item-card flex" onclick="verCaso(${c.id})">

<div class="module-card" onclick="vistaClase(${x.id},${escJsAttr(x.nombre||'')})">
<button type="button" class="btn-plano module-card" onclick="vistaClase(${x.id},${escJsAttr(x.nombre||'')})">

<div class="item-card flex" style="cursor:pointer" onclick="verPredica(${p.id})">
<button type="button" class="btn-plano item-card flex" onclick="verPredica(${p.id})">

<div class="item-card flex" style="margin-top:10px;cursor:pointer" onclick="Org.abrir(${h.id},'organizacion')">
<button type="button" class="btn-plano item-card flex" style="margin-top:10px" onclick="Org.abrir(${h.id},'organizacion')">
```

La fila de asistencia — **toggle**: botón con `aria-pressed` cuando es editable; div estático como hoy cuando no:

```
<div class="asist-row ${on?'on':''}" ${editable?`onclick="togglePresente(${m.id})"`:'style="cursor:default"'}>
${editable?`<button type="button" class="btn-plano asist-row ${on?'on':''}" aria-pressed="${on?'true':'false'}" onclick="togglePresente(${m.id})">`:`<div class="asist-row ${on?'on':''}" style="cursor:default">`}
```

y su cierre pasa a `${editable?'</button>':'</div>'}`.

- [ ] **Step 3: GREEN**

Run: `cd backend && node --test test/botones-reales.test.js`
Expected: PASS.

- [ ] **Step 4: Suite completa**

Run: `cd backend && npm test`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add web/app.js backend/test/botones-reales.test.js
git commit -m "feat(a11y): asistencia con aria-pressed, cuidado, predicas, clases y hojas con teclado"
```

---

### Task 4: Musica, himnario y panel del obispo (8 controles)

**Files:**
- Modify: `web/app.js` (~líneas 1935, 1965, 2012, 2178, 3267, 3298, 3299, 3303 del commit `58e221c`)
- Modify: `backend/test/botones-reales.test.js` (solo quitar entradas — quedan 0)

**Interfaces:**
- Consumes: `.btn-plano` de la Task 1.

- [ ] **Step 1: RED — quitar de `PENDIENTES` las 8 entradas restantes**

```
`onclick="abrirVisorCancion(`,
`onclick="abrirVisorSetlist(`,
`onclick="quitarIntegrante(`,
`onclick="himnarioSel(`,
`onclick="verIglesiaObispo(`,
`onclick="obAsistencia(`,
`onclick="obTesoreria(`,
`onclick="obPredica(`,
```

El array queda `const PENDIENTES = [];` — **conserva el array y su comentario**: vacío, es el candado permanente.

Run: `cd backend && node --test test/botones-reales.test.js`
Expected: FAIL para los 8.

- [ ] **Step 2: Convertir los 8**

⚠️ Canción y setlist: se convierte **solo la zona clicable interna** (el div con `flex:1`) — la tarjeta que la envuelve tiene botones al lado y un botón no puede anidar otro.

```
<div style="flex:1;cursor:pointer" onclick="abrirVisorCancion(${c.id})" title="Ver y transponer">
<button type="button" class="btn-plano" style="flex:1" onclick="abrirVisorCancion(${c.id})" title="Ver y transponer">

<div style="flex:1;cursor:pointer" onclick="abrirVisorSetlist(${s.cancion_id},${escJsAttr(s.tono_dia||'')})" title="Ver y transponer">
<button type="button" class="btn-plano" style="flex:1" onclick="abrirVisorSetlist(${s.cancion_id},${escJsAttr(s.tono_dia||'')})" title="Ver y transponer">
```

El `×` de quitar integrante (era `<span>`; gana nombre accesible — cierre `</span>` → `</button>`):

```
<span title="Quitar" style="cursor:pointer;color:var(--red-tx);font-weight:700;margin-left:2px" onclick="quitarIntegrante(${it.id})">×</span>
<button type="button" class="btn-plano" title="Quitar" aria-label="Quitar del equipo" style="color:var(--red-tx);font-weight:700;margin-left:2px" onclick="quitarIntegrante(${it.id})">×</button>
```

La canción del modal del himnario:

```
<div class="hmodal-song ${_hmSel&&_hmSel.id===h.id?'sel':''}" onclick="himnarioSel(${escJsAttr(h.id)})">
<button type="button" class="btn-plano hmodal-song ${_hmSel&&_hmSel.id===h.id?'sel':''}" onclick="himnarioSel(${escJsAttr(h.id)})">
```

El panel del obispo (4):

```
<div class="module-card" style="text-align:left;align-items:stretch" onclick="verIglesiaObispo(${i.id})">
<button type="button" class="btn-plano module-card" style="text-align:left;align-items:stretch" onclick="verIglesiaObispo(${i.id})">

<div class="widget" style="cursor:pointer" onclick="obAsistencia(${id})">
<button type="button" class="btn-plano widget" onclick="obAsistencia(${id})">

<div class="widget" style="cursor:pointer" onclick="obTesoreria(${id})">
<button type="button" class="btn-plano widget" onclick="obTesoreria(${id})">

<div class="item-card flex" style="cursor:pointer" onclick="obPredica(${p.id})">
<button type="button" class="btn-plano item-card flex" onclick="obPredica(${p.id})">
```

- [ ] **Step 3: GREEN**

Run: `cd backend && node --test test/botones-reales.test.js`
Expected: PASS — y con `PENDIENTES` vacío, el barrido ya no admite ningún div clicable.

- [ ] **Step 4: Suite completa**

Run: `cd backend && npm test`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add web/app.js backend/test/botones-reales.test.js
git commit -m "feat(a11y): musica, himnario y panel del obispo con teclado -- deuda en cero"
```

---

### Task 5: ESTADO.md al dia

**Files:**
- Modify: `ESTADO.md`

**Interfaces:**
- Consumes: nada de código; los commits anteriores.

- [ ] **Step 1: Actualizar ESTADO.md**

Añadir al principio (después de la línea 2 de cabecera y su `---`) esta sección nueva:

```markdown
## 🆕 5 DE AGOSTO DE 2026 — ⌨️ toda la app se usa con teclado: los 21 divs clicables son botones

La otra mitad de la brecha de accesibilidad que dejó anotada el menú (su punto
4 de "sigue sin resolver") quedó cerrada: **los 21 controles que eran
`<div onclick>` (y un `<span>`) fuera del menú son ahora `<button
type="button">` de verdad** — panel de inicio, celdas del calendario,
notificaciones, asistencia (el toggle de presente lleva `aria-pressed`),
música (el × de quitar integrante ganó `aria-label`), himnario, cuidado
pastoral, Escuela Dominical, prédicas, panel del obispo y hojas de
Organización. Visual idéntico: la clase `.btn-plano` (`web/styles.css`)
neutraliza el estilo nativo y las clases de siempre mandan.

**El candado es un barrido** (`backend/test/botones-reales.test.js`): cualquier
`<div`/`<span` con `onclick` que no sea uno de los 6 `stopPropagation` de los
modales rompe la suite con un mensaje que dice qué usar. La lista `PENDIENTES`
del barrido quedó vacía y así se queda.

**Fuera de alcance, a propósito:** el overlay del cajón del menú (es fondo, no
control), `kiosko.html`/`inscribir.html` (despliegue facial aparte) y las
páginas legales. Spec: `docs/superpowers/specs/2026-08-05-botones-reales-design.md`.
```

Y en la sección del 31-jul, en la lista "Sigue sin resolver", el punto 4 ("El
resto de la app sigue sin botones reales...") gana al principio la marca
`~~...~~ **(desfasado, resuelto el 5-ago:** ver la sección de esa fecha**)**` —
tachado el texto viejo, como hace el propio documento con lo que caduca.

- [ ] **Step 2: Suite completa**

Run: `cd backend && npm test`
Expected: verde. Anota el total: lo cita el merge.

- [ ] **Step 3: Commit**

```bash
git add ESTADO.md
git commit -m "docs(estado): la brecha de teclado fuera del menu queda cerrada"
```

> **Después de esta tarea, y antes de fusionar (lo hace el controlador, no un
> subagente):** caminata Playwright en 390 px y 1280 px — visual idéntico,
> Tab recorre, Enter activa — sobre panel de inicio, calendario, asistencia
> (toggle con `aria-pressed` anunciado) y música; después, merge `--no-ff` a
> `main` y borrar la rama.
