# Cabos de agosto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los tres cabos verificados: un gasto nuevo no se atribuye a cuentas inactivas; corregir un nombre avisa dónde sigue escrito el viejo; corregir un gasto que otro ya cambió da 409 en vez de pisarlo.

**Architecture:** Todo vive en rutas existentes (`organizacion.js`, `directorio.js`, `admin.js`) más un módulo nuevo chico (`apariciones-nombre.js`). El frontend gana un `modalAviso()` y una instantánea `Org._visto`. Sin cambios de esquema de base de datos.

**Tech Stack:** Node + Express + better-sqlite3, zod 4, `node:test`. Frontend vanilla (`web/app.js`), cero dependencias externas.

**Spec:** `docs/superpowers/specs/2026-08-07-cabos-agosto-design.md`

## Global Constraints

- Suite de referencia al partir: **721 tests** (`cd backend && npm test`). Cada tarea termina con la suite entera en verde, no solo el archivo nuevo.
- Mensajes de error **en castellano y sin jerga** (nada de nombres de campos técnicos; ver `validar()` en `seguridad.js`).
- Los barridos XSS (`xss-cuerpo.test.js`, `xss-manejadores.test.js`, `botones-reales.test.js`) corren sobre el fuente de `web/app.js`: todo HTML nuevo va en formas demostrables — `escHtml(...)` sobre datos, `Number(...)` sobre contadores, `map(...).join()` inline con flecha-template.
- Commits en el estilo del repo: `feat(modulo): …` / `docs: …`, en castellano.
- Trabajo en la rama `feat/cabos-agosto`; merge `--no-ff` a `main` al final. **NO hacer `git push`** (eso lo hace Pablo con GitHub Desktop).
- Los tests que arrancan servidor usan el patrón de `organizacion-fuente-gasto.test.js` (puerto 0, `signToken`, `cargarDb()` de `helpers.js`). No usar `with_server.py`.

---

### Task 1: Cabo 1 — el gasto exige persona activa (backend)

**Files:**
- Modify: `backend/src/organizacion.js` (POST `/:id/gastos` ~línea 408-415; PATCH `/gastos/:gastoId` ~línea 470-473)
- Test: `backend/test/organizacion-gasto-activo.test.js` (nuevo)

**Interfaces:**
- Produces: mensajes 400 — alta: `'Esa persona no esta en tu iglesia o su cuenta esta inactiva'`; corrección con cambio de pagador a inactiva: el mismo texto. La corrección que NO cambia el pagador no valida `activo` (los gastos históricos de gente dada de baja se corrigen igual).

- [x] **Step 1: Crear la rama**

```bash
git checkout -b feat/cabos-agosto
```

- [x] **Step 2: Escribir los tests que fallan**

Crear `backend/test/organizacion-gasto-activo.test.js`:

```js
// ============================================================
//  Cabo 1 (agosto): un gasto no se atribuye a una cuenta inactiva.
//  Alta: la persona debe estar activa. Correccion: solo se exige si el
//  pagador CAMBIA — el gasto historico de alguien que se dio de baja se
//  corrige (concepto/monto) sin tocar su atribucion.
//  Spec: docs/superpowers/specs/2026-08-07-cabos-agosto-design.md
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';
import { signToken } from '../src/auth.js';

let db;
before(async () => { db = await cargarDb(); });

let base, srv;
async function servidor() {
  if (srv) return base;
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  return base;
}
after(() => srv && new Promise(r => srv.close(r)));

function tok(personaId, iglesiaId) { return signToken({ id: personaId, iglesia_id: iglesiaId }); }

function sembrar(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const nueva = (usuario, nombre, activo = 1) => Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,'x',0,?)"
  ).run(iglesiaId, usuario + '_' + codigo, nombre, activo).lastInsertRowid);
  const liderId = nueva('lid', 'Lider');
  const activaId = nueva('act', 'Ana Activa');
  const inactivaId = nueva('ina', 'Ines Inactiva', 0);
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(liderId, Number(g.lastInsertRowid));
  return { iglesiaId, liderId, activaId, inactivaId };
}

async function hoja(b, S) {
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  const res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Almuerzo' }) });
  return { hojaId: (await res.json()).id, auth };
}

test('alta: un gasto nuevo NO se puede atribuir a una cuenta inactiva', async () => {
  const b = await servidor();
  const S = sembrar('GA1');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ concepto: 'Pan', monto: 3000, fuente: 'devuelve', pagado_por: S.inactivaId })
  });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /inactiva/, 'el mensaje debe decir que la cuenta esta inactiva');
});

test('correccion: tocar solo el monto de un gasto cuyo pagador se dio de baja sigue funcionando', async () => {
  const b = await servidor();
  const S = sembrar('GA2');
  const { hojaId, auth } = await hoja(b, S);
  // El gasto nace cuando Ana estaba activa…
  const alta = await fetch(b + `/api/organizacion/${hojaId}/gastos`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ concepto: 'Carne', monto: 20000, fuente: 'devuelve', pagado_por: S.activaId })
  });
  const { id } = await alta.json();
  // …y despues Ana se da de baja.
  db.prepare('UPDATE persona SET activo = 0 WHERE id = ?').run(S.activaId);
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 25000 })
  });
  assert.equal(res.status, 200, 'corregir el monto no obliga a quitarle la atribucion a quien se fue');
  const fila = db.prepare('SELECT monto, pagado_por FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.monto, 25000);
  assert.equal(fila.pagado_por, S.activaId, 'la atribucion historica se conserva');
});

test('correccion: CAMBIAR el pagador a una cuenta inactiva se rechaza con 400', async () => {
  const b = await servidor();
  const S = sembrar('GA3');
  const { hojaId, auth } = await hoja(b, S);
  const alta = await fetch(b + `/api/organizacion/${hojaId}/gastos`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ concepto: 'Bebidas', monto: 8000, fuente: 'devuelve', pagado_por: S.activaId })
  });
  const { id } = await alta.json();
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ fuente: 'devuelve', pagado_por: S.inactivaId })
  });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /inactiva/);
  assert.equal(db.prepare('SELECT pagado_por FROM evento_org_gasto WHERE id = ?').get(id).pagado_por, S.activaId);
});
```

