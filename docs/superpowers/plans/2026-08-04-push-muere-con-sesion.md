# El push muere con la sesión — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar sesión (o caducar la sesión) corta las notificaciones push de ese dispositivo, cerrando el último hallazgo abierto de la auditoría (push cruzado en dispositivo compartido).

**Architecture:** Todo en el cliente (`web/app.js`), servidor intacto. Un helper único `pushCortarDispositivo()` concentra la baja (servidor + navegador); `salir()` lo espera con timeout de 2 s dentro de un `try/finally` que garantiza el logout; `_sesionCaducada()` lo dispara fire-and-forget (el token ya no autentica). La fila huérfana del servidor la poda el 404/410 que ya existe (`backend/src/push.js:47`).

**Tech Stack:** Vanilla JS (frontend sin framework), tests `node:test` que leen el texto fuente de `web/app.js` (el proyecto no tiene banco de pruebas de navegador).

**Spec:** `docs/superpowers/specs/2026-08-04-push-dispositivo-compartido-design.md` — léela antes de empezar.

## Global Constraints

- Rama de trabajo: `feat/push-muere-con-sesion`, desde `main`.
- Mensajes de commit en castellano, **sin tildes** (convención del repo: `git log --oneline` lo confirma).
- Comentarios y textos de UI en castellano.
- ⚠️ **Todo regex de test que lea `web/app.js` lleva `\r?` antes de cada `\n`** (o usa `[\s\S]`): git materializa ese archivo con finales de línea de Windows (lección documentada en `ESTADO.md`).
- La suite se corre con `cd backend && npm test` (617 tests en verde al partir). El test nuevo, dirigido: `cd backend && node --test test/push-cierre-sesion.test.js`.
- El backend **no se toca**: cualquier tarea que crea necesitar tocar `backend/src/` está malinterpretando el spec.

## File Structure

- **Create:** `backend/test/push-cierre-sesion.test.js` — candados de fuente sobre las tres funciones (una tarea añade sus tests al mismo archivo).
- **Modify:** `web/app.js`:
  - `salir()` (~línea 301) — pasa a async con corte + `finally`.
  - `_sesionCaducada()` (~línea 105) — corte fire-and-forget al principio.
  - Sección push (~líneas 4150-4157): nuevo helper `pushCortarDispositivo()` justo antes de `desactivarPush()`, y `desactivarPush()` reescrito sobre él.
- **Modify (última tarea):** `ESTADO.md` — el hallazgo pasa de "1 abierto" a cerrado.

---

### Task 1: El helper `pushCortarDispositivo()` y `desactivarPush()` sobre él

**Files:**
- Create: `backend/test/push-cierre-sesion.test.js`
- Modify: `web/app.js` (~líneas 4150-4157, funciones `desactivarPush` y vecinas)

**Interfaces:**
- Consumes: `pushSoportado()`, `api()`, `toast()`, `vistaAjustes()` — ya existen en `web/app.js`.
- Produces: `async function pushCortarDispositivo({avisarServidor=true}={})` → `Promise<boolean>` (true si no había nada que cortar o el corte salió bien; false si algo falló). Las tareas 2 y 3 la llaman.

- [ ] **Step 1: Crear la rama**

```bash
git checkout main && git checkout -b feat/push-muere-con-sesion
```

- [ ] **Step 2: Escribir el test que falla**

Crear `backend/test/push-cierre-sesion.test.js`:

