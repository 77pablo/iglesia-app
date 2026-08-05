# Pulido de agosto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar cinco cabos chicos ya anotados: puertos de test dinámicos, tabla y endpoint legacy muertos, el punto de sin-leer en rojo, temas del menú de una sola entrada pintados sueltos, y el rótulo "(cuenta inactiva)" que miente mientras carga el directorio.

**Architecture:** Sin cambios de fondo. Un helper de test nuevo (`puerto-libre.js`), una migración `DROP TABLE` idempotente en `db.js`, un cambio de una palabra en CSS, dos funciones del menú retocadas (`agruparNav`/`buildNav`) y una función nueva chica en `web/app.js` (`quitarAusenteDuplicada`). Spec: `docs/superpowers/specs/2026-08-05-pulido-agosto-design.md`.

**Tech Stack:** Node 24 (`node:test`, `node:sqlite`), Express, frontend vanilla. Tests de frontend por lectura de fuente + DOM de juguete (no hay banco de navegador).

## Global Constraints

- Rama: `feat/pulido-agosto` (creada en la Task 1, desde `main`).
- Suite en verde entre tarea y tarea: `cd backend && npm test`.
- Los tests que leen fuente con regex: **nunca un `.` ni un `[^X]` que deba cruzar `\r\n` sin contemplarlo** — git materializa con CRLF en Windows (lección de `ESTADO.md`).
- Los nombres los escribe gente: `textContent`, nunca `innerHTML`, en cualquier opción de selector.
- Mensajes de commit en el estilo del repo: minúsculas, sin tildes, `tipo(ámbito): qué -- por qué`.
- Cada commit termina con la línea `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Puertos de test dinámicos

**Files:**
- Create: `backend/test/puerto-libre.js`
- Modify: `backend/test/upload-validacion.test.js:6,31,36` (comentario, `PORT`, `BASE`)
- Modify: `backend/test/seguridad.test.js:19,27` (`PORT`, `BASE`)

**Interfaces:**
- Produces: `puertoLibre(): Promise<number>` — pide al SO un puerto libre en `127.0.0.1` y lo devuelve ya cerrado. La usan estas dos suites y la Task 2.

- [ ] **Step 1: Crear la rama**

```bash
cd "C:/Users/pdani/Documents/App-Iglesia/app" && git checkout -b feat/pulido-agosto
```

- [ ] **Step 2: Escribir el helper**

Crear `backend/test/puerto-libre.js`:

```js
// Pide al sistema operativo un puerto libre y lo devuelve.
//
// Existe porque upload-validacion.test.js y seguridad.test.js fijaban 3941 y
// 3931 a mano: dos corridas a la vez se pisaban y el sintoma ("El servidor de
// pruebas no respondio a tiempo") no decia nada de la causa. Hueco anotado en
// ESTADO.md el 30-jul; mordio de verdad el 5-ago.
//
// Queda una ventana de carrera entre cerrar este socket y que el servidor hijo
// abra el suyo: se acepta, es ordenes de magnitud mas chica que el choque
// determinista de un numero fijo.
import net from 'node:net';