- [x] **Step 3: Verificar que fallan**

```bash
cd backend && node --test test/organizacion-gasto-activo.test.js
```
Esperado: el test 1 y el 3 FALLAN (hoy responden 200); el test 2 pasa (fija el comportamiento que debe conservarse).

- [x] **Step 4: Implementación mínima**

En `backend/src/organizacion.js`, **POST** (~línea 410), cambiar la consulta de validación:

```js
  if (quienPago != null) {
    // Solo gente de la misma iglesia Y activa: atribuirle un pago a un tercero
    // de otra congregacion no significa nada, y a una cuenta dada de baja
    // tampoco — un gasto NUEVO no puede nacer a nombre de quien ya no esta
    // (el responsable de la hoja exige lo mismo, linea ~342).
    const p = db.prepare('SELECT id FROM persona WHERE id = ? AND iglesia_id = ? AND activo = 1')
      .get(quienPago, req.user.iglesia_id);
    if (!p) return res.status(400).json({ error: 'Esa persona no esta en tu iglesia o su cuenta esta inactiva' });
  }
```

En el **PATCH** (~línea 470), reemplazar el bloque de validación:

```js
  if (pagadoPor != null) {
    const p = db.prepare('SELECT id, activo FROM persona WHERE id = ? AND iglesia_id = ?')
      .get(pagadoPor, req.user.iglesia_id);
    if (!p) return res.status(400).json({ error: 'Esa persona no esta en tu iglesia' });
    // Activa solo se exige si la atribucion CAMBIA: el gasto historico de
    // alguien que se dio de baja tiene que poder corregir su concepto o su
    // monto sin que la app obligue a quitarle la atribucion (misma filosofia
    // del PATCH parcial que gobierna fuente/pagado_por).
    if (pagadoPor !== gasto.pagado_por && !p.activo)
      return res.status(400).json({ error: 'Esa persona no esta en tu iglesia o su cuenta esta inactiva' });
  }
```

- [x] **Step 5: Verificar que pasan y la suite entera sigue verde**

```bash
cd backend && node --test test/organizacion-gasto-activo.test.js && npm test
```
Esperado: 3/3 del archivo nuevo, y la suite completa en verde (721 + 3).

- [x] **Step 6: Commit**

```bash
git add backend/src/organizacion.js backend/test/organizacion-gasto-activo.test.js
git commit -m "feat(organizacion): un gasto nuevo no se atribuye a una cuenta inactiva"
```

---

### Task 2: Cabo 2 — buscador de apariciones + aviso en "Mi perfil" (backend)

**Files:**
- Create: `backend/src/apariciones-nombre.js`
- Modify: `backend/src/directorio.js` (PATCH `/perfil`, bloque `if (cambioNombre)` ~línea 149-155)
- Test: `backend/test/corregir-nombre-apariciones.test.js` (nuevo)

**Interfaces:**
- Produces: `aparicionesDeNombre(nombreViejo, iglesiaId)` → `{ ninos: [{id, nombre}], predicas: number }` (predicas suma `predica.predicador` y `sermon.predicador`). El PATCH `/perfil` responde `{ ok: true, apariciones: { ninos: <número>, predicas: <número> } }` **solo cuando el nombre cambió** — al autoservicio le llegan CONTEOS, nunca nombres de niños (Task 3 usa la misma función para el detalle del pastor).