```js
// -----------------------------------------------------------------------------
//  El push muere con la sesion (spec 2026-08-04-push-dispositivo-compartido).
//
//  Igual que menu-plegable.test.js, esto lee el TEXTO FUENTE de web/app.js:
//  el proyecto no tiene banco de pruebas de navegador. Regla de la casa:
//  \r? antes de cada \n en los regex, o [\s\S] — el archivo vive con CRLF.
// -----------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'app.js'), 'utf8');

// Recorta el cuerpo de una funcion de nivel superior: desde su cabecera hasta
// la primera llave de cierre en columna 0.
function cuerpoDe(cabecera) {
  const re = new RegExp(cabecera.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?\\r?\\n\\}');
  const m = fuente.match(re);
  assert.ok(m, `no se encontro "${cabecera}" en web/app.js`);
  return m[0];
}

test('la baja del push vive en un solo sitio: pushCortarDispositivo', () => {
  // Si /push/baja se llama desde mas de un punto, la proxima correccion se
  // aplicara en uno y no en el otro — exactamente lo que este helper evita.
  const usos = fuente.match(/\/push\/baja/g) || [];
  assert.equal(usos.length, 1,
    `/push/baja aparece ${usos.length} veces en web/app.js; debe aparecer solo ` +
    'dentro de pushCortarDispositivo()');
  const helper = cuerpoDe('async function pushCortarDispositivo');
  assert.ok(helper.includes('pushSoportado()'),
    'pushCortarDispositivo() no comprueba pushSoportado(): en un navegador viejo reventaria');
  assert.ok(helper.includes('getSubscription'),
    'pushCortarDispositivo() no mira la suscripcion actual');
  assert.ok(helper.includes('avisarServidor'),
    'pushCortarDispositivo() perdio el interruptor avisarServidor: el camino del 401 ' +
    'llamaria al servidor con un token muerto');
  assert.ok(helper.includes('/push/baja'), 'pushCortarDispositivo() ya no da de baja en el servidor');
  assert.ok(helper.includes('unsubscribe()'),
    'pushCortarDispositivo() ya no des-suscribe el navegador: el corte real es ese');
});

test('desactivarPush usa el helper, no su propia copia de la baja', () => {
  const f = cuerpoDe('async function desactivarPush');
  assert.ok(f.includes('pushCortarDispositivo('),
    'desactivarPush() no pasa por pushCortarDispositivo(): dos copias de la baja');
});
```

- [ ] **Step 3: Verificar que falla**

Run: `cd backend && node --test test/push-cierre-sesion.test.js`
Expected: FAIL — `no se encontro "async function pushCortarDispositivo" en web/app.js`.

- [ ] **Step 4: Implementar**

En `web/app.js`, reemplazar la función `desactivarPush()` actual (~línea 4150):

```js
async function desactivarPush(){
  try{
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    if(sub){ await api('/push/baja',{method:'POST',body:JSON.stringify({endpoint:sub.endpoint})}).catch(()=>{}); await sub.unsubscribe(); }
    toast('Notificaciones desactivadas'); vistaAjustes();
  }catch(e){ toast(e.message); }
}
```

por el helper más la versión reescrita:

```js
// Corta el push de ESTE dispositivo: baja en el servidor (si avisarServidor;
// el fallo se traga, porque tras eliminar la cuenta o caducar la sesion el
// token ya no autentica) y siempre des-suscribe el navegador, que es el corte
// real. Nunca lanza: cerrar sesion no puede quedarse a medias por la red.
async function pushCortarDispositivo({avisarServidor=true}={}){
  if(!pushSoportado()) return true;
  try{
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    if(!sub) return true;
    if(avisarServidor) await api('/push/baja',{method:'POST',body:JSON.stringify({endpoint:sub.endpoint})}).catch(()=>{});
    await sub.unsubscribe();
    return true;
  }catch{ return false; }
}
async function desactivarPush(){
  const ok=await pushCortarDispositivo({avisarServidor:true});
  toast(ok?'Notificaciones desactivadas':'No se pudo desactivar. Inténtalo otra vez.');
  vistaAjustes();
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `cd backend && node --test test/push-cierre-sesion.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Suite completa**

Run: `cd backend && npm test`
Expected: todo en verde (617 + 2 nuevos). En particular `xss-interpolaciones-atributo.test.js` y las suites de XSS no deben quejarse: el helper no interpola nada en HTML.

- [ ] **Step 7: Commit**

```bash
git add web/app.js backend/test/push-cierre-sesion.test.js
git commit -m "feat(push): la baja del dispositivo vive en un solo helper"
```

---

### Task 2: `salir()` corta el push antes de irse

**Files:**
- Modify: `web/app.js` (función `salir()`, ~línea 301)
- Test: `backend/test/push-cierre-sesion.test.js` (añadir al final)

**Interfaces:**
- Consumes: `pushCortarDispositivo({avisarServidor:true})` de la Task 1 (async, nunca lanza, devuelve boolean que aquí se ignora).
- Produces: `async function salir()` — misma firma pública; los `onclick="salir()"` de `index.html:113`, `app.js:407` y el `setTimeout(()=>salir(),800)` de `app.js:4348` no cambian.

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `backend/test/push-cierre-sesion.test.js`:

```js
test('salir() corta el push y el logout va en un finally', () => {
  // El corte es cortesia con timeout; borrar el token y recargar es la orden,
  // y el finally garantiza que ocurre aunque la red o el push service fallen.
  const f = cuerpoDe('async function salir');
  assert.ok(f.includes('pushCortarDispositivo('),
    'salir() ya no corta el push: las notificaciones del que se fue seguirian ' +
    'llegando al dispositivo (el hallazgo de la auditoria, reabierto)');
  assert.ok(f.includes('Promise.race'),
    'salir() espera el corte sin timeout: sin red, cerrar sesion se quedaria colgado');
  assert.ok(/finally\s*\{[^}]*localStorage\.removeItem\('token'\)[^}]*location\.reload\(\)[^}]*\}/.test(f),
    'salir() no garantiza el logout en un finally con removeItem + reload');
});
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && node --test test/push-cierre-sesion.test.js`
Expected: FAIL — `no se encontro "async function salir" en web/app.js` (hoy es `function salir()`, síncrona).

- [ ] **Step 3: Implementar**

En `web/app.js` (~línea 301), reemplazar:

```js
function salir(){ localStorage.removeItem('token'); location.reload(); }
```

por:

```js
// Cerrar sesion corta el push de este dispositivo (spec 2026-08-04): sin esto,
// en un dispositivo compartido las notificaciones del que se fue —cuidado
// pastoral incluido— siguen llegando a la vista del siguiente. 2 s de tope:
// cortar es cortesia, cerrar sesion es la orden.
async function salir(){
  try{
    await Promise.race([
      pushCortarDispositivo({avisarServidor:true}),
      new Promise(r=>setTimeout(r,2000))
    ]);
  }finally{
    localStorage.removeItem('token'); location.reload();
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `cd backend && node --test test/push-cierre-sesion.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Suite completa**

Run: `cd backend && npm test`
Expected: todo en verde. Si algún test viejo asertaba la forma síncrona de `salir()`, míralo antes de tocarlo: la forma nueva es la del spec.

- [ ] **Step 6: Commit**

```bash
git add web/app.js backend/test/push-cierre-sesion.test.js
git commit -m "feat(push): cerrar sesion corta las notificaciones de este dispositivo"
```

---

### Task 3: `_sesionCaducada()` también corta, sin servidor

**Files:**
- Modify: `web/app.js` (función `_sesionCaducada()`, ~línea 105)
- Test: `backend/test/push-cierre-sesion.test.js` (añadir al final)

**Interfaces:**
- Consumes: `pushCortarDispositivo({avisarServidor:false})` de la Task 1.
- Produces: nada nuevo — `_sesionCaducada()` conserva su firma y su desduplicación `_avisandoSesion`.

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `backend/test/push-cierre-sesion.test.js`:

```js
test('_sesionCaducada corta el push local antes de su early-return, sin llamar al servidor', () => {
  const f = cuerpoDe('function _sesionCaducada');
  const corte = f.indexOf('pushCortarDispositivo({avisarServidor:false})');
  assert.ok(corte >= 0,
    '_sesionCaducada() no corta el push, o lo corta llamando al servidor con un ' +
    'token que acaba de caducar (avisarServidor debe ser false)');
  assert.ok(!/await\s+pushCortarDispositivo/.test(f),
    '_sesionCaducada() hace await del corte: es fire-and-forget, la funcion es sincrona');
  // 'return;' con punto y coma: busca la sentencia real, no la palabra suelta
  // en un comentario.
  const early = f.indexOf('return;');
  assert.ok(early < 0 || corte < early,
    'el corte esta despues de un return: al arrancar con un token viejo (app aun ' +
    'oculta) el push del dueño anterior quedaria vivo');
});
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && node --test test/push-cierre-sesion.test.js`
Expected: FAIL — `_sesionCaducada() no corta el push...`.

- [ ] **Step 3: Implementar**

En `web/app.js` (~línea 105), añadir la primera línea del cuerpo:

```js
function _sesionCaducada(){
  // El 401 dice que esta sesion ya no es de nadie: se corta el push del
  // dispositivo sin esperar (la recarga de abajo no lo va a esperar) y sin
  // avisar al servidor (este token ya no autentica; la fila huerfana la poda
  // el 404/410 de enviarPush). Va ANTES de la salida temprana del arranque:
  // llegar con un token viejo guardado tambien es una sesion que termino.
  pushCortarDispositivo({avisarServidor:false});
  localStorage.removeItem('token');
  const app=$('app');
  // Si la app todavía no está a la vista, estamos arrancando con un token viejo
  // y no hay nada que interrumpir: cargarApp() enseña el login por su cuenta.
  if(!app || app.classList.contains('hidden')) return;
  if(_avisandoSesion) return;   // varias peticiones a la vez → un solo aviso
  _avisandoSesion=true;
  try{ toast(ERR_SESION); }catch{}
  // Se recarga en vez de solo enseñar el login: media app quedaría pintada
  // detrás con los datos de la sesión anterior.
  setTimeout(()=>location.reload(), 1500);
}
```