export function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const puerto = s.address().port;
      s.close(err => err ? reject(err) : resolve(puerto));
    });
  });
}
```

- [ ] **Step 3: Migrar `upload-validacion.test.js`**

En la cabecera (línea 6), cambiar:

```js
//   - PUERTO 3941 (3931 lo ocupa seguridad.test.js).
```

por:

```js
//   - Puerto dinamico (test/puerto-libre.js): los puertos fijos 3941/3931
//     hacian que dos corridas a la vez se pisaran.
```

Añadir el import junto a los demás:

```js
import { puertoLibre } from './puerto-libre.js';
```

Cambiar las líneas 31 y 36:

```js
const PORT = 3941;
```
```js
const BASE = `http://127.0.0.1:${PORT}`;
```

por:

```js
let PORT;            // se pide al SO en before(): ver test/puerto-libre.js
```
```js
let BASE;            // depende de PORT: se arma en before()
```

(El comentario de la IP literal de las líneas 32-35 se queda tal cual.)

Y al principio del `before(async () => {` (línea 85), antes de `fs.mkdirSync`:

```js
  PORT = await puertoLibre();
  BASE = `http://127.0.0.1:${PORT}`;
```

`spawn` ya usa `PORT: String(PORT)` — al correr dentro de `before`, toma el valor nuevo. Las funciones `esperarListo`/`subir`/`postJson` leen `BASE` al llamarse, siempre después de `before`.

- [ ] **Step 4: Migrar `seguridad.test.js` igual**

Añadir el import:

```js
import { puertoLibre } from './puerto-libre.js';
```

Cambiar la línea 19 (`const PORT = 3931;`) por:

```js
let PORT;            // se pide al SO en before(): ver test/puerto-libre.js
```

y la línea 27 (`const BASE = ...`) por:

```js
let BASE;            // depende de PORT: se arma en before()
```

(las constantes `HOST` y su comentario se quedan). En su `before(async () => {` (línea 45), como primera línea:

```js
  PORT = await puertoLibre();
  BASE = `http://${HOST}:${PORT}`;
```

- [ ] **Step 5: Verificar que cada suite pasa sola**

```bash
cd backend && node --test test/upload-validacion.test.js && node --test test/seguridad.test.js
```

Expected: las dos en verde (pass, 0 fail).

- [ ] **Step 6: Verificar que ya no se pisan corriendo A LA VEZ**

```bash
cd backend && (node --test test/upload-validacion.test.js & node --test test/seguridad.test.js & wait)
```

Expected: las dos en verde. Antes de este cambio, correr dos a la vez daba "El servidor de pruebas no respondio a tiempo".

- [ ] **Step 7: Suite completa y commit**

```bash
cd backend && npm test
```

Expected: todo en verde (624 al partir; el número exacto puede variar con la rama).

```bash
git add backend/test/puerto-libre.js backend/test/upload-validacion.test.js backend/test/seguridad.test.js
git commit -m "test(arnes): puertos dinamicos -- dos suites a la vez ya no se pisan

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Limpieza de lo muerto (`recurso` + `POST /api/dispositivo`)

**Files:**
- Modify: `backend/src/db.js:158-163` (fuera `CREATE TABLE recurso`), y añadir migración al final (después de `migrarCampaniaAMovimientos()`, línea ~699)
- Modify: `backend/src/seed.js:18` (fuera `'recurso'` de la lista de reseteo)
- Modify: `backend/src/server.js:345-355` (fuera `dispositivoSchema` y el endpoint)
- Modify: `backend/README.md:25` (fuera la fila de la tabla de endpoints)
- Create: `backend/test/limpieza-legacy.test.js`

**Interfaces:**
- Consumes: `puertoLibre()` de la Task 1.
- Produces: `migrarQuitarRecurso(conexion = db)` exportada de `db.js` (mismo patrón que `migrarEstadoContactoPublico`).

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/limpieza-legacy.test.js`:

```js
// ----------------------------------------------------------------------------
//  Limpieza de lo muerto (spec 2026-08-05-pulido-agosto):
//   - la tabla `recurso` no existe (nada la escribio jamas; se dropea);
//   - `dispositivo_push` SI existe (puede tener filas reales; solo murio
//     su puerta de escritura);
//   - POST /api/dispositivo -> 404 (endpoint legacy eliminado; el push real
//     usa push_sub via /api/push/*).
// ----------------------------------------------------------------------------
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { cargarDb } from './helpers.js';
import { puertoLibre } from './puerto-libre.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, '..', 'src', 'server.js');

test('la tabla recurso ya no existe y dispositivo_push sigue', async () => {
  const db = await cargarDb();
  const tablas = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  assert.ok(!tablas.includes('recurso'),
    'la tabla `recurso` sigue existiendo: nada la escribio jamas y la spec la retira');
  assert.ok(tablas.includes('dispositivo_push'),
    '`dispositivo_push` NO debia borrarse: puede tener filas reales en produccion');
});

test('la migracion que la dropea es idempotente', async () => {
  await cargarDb();
  const { migrarQuitarRecurso } = await import('../src/db.js');
  migrarQuitarRecurso();
  migrarQuitarRecurso();   // segunda llamada: no debe reventar ni hacer nada
});

test('POST /api/dispositivo -> 404 (endpoint legacy eliminado)', async (t) => {
  const PORT = await puertoLibre();
  const BASE = `http://127.0.0.1:${PORT}`;
  const DB_PATH = path.join(os.tmpdir(), `iglesia-test-limpieza-${Date.now()}.db`);
  const servidor = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...process.env, PORT: String(PORT), DB_PATH,
      JWT_SECRET: 'secreto-de-pruebas-no-usar-en-produccion',
      SEED_ON_EMPTY: '1', NODE_ENV: '', DISABLE_RATE_LIMIT: '1'
    },
    stdio: 'pipe'
  });
  t.after(() => servidor.kill());
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; }
    catch { /* aun no levanta */ }
    await new Promise(r => setTimeout(r, 250));
  }
  const login = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iglesia: 'MONTESION', usuario: 'pastor', password: '1234' })
  });
  const { token } = await login.json();
  assert.ok(token, 'no se pudo iniciar sesion en el servidor de pruebas');
  const r = await fetch(`${BASE}/api/dispositivo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ token: 'token-viejo', plataforma: 'android' })
  });
  assert.equal(r.status, 404,
    'POST /api/dispositivo sigue vivo: es la puerta de escritura del push legacy');
});
```

- [ ] **Step 2: Correr el test — debe FALLAR**

```bash
cd backend && node --test test/limpieza-legacy.test.js
```

Expected: FAIL — `recurso` existe todavía, `migrarQuitarRecurso` no existe, y el POST devuelve 200.

- [ ] **Step 3: Retirar la tabla y el endpoint**

En `backend/src/db.js`, borrar el bloque (líneas 158-163):

```sql
-- RECURSO: espacio/equipo reservable (salon, canon...)
CREATE TABLE IF NOT EXISTS recurso (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  nombre      TEXT NOT NULL
);
```

y añadir al final del archivo, después de `migrarCampaniaAMovimientos();`:

```js
// RECURSO: la tabla nacio para "espacio/equipo reservable" y NADA la escribio
// jamas (cero INSERT en toda la historia del repo: por construccion esta
// vacia en cualquier despliegue). No confundir con recurso_grupo ni
// predica_recurso, que si se usan. DROP IF EXISTS es idempotente por si
// mismo, asi que no necesita la guarda PRAGMA de las migraciones de arriba.
// Exportada por el mismo motivo que las demas: que una prueba pueda llamarla
// dos veces.
export function migrarQuitarRecurso(conexion = db) {
  conexion.exec('DROP TABLE IF EXISTS recurso');
}
migrarQuitarRecurso();
```

En `backend/src/seed.js` línea 18, quitar `'recurso',` de la lista (queda `...,'asistencia','asignacion','evento','anuncio','pertenencia','grupo','persona','auditoria','iglesia']`).

En `backend/src/server.js`, borrar el bloque completo (líneas 345-355):

```js
// --- Registro de token push (1A.5) ---
const dispositivoSchema = z.object({
  token: z.string().trim().min(1, 'falta el token push'),
  plataforma: z.string().trim().max(50).optional()
});
app.post('/api/dispositivo', authMiddleware, validar(dispositivoSchema), (req, res) => {
  const { token, plataforma } = req.body;
  db.prepare('INSERT INTO dispositivo_push (persona_id, token, plataforma) VALUES (?,?,?)')
    .run(req.user.persona_id, token, plataforma || 'desconocida');
  res.json({ ok: true });
});
```

y en su lugar dejar una nota de una línea:

```js
// POST /api/dispositivo (push legacy) se retiro el 5-ago-2026: nada del
// frontend lo llamaba y el push real usa push_sub (push.js). La tabla
// dispositivo_push se queda: puede tener filas viejas y ARCO la limpia.
```

⚠️ Si al quitar el schema `z` queda sin usar en `server.js`, **comprobar con grep antes de quitar el import**: `grep -n "z\." backend/src/server.js` — si hay más usos, el import se queda.

En `backend/README.md`, borrar la línea 25:

```md
| POST | `/api/dispositivo` | Registra token push (requiere token) |
```

- [ ] **Step 4: Correr el test — debe PASAR**

```bash
cd backend && node --test test/limpieza-legacy.test.js
```

Expected: PASS (3 tests).

- [ ] **Step 5: Suite completa y commit**

```bash
cd backend && npm test
```

Expected: verde. (`helpers.js` no resetea `recurso`, y `seed.js` ya no lo nombra: nada más lo conocía.)

```bash
git add backend/src/db.js backend/src/seed.js backend/src/server.js backend/README.md backend/test/limpieza-legacy.test.js
git commit -m "chore(legacy): fuera la tabla recurso (siempre vacia) y el endpoint del push viejo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: El punto de sin-leer, rojo como el badge

**Files:**
- Modify: `web/styles.css:425` (`var(--gold)` → `var(--red)`)
- Modify: `backend/test/menu-plegable.test.js` (aserción nueva, después del test de `:628-643` que valida el CSS del punto)

**Interfaces:** ninguna nueva. El `aria-label` **ya existe y ya está testeado** (`app.js:812-829`, test `:598-626`) — esta tarea NO lo toca.

- [ ] **Step 1: Escribir la aserción que falla**

En `backend/test/menu-plegable.test.js`, después del test que valida que el punto vive solo en el `@media` del móvil (el que contiene la línea `el punto no esta estilizado en el @media del movil`), añadir:

```js
test('el punto de sin-leer es ROJO, el mismo del badge que representa', () => {
  // Decision del dueno (5-ago): mismo dato, mismo color. El punto y el badge
  // salen del mismo numero (Chat._sinLeer); si un dia no combinan, quien
  // aprendio "rojo = mensajes sin leer" deja de reconocerlo en el menu.
  const n = anchoMovilDelJs();
  const inicio = hoja.indexOf(`@media (max-width:${n}px){`);
  assert.ok(inicio >= 0, 'no se encontro el @media del movil en styles.css');
  const regla = hoja.slice(inicio).match(/\.nav-sec\.con-sin-leer::after\{[^}]*\}/);
  assert.ok(regla, 'no se encontro la regla del punto de sin-leer en el @media del movil');
  assert.ok(regla[0].includes('var(--red)'),
    'el punto de sin-leer no usa var(--red): punto y badge dicen lo mismo con dos colores');
});
```

(`[^}]*` no usa `.`, así que el CRLF no lo rompe.)

- [ ] **Step 2: Correr — debe FALLAR**

```bash
cd backend && node --test test/menu-plegable.test.js
```

Expected: FAIL con "el punto de sin-leer no usa var(--red)" (hoy dice `var(--gold)`).

- [ ] **Step 3: Cambiar el color**

En `web/styles.css` línea 424-425, cambiar:

```css
  .nav-sec.con-sin-leer::after{content:"";display:inline-block;width:6px;height:6px;
    border-radius:50%;background:var(--gold);margin-left:7px;vertical-align:middle;}