- [x] **Step 1: Escribir los tests que fallan**

Crear `backend/test/corregir-nombre-apariciones.test.js`:

```js
// ============================================================
//  Cabo 2 (agosto): corregir un nombre AVISA donde sigue escrito el viejo
//  (nino.autorizados, predica.predicador, sermon.predicador). La app nunca
//  reescribe un texto libre: busca y avisa. Autoservicio ve CONTEOS (un LIKE
//  con un nombre comun puede casar fichas ajenas); el pastor ve el detalle.
//  Spec: docs/superpowers/specs/2026-08-07-cabos-agosto-design.md
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';
import { signToken } from '../src/auth.js';

let db;
before(async () => { db = await cargarDb(); });

let base, srv;
async function servidor() {
  if (srv) return base;
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  return base;
}
after(() => srv && new Promise(r => srv.close(r)));

function tok(personaId, iglesiaId) { return signToken({ id: personaId, iglesia_id: iglesiaId }); }

function sembrar(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const nueva = (usuario, nombre, pastor = 0) => Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,'x',?,1)"
  ).run(iglesiaId, usuario + '_' + codigo, nombre, pastor).lastInsertRowid);
  return { iglesiaId, pastorId: nueva('pas', 'Pastor', 1), rosaId: nueva('ros', 'Rosa Diaz') };
}

function sembrarRastros(S) {
  db.prepare('INSERT INTO nino (iglesia_id, nombre, autorizados) VALUES (?,?,?)')
    .run(S.iglesiaId, 'Pedrito', 'Rosa Diaz, tia Carmen');
  db.prepare('INSERT INTO predica (iglesia_id, titulo, predicador) VALUES (?,?,?)')
    .run(S.iglesiaId, 'La fe', 'Rosa Diaz');
  db.prepare('INSERT INTO sermon (iglesia_id, titulo, predicador) VALUES (?,?,?)')
    .run(S.iglesiaId, 'Bosquejo', 'Rosa Diaz');
}

test('autoservicio: el PATCH /perfil que cambia el nombre responde CONTEOS, sin nombres de ninos', async () => {
  const b = await servidor();
  const S = sembrar('AP1');
  sembrarRastros(S);
  const res = await fetch(b + '/api/directorio/perfil', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.rosaId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Rosa Diaz Perez' })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.apariciones, { ninos: 1, predicas: 2 },
    'un nino la autoriza y su nombre esta en una predica y un sermon');
  assert.equal(typeof data.apariciones.ninos, 'number', 'al autoservicio NUNCA le llegan fichas, solo numeros');
});

test('autoservicio: sin rastros, los conteos van en cero (el aviso no inventa nada)', async () => {
  const b = await servidor();
  const S = sembrar('AP2');
  const res = await fetch(b + '/api/directorio/perfil', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.rosaId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Rosa Cambiada' })
  });
  assert.deepEqual((await res.json()).apariciones, { ninos: 0, predicas: 0 });
});

test('reenviar el MISMO nombre no busca nada: la respuesta no trae apariciones', async () => {
  const b = await servidor();
  const S = sembrar('AP3');
  sembrarRastros(S);
  const res = await fetch(b + '/api/directorio/perfil', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.rosaId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Rosa Diaz' })
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).apariciones, undefined,
    '"Mi perfil" manda el nombre en cada guardado; sin cambio real no hay aviso');
});

test('acotado por iglesia: el nino de OTRA congregacion no aparece en el conteo', async () => {
  const b = await servidor();
  const S = sembrar('AP4');
  const Otra = sembrar('AP4B');
  db.prepare('INSERT INTO nino (iglesia_id, nombre, autorizados) VALUES (?,?,?)')
    .run(Otra.iglesiaId, 'Ajeno', 'Rosa Diaz');
  const res = await fetch(b + '/api/directorio/perfil', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.rosaId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Rosa Distinta' })
  });
  assert.deepEqual((await res.json()).apariciones, { ninos: 0, predicas: 0 });
});
```

- [x] **Step 2: Verificar que fallan**

```bash
cd backend && node --test test/corregir-nombre-apariciones.test.js
```
Esperado: FALLAN los cuatro con `apariciones` `undefined` (el endpoint hoy responde solo `{ok:true}`).

- [x] **Step 3: Implementación**

Crear `backend/src/apariciones-nombre.js`:

```js
// ============================================================
//  Donde sigue escrito un nombre despues de corregirlo. La correccion de
//  nombre (directorio.js, admin.js) sincroniza la unica copia denormalizada
//  que hay (aprobacion_log.actor_nombre), pero hay TEXTOS LIBRES que pueden
//  nombrar a la persona y que la app no debe reescribir sola: la lista de
//  quien puede retirar a un nino (se mira en la puerta de la sala) y el
//  predicador de una predica o sermon (se ve en el portal). Esta funcion
//  BUSCA y el llamador AVISA; nadie toca esos textos.
//
//  Limite asumido (spec): es un LIKE por texto. "la sra. Juanita" no se
//  encuentra (falso negativo) y un tocayo genera un aviso de mas (falso
//  positivo aceptable: el aviso pide revisar, no afirma). LIKE de SQLite no
//  distingue mayusculas solo en ASCII: "PEREZ" casa, "PÉREZ" no.
// ============================================================
import { db } from './db.js';

export function aparicionesDeNombre(nombreViejo, iglesiaId) {
  const nombre = String(nombreViejo || '').trim();
  if (!nombre) return { ninos: [], predicas: 0 };
  const like = '%' + nombre + '%';
  const ninos = db.prepare(
    'SELECT id, nombre FROM nino WHERE iglesia_id = ? AND autorizados LIKE ?'
  ).all(iglesiaId, like);
  const predicas = db.prepare(
    `SELECT (SELECT COUNT(*) FROM predica WHERE iglesia_id = ? AND predicador LIKE ?)
          + (SELECT COUNT(*) FROM sermon  WHERE iglesia_id = ? AND predicador LIKE ?) AS n`
  ).get(iglesiaId, like, iglesiaId, like).n;
  return { ninos, predicas };
}
```

En `backend/src/directorio.js`: importar arriba `import { aparicionesDeNombre } from './apariciones-nombre.js';` y reemplazar el cierre del PATCH `/perfil`:

```js
  let apariciones = null;
  if (cambioNombre) {
    db.prepare('UPDATE aprobacion_log SET actor_nombre = ? WHERE actor_id = ?')
      .run(req.body.nombre, req.user.persona_id);
    auditar(req.user.iglesia_id, req.user.persona_id, 'corregir_nombre', 'directorio',
      `${nombreViejo} → ${req.body.nombre}`);
    // El aviso del cabo 2: donde sigue escrito el nombre viejo. Al autoservicio
    // le llegan solo CONTEOS — un LIKE con un nombre comun puede casar fichas
    // de ninos ajenas, y eso no es asunto de quien se corrige el nombre.
    const ap = aparicionesDeNombre(nombreViejo, req.user.iglesia_id);
    apariciones = { ninos: ap.ninos.length, predicas: ap.predicas };
  }
  res.json(apariciones ? { ok: true, apariciones } : { ok: true });
```

- [x] **Step 4: Verificar que pasan y la suite sigue verde**

```bash
cd backend && node --test test/corregir-nombre-apariciones.test.js && npm test
```

- [x] **Step 5: Commit**

```bash
git add backend/src/apariciones-nombre.js backend/src/directorio.js backend/test/corregir-nombre-apariciones.test.js
git commit -m "feat(directorio): corregir el nombre avisa donde sigue escrito el viejo (conteos)"
```

---

### Task 3: Cabo 2 — el detalle completo para el pastor (backend)

**Files:**
- Modify: `backend/src/admin.js` (PATCH `/usuarios/:id`, bloque `if (typeof nombre === 'string' && nombre !== p.nombre)` ~línea 207-211 y el `res.json` final ~línea 220)
- Test: `backend/test/corregir-nombre-apariciones.test.js` (ampliar)

**Interfaces:**
- Consumes: `aparicionesDeNombre(nombreViejo, iglesiaId)` de Task 2 (misma firma).
- Produces: PATCH `/api/admin/usuarios/:id` responde `{ ok: true, apariciones: { ninos: [{id, nombre}], predicas: number } }` cuando el nombre cambió — el pastor SÍ ve qué fichas (ya las ve en la app).

- [x] **Step 1: Ampliar el test (falla primero)**

Añadir a `backend/test/corregir-nombre-apariciones.test.js`:

```js
test('asistido: el pastor recibe el DETALLE — que fichas de ninos y cuantas predicas', async () => {
  const b = await servidor();
  const S = sembrar('AP5');
  sembrarRastros(S);
  const res = await fetch(b + `/api/admin/usuarios/${S.rosaId}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Rosa Diaz Perez' })
  });
  assert.equal(res.status, 200);
  const { apariciones } = await res.json();
  assert.equal(apariciones.ninos.length, 1);
  assert.equal(apariciones.ninos[0].nombre, 'Pedrito', 'el pastor ve QUE ficha revisar');
  assert.equal(apariciones.predicas, 2);
});