(El resto del cuerpo queda idéntico al actual; solo se añaden el comentario y la línea del corte al principio.)

- [ ] **Step 4: Verificar que pasa**

Run: `cd backend && node --test test/push-cierre-sesion.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Suite completa**

Run: `cd backend && npm test`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add web/app.js backend/test/push-cierre-sesion.test.js
git commit -m "feat(push): la sesion caducada tambien corta el push, sin tocar al servidor"
```

---

### Task 4: ESTADO.md al día y cierre de la rama

**Files:**
- Modify: `ESTADO.md` (la cabecera-resumen de la línea ~2, y el párrafo "queda **1 abierto**" de la sección del 4 de agosto, ~líneas 22-23)

**Interfaces:**
- Consumes: nada de código; los tres commits anteriores.
- Produces: el documento de retomar-el-desarrollo dice la verdad: 8/8 hallazgos cerrados.

- [ ] **Step 1: Actualizar ESTADO.md**

En la sección `## 🆕 4 DE AGOSTO DE 2026`, reemplazar el párrafo que dice que queda 1 hallazgo abierto (búscalo por "queda **1 abierto**") por:

```markdown
De los 8 hallazgos de la auditoría **ya no queda ninguno abierto**: el push
cruzado en dispositivo compartido se cerró el mismo 4 de agosto (rama
`feat/push-muere-con-sesion`) — cerrar sesión y la sesión caducada cortan el
push del dispositivo (baja en servidor + des-suscripción del navegador, en un
solo helper `pushCortarDispositivo` en `web/app.js`), con timeout de 2 s para
que el logout nunca se cuelgue. Spec:
`docs/superpowers/specs/2026-08-04-push-dispositivo-compartido-design.md`.
⚠️ **Riesgo residual aceptado:** quien abandona un dispositivo compartido SIN
cerrar sesión sigue filtrando push hasta que otra persona entre (el login del
siguiente reasigna el canal — el `ON CONFLICT` de `push.js:70-72` se queda a
propósito, ahora como mitigación). ⚠️ **Verificación manual pendiente de
Pablo** (no hay banco de pruebas de navegador): activar push como una persona,
cerrar sesión, entrar como otra en el mismo navegador y comprobar con
`/push/probar` que no llega nada del anterior.
⚠️ La nota del 31-jul sobre la fecha de Cuidado pastoral (`verCaso`) **caducó**: se
arregló el 1-ago en `59772ca` junto con aprobaciones y material musical.
```

(La última línea conserva la nota de Cuidado pastoral que ya estaba en ese párrafo.)

Y en la línea-resumen de la cabecera del documento (línea ~2), añadir al paréntesis de "Última actualización" la mención: `el push muere con la sesión, construido en la rama feat/push-muere-con-sesion`.

- [ ] **Step 2: Suite completa una última vez**

Run: `cd backend && npm test`
Expected: todo en verde. Anota el número total: es el que va a citar el merge.

- [ ] **Step 3: Commit**

```bash
git add ESTADO.md
git commit -m "docs(estado): los 8 hallazgos de la auditoria quedan cerrados"
```

- [ ] **Step 4: Fusionar a main**

Convención del repo: merge `--no-ff` con mensaje que resume, y borrar la rama.

```bash
git checkout main
git merge --no-ff feat/push-muere-con-sesion -m "merge: cerrar sesion corta el push del dispositivo -- ultimo hallazgo de la auditoria cerrado"
git branch -d feat/push-muere-con-sesion
```

- [ ] **Step 5: Verificación final**

Run: `cd backend && npm test` y `git log origin/main..main --oneline`
Expected: suite en verde sobre `main`; el log muestra los commits de esta rama pendientes de push (el push a GitHub lo decide Pablo — dispara el redeploy de Render, y este cambio es solo de `web/`, así que puede viajar solo).

> ⏳ **Queda para Pablo, fuera del alcance del agente:** la verificación manual
> con dos sesiones reales descrita en el ESTADO (requiere un navegador con
> push real y las claves VAPID configuradas).