```

por:

```css
  .nav-sec.con-sin-leer::after{content:"";display:inline-block;width:6px;height:6px;
    border-radius:50%;background:var(--red);margin-left:7px;vertical-align:middle;}
```

- [ ] **Step 4: Correr — debe PASAR, y suite completa**

```bash
cd backend && node --test test/menu-plegable.test.js && npm test
```

Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add web/styles.css backend/test/menu-plegable.test.js
git commit -m "fix(menu): el punto de sin-leer en rojo -- mismo dato, mismo color que el badge

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Un tema con una sola entrada se pinta suelto

**Files:**
- Modify: `web/app.js:59-67` (`agruparNav`), `web/app.js:722-753` (`buildNav`: el bucle de secciones y el fallback del acordeón)
- Modify: `backend/test/menu-plegable.test.js` (parámetro nuevo del arnés + test nuevo)

**Interfaces:**
- Produces: `agruparNav` devuelve las secciones de UNA entrada con `titulo:null`; `buildNav` pinta toda sección `titulo:null` como entradas sueltas. El arnés `ejecutarBuildNav(movil, claveActivaPrevia, tieneModulo)` gana el tercer parámetro opcional (default `() => true`, como hoy).

- [ ] **Step 1: Escribir el test que falla**

En `backend/test/menu-plegable.test.js`, cambiar la firma del arnés (línea 123) de:

```js
function ejecutarBuildNav(movil, claveActivaPrevia) {
```

a:

```js
function ejecutarBuildNav(movil, claveActivaPrevia, tieneModulo) {
```

y en la llamada a `new Function(...)` (líneas 168-176), cambiar el argumento fijo `() => true,` por:

```js
    tieneModulo || (() => true),   // por defecto, el pastor: ve las 19 entradas
```

Añadir después del test `'en MOVIL cada tema es un contenedor de verdad con sus entradas dentro'`:

```js
test('en MOVIL un tema que queda con UNA entrada se pinta suelto, sin encabezado', () => {
  // Decision del dueno (5-ago): un acordeon de un solo elemento cuesta un toque
  // y no ahorra nada. El caso real: el lider de cuerpo ve 12 modulos y
  // "Pastoreo" le quedaba con solo `asistencia` debajo.
  const DOCE = ['inicio', 'calendario', 'anuncios', 'mensajes', 'directorio', 'predica',
    'mi_servicio', 'mi_grupo', 'ajustes', 'asistencia', 'servicio_gestion', 'organizacion'];
  const nav = ejecutarBuildNav(true, null, (k) => DOCE.includes(k));

  // "Pastoreo" quedaria con una sola entrada: ni encabezado ni contenedor.
  const encabezados = nav.children.filter(e => e.className === 'nav-sec');
  assert.ok(!encabezados.some(h => h.textContent === 'Pastoreo'),
    'un tema con una sola entrada sigue llevando encabezado');

  // Su entrada esta SUELTA en el nav, y no ademas dentro de un grupo.
  const sueltas = clavesDe(nav.children);
  assert.deepEqual(sueltas, ['asistencia'],
    'la entrada del tema de uno no quedo suelta en el lugar del tema');
  const agrupadas = nav.children.filter(e => e.className === 'nav-grupo')
    .flatMap(g => clavesDe(g.children));
  assert.ok(!agrupadas.includes('asistencia'), 'asistencia esta dos veces: suelta y agrupada');

  // Nada se pierde: sueltas + agrupadas = los 12 modulos visibles.
  assert.deepEqual([...sueltas, ...agrupadas].sort(), [...DOCE].sort(),
    'al soltar el tema de uno se perdio o duplico una entrada');

  // Los demas temas siguen siendo acordeon de verdad.
  assert.ok(encabezados.length >= 3, 'los temas con 2+ entradas perdieron su encabezado');
  assert.equal(encabezados.length, nav.children.filter(e => e.className === 'nav-grupo').length,
    'cada encabezado necesita su contenedor');
});
```

- [ ] **Step 2: Correr — debe FALLAR**

```bash
cd backend && node --test test/menu-plegable.test.js
```

Expected: FAIL — hoy "Pastoreo" se pinta con encabezado y `asistencia` va dentro de un grupo.

- [ ] **Step 3: Implementar**

En `web/app.js`, `agruparNav` (líneas 59-67) — añadir el `.map` final:

```js
function agruparNav(claves){
  // [...claves] y no `claves` a secas: devolver la MISMA referencia que se
  // recibio invita a que quien la use la ordene o la recorte y le cambie el
  // array a quien llamo, sin enterarse.
  if(claves.length < NAV_UMBRAL_GRUPOS) return [{titulo:null, claves:[...claves]}];
  return GRUPOS_NAV
    .map(g=>({titulo:g.titulo, claves:g.claves.filter(k=>claves.includes(k))}))
    .filter(g=>g.claves.length)    // un encabezado sin nada debajo es ruido
    // Y un encabezado con UNA sola cosa debajo tambien (decision del dueno,
    // 5-ago): titulo null = "sin encabezado", que buildNav ya sabe pintar.
    .map(g=>g.claves.length===1 ? {titulo:null, claves:g.claves} : g);
}
```

En `buildNav`, el bucle de secciones (líneas 722-740) pasa a:

```js
  let primerGrupo=null;   // el fallback del acordeon: el primer tema REAL
  secciones.forEach((seccion,i)=>{
    const id=`nav-g-${i+1}`;
    // Tema de una sola entrada (titulo null): la entrada va suelta, en el
    // lugar del tema, sin acordeon que abrir para una sola cosa.
    if(!seccion.titulo){
      seccion.claves.forEach(k=>nav.appendChild(conActiva(k)));
      return;
    }
    if(primerGrupo===null) primerGrupo=id;
    const h=document.createElement('button');
    h.type='button';
    h.className='nav-sec';
    // textContent, no innerHTML: los titulos son fijos, pero no hay motivo para
    // abrir esa puerta en el menu.
    h.textContent=seccion.titulo;
    h.setAttribute('aria-controls',id);
    h.setAttribute('aria-expanded','true');
    h.onclick=()=>alternarGrupo(id);
    nav.appendChild(h);

    const cont=document.createElement('div');
    cont.className='nav-grupo';
    cont.id=id;
    seccion.claves.forEach(k=>cont.appendChild(conActiva(k)));
    nav.appendChild(cont);
  });
```

y el estado inicial del acordeón (línea 749) cambia `'nav-g-1'` por `primerGrupo`:

```js
    abrirGrupo(grupoActivo()||primerGrupo);
```

(`abrirGrupo(null)` ya significa "cerrar todos" y con cero grupos no recorre nada: el guardia existente basta. Si la entrada activa quedó suelta, `grupoActivo()` devuelve null —su `closest('.nav-grupo')` no encuentra nada— y se abre el primer tema real, que es el comportamiento de "no hay ninguna activa" de siempre.)

**No tocar nada más**: `marcarGrupoConSinLeer` ya maneja la entrada sin contenedor (`if(!cont) return` — el badge se ve directo), y el escritorio no pasa por este bucle.

- [ ] **Step 4: Correr — debe PASAR, y suite completa**

```bash
cd backend && node --test test/menu-plegable.test.js && npm test
```

Expected: verde, incluidos los tests viejos del menú (con el pastor ningún tema queda de uno: nada cambia para ellos).

- [ ] **Step 5: Commit**

```bash
git add web/app.js backend/test/menu-plegable.test.js
git commit -m "feat(menu): un tema con una sola entrada se pinta suelto -- fuera el acordeon de uno

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: El rótulo "(cuenta inactiva)" deja de mentir

**Files:**
- Modify: `web/app.js` — función nueva `quitarAusenteDuplicada(sel)` justo antes de `const Org=` (o del bloque de Organización), y una llamada en `Org._llenarQuienPago` (línea ~4826, tras el `catch`)
- Create: `backend/test/organizacion-selector.test.js`

**Interfaces:**
- Produces: `quitarAusenteDuplicada(sel)` — función de nivel superior (declarada con `function`, para que `recortarFuncion` la encuentre). Quita la `<option data-ausente>` si existe otra opción con el mismo `value`, conservando la selección.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/organizacion-selector.test.js`:

```js
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
```

- [ ] **Step 2: Correr — debe FALLAR**

```bash
cd backend && node --test test/organizacion-selector.test.js
```

Expected: FAIL con "no se encontro quitarAusenteDuplicada en web/app.js".

- [ ] **Step 3: Implementar**

En `web/app.js`, justo antes de la definición del objeto `Org` (buscar `const Org=` o el comentario del módulo de Organización), añadir:

```js
// La opcion inyectada "(cuenta inactiva)" del selector de quien pago
// (Org._opcionAusente) es PROVISIONAL: existe para que el selector pueda
// representar a un pagador que /directorio aun no trajo. Si el directorio
// llega y trae a esa misma persona (gemela real, mismo value), la inyectada
// sobra: su rotulo pasa a ser mentira y el nombre sale dos veces. Se quita
// SIEMPRE que haya gemela -- no solo si esta seleccionada, que era el hueco
// (pendiente 7 de la fuente del gasto) -- conservando la eleccion: si la
// seleccionada era la inyectada, reasignar el mismo value cae en la real.
// Sin gemela no se toca nada: la persona esta inactiva de verdad.
function quitarAusenteDuplicada(sel){
  const ausente=sel.querySelector('option[data-ausente]');
  if(!ausente) return;
  const hayGemela=Array.prototype.some.call(sel.options, o=>o!==ausente && o.value===ausente.value);
  if(!hayGemela) return;
  const valor=sel.value;
  ausente.remove();
  sel.value=valor;
}
```

Y en `Org._llenarQuienPago` (línea ~4826), después del `}catch{ ... }` y antes de `const g=Org._gastoEditando ...`:

```js
    // El directorio acaba de llegar: si trajo a la persona de la opcion
    // inyectada, la inyectada sobra -- se quita conservando la eleccion.
    quitarAusenteDuplicada(sel);
```

- [ ] **Step 4: Correr — debe PASAR, y suite completa**

```bash
cd backend && node --test test/organizacion-selector.test.js && npm test
```

Expected: verde. ⚠️ El barrido de botones (`botones-reales.test.js`) y el de XSS recorren `web/app.js`: si alguno protesta por la función nueva, leer su mensaje — la función no crea HTML ni maneja clics, no debería rozarlos.

- [ ] **Step 5: Commit**

```bash
git add web/app.js backend/test/organizacion-selector.test.js
git commit -m "fix(organizacion): la opcion '(cuenta inactiva)' se retira al llegar su gemela real

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: ESTADO.md al día

**Files:**
- Modify: `ESTADO.md` — sección nueva del 5-ago (tarde) + tachar los pendientes que esta rama cierra

**Interfaces:** ninguna.

- [ ] **Step 1: Escribir la sección nueva**

Añadir bajo la cabecera de `ESTADO.md` (después de la sección "5 DE AGOSTO — botones") una sección `## 🆕 5 DE AGOSTO DE 2026 · TARDE — 🧹 pulido de agosto: cinco cabos chicos` que cuente, en el estilo del documento:

- Puertos de test dinámicos (`test/puerto-libre.js`); el fallo falso de hoy explicado.
- Fuera `recurso` (siempre vacía) y `POST /api/dispositivo`; `dispositivo_push` se queda y por qué.
- El punto de sin-leer en rojo — y la corrección honesta: **el pendiente 5 (aria-label) estaba desfasado, ya lo había cerrado la reescritura del 3-ago**; lo que faltaba era solo el color (pendiente 6) y el candado del color.
- Tema de una entrada suelto (decisión del dueño).
- El rótulo "(cuenta inactiva)" reconciliado siempre (cierra el pendiente 7 de la fuente del gasto).
- Suite: el número que dé `npm test` al terminar, con la nota de siempre de que caduca.

- [ ] **Step 2: Tachar los pendientes cerrados**

En la sección del menú (31-jul), pendientes 5 y 6: tacharlos con `~~...~~` y la nota `**(desfasado/resuelto el 5-ago:** ver la sección de esa fecha**)**` — en el pendiente 5 decir expresamente que ya estaba hecho desde el 3-ago y nadie lo tachó. En el pendiente 7 (grupo de uno), lo mismo. En los pendientes de la fuente del gasto (sección "POR DÓNDE RETOMAR", punto 2), tachar el 7 (rótulo falso). En "Huecos verificados" del 30-jul, tachar la línea del puerto 3941 y la de las tablas sin usar (con el matiz: `dispositivo_push` sigue, pero su endpoint ya no).

- [ ] **Step 3: Suite y commit**

```bash
cd backend && npm test
```

```bash
git add ESTADO.md
git commit -m "docs(estado): pulido de agosto -- cinco cabos cerrados y dos pendientes que ya estaban viejos

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura de la spec:** puertos → Task 1 · limpieza → Task 2 · punto rojo → Task 3 · grupo de uno → Task 4 · rótulo → Task 5 · documentación → Task 6. El aria-label de la spec quedó corregido en la spec misma (ya existía).
- **Consistencia:** `puertoLibre()` se define en Task 1 y se consume en Task 2; `quitarAusenteDuplicada` se define y se cablea en la misma Task 5; `ejecutarBuildNav` gana el 3er parámetro en la misma Task 4 que lo usa.
- **Números de línea:** válidos al 5-ago sobre `main` (`dac83b9`); si el archivo se movió, buscar por el texto citado.