test('asistido: activar/desactivar sin tocar el nombre no trae apariciones', async () => {
  const b = await servidor();
  const S = sembrar('AP6');
  sembrarRastros(S);
  const res = await fetch(b + `/api/admin/usuarios/${S.rosaId}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ activo: false })
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).apariciones, undefined);
});
```

- [x] **Step 2: Verificar que el primero falla**

```bash
cd backend && node --test test/corregir-nombre-apariciones.test.js
```
Esperado: el test del detalle FALLA (`apariciones` undefined); el de activar/desactivar pasa (fija lo que no debe cambiar).

- [x] **Step 3: Implementación**

En `backend/src/admin.js`: importar `import { aparicionesDeNombre } from './apariciones-nombre.js';` y modificar el bloque del nombre y el cierre:

```js
  let apariciones = null;
  if (typeof nombre === 'string' && nombre !== p.nombre) {
    db.prepare('UPDATE persona SET nombre = ? WHERE id = ?').run(nombre, p.id);
    db.prepare('UPDATE aprobacion_log SET actor_nombre = ? WHERE actor_id = ?').run(nombre, p.id);
    auditar(ig, yo, 'corregir_nombre_usuario', 'admin', `${p.nombre} → ${nombre}`);
    // Cabo 2, version asistida: el pastor recibe el DETALLE (que fichas, ya
    // las ve en la app) para corregir a mano donde corresponda.
    apariciones = aparicionesDeNombre(p.nombre, ig);
  }
```
(el `if` de `editar_usuario` de abajo queda igual) y el final:

```js
  res.json(apariciones ? { ok: true, apariciones } : { ok: true });
```

- [x] **Step 4: Verificar que pasan y la suite sigue verde**

```bash
cd backend && node --test test/corregir-nombre-apariciones.test.js && npm test
```

- [x] **Step 5: Commit**

```bash
git add backend/src/admin.js backend/test/corregir-nombre-apariciones.test.js
git commit -m "feat(admin): corregir un nombre le dice al pastor que fichas revisar"
```

---

### Task 4: Cabo 2 — los avisos en pantalla (frontend)

**Files:**
- Modify: `web/app.js` — `guardarPerfil` (~línea 3784), `adminCorregirNombre` (~línea 4162), y un `modalAviso()` nuevo junto a `modalConfirm` (~línea 3805)

**Interfaces:**
- Consumes: `apariciones` de las respuestas de Task 2 (conteos) y Task 3 (detalle). `cerrarModal()`, `escHtml()`, `toast()` existentes.
- Produces: `modalAviso(msg, titulo)` — modal informativo con un solo botón "Entendido". **Convención de la casa:** `msg` llega YA escapado por el llamador (igual que `modalConfirm`, que mete el mensaje crudo en `innerHTML`).

No hay banco de pruebas de navegador: el candado automático son los barridos XSS y de botones sobre el fuente, que corren en la suite. La verificación visual queda para Pablo (Task 7).

- [x] **Step 1: Implementar `modalAviso`**

Junto a `modalConfirm` en `web/app.js`:

```js
// Informativo puro: un solo boton. msg llega YA escapado por el llamador
// (misma convencion que modalConfirm). Existe porque toast() dura 2.8s y hay
// avisos que la persona necesita LEER (donde sigue escrito su nombre viejo).
function modalAviso(msg, titulo){
  const root=$('modal-root');
  root.innerHTML=`<div class="modal-bg"><div class="modal"><h3>${escHtml(titulo||'Aviso')}</h3>
    <p class="muted" style="margin:8px 0 16px">${msg}</p>
    <div class="row"><button class="btn" onclick="cerrarModal()">Entendido</button></div></div></div>`;
  root.classList.add('show');
}
```

- [x] **Step 2: Aviso en "Mi perfil" (conteos)**

En `guardarPerfil`, capturar la respuesta y avisar tras el toast:

```js
      const resp = await api('/directorio/perfil',{method:'PATCH',body:JSON.stringify(body)});
      if(ME.persona){ ME.persona.nombre=body.nombre; pintarUsuarioLateral(); }
      toast('✅ Perfil actualizado');
      vistaDirectorio();
      // Cabo 2: si el nombre cambio y el viejo sigue escrito en textos libres
      // (lista de retiro de un nino, predicas), avisar. Solo CONTEOS: el
      // backend no manda fichas al autoservicio, a proposito.
      const a=resp&&resp.apariciones;
      if(a&&(a.ninos>0||a.predicas>0)){
        modalAviso(`Tu nombre anterior sigue escrito en ${Number(a.ninos)} ficha(s) de niños (lista de quién puede retirarlos) y ${Number(a.predicas)} prédica(s). Pídele a tu maestra o al pastor que lo actualicen donde corresponda.`,'Tu nombre aparece en otros lugares');
      }
```

- [x] **Step 3: Aviso en Administración (detalle)**

En `adminCorregirNombre`, tras el `toast('✅ Nombre corregido'); vistaAdmin();`:

```js
    try{ const resp=await api('/admin/usuarios/'+id,{method:'PATCH',body:JSON.stringify({nombre})});
      if(ME.persona&&ME.persona.id===id){ ME.persona.nombre=nombre; pintarUsuarioLateral(); }
      toast('✅ Nombre corregido'); vistaAdmin();
      // Cabo 2, detalle para el pastor: que fichas siguen diciendo el nombre
      // viejo. La app no reescribe textos libres; el pastor corrige a mano.
      const a=resp&&resp.apariciones;
      if(a&&(a.ninos.length||a.predicas>0)){
        const partes=[];
        if(a.ninos.length) partes.push(a.ninos.map(n=>`la ficha de <b>${escHtml(n.nombre)}</b> (autorizados para retirarlo)`).join(', '));
        if(a.predicas>0) partes.push(`${Number(a.predicas)} prédica(s)`);
        modalAviso(`El nombre anterior sigue escrito en: ${partes.join(' y ')}. Corrígelo a mano donde corresponda.`,'El nombre viejo sigue escrito');
      } }
    catch(e){ toast(e.message); }
```

- [x] **Step 4: Correr la suite entera (los barridos XSS son el candado del frontend)**

```bash
cd backend && npm test
```
Esperado: verde. Si `xss-cuerpo.test.js` rechaza alguna interpolación nueva, reescribirla en las formas demostrables (escHtml/Number/map-join inline) — NO añadir excepciones.

- [x] **Step 5: Commit**

```bash
git add web/app.js
git commit -m "feat(web): avisos de donde sigue escrito un nombre corregido"
```

---

### Task 5: Cabo 3 — el PATCH del gasto compara lo visto y da 409 (backend)

**Files:**
- Modify: `backend/src/organizacion.js` — `editarGastoSchema` (~línea 424) y el PATCH `/gastos/:gastoId` (justo tras obtener `gasto` y `org`, ~línea 448)
- Test: `backend/test/organizacion-gasto-visto.test.js` (nuevo)

**Interfaces:**
- Produces: el PATCH acepta `visto` **opcional**: `{ concepto: string, monto: number, fuente: 'caja'|'devuelve'|'aporte'|null, pagado_por: number|null }`. Si viene y difiere de la fila guardada → **409** `{ error: 'Alguien cambió este gasto mientras lo mirabas — recarga la hoja' }` sin aplicar nada. Sin `visto`, el PATCH funciona como hoy (compatibilidad con un `app.js` viejo).

- [x] **Step 1: Escribir los tests que fallan**

Crear `backend/test/organizacion-gasto-visto.test.js` (mismo arnés `servidor()`/`tok()`/`sembrar()`/`hoja()` que `organizacion-gasto-activo.test.js` de Task 1 — copiarlo, es la convención del directorio):

```js
// ============================================================
//  Cabo 3 (agosto): la hoja no se pisa. El PATCH del gasto acepta `visto`
//  (lo que la pantalla mostraba al abrir el ✏️); si ya no coincide con lo
//  guardado, otro lo cambio en el medio: 409 y no se aplica nada. Sin
//  `visto` (cliente viejo) todo sigue como hoy.
//  Spec: docs/superpowers/specs/2026-08-07-cabos-agosto-design.md
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';
import { signToken } from '../src/auth.js';

let db;
before(async () => { db = await cargarDb(); });

let base, srv;
async function servidor() {
  if (srv) return base;
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  return base;
}
after(() => srv && new Promise(r => srv.close(r)));

function tok(personaId, iglesiaId) { return signToken({ id: personaId, iglesia_id: iglesiaId }); }

function sembrar(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const nueva = (usuario, nombre) => Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,'x',0,1)"
  ).run(iglesiaId, usuario + '_' + codigo, nombre).lastInsertRowid);
  const liderId = nueva('lid', 'Lider');
  const anaId = nueva('ana', 'Ana');
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(liderId, Number(g.lastInsertRowid));
  return { iglesiaId, liderId, anaId };
}

async function hoja(b, S) {
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  const res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Almuerzo' }) });
  return { hojaId: (await res.json()).id, auth };
}

// Siembra un gasto y devuelve {id, visto} — visto es la instantanea que una
// pantalla recien abierta habria capturado.
async function gastoSembrado(b, S, auth, hojaId) {
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ concepto: 'Carne', monto: 20000, fuente: 'devuelve', pagado_por: S.anaId })
  });
  const { id } = await res.json();
  return { id, visto: { concepto: 'Carne', monto: 20000, fuente: 'devuelve', pagado_por: S.anaId } };
}

test('el pisoton da 409 y la fila queda como la dejo el otro', async () => {
  const b = await servidor();
  const S = sembrar('VI1');
  const { hojaId, auth } = await hoja(b, S);
  const { id, visto } = await gastoSembrado(b, S, auth, hojaId);
  // B corrige el monto mientras A tiene el ✏️ abierto…
  await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 22000 }) });
  // …y A guarda con la instantanea vieja.
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ concepto: 'Carne asada', visto })
  });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /recarga la hoja/);
  const fila = db.prepare('SELECT concepto, monto FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.concepto, 'Carne', 'no se aplico nada de A');
  assert.equal(fila.monto, 22000, 'lo de B sigue intacto');
});

test('con la instantanea fresca (tras recargar) el PATCH pasa', async () => {
  const b = await servidor();
  const S = sembrar('VI2');
  const { hojaId, auth } = await hoja(b, S);
  const { id, visto } = await gastoSembrado(b, S, auth, hojaId);
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ concepto: 'Carne asada', visto })
  });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT concepto FROM evento_org_gasto WHERE id = ?').get(id).concepto, 'Carne asada');
});

test('sin visto (cliente viejo) el PATCH sigue funcionando como hoy', async () => {
  const b = await servidor();
  const S = sembrar('VI3');
  const { hojaId, auth } = await hoja(b, S);
  const { id } = await gastoSembrado(b, S, auth, hojaId);
  await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 22000 }) });
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ concepto: 'Carne asada' })
  });
  assert.equal(res.status, 200, 'compatibilidad: backend y frontend pueden no llegar juntos');
});

test('el NULL tambien es un valor: pasar a "lo pago la caja" (fuente y pagador en null) se detecta', async () => {
  const b = await servidor();
  const S = sembrar('VI4');
  const { hojaId, auth } = await hoja(b, S);
  // Gasto sin fuente: el POST por defecto lo atribuye a quien lo registra
  // (el lider), asi que la instantanea fiel lleva fuente null y ESE pagador.
  const alta = await fetch(b + `/api/organizacion/${hojaId}/gastos`, {
    method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 3000 })
  });
  const { id } = await alta.json();
  const visto = { concepto: 'Pan', monto: 3000, fuente: null, pagado_por: S.liderId };
  // Control: con la instantanea fiel, corregir pasa (demuestra que el 409 de
  // abajo no sale de una instantanea mal sembrada).
  const ok = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 3500, visto })
  });
  assert.equal(ok.status, 200);
  const visto2 = { ...visto, monto: 3500 };
  // B lo pasa a "lo pago la caja" (fuente 'caja' y pagador null)…
  await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'caja' })
  });
  // …y A guarda con su instantanea de antes: fuente null vs 'caja' y pagador
  // vs null difieren — 409.
  const res = await fetch(b + `/api/organizacion/gastos/${id}`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ concepto: 'Pan integral', visto: visto2 })
  });
  assert.equal(res.status, 409);
});
```

- [x] **Step 2: Verificar que fallan**

```bash
cd backend && node --test test/organizacion-gasto-visto.test.js
```
Esperado: FALLAN los tests 1 y 4 (hoy `visto` se descarta en silencio por zod y el PATCH pisa con 200); el 2 y el 3 pasan (fijan compatibilidad).

- [x] **Step 3: Implementación**

En `backend/src/organizacion.js`, añadir a `editarGastoSchema`:

```js
  // Cabo 3: la instantanea de lo que la pantalla mostraba al abrir el ✏️.
  // Opcional a proposito: un app.js viejo no la manda y el PATCH sigue
  // funcionando (backend y frontend pueden no desplegarse juntos). Sin
  // coerce: la construye nuestro propio codigo, no un formulario.
  visto: z.object({
    concepto: z.string(),
    monto: z.number(),
    fuente: z.enum(FUENTES_GASTO).nullable(),
    pagado_por: z.number().int().nullable()
  }).optional()
```

Y en la ruta, justo después de `const org = hojaEditable(req, res, gasto.org_id); if (!org) return;`:

```js
  // Cabo 3: si la pantalla mando lo que estaba viendo y ya no coincide con lo
  // guardado, otro corrigio este gasto en el medio (la hoja queda abierta
  // durante todo el almuerzo). No se aplica nada: 409 y a recargar. NULL es un
  // valor mas ("no se sabe quien puso" tambien se puede pisar).
  const visto = req.body.visto;
  if (visto && (visto.concepto !== gasto.concepto
             || visto.monto !== gasto.monto
             || visto.fuente !== gasto.fuente
             || visto.pagado_por !== gasto.pagado_por))
    return res.status(409).json({ error: 'Alguien cambió este gasto mientras lo mirabas — recarga la hoja' });
```

- [x] **Step 4: Verificar que pasan y la suite sigue verde**

```bash
cd backend && node --test test/organizacion-gasto-visto.test.js && npm test
```

- [x] **Step 5: Commit**

```bash
git add backend/src/organizacion.js backend/test/organizacion-gasto-visto.test.js
git commit -m "feat(organizacion): corregir un gasto que otro ya cambio da 409, no lo pisa"
```

---

### Task 6: Cabo 3 — la pantalla manda lo visto y reacciona al 409 (frontend)

**Files:**
- Modify: `web/app.js` — `api()` (~línea 150), `Org.editarGasto` (~línea 5414), `Org.guardarGasto` (~línea 5478-5495), `Org.cancelarEdicionGasto` (~línea 5437), y la declaración `_gastoEditando:null` (~línea 5393)

**Interfaces:**
- Consumes: el `visto` opcional y el 409 de Task 5.
- Produces: `api()` adjunta `err.status` (número) a todo error HTTP que lanza — disponible para cualquier manejador futuro. `Org._visto` (instantánea o `null`).

- [x] **Step 1: `api()` adjunta el status al error**

En `web/app.js`, en `api()`, reemplazar la línea `if(!r.ok) throw new Error(...)`:

```js
    if(!r.ok){
      // El status viaja en el error: hay manejadores que necesitan distinguir
      // un 409 ("recarga y reintenta") de cualquier otro fallo (cabo 3).
      const err=new Error(data.error||'No se pudo completar la acción. Inténtalo otra vez.');
      err.status=r.status;
      throw err;
    }
```

- [x] **Step 2: capturar la instantánea al abrir el ✏️**

En `Org`, junto a `_gastoEditando:null`, añadir `_visto:null,`. En `editarGasto(id)`, tras `Org._origenTocado=false;`:

```js
    // Cabo 3: lo que la pantalla esta mostrando AHORA, para que el backend
    // detecte si otro lo cambia mientras el ✏️ esta abierto. Se captura de la
    // fila (la misma verdad que pinta el formulario), no del DOM.
    Org._visto={concepto:g.concepto, monto:g.monto, fuente:g.fuente??null, pagado_por:g.pagado_por??null};
```

Y en `cancelarEdicionGasto()`, junto a `Org._gastoEditando=null;`, añadir `Org._visto=null;`.

- [x] **Step 3: mandarla en el PATCH y reaccionar al 409**

En `guardarGasto`, tras construir `cuerpo` (después del bloque `if((!id || Org._origenTocado)…)`):

```js
    if(id && Org._visto) cuerpo.visto=Org._visto;
```

Y el `catch` del `conBoton` pasa a distinguir el 409:

```js
      }catch(e){
        if(e&&e.status===409){
          // Otro corrigio este gasto con el ✏️ abierto. No se fusiona nada:
          // se cierra la edicion y se recarga la hoja para mirar lo nuevo.
          toast((e&&e.message)||'Recarga la hoja');
          Org.cancelarEdicionGasto();
          Org._recargar();
          return;
        }
        toast((e&&e.message)||'No se pudo guardar');
      }
```

- [x] **Step 4: Correr la suite entera**

```bash
cd backend && npm test
```
Esperado: verde (los barridos XSS/manejadores validan el fuente nuevo).

- [x] **Step 5: Commit**

```bash
git add web/app.js
git commit -m "feat(web): el ✏️ del gasto manda lo visto y ante un 409 recarga la hoja"
```

---

### Task 7: Cierre — suite, ESTADO.md, merge

**Files:**
- Modify: `ESTADO.md` (nueva sección arriba + actualizar "POR DÓNDE RETOMAR")
- Modify: `docs/superpowers/plans/2026-08-07-cabos-agosto.md` (casillas marcadas)

- [x] **Step 1: Suite completa y medirla**

```bash
cd backend && npm test
```
Esperado: verde. Anotar el número total (721 + los nuevos; el número exacto se mide aquí, no se repite de memoria).

- [x] **Step 2: Actualizar ESTADO.md**

Nueva sección arriba del todo con: qué cerró cada cabo, la decisión "avisar, nunca reescribir", el detalle de privacidad (autoservicio ve conteos), la compatibilidad del `visto` opcional, y la **verificación manual pendiente de Pablo**: como `raquel`, intentar anotar un gasto a nombre de una cuenta inactiva (se niega); corregir su propio nombre y leer el aviso; abrir el mismo gasto en dos pestañas, guardar en una y ver el aviso de "recarga la hoja" en la otra. Actualizar la línea de "Última actualización" y la sección "POR DÓNDE RETOMAR".

- [x] **Step 3: Commit de docs**

```bash
git add ESTADO.md docs/superpowers/plans/2026-08-07-cabos-agosto.md
git commit -m "docs: cabos de agosto documentados (ESTADO y plan cerrado)"
```

- [ ] **Step 4: Fusionar a main y borrar la rama** — PENDIENTE: la hace Pablo, no el agente

```bash
git checkout main
git merge --no-ff feat/cabos-agosto -m "Merge feat/cabos-agosto: gasto a persona activa, aviso de nombre, hoja sin pisotones"
git branch -d feat/cabos-agosto
cd backend && npm test
```
Esperado: suite verde SOBRE la fusión. **NO hacer push** — lo hace Pablo con GitHub Desktop.
