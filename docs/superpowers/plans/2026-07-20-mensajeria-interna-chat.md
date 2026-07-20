# Mensajería interna (chat) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir chat interno (1:1, por grupo y a medida) a la App de Iglesia, con tiempo real por SSE, adjuntos, leído/no-leídos, "escribiendo…" y moderación del pastor.

**Architecture:** Un router nuevo `mensajes.js` (`/api/mensajes`) sobre el stack actual (Express + `node:sqlite`). El tiempo real es un *hub* SSE en memoria (`sse.js`) desacoplado de la BD; los mensajes viven en 3 tablas nuevas. Cuando un destinatario no está conectado al SSE, se le manda Web Push (reusa `push.js`). El frontend agrega una vista "Mensajes" en `web/app.js` con un único `EventSource`.

**Tech Stack:** Node ≥22.5 (ESM, `node:sqlite` `DatabaseSync`), Express 4, JWT (`jsonwebtoken`), multer (subida ya existente), `web-push`. Pruebas con el runner nativo `node:test` + `node:assert` (sin dependencias nuevas).

## Global Constraints

- **Sin dependencias npm nuevas.** Todo con lo ya instalado o módulos nativos de Node.
- **ESM** (`"type":"module"`): usar `import`/`export`, nunca `require`.
- **BD:** `node:sqlite` `DatabaseSync`; API `db.prepare(sql).get()/.all()/.run()` y `db.exec(sql)`. Tablas nuevas con `CREATE TABLE IF NOT EXISTS` dentro de `db.js`. `PRAGMA foreign_keys = ON` ya está activo.
- **Aislamiento multi-iglesia:** toda consulta filtra por `iglesia_id`. Nunca cruzar iglesias.
- **Auth:** middleware `authMiddleware` deja `req.user = { persona_id, iglesia_id }`. Tokens JWT de 30 días.
- **Permisos:** reutilizar helpers de `auth.js` (`esPastor`, `esLiderOAdmin`, `auditar`, `enviarPush`). No duplicar lógica de roles.
- **Estilo de respuesta:** JSON. Errores `{ error: '...' }` con status 400/401/403/404. El manejador global de `server.js` ya captura excepciones.
- **Límite de mensaje:** 4000 caracteres. **Adjuntos:** por la config de multer existente (10 MB, extensiones seguras) vía `/api/upload`.
- **Los mensajes NO crean notificación en la campana** (`tabla notificacion`). Se avisan por push (offline) y por badge de no-leídos.
- **Idioma:** identificadores y comentarios en español, coherentes con el resto del repo. Sin tildes en nombres de símbolos.

---

## Estructura de archivos

**Crear**
- `backend/src/sse.js` — hub SSE en memoria (registrar conexiones, emitir eventos, saber quién está conectado). Puro, sin BD.
- `backend/src/mensajes.js` — router `/api/mensajes` (conversaciones, mensajes, leído, escribiendo, moderación, stream).
- `backend/test/helpers.js` — utilidades de prueba (BD temporal + siembra mínima).
- `backend/test/mensajes.sse.test.js` — unit test del hub SSE.
- `backend/test/mensajes.permisos.test.js` — unit test de `puedeIniciarChatCon`.
- `backend/test/mensajes.api.test.js` — test de integración de las rutas (boot del app + `fetch`).

**Modificar**
- `backend/src/db.js` — 3 tablas nuevas + índices.
- `backend/src/auth.js` — `verificarToken(token)` y `puedeIniciarChatCon(actorId, destinoId)`.
- `backend/src/server.js` — montar el router; exportar `app` y arrancar `listen` solo si se ejecuta directo (para poder importarlo en tests).
- `backend/src/seed.js` — un par de conversaciones demo.
- `backend/package.json` — script `"test": "node --test test/"`.
- `web/index.html` — ítem de NAV + contenedor de la vista Mensajes.
- `web/app.js` — vista Mensajes + cliente SSE.
- `web/styles.css` — estilos del chat.
- `web/sw.js` — que `notificationclick` del push abra la conversación.
- `app/ESTADO.md` — documentar Fase 6.

## Interfaces (contratos entre tareas)

```
// sse.js
export function registrar(personaId: number, res): () => void   // devuelve fn para desregistrar
export function emitir(personaIds: number[], evento: string, data: object): void
export function estaConectada(personaId: number): boolean

// auth.js
export function verificarToken(token: string): {persona_id, iglesia_id} | null
export function puedeIniciarChatCon(actorId: number, destinoId: number): boolean

// mensajes.js  → export default (Router montado en /api/mensajes)

// test/helpers.js  (fija DB_PATH/JWT_SECRET como efecto de import)
export async function cargarDb(): Promise<db>  // import dinamico de db.js (BD temporal), cacheado
export function reiniciar(db): void            // limpia todas las tablas de test
export function sembrarMinimo(db): {iglesiaId, pastor, lider, miembro1, miembro2, ajeno, grupoId}
```

**Personas de la siembra mínima** (todas en la misma iglesia salvo donde se indique):
- `pastor` — `es_pastor=1`.
- `lider` — rol `admin` del `grupo` (Jóvenes).
- `miembro1`, `miembro2` — rol `miembro` del grupo.
- `ajeno` — feligrés de la iglesia que NO pertenece a ningún grupo.

Cada persona del helper es `{id, usuario, nombre}`.

---

## Task 1: Esquema de BD (tablas + índices)

**Files:**
- Modify: `backend/src/db.js` (añadir dentro del bloque `db.exec(\`...\`)` de tablas, antes del cierre; e índices en el bloque de índices)
- Test: `backend/test/mensajes.api.test.js` (bloque `describe('esquema')`)
- Create: `backend/test/helpers.js`

**Interfaces:**
- Produces: tablas `conversacion`, `conversacion_miembro`, `mensaje` (columnas según spec §2).

- [ ] **Step 1: Crear el helper de pruebas**

`backend/test/helpers.js`:

> **Clave del arnés:** los `import` de ESM se cachean por proceso. Por eso: (1) `helpers.js`
> setea `DB_PATH`/`JWT_SECRET` **como efecto de import** (al tope del módulo), de modo que cualquier
> carga posterior de `db.js` use la BD temporal; (2) `db.js` se carga **una sola vez** por archivo de
> test (dynamic import dentro de `before()`); (3) entre tests se limpia con `reiniciar(db)` y se
> re-siembra, en `beforeEach`. `node --test` corre cada archivo en su propio proceso, así que la BD
> temporal está aislada entre archivos.

```js
// Utilidades de prueba: BD temporal aislada + siembra minima determinista.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Efecto de import: fija una BD temporal unica y el secreto JWT ANTES de que se
// cargue db.js/auth.js (que se importan dinamicamente en los tests, despues de esto).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iglesia-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.JWT_SECRET = 'test-secret';

// Carga db.js (cacheado tras la 1a vez): devuelve el singleton apuntando a la BD temporal.
export async function cargarDb() {
  const mod = await import('../src/db.js');
  return mod.default;
}

// Limpia todas las tablas usadas por los tests (para reusar la misma BD entre tests).
export function reiniciar(db) {
  db.exec('PRAGMA foreign_keys=OFF');
  for (const t of ['mensaje', 'conversacion_miembro', 'conversacion', 'pertenencia', 'grupo', 'persona', 'iglesia'])
    db.exec('DELETE FROM ' + t);
  db.exec('PRAGMA foreign_keys=ON');
}

// Inserta una iglesia con pastor, un grupo (Jovenes) con lider + 2 miembros, y un feligres ajeno.
export function sembrarMinimo(db) {
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Test','TEST')").run();
  const iglesiaId = Number(ig.lastInsertRowid);
  const hash = 'x'; // no se usa: los tests firman el token directo
  const insP = db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,?,1)"
  );
  const persona = (usuario, nombre, esPastor = 0) => {
    const r = insP.run(iglesiaId, usuario, nombre, hash, esPastor);
    return { id: Number(r.lastInsertRowid), usuario, nombre };
  };
  const pastor = persona('pastor', 'Pastor', 1);
  const lider = persona('lider', 'Lider');
  const miembro1 = persona('miembro1', 'Miembro Uno');
  const miembro2 = persona('miembro2', 'Miembro Dos');
  const ajeno = persona('ajeno', 'Feligres Ajeno');

  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  const grupoId = Number(g.lastInsertRowid);
  const insPe = db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)');
  insPe.run(lider.id, grupoId, 'admin');
  insPe.run(miembro1.id, grupoId, 'miembro');
  insPe.run(miembro2.id, grupoId, 'miembro');

  return { iglesiaId, pastor, lider, miembro1, miembro2, ajeno, grupoId };
}
```

- [ ] **Step 2: Escribir el test que falla (tablas existen)**

Crear `backend/test/mensajes.api.test.js` con solo esto por ahora (el arnés de boot se añade en Task 4):

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';   // fija la BD temporal como efecto de import

let db;
before(async () => { db = await cargarDb(); });

test('esquema: existen las tablas del chat', () => {
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  assert.deepEqual(
    cols('conversacion').sort(),
    ['creado_en','creado_por','grupo_id','iglesia_id','id','tipo','titulo'].sort()
  );
  assert.deepEqual(
    cols('conversacion_miembro').sort(),
    ['conversacion_id','persona_id','rol','silenciado','ultimo_leido_mensaje_id'].sort()
  );
  assert.deepEqual(
    cols('mensaje').sort(),
    ['adjunto_tipo','adjunto_url','borrado','conversacion_id','creado_en','id','persona_id','texto'].sort()
  );
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: FAIL — `PRAGMA table_info(conversacion)` devuelve `[]` → `deepEqual` falla.

- [ ] **Step 4: Añadir las tablas en `db.js`**

Dentro del gran `db.exec(\`... \`)` de creación de tablas (junto a `material_musica`, antes del backtick de cierre `\`);`), añadir:

```sql
-- MENSAJERIA (Fase 6): chat 1:1 / por grupo / a medida
CREATE TABLE IF NOT EXISTS conversacion (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  tipo        TEXT NOT NULL,                 -- 'directo' | 'grupo' | 'custom'
  grupo_id    INTEGER REFERENCES grupo(id),  -- solo tipo 'grupo'
  titulo      TEXT,                          -- solo tipo 'custom'
  creado_por  INTEGER REFERENCES persona(id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS conversacion_miembro (
  conversacion_id         INTEGER NOT NULL REFERENCES conversacion(id) ON DELETE CASCADE,
  persona_id              INTEGER NOT NULL REFERENCES persona(id),
  rol                     TEXT NOT NULL DEFAULT 'miembro',  -- 'admin' | 'miembro'
  ultimo_leido_mensaje_id INTEGER,
  silenciado              INTEGER NOT NULL DEFAULT 0,
  UNIQUE(conversacion_id, persona_id)
);
CREATE TABLE IF NOT EXISTS mensaje (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversacion_id INTEGER NOT NULL REFERENCES conversacion(id) ON DELETE CASCADE,
  persona_id      INTEGER NOT NULL REFERENCES persona(id),
  texto           TEXT NOT NULL DEFAULT '',
  adjunto_url     TEXT,
  adjunto_tipo    TEXT,
  borrado         INTEGER NOT NULL DEFAULT 0,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now'))
);
```

En el segundo `db.exec(\`...\`)` (el de índices), añadir antes del cierre:

```sql
CREATE INDEX IF NOT EXISTS idx_conv_iglesia       ON conversacion(iglesia_id);
CREATE INDEX IF NOT EXISTS idx_convmiembro_persona ON conversacion_miembro(persona_id);
CREATE INDEX IF NOT EXISTS idx_mensaje_conv        ON mensaje(conversacion_id, id);
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add backend/src/db.js backend/test/helpers.js backend/test/mensajes.api.test.js
git commit -m "feat(chat): esquema de BD (conversacion, conversacion_miembro, mensaje)"
```

---

## Task 2: Hub SSE (`sse.js`)

**Files:**
- Create: `backend/src/sse.js`
- Create: `backend/test/mensajes.sse.test.js`

**Interfaces:**
- Produces: `registrar(personaId, res) → unregister`, `emitir(personaIds, evento, data)`, `estaConectada(personaId)`.
- Consumes: un objeto tipo `res` con método `.write(string)` (en tests, un doble simple).

- [ ] **Step 1: Escribir el test que falla**

`backend/test/mensajes.sse.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrar, emitir, estaConectada } from '../src/sse.js';

function resFake() {
  return { escrito: [], write(s) { this.escrito.push(s); } };
}

test('emitir escribe el evento SSE a las personas conectadas', () => {
  const a = resFake(), b = resFake();
  registrar(1, a);
  registrar(2, b);
  emitir([1, 2], 'mensaje', { hola: 'mundo' });
  const esperado = 'event: mensaje\ndata: {"hola":"mundo"}\n\n';
  assert.equal(a.escrito.at(-1), esperado);
  assert.equal(b.escrito.at(-1), esperado);
});

test('estaConectada refleja registro y baja', () => {
  const a = resFake();
  const baja = registrar(10, a);
  assert.equal(estaConectada(10), true);
  baja();
  assert.equal(estaConectada(10), false);
});

test('emitir ignora personas no conectadas sin error', () => {
  assert.doesNotThrow(() => emitir([999], 'mensaje', { x: 1 }));
});

test('una persona con 2 conexiones recibe en ambas', () => {
  const a = resFake(), b = resFake();
  registrar(5, a); registrar(5, b);
  emitir([5], 'leido', { c: 1 });
  assert.equal(a.escrito.at(-1), b.escrito.at(-1));
  assert.match(a.escrito.at(-1), /event: leido/);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && node --test test/mensajes.sse.test.js`
Expected: FAIL — no existe `../src/sse.js`.

- [ ] **Step 3: Implementar `sse.js`**

```js
// ============================================================
//  Hub SSE en memoria (Fase 6): entrega en tiempo real.
//  Desacoplado de la BD: solo mapea persona_id -> conexiones abiertas.
//  Best-effort: si la persona no esta conectada, el evento se descarta
//  (el mensaje ya esta en BD y se recupera al abrir la conversacion).
// ============================================================

const conexiones = new Map();  // persona_id -> Set<res>

export function registrar(personaId, res) {
  const pid = Number(personaId);
  if (!conexiones.has(pid)) conexiones.set(pid, new Set());
  conexiones.get(pid).add(res);
  return function baja() {
    const set = conexiones.get(pid);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) conexiones.delete(pid);
  };
}

export function estaConectada(personaId) {
  const set = conexiones.get(Number(personaId));
  return !!(set && set.size);
}

export function emitir(personaIds, evento, data) {
  const payload = `event: ${evento}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const pid of new Set(personaIds.map(Number))) {
    const set = conexiones.get(pid);
    if (!set) continue;
    for (const res of set) {
      try { res.write(payload); } catch { /* conexion muerta: se limpia en 'close' */ }
    }
  }
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend && node --test test/mensajes.sse.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/sse.js backend/test/mensajes.sse.test.js
git commit -m "feat(chat): hub SSE en memoria (registrar/emitir/estaConectada)"
```

---

## Task 3: Permisos y verificación de token en `auth.js`

**Files:**
- Modify: `backend/src/auth.js` (añadir 2 funciones exportadas, cerca de los otros helpers `es*`)
- Create: `backend/test/mensajes.permisos.test.js`

**Interfaces:**
- Consumes: `esPastor`, `esLiderOAdmin` (ya existen); tabla `pertenencia`.
- Produces:
  - `verificarToken(token)` → `{persona_id, iglesia_id}` o `null`.
  - `puedeIniciarChatCon(actorId, destinoId)` → boolean.

**Regla de `puedeIniciarChatCon(actorId, destinoId)`** (misma iglesia siempre):
1. `false` si el destino no existe, es el mismo actor, o es de otra iglesia.
2. `true` si el actor es pastor o líder (`esLiderOAdmin(actorId)`).
3. `true` si el destino es líder/pastor de algún grupo del actor (el feligrés puede escribir a su liderazgo).
4. `true` si actor y destino comparten al menos un grupo.
5. `false` en el resto.

- [ ] **Step 1: Escribir el test que falla**

`backend/test/mensajes.permisos.test.js`:

```js
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, sem, puedeIniciarChatCon, verificarToken, signToken;

before(async () => {
  db = await cargarDb();
  ({ puedeIniciarChatCon, verificarToken, signToken } = await import('../src/auth.js'));
});
beforeEach(() => { reiniciar(db); sem = sembrarMinimo(db); });

test('lider puede iniciar chat con cualquiera de su iglesia', () => {
  assert.equal(puedeIniciarChatCon(sem.lider.id, sem.ajeno.id), true);
  assert.equal(puedeIniciarChatCon(sem.lider.id, sem.miembro1.id), true);
});

test('feligres del grupo puede escribir a su lider y a otro miembro del grupo', () => {
  assert.equal(puedeIniciarChatCon(sem.miembro1.id, sem.lider.id), true);   // a su liderazgo
  assert.equal(puedeIniciarChatCon(sem.miembro1.id, sem.miembro2.id), true); // comparten grupo
});

test('feligres NO puede escribir a alguien con quien no comparte grupo ni es su lider', () => {
  assert.equal(puedeIniciarChatCon(sem.ajeno.id, sem.miembro1.id), false);
});

test('no se puede iniciar chat consigo mismo', () => {
  assert.equal(puedeIniciarChatCon(sem.lider.id, sem.lider.id), false);
});

test('verificarToken devuelve payload valido y null si es basura', () => {
  const t = signToken({ id: sem.lider.id, iglesia_id: sem.iglesiaId });
  assert.equal(verificarToken(t).persona_id, sem.lider.id);
  assert.equal(verificarToken('basura'), null);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && node --test test/mensajes.permisos.test.js`
Expected: FAIL — `puedeIniciarChatCon`/`verificarToken` no exportados.

- [ ] **Step 3: Implementar en `auth.js`**

Añadir cerca de los otros helpers (`esLiderOAdmin`, etc.):

```js
// --- Verifica un JWT crudo (para el stream SSE, que no puede mandar headers) ---
export function verificarToken(token) {
  try { return jwt.verify(token, SECRET); }   // { persona_id, iglesia_id }
  catch { return null; }
}

// --- Puede ACTOR iniciar un chat 1:1 con DESTINO? (misma iglesia) ---
//  lider/pastor -> con cualquiera; feligres -> a su liderazgo o a quien comparte grupo.
export function puedeIniciarChatCon(actorId, destinoId) {
  if (Number(actorId) === Number(destinoId)) return false;
  const actor = db.prepare('SELECT iglesia_id FROM persona WHERE id = ?').get(actorId);
  const destino = db.prepare('SELECT iglesia_id FROM persona WHERE id = ? AND activo = 1').get(destinoId);
  if (!actor || !destino) return false;
  if (actor.iglesia_id !== destino.iglesia_id) return false;
  if (esLiderOAdmin(actorId)) return true;
  // destino es lider/pastor de algun grupo del actor?
  const destinoEsMiLider = db.prepare(
    `SELECT 1 FROM pertenencia pd
       JOIN pertenencia pa ON pa.grupo_id = pd.grupo_id AND pa.persona_id = ?
      WHERE pd.persona_id = ? AND pd.rol IN ('admin','lider_musica','lider_ed') LIMIT 1`
  ).get(actorId, destinoId);
  if (destinoEsMiLider) return true;
  if (esPastor(destinoId)) return true;
  // comparten algun grupo?
  const compartenGrupo = db.prepare(
    `SELECT 1 FROM pertenencia a JOIN pertenencia b ON a.grupo_id = b.grupo_id
      WHERE a.persona_id = ? AND b.persona_id = ? LIMIT 1`
  ).get(actorId, destinoId);
  return !!compartenGrupo;
}
```

> Nota: `signToken` ya está exportado en `auth.js` (lo usa el login); el test lo importa tal cual.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend && node --test test/mensajes.permisos.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth.js backend/test/mensajes.permisos.test.js
git commit -m "feat(chat): verificarToken + puedeIniciarChatCon en auth.js"
```

---

## Task 4: Hacer el `app` importable + montar el router vacío

**Files:**
- Modify: `backend/src/server.js` (exportar `app`; `listen` solo si se ejecuta directo; import + mount de `mensajes.js`)
- Create: `backend/src/mensajes.js` (router base, aún sin rutas)
- Modify: `backend/package.json` (script de test)

**Interfaces:**
- Produces: `export { app }` en `server.js`; `mensajes.js` default = Router montado en `/api/mensajes`.

- [ ] **Step 1: Convertir `mensajes.api.test.js` en el arnés compartido + test de health**

Reemplazar la cabecera del archivo (los `import` + el `before` de Task 1) por este arnés
compartido, que **arranca el app una sola vez** (puerto efímero) y **resetea + re-siembra antes de
cada test**. El test de esquema de Task 1 permanece; el nuevo test de health se agrega.

```js
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, srv, base, signToken, SEM;

before(async () => {
  db = await cargarDb();
  ({ signToken } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));
beforeEach(() => { reiniciar(db); SEM = sembrarMinimo(db); });

// Headers con token de una persona (mint directo, sin pasar por /api/login).
const H = (p) => ({ 'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: SEM.iglesiaId }) });

test('esquema: existen las tablas del chat', () => {
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  assert.deepEqual(cols('conversacion').sort(),
    ['creado_en','creado_por','grupo_id','iglesia_id','id','tipo','titulo'].sort());
  assert.deepEqual(cols('conversacion_miembro').sort(),
    ['conversacion_id','persona_id','rol','silenciado','ultimo_leido_mensaje_id'].sort());
  assert.deepEqual(cols('mensaje').sort(),
    ['adjunto_tipo','adjunto_url','borrado','conversacion_id','creado_en','id','persona_id','texto'].sort());
});

test('el app responde /api/health', async () => {
  const r = await fetch(base + '/api/health');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});
```

> Nota: el test de esquema que Task 1 puso en este archivo queda **absorbido** aquí (ya no hay un
> `before` separado ni el import de solo `cargarDb`). A partir de esta tarea, todos los tests usan el
> `base`, `H` y `SEM` compartidos y NO vuelven a llamar `cargarDb`/boot ni redefinen `H`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: FAIL — `server.js` no exporta `app` (`app` es `undefined`).

- [ ] **Step 3: Crear el router base `mensajes.js`**

```js
// ============================================================
//  Fase 6: Mensajeria interna (chat) — /api/mensajes
//  Conversaciones 1:1 / por grupo / a medida, tiempo real por SSE,
//  adjuntos, leido/no-leidos, "escribiendo...", moderacion del pastor.
// ============================================================
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esPastor, auditar } from './auth.js';
import { enviarPush } from './push.js';
import { emitir, estaConectada } from './sse.js';

const r = Router();

// (las rutas se agregan en las tareas siguientes)

export default r;
```

- [ ] **Step 4: Modificar `server.js`**

Añadir el import junto a los otros routers (tras `import adminRouter`):

```js
import mensajesRouter from './mensajes.js';
```

Montar el router junto a los demás `app.use('/api/...')`:

```js
app.use('/api/mensajes', mensajesRouter);
```

Reemplazar el bloque final de arranque:

```js
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[server] API escuchando en el puerto ${PORT}`);
});
```

por (arranca solo al ejecutarse directo; en tests se importa sin escuchar en 3000):

```js
const PORT = process.env.PORT || 3000;
const ejecutadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ejecutadoDirecto) {
  app.listen(PORT, () => console.log(`[server] API escuchando en el puerto ${PORT}`));
}

export { app };
```

Y añadir el import necesario arriba (junto a `fileURLToPath`):

```js
import { fileURLToPath, pathToFileURL } from 'node:url';
```

(reemplaza el `import { fileURLToPath } from 'node:url';` existente).

> El bloque de auto-seed (`SEED_ON_EMPTY`) queda tal cual, arriba de esto.

- [ ] **Step 5: Añadir el script de test en `package.json`**

En `"scripts"` añadir:

```json
"test": "node --test test/"
```

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: PASS (2 tests: esquema + health).

- [ ] **Step 7: Commit**

```bash
git add backend/src/server.js backend/src/mensajes.js backend/package.json backend/test/mensajes.api.test.js
git commit -m "feat(chat): app importable + montar router /api/mensajes (base)"
```

---

## Task 5: Iniciar 1:1, enviar y listar mensajes

**Files:**
- Modify: `backend/src/mensajes.js` (helpers internos + rutas `/directo`, `POST /conversacion/:id`, `GET /conversacion/:id`)
- Test: `backend/test/mensajes.api.test.js`

**Interfaces:**
- Consumes: `puedeIniciarChatCon` (Task 3), `emitir`/`estaConectada` (Task 2), `enviarPush`.
- Produces (respuestas JSON):
  - `POST /api/mensajes/directo {persona_id}` → `{ id, tipo:'directo' }` (id de conversación).
  - `POST /api/mensajes/conversacion/:id {texto, adjunto_url?, adjunto_tipo?}` → `{ ok:true, mensaje:{id, persona_id, texto, adjunto_url, adjunto_tipo, creado_en} }`.
  - `GET /api/mensajes/conversacion/:id?antes=<id>&limite=30` → `{ conversacion:{...}, mensajes:[...] }` (más nuevos primero).

- [ ] **Step 1: Escribir los tests que fallan**

Añadir este `test` a `backend/test/mensajes.api.test.js`. Usa `base`, `H` y `SEM` del **arnés
compartido** (Task 4); no llama a `cargarDb`/boot ni redefine `H`.

```js
test('1:1 + envio + listado', async () => {
  // lider abre 1:1 con miembro1
  let res = await fetch(base + '/api/mensajes/directo', {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ persona_id: SEM.miembro1.id }) });
  assert.equal(res.status, 200);
  const conv = await res.json();
  assert.ok(conv.id);

  // llamar de nuevo devuelve la MISMA conversacion (no duplica)
  res = await fetch(base + '/api/mensajes/directo', {
    method: 'POST', headers: H(SEM.miembro1), body: JSON.stringify({ persona_id: SEM.lider.id }) });
  assert.equal((await res.json()).id, conv.id);

  // ajeno NO puede abrir 1:1 con miembro1
  res = await fetch(base + '/api/mensajes/directo', {
    method: 'POST', headers: H(SEM.ajeno), body: JSON.stringify({ persona_id: SEM.miembro1.id }) });
  assert.equal(res.status, 403);

  // enviar mensaje
  res = await fetch(base + `/api/mensajes/conversacion/${conv.id}`, {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ texto: 'Hola!' }) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).mensaje.texto, 'Hola!');

  // mensaje vacio sin adjunto -> 400
  res = await fetch(base + `/api/mensajes/conversacion/${conv.id}`, {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ texto: '   ' }) });
  assert.equal(res.status, 400);

  // no-miembro no puede leer la conversacion
  res = await fetch(base + `/api/mensajes/conversacion/${conv.id}`, { headers: H(SEM.ajeno) });
  assert.equal(res.status, 403);

  // listar: el miembro ve el mensaje
  res = await fetch(base + `/api/mensajes/conversacion/${conv.id}`, { headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.mensajes.length, 1);
  assert.equal(data.mensajes[0].texto, 'Hola!');
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: FAIL — `/api/mensajes/directo` responde 404 (ruta inexistente).

- [ ] **Step 3: Implementar helpers + rutas en `mensajes.js`**

Insertar entre el `const r = Router();` y el `export default r;`:

```js
r.use(authMiddleware);

const LARGO_MAX = 4000;

// La conversacion pertenece a la iglesia del actor?
function convDeIglesia(convId, iglesiaId) {
  return db.prepare('SELECT * FROM conversacion WHERE id = ? AND iglesia_id = ?').get(convId, iglesiaId);
}
function esMiembroConv(convId, personaId) {
  return !!db.prepare('SELECT 1 FROM conversacion_miembro WHERE conversacion_id = ? AND persona_id = ?')
    .get(convId, personaId);
}
function miembrosConv(convId) {
  return db.prepare('SELECT persona_id FROM conversacion_miembro WHERE conversacion_id = ?')
    .all(convId).map(x => x.persona_id);
}

// --- Obtener o crear el 1:1 con otra persona ---
r.post('/directo', (req, res) => {
  const otroId = Number((req.body || {}).persona_id);
  if (!otroId) return res.status(400).json({ error: 'Falta persona_id' });
  const { puedeIniciarChatCon } = req.app.locals.__auth || {};   // ver nota abajo
  // import directo (no via app.locals):
  return crearDirecto(req, res, otroId);
});
```

> Para evitar el patrón `app.locals`, importar `puedeIniciarChatCon` arriba y usar una función local. Reemplaza el handler anterior por esta versión definitiva (import al inicio del archivo: `import { authMiddleware, esPastor, auditar, puedeIniciarChatCon } from './auth.js';`):

```js
r.post('/directo', (req, res) => {
  const otroId = Number((req.body || {}).persona_id);
  if (!otroId) return res.status(400).json({ error: 'Falta persona_id' });
  if (!puedeIniciarChatCon(req.user.persona_id, otroId))
    return res.status(403).json({ error: 'No puedes iniciar un chat con esa persona' });
  // buscar 1:1 existente entre exactamente estas 2 personas
  const existente = db.prepare(
    `SELECT c.id FROM conversacion c
       JOIN conversacion_miembro m1 ON m1.conversacion_id = c.id AND m1.persona_id = ?
       JOIN conversacion_miembro m2 ON m2.conversacion_id = c.id AND m2.persona_id = ?
      WHERE c.tipo = 'directo' AND c.iglesia_id = ?
      LIMIT 1`
  ).get(req.user.persona_id, otroId, req.user.iglesia_id);
  if (existente) return res.json({ id: existente.id, tipo: 'directo' });

  const info = db.prepare("INSERT INTO conversacion (iglesia_id, tipo, creado_por) VALUES (?, 'directo', ?)")
    .run(req.user.iglesia_id, req.user.persona_id);
  const convId = Number(info.lastInsertRowid);
  const insM = db.prepare('INSERT INTO conversacion_miembro (conversacion_id, persona_id, rol) VALUES (?,?,?)');
  insM.run(convId, req.user.persona_id, 'miembro');
  insM.run(convId, otroId, 'miembro');
  res.json({ id: convId, tipo: 'directo' });
});

// --- Enviar un mensaje ---
r.post('/conversacion/:id', (req, res) => {
  const conv = convDeIglesia(req.params.id, req.user.iglesia_id);
  if (!conv) return res.status(404).json({ error: 'Conversacion no encontrada' });
  if (!esMiembroConv(conv.id, req.user.persona_id))
    return res.status(403).json({ error: 'No perteneces a esta conversacion' });
  const b = req.body || {};
  const texto = String(b.texto || '').trim();
  const adjuntoUrl = b.adjunto_url ? String(b.adjunto_url) : null;
  if (!texto && !adjuntoUrl) return res.status(400).json({ error: 'El mensaje esta vacio' });
  if (texto.length > LARGO_MAX) return res.status(400).json({ error: 'Mensaje demasiado largo' });

  const info = db.prepare(
    'INSERT INTO mensaje (conversacion_id, persona_id, texto, adjunto_url, adjunto_tipo) VALUES (?,?,?,?,?)'
  ).run(conv.id, req.user.persona_id, texto, adjuntoUrl, b.adjunto_tipo ? String(b.adjunto_tipo) : null);
  const mensaje = {
    id: Number(info.lastInsertRowid), conversacion_id: conv.id, persona_id: req.user.persona_id,
    nombre: db.prepare('SELECT nombre FROM persona WHERE id = ?').get(req.user.persona_id).nombre,
    texto, adjunto_url: adjuntoUrl, adjunto_tipo: b.adjunto_tipo || null,
    creado_en: new Date().toISOString()
  };
  // el autor ya "leyo" hasta su propio mensaje
  db.prepare('UPDATE conversacion_miembro SET ultimo_leido_mensaje_id = ? WHERE conversacion_id = ? AND persona_id = ?')
    .run(mensaje.id, conv.id, req.user.persona_id);

  const otros = miembrosConv(conv.id).filter(pid => pid !== req.user.persona_id);
  emitir(otros, 'mensaje', { conversacion_id: conv.id, mensaje });
  const offline = otros.filter(pid => !estaConectada(pid));
  if (offline.length) {
    enviarPush(offline, { titulo: '💬 ' + mensaje.nombre, texto: texto || 'Te envió un archivo',
      url: '/#mensajes/' + conv.id }).catch(() => {});
  }
  res.json({ ok: true, mensaje });
});

// --- Leer mensajes de una conversacion (paginado hacia atras) ---
r.get('/conversacion/:id', (req, res) => {
  const conv = convDeIglesia(req.params.id, req.user.iglesia_id);
  if (!conv) return res.status(404).json({ error: 'Conversacion no encontrada' });
  const soyMiembro = esMiembroConv(conv.id, req.user.persona_id);
  const puedeModerar = esPastor(req.user.persona_id) && conv.tipo !== 'directo';
  if (!soyMiembro && !puedeModerar) return res.status(403).json({ error: 'No perteneces a esta conversacion' });

  const limite = Math.min(Number(req.query.limite) || 30, 100);
  const antes = Number(req.query.antes) || Number.MAX_SAFE_INTEGER;
  const mensajes = db.prepare(
    `SELECT m.id, m.persona_id, p.nombre, m.texto, m.adjunto_url, m.adjunto_tipo, m.borrado, m.creado_en
       FROM mensaje m JOIN persona p ON p.id = m.persona_id
      WHERE m.conversacion_id = ? AND m.id < ?
      ORDER BY m.id DESC LIMIT ?`
  ).all(conv.id, antes, limite);
  res.json({ conversacion: { id: conv.id, tipo: conv.tipo, titulo: conv.titulo, grupo_id: conv.grupo_id }, mensajes });
});
```

> Al implementar, **borra** el primer handler `r.post('/directo')` provisional (el que menciona `app.locals`) y deja solo la versión definitiva. Asegúrate de que el import de arriba incluya `puedeIniciarChatCon`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: PASS (incluye el nuevo test "1:1 + envio + listado").

- [ ] **Step 5: Commit**

```bash
git add backend/src/mensajes.js backend/test/mensajes.api.test.js
git commit -m "feat(chat): iniciar 1:1, enviar y listar mensajes (+push offline)"
```

---

## Task 6: Listado de conversaciones + auto-provisión de canales de grupo + no-leídos

**Files:**
- Modify: `backend/src/mensajes.js` (`GET /conversaciones`, helper `provisionarCanalesDeGrupo`)
- Test: `backend/test/mensajes.api.test.js`

**Interfaces:**
- Produces: `GET /api/mensajes/conversaciones` → `[{ id, tipo, titulo, otro:{id,nombre}|null, grupo_id, ultimo:{texto,creado_en}|null, no_leidos }]`, ordenado por actividad reciente. Auto-crea el canal de cada grupo del actor y sincroniza miembros.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/mensajes.api.test.js`:

```js
test('conversaciones: auto-provisiona canal de grupo y cuenta no-leidos', async () => {
  // miembro1 entra a Mensajes -> debe aparecer el canal de Jovenes
  let res = await fetch(base + '/api/mensajes/conversaciones', { headers: H(SEM.miembro1) });
  let lista = await res.json();
  const canal = lista.find(c => c.tipo === 'grupo' && c.grupo_id === SEM.grupoId);
  assert.ok(canal, 'existe el canal del grupo');

  // lider (tambien miembro del grupo) manda un mensaje al canal
  res = await fetch(base + '/api/mensajes/conversaciones', { headers: H(SEM.lider) }); // provisiona para lider
  await res.json();
  await fetch(base + `/api/mensajes/conversacion/${canal.id}`, {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ texto: 'Reunion el sabado' }) });

  // miembro2 ve 1 no-leido en el canal
  res = await fetch(base + '/api/mensajes/conversaciones', { headers: H(SEM.miembro2) });
  lista = await res.json();
  const c2 = lista.find(c => c.id === canal.id);
  assert.equal(c2.no_leidos, 1);
  assert.equal(c2.ultimo.texto, 'Reunion el sabado');

  // ajeno (no es del grupo) NO ve el canal
  res = await fetch(base + '/api/mensajes/conversaciones', { headers: H(SEM.ajeno) });
  lista = await res.json();
  assert.equal(lista.find(c => c.id === canal.id), undefined);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: FAIL — `/api/mensajes/conversaciones` → 404.

- [ ] **Step 3: Implementar en `mensajes.js`**

Añadir (antes de `export default r;`):

```js
// Crea (si falta) el canal 'grupo' de cada grupo del actor y sincroniza sus miembros.
function provisionarCanalesDeGrupo(personaId, iglesiaId) {
  const grupos = db.prepare(
    `SELECT DISTINCT g.id, g.nombre FROM grupo g
       JOIN pertenencia pe ON pe.grupo_id = g.id
      WHERE pe.persona_id = ? AND g.iglesia_id = ?`
  ).all(personaId, iglesiaId);
  for (const g of grupos) {
    let conv = db.prepare("SELECT id FROM conversacion WHERE tipo = 'grupo' AND grupo_id = ? AND iglesia_id = ?")
      .get(g.id, iglesiaId);
    if (!conv) {
      const info = db.prepare(
        "INSERT INTO conversacion (iglesia_id, tipo, grupo_id, titulo, creado_por) VALUES (?, 'grupo', ?, ?, ?)"
      ).run(iglesiaId, g.id, g.nombre, personaId);
      conv = { id: Number(info.lastInsertRowid) };
    }
    // sincronizar miembros del grupo como miembros de la conversacion (idempotente)
    db.prepare(
      `INSERT OR IGNORE INTO conversacion_miembro (conversacion_id, persona_id, rol)
       SELECT ?, persona_id, 'miembro' FROM pertenencia WHERE grupo_id = ?`
    ).run(conv.id, g.id);
  }
}

// --- Mis conversaciones (con ultimo mensaje + no leidos) ---
r.get('/conversaciones', (req, res) => {
  provisionarCanalesDeGrupo(req.user.persona_id, req.user.iglesia_id);
  const filas = db.prepare(
    `SELECT c.id, c.tipo, c.titulo, c.grupo_id, cm.ultimo_leido_mensaje_id
       FROM conversacion c
       JOIN conversacion_miembro cm ON cm.conversacion_id = c.id AND cm.persona_id = ?
      WHERE c.iglesia_id = ?`
  ).all(req.user.persona_id, req.user.iglesia_id);

  const ultimoMsg = db.prepare(
    `SELECT id, texto, adjunto_url, creado_en FROM mensaje
      WHERE conversacion_id = ? AND borrado = 0 ORDER BY id DESC LIMIT 1`);
  const cuentaNoLeidos = db.prepare(
    `SELECT COUNT(*) AS n FROM mensaje
      WHERE conversacion_id = ? AND borrado = 0 AND persona_id != ? AND id > ?`);
  const otroDe = db.prepare(
    `SELECT p.id, p.nombre FROM conversacion_miembro cm JOIN persona p ON p.id = cm.persona_id
      WHERE cm.conversacion_id = ? AND cm.persona_id != ? LIMIT 1`);

  const salida = filas.map(c => {
    const um = ultimoMsg.get(c.id);
    const no = cuentaNoLeidos.get(c.id, req.user.persona_id, c.ultimo_leido_mensaje_id || 0).n;
    const otro = c.tipo === 'directo' ? otroDe.get(c.id, req.user.persona_id) : null;
    return {
      id: c.id, tipo: c.tipo, grupo_id: c.grupo_id,
      titulo: c.tipo === 'directo' ? (otro ? otro.nombre : '') : c.titulo,
      otro: otro || null,
      ultimo: um ? { texto: um.texto || (um.adjunto_url ? '📎 archivo' : ''), creado_en: um.creado_en } : null,
      no_leidos: no
    };
  });
  // mas recientes primero (por ultimo mensaje; sin actividad al final)
  salida.sort((a, b) => (b.ultimo?.creado_en || '').localeCompare(a.ultimo?.creado_en || ''));
  res.json(salida);
});
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: PASS (nuevo test incluido).

- [ ] **Step 5: Commit**

```bash
git add backend/src/mensajes.js backend/test/mensajes.api.test.js
git commit -m "feat(chat): listado de conversaciones + auto-provision de canales de grupo + no-leidos"
```

---

## Task 7: Marcar leído, "escribiendo…", contactos y grupo a medida

**Files:**
- Modify: `backend/src/mensajes.js` (`POST /conversacion/:id/leido`, `POST /conversacion/:id/escribiendo`, `GET /contactos`, `POST /custom`)
- Test: `backend/test/mensajes.api.test.js`

**Interfaces:**
- Produces:
  - `POST /api/mensajes/conversacion/:id/leido {mensaje_id}` → `{ ok:true }`; emite SSE `leido` a los otros.
  - `POST /api/mensajes/conversacion/:id/escribiendo` → `{ ok:true }`; emite SSE `escribiendo` a los otros (no toca BD).
  - `GET /api/mensajes/contactos` → `[{ id, nombre }]` con quién puedo iniciar chat.
  - `POST /api/mensajes/custom {titulo, participantes:[id]}` → `{ id }`; creador = `rol:'admin'`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/mensajes.api.test.js`:

```js
test('leido, contactos y grupo a medida', async () => {
  // 1:1 lider<->miembro1 con un mensaje del lider
  let conv = await (await fetch(base + '/api/mensajes/directo', {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ persona_id: SEM.miembro1.id }) })).json();
  const m = await (await fetch(base + `/api/mensajes/conversacion/${conv.id}`, {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ texto: 'hey' }) })).json();

  // miembro1 marca leido
  let res = await fetch(base + `/api/mensajes/conversacion/${conv.id}/leido`, {
    method: 'POST', headers: H(SEM.miembro1), body: JSON.stringify({ mensaje_id: m.mensaje.id }) });
  assert.equal(res.status, 200);
  // ahora miembro1 no tiene no-leidos en esa conv
  const lista = await (await fetch(base + '/api/mensajes/conversaciones', { headers: H(SEM.miembro1) })).json();
  assert.equal(lista.find(c => c.id === conv.id).no_leidos, 0);

  // contactos del ajeno: no incluye a miembro1
  const contactos = await (await fetch(base + '/api/mensajes/contactos', { headers: H(SEM.ajeno) })).json();
  assert.equal(contactos.find(c => c.id === SEM.miembro1.id), undefined);

  // grupo a medida creado por el lider con 2 participantes
  res = await fetch(base + '/api/mensajes/custom', {
    method: 'POST', headers: H(SEM.lider),
    body: JSON.stringify({ titulo: 'Comision', participantes: [SEM.miembro1.id, SEM.miembro2.id] }) });
  assert.equal(res.status, 200);
  const custom = await res.json();
  // los 3 lo ven en su lista
  for (const p of [SEM.lider, SEM.miembro1, SEM.miembro2]) {
    const l = await (await fetch(base + '/api/mensajes/conversaciones', { headers: H(p) })).json();
    assert.ok(l.find(c => c.id === custom.id), `${p.usuario} ve el grupo a medida`);
  }
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: FAIL — rutas `/leido`, `/contactos`, `/custom` → 404.

- [ ] **Step 3: Implementar en `mensajes.js`**

Añadir antes de `export default r;`:

```js
// --- Marcar leido (solo avanza) ---
r.post('/conversacion/:id/leido', (req, res) => {
  const conv = convDeIglesia(req.params.id, req.user.iglesia_id);
  if (!conv || !esMiembroConv(conv.id, req.user.persona_id))
    return res.status(403).json({ error: 'No perteneces a esta conversacion' });
  const mid = Number((req.body || {}).mensaje_id) || 0;
  db.prepare(
    `UPDATE conversacion_miembro SET ultimo_leido_mensaje_id = MAX(COALESCE(ultimo_leido_mensaje_id,0), ?)
      WHERE conversacion_id = ? AND persona_id = ?`
  ).run(mid, conv.id, req.user.persona_id);
  const nuevo = db.prepare('SELECT ultimo_leido_mensaje_id FROM conversacion_miembro WHERE conversacion_id = ? AND persona_id = ?')
    .get(conv.id, req.user.persona_id).ultimo_leido_mensaje_id;
  const otros = miembrosConv(conv.id).filter(pid => pid !== req.user.persona_id);
  emitir(otros, 'leido', { conversacion_id: conv.id, persona_id: req.user.persona_id, ultimo_leido_mensaje_id: nuevo });
  res.json({ ok: true });
});

// --- "escribiendo..." (solo reemite, sin BD) ---
r.post('/conversacion/:id/escribiendo', (req, res) => {
  const conv = convDeIglesia(req.params.id, req.user.iglesia_id);
  if (!conv || !esMiembroConv(conv.id, req.user.persona_id))
    return res.status(403).json({ error: 'No perteneces a esta conversacion' });
  const nombre = db.prepare('SELECT nombre FROM persona WHERE id = ?').get(req.user.persona_id).nombre;
  const otros = miembrosConv(conv.id).filter(pid => pid !== req.user.persona_id);
  emitir(otros, 'escribiendo', { conversacion_id: conv.id, persona_id: req.user.persona_id, nombre });
  res.json({ ok: true });
});

// --- Con quien puedo iniciar chat (para el selector) ---
r.get('/contactos', (req, res) => {
  const personas = db.prepare(
    'SELECT id, nombre FROM persona WHERE iglesia_id = ? AND activo = 1 AND id != ? ORDER BY nombre'
  ).all(req.user.iglesia_id, req.user.persona_id);
  res.json(personas.filter(p => puedeIniciarChatCon(req.user.persona_id, p.id)));
});

// --- Crear grupo a medida ---
r.post('/custom', (req, res) => {
  const { titulo, participantes } = req.body || {};
  const t = String(titulo || '').trim();
  if (!t) return res.status(400).json({ error: 'Falta el titulo' });
  const ids = [...new Set((Array.isArray(participantes) ? participantes : []).map(Number).filter(Boolean))]
    .filter(id => id !== req.user.persona_id);
  if (!ids.length) return res.status(400).json({ error: 'Elige al menos un participante' });
  // todos deben ser de la misma iglesia
  const validos = db.prepare(
    `SELECT id FROM persona WHERE iglesia_id = ? AND activo = 1 AND id IN (${ids.map(() => '?').join(',')})`
  ).all(req.user.iglesia_id, ...ids).map(x => x.id);
  if (!validos.length) return res.status(400).json({ error: 'Participantes invalidos' });

  const info = db.prepare("INSERT INTO conversacion (iglesia_id, tipo, titulo, creado_por) VALUES (?, 'custom', ?, ?)")
    .run(req.user.iglesia_id, t, req.user.persona_id);
  const convId = Number(info.lastInsertRowid);
  const insM = db.prepare('INSERT OR IGNORE INTO conversacion_miembro (conversacion_id, persona_id, rol) VALUES (?,?,?)');
  insM.run(convId, req.user.persona_id, 'admin');
  for (const id of validos) insM.run(convId, id, 'miembro');
  auditar(req.user.iglesia_id, req.user.persona_id, 'chat_custom', 'conversacion', t);
  res.json({ id: convId });
});
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mensajes.js backend/test/mensajes.api.test.js
git commit -m "feat(chat): leido, escribiendo, contactos y grupo a medida"
```

---

## Task 8: Moderación del pastor (borrar mensaje de grupo/custom)

**Files:**
- Modify: `backend/src/mensajes.js` (`DELETE /:mensajeId`)
- Test: `backend/test/mensajes.api.test.js`

**Interfaces:**
- Produces: `DELETE /api/mensajes/:mensajeId` → `{ ok:true }` (soft delete `borrado=1`). Solo pastor y solo en `grupo`/`custom`. En `directo` → 403.

- [ ] **Step 1: Escribir el test que falla**

```js
test('moderacion: pastor borra en grupo pero no en 1:1', async () => {
  // canal de grupo + un mensaje del miembro1
  const canal = (await (await fetch(base + '/api/mensajes/conversaciones', { headers: H(SEM.miembro1) })).json())
    .find(c => c.tipo === 'grupo');
  const gm = await (await fetch(base + `/api/mensajes/conversacion/${canal.id}`, {
    method: 'POST', headers: H(SEM.miembro1), body: JSON.stringify({ texto: 'inapropiado' }) })).json();

  // pastor borra (soft)
  let res = await fetch(base + `/api/mensajes/${gm.mensaje.id}`, { method: 'DELETE', headers: H(SEM.pastor) });
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT borrado FROM mensaje WHERE id = ?').get(gm.mensaje.id);
  assert.equal(row.borrado, 1);

  // 1:1 lider<->miembro1: pastor NO puede borrar
  const conv = await (await fetch(base + '/api/mensajes/directo', {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ persona_id: SEM.miembro1.id }) })).json();
  const dm = await (await fetch(base + `/api/mensajes/conversacion/${conv.id}`, {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ texto: 'privado' }) })).json();
  res = await fetch(base + `/api/mensajes/${dm.mensaje.id}`, { method: 'DELETE', headers: H(SEM.pastor) });
  assert.equal(res.status, 403);

  // un feligres tampoco puede moderar
  res = await fetch(base + `/api/mensajes/${gm.mensaje.id}`, { method: 'DELETE', headers: H(SEM.miembro2) });
  assert.equal(res.status, 403);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: FAIL — `DELETE /api/mensajes/:id` → 404.

- [ ] **Step 3: Implementar en `mensajes.js`**

```js
// --- Moderacion: el pastor borra (soft) mensajes de grupo/custom (no 1:1) ---
r.delete('/:mensajeId', (req, res) => {
  const msg = db.prepare(
    `SELECT m.id, m.conversacion_id, c.tipo, c.iglesia_id
       FROM mensaje m JOIN conversacion c ON c.id = m.conversacion_id
      WHERE m.id = ?`
  ).get(req.params.mensajeId);
  if (!msg || msg.iglesia_id !== req.user.iglesia_id)
    return res.status(404).json({ error: 'Mensaje no encontrado' });
  if (msg.tipo === 'directo')
    return res.status(403).json({ error: 'No se pueden moderar mensajes privados' });
  if (!esPastor(req.user.persona_id))
    return res.status(403).json({ error: 'Solo el pastor puede moderar' });
  db.prepare('UPDATE mensaje SET borrado = 1, texto = ? WHERE id = ?').run('', msg.id);
  emitir(miembrosConv(msg.conversacion_id), 'mensaje', {
    conversacion_id: msg.conversacion_id, mensaje: { id: msg.id, borrado: 1 }
  });
  auditar(req.user.iglesia_id, req.user.persona_id, 'chat_moderar', 'mensaje', String(msg.id));
  res.json({ ok: true });
});
```

> Colocar esta ruta **después** de las rutas `/conversacion/...` y `/contactos` para que `:mensajeId` no capture esos paths (Express evalúa en orden de registro; `/contactos` y `/conversacion/:id` ya están definidos antes).

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mensajes.js backend/test/mensajes.api.test.js
git commit -m "feat(chat): moderacion del pastor (soft-delete en grupo/custom)"
```

---

## Task 9: Ruta SSE `/stream` + test de entrega en vivo

**Files:**
- Modify: `backend/src/mensajes.js` (`GET /stream` — sin `authMiddleware`, valida token por query)
- Test: `backend/test/mensajes.api.test.js`

**Interfaces:**
- Produces: `GET /api/mensajes/stream?token=<jwt>` → `text/event-stream`; entrega eventos `mensaje`/`escribiendo`/`leido`; heartbeat cada 25 s.

> **Importante:** `r.use(authMiddleware)` (Task 5) aplica a TODAS las rutas del router. La ruta `/stream` debe montarse **antes** de ese `r.use(...)`, o bien registrarse en `server.js` directamente. Aquí se registra **antes** del `r.use(authMiddleware)` dentro de `mensajes.js`.

- [ ] **Step 1: Escribir el test que falla (SSE entrega un mensaje)**

```js
test('SSE entrega en vivo un mensaje nuevo', async () => {
  // 1:1 lider<->miembro1
  const conv = await (await fetch(base + '/api/mensajes/directo', {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ persona_id: SEM.miembro1.id }) })).json();

  // miembro1 abre el stream (token por query, como hace el frontend)
  const tk = signToken({ id: SEM.miembro1.id, iglesia_id: SEM.iglesiaId });
  const ac = new AbortController();
  const streamResp = await fetch(base + '/api/mensajes/stream?token=' + tk, { signal: ac.signal });
  assert.match(streamResp.headers.get('content-type'), /text\/event-stream/);
  const reader = streamResp.body.getReader();
  const dec = new TextDecoder();

  // dar un tick para que el server registre la conexion
  await new Promise(r => setTimeout(r, 50));

  // lider envia
  await fetch(base + `/api/mensajes/conversacion/${conv.id}`, {
    method: 'POST', headers: H(SEM.lider), body: JSON.stringify({ texto: 'en vivo' }) });

  // leer hasta encontrar el evento 'mensaje'
  let buf = '', encontrado = false;
  for (let i = 0; i < 20 && !encontrado; i++) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    if (/event: mensaje/.test(buf) && /en vivo/.test(buf)) encontrado = true;
  }
  ac.abort();
  assert.ok(encontrado, 'llego el evento SSE con el mensaje');
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: FAIL — `/stream` responde 401/404 (ruta inexistente o bloqueada por authMiddleware).

- [ ] **Step 3: Implementar `/stream` en `mensajes.js`**

Reestructurar el inicio del router para que `/stream` quede ANTES del `authMiddleware`. El archivo debe quedar así en su parte superior:

```js
import { Router } from 'express';
import db from './db.js';
import { authMiddleware, esPastor, auditar, puedeIniciarChatCon, verificarToken } from './auth.js';
import { enviarPush } from './push.js';
import { emitir, estaConectada, registrar } from './sse.js';

const r = Router();

// --- STREAM SSE (sin authMiddleware: valida el token por query param) ---
r.get('/stream', (req, res) => {
  const payload = verificarToken(String(req.query.token || ''));
  if (!payload) return res.status(401).json({ error: 'Token invalido' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': conectado\n\n');
  const baja = registrar(payload.persona_id, res);
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 25000);
  req.on('close', () => { clearInterval(hb); baja(); });
});

// A partir de aqui, todo requiere token en header
r.use(authMiddleware);
```

(El resto de rutas de las Tasks 5–8 permanece igual, debajo del `r.use(authMiddleware)`.)

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend && node --test test/mensajes.api.test.js`
Expected: PASS.

- [ ] **Step 5: Correr TODA la suite**

Run: `cd backend && npm test`
Expected: PASS — todos los archivos (`*.sse`, `*.permisos`, `*.api`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/mensajes.js backend/test/mensajes.api.test.js
git commit -m "feat(chat): endpoint SSE /stream con heartbeat + entrega en vivo"
```

---

## Task 10: Frontend — vista Mensajes + cliente SSE

**Files:**
- Modify: `web/index.html` (ítem de NAV + contenedor de vista)
- Modify: `web/app.js` (render de la vista, llamadas a la API, `EventSource`)
- Modify: `web/styles.css` (estilos del chat)

> **No hay tests automáticos de UI en este repo** (patrón existente: verificación manual). Esta tarea usa verificación manual con pasos explícitos. Sigue las convenciones ya presentes en `app.js`: helper de fetch con token, `toast`, iconos de línea, badges.

- [ ] **Step 1: Localizar los patrones existentes en `app.js`**

Antes de escribir, abrir `web/app.js` y anotar:
- El helper que hace fetch con el token (buscar `Authorization` / `Bearer`). Nombre y firma exactos.
- Cómo se define un ítem de NAV y cómo se enruta una vista (buscar el switch/routing de `modulos`).
- El helper de subida de archivos que llama a `/api/upload` (buscar `/api/upload`).
- El nombre del token en `localStorage` (buscar `localStorage.getItem`).

Registrar esos nombres aquí antes de continuar (se usan abajo como `apiFetch`, `subirArchivo`, `TOKEN`).

- [ ] **Step 2: Añadir el ítem de NAV en `index.html`**

Junto a los demás ítems del `<nav>`, añadir (icono de línea coherente con el rediseño):

```html
<a href="#mensajes" class="nav-item" data-vista="mensajes">
  <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
  <span>Mensajes</span>
  <span id="badgeMensajes" class="badge" hidden></span>
</a>
```

Y un contenedor de vista donde viven las demás vistas:

```html
<section id="vista-mensajes" class="vista" hidden>
  <div class="chat-wrap">
    <aside id="chatLista" class="chat-lista"></aside>
    <div id="chatHilo" class="chat-hilo"><div class="chat-vacio">Elige una conversación</div></div>
  </div>
</section>
```

- [ ] **Step 3: Implementar la vista en `app.js`**

Añadir un módulo de mensajes. Usa los nombres reales detectados en el Step 1 (`apiFetch`, `subirArchivo`, `TOKEN`). Código:

```js
// ===== Mensajes (chat) =====
const Chat = {
  convActual: null,
  escribiendoTimer: null,
  async abrirVista() {
    await this.cargarLista();
    this.conectarSSE();
  },
  async cargarLista() {
    const convs = await apiFetch('/api/mensajes/conversaciones');
    const cont = document.getElementById('chatLista');
    cont.innerHTML = '<button id="btnNuevoChat" class="btn-sec">+ Nuevo chat</button>';
    let totalNoLeidos = 0;
    for (const c of convs) {
      totalNoLeidos += c.no_leidos || 0;
      const el = document.createElement('div');
      el.className = 'chat-item' + (c.no_leidos ? ' no-leido' : '');
      el.innerHTML = `<div class="ci-titulo">${escapeHtml(c.titulo || '(sin nombre)')}</div>
        <div class="ci-ultimo">${escapeHtml(c.ultimo?.texto || '')}</div>
        ${c.no_leidos ? `<span class="badge">${c.no_leidos}</span>` : ''}`;
      el.onclick = () => this.abrirConversacion(c.id, c.titulo);
      cont.appendChild(el);
    }
    const badge = document.getElementById('badgeMensajes');
    badge.hidden = !totalNoLeidos; badge.textContent = totalNoLeidos;
    document.getElementById('btnNuevoChat').onclick = () => this.nuevoChat();
  },
  async abrirConversacion(id, titulo) {
    this.convActual = id;
    const { mensajes } = await apiFetch('/api/mensajes/conversacion/' + id);
    const hilo = document.getElementById('chatHilo');
    hilo.innerHTML = `<header class="chat-head">${escapeHtml(titulo || '')}</header>
      <div id="chatMsgs" class="chat-msgs"></div>
      <div id="chatEscribiendo" class="chat-escribiendo"></div>
      <form id="chatForm" class="chat-form">
        <button type="button" id="chatAdjuntar" class="btn-ico" title="Adjuntar">📎</button>
        <input id="chatInput" autocomplete="off" placeholder="Escribe un mensaje…" maxlength="4000"/>
        <button class="btn">Enviar</button>
      </form>`;
    const cont = document.getElementById('chatMsgs');
    for (const m of mensajes.slice().reverse()) cont.appendChild(this.burbuja(m));
    cont.scrollTop = cont.scrollHeight;
    if (mensajes.length) this.marcarLeido(id, mensajes[0].id);
    document.getElementById('chatForm').onsubmit = (e) => { e.preventDefault(); this.enviar(id); };
    document.getElementById('chatInput').oninput = () => this.pingEscribiendo(id);
    document.getElementById('chatAdjuntar').onclick = () => this.adjuntar(id);
    await this.cargarLista();
  },
  burbuja(m) {
    const el = document.createElement('div');
    el.className = 'burbuja' + (m.persona_id === MI_ID ? ' mia' : '');
    el.dataset.id = m.id;
    if (m.borrado) { el.classList.add('borrado'); el.textContent = 'mensaje eliminado'; return el; }
    let cuerpo = escapeHtml(m.texto || '');
    if (m.adjunto_url) cuerpo += `<a class="adj" href="${m.adjunto_url}" target="_blank">📎 archivo</a>`;
    el.innerHTML = `<span class="autor">${escapeHtml(m.nombre || '')}</span><div>${cuerpo}</div>`;
    return el;
  },
  async enviar(id) {
    const input = document.getElementById('chatInput');
    const texto = input.value.trim();
    if (!texto) return;
    input.value = '';
    await apiFetch('/api/mensajes/conversacion/' + id, { method: 'POST', body: { texto } });
    // el eco llega por SSE; si no, recargamos
  },
  async adjuntar(id) {
    const url = await subirArchivo();   // helper existente: abre file picker, sube a /api/upload, devuelve url
    if (!url) return;
    await apiFetch('/api/mensajes/conversacion/' + id, { method: 'POST', body: { texto: '', adjunto_url: url, adjunto_tipo: 'archivo' } });
  },
  pingEscribiendo(id) {
    if (this.escribiendoTimer) return;
    apiFetch('/api/mensajes/conversacion/' + id + '/escribiendo', { method: 'POST', body: {} }).catch(() => {});
    this.escribiendoTimer = setTimeout(() => { this.escribiendoTimer = null; }, 3000);
  },
  marcarLeido(id, mensajeId) {
    apiFetch('/api/mensajes/conversacion/' + id + '/leido', { method: 'POST', body: { mensaje_id: mensajeId } }).catch(() => {});
  },
  async nuevoChat() {
    const contactos = await apiFetch('/api/mensajes/contactos');
    // Reusa el patron de modal existente para elegir una persona.
    const persona = await elegirDeLista('Nuevo chat', contactos.map(c => ({ id: c.id, texto: c.nombre })));
    if (!persona) return;
    const conv = await apiFetch('/api/mensajes/directo', { method: 'POST', body: { persona_id: persona } });
    this.abrirConversacion(conv.id, contactos.find(c => c.id === persona)?.nombre);
  },
  conectarSSE() {
    if (this.es) return;
    this.es = new EventSource('/api/mensajes/stream?token=' + encodeURIComponent(TOKEN));
    this.es.addEventListener('mensaje', (ev) => {
      const { conversacion_id, mensaje } = JSON.parse(ev.data);
      if (conversacion_id === this.convActual) {
        const cont = document.getElementById('chatMsgs');
        if (cont) {
          if (mensaje.borrado) { const b = cont.querySelector(`[data-id="${mensaje.id}"]`); if (b) { b.classList.add('borrado'); b.textContent = 'mensaje eliminado'; } }
          else { cont.appendChild(this.burbuja(mensaje)); cont.scrollTop = cont.scrollHeight; this.marcarLeido(conversacion_id, mensaje.id); }
        }
      }
      this.cargarLista();
    });
    this.es.addEventListener('escribiendo', (ev) => {
      const { conversacion_id, nombre } = JSON.parse(ev.data);
      if (conversacion_id !== this.convActual) return;
      const e = document.getElementById('chatEscribiendo');
      if (!e) return;
      e.textContent = nombre + ' está escribiendo…';
      clearTimeout(this._escTimer);
      this._escTimer = setTimeout(() => { e.textContent = ''; }, 3000);
    });
    this.es.addEventListener('leido', () => { /* opcional: marcar doble-check en la UI */ });
    this.es.onerror = () => { /* EventSource reconecta solo */ };
  }
};
```

> `MI_ID`, `escapeHtml`, `elegirDeLista`, `subirArchivo`, `apiFetch`, `TOKEN` deben mapearse a los helpers reales de `app.js` (Step 1). Si alguno no existe con ese nombre exacto (p. ej. `elegirDeLista`), usar el modal genérico ya presente o un `prompt` temporal, y anotarlo para pulir.

Enganchar `Chat.abrirVista()` en el router de vistas: donde se muestran las vistas por `data-vista`, al activar `mensajes` llamar `Chat.abrirVista()`.

- [ ] **Step 4: Estilos en `styles.css`**

```css
.chat-wrap{display:flex;gap:12px;height:70vh}
.chat-lista{width:280px;overflow-y:auto;border-right:1px solid var(--linea,#e5e3df)}
.chat-item{padding:10px;border-radius:12px;cursor:pointer;position:relative}
.chat-item:hover{background:var(--crema-2,#eceae5)}
.chat-item.no-leido .ci-titulo{font-weight:700}
.ci-ultimo{font-size:.85em;color:#777;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chat-hilo{flex:1;display:flex;flex-direction:column}
.chat-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:6px}
.burbuja{max-width:70%;padding:8px 12px;border-radius:14px;background:#eceae5;align-self:flex-start}
.burbuja.mia{align-self:flex-end;background:#d6 efe0;background:#d8ede2}
.burbuja.borrado{font-style:italic;color:#999}
.burbuja .autor{font-size:.72em;color:#666;display:block}
.chat-form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--linea,#e5e3df)}
.chat-form input{flex:1}
.chat-escribiendo{height:18px;font-size:.8em;color:#888;padding:0 12px}
.chat-vacio{margin:auto;color:#999}
```

> Ajustar variables de color a las reales del tema (`styles.css` ya define la paleta verde/crema). Corregir el valor duplicado en `.burbuja.mia` a un verde suave real del tema.

- [ ] **Step 5: Verificación manual**

1. `cd backend && node src/server.js` (con `SEED_ON_EMPTY=1` si la BD está vacía).
2. Abrir `http://localhost:3000`, login `MONTESION / abel / 1234`.
3. Ir a **Mensajes**: se ve el canal de su grupo (Jóvenes). Abrirlo, enviar un mensaje.
4. En otra ventana privada, login `MONTESION / maria / 1234` → abrir el 1:1 o el canal; verificar que el mensaje llega **en vivo** (SSE) y que "escribiendo…" aparece al teclear.
5. Adjuntar un archivo y verificar que se ve el enlace 📎.
6. Verificar que el **badge** de no-leídos sube y baja al leer.

Anotar cualquier ajuste de nombres de helpers.

- [ ] **Step 6: Commit**

```bash
git add web/index.html web/app.js web/styles.css
git commit -m "feat(chat): vista Mensajes en el frontend + cliente SSE"
```

---

## Task 11: Push abre la conversación + seed demo + ESTADO.md

**Files:**
- Modify: `web/sw.js` (`notificationclick` → abrir `/#mensajes/<id>` de la `url` del push)
- Modify: `backend/src/seed.js` (una conversación 1:1 demo con 1-2 mensajes)
- Modify: `app/ESTADO.md` (sección Fase 6)

**Interfaces:**
- Consumes: el `url` que `POST /conversacion/:id` ya manda en el push (`/#mensajes/<id>`).

- [ ] **Step 1: Ajustar `sw.js` para abrir la conversación**

Localizar el handler `notificationclick` existente (Fase 5 lo añadió). Asegurar que use `event.notification.data.url` (o el campo donde `web-push` deja la url) para enfocar/abrir esa ruta. Si el handler ya abre `data.url`, verificar que `push.js` propaga `url` al payload. Código de referencia del handler:

```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
    for (const w of wins) { if ('focus' in w) { w.navigate?.(url); return w.focus(); } }
    return clients.openWindow(url);
  }));
});
```

- [ ] **Step 2: Verificar que `push.js` incluye `url` en el payload**

Abrir `push.js`; confirmar que `enviarPush(..., { titulo, texto, url })` serializa `url` dentro del `JSON.stringify` del payload y que el `sw.js` `push` handler lo pone en `data.url`. Si falta, añadir `data: { url }` al `showNotification`. (Solo verificación + fix mínimo si hace falta.)

- [ ] **Step 3: Seed demo**

En `seed.js`, tras crear personas y grupos de MONTESION, añadir una conversación 1:1 demo entre `abel` y `maria` con 2 mensajes (usar los ids ya insertados; seguir el estilo de inserción del archivo):

```js
// Chat demo (Fase 6): 1:1 abel <-> maria
const cvDemo = db.prepare("INSERT INTO conversacion (iglesia_id, tipo, creado_por) VALUES (?, 'directo', ?)")
  .run(iglesiaMonteSion, idAbel).lastInsertRowid;
db.prepare('INSERT INTO conversacion_miembro (conversacion_id, persona_id, rol) VALUES (?,?,?)').run(cvDemo, idAbel, 'miembro');
db.prepare('INSERT INTO conversacion_miembro (conversacion_id, persona_id, rol) VALUES (?,?,?)').run(cvDemo, idMaria, 'miembro');
db.prepare("INSERT INTO mensaje (conversacion_id, persona_id, texto) VALUES (?,?, 'Hola María, ¿vienes el sábado?')").run(cvDemo, idAbel);
db.prepare("INSERT INTO mensaje (conversacion_id, persona_id, texto) VALUES (?,?, '¡Sí! Ahí estaré 🙌')").run(cvDemo, idMaria);
```

> Sustituir `iglesiaMonteSion`, `idAbel`, `idMaria` por las variables reales que `seed.js` ya usa para esos registros.

- [ ] **Step 4: Verificar el seed**

Run: `cd backend && node src/seed.js && node -e "const db=require('node:sqlite'); " ` → en su lugar, verificación simple:
Run: `cd backend && node --input-type=module -e "process.env.DB_PATH='./iglesia.db'; const {default:db}=await import('./src/db.js'); console.log(db.prepare('SELECT COUNT(*) n FROM mensaje').get());"`
Expected: `{ n: >=2 }` (tras haber corrido el seed).

- [ ] **Step 5: Documentar en ESTADO.md**

Añadir sección al inicio de las fases:

```markdown
## 🆕 FASE 6 (20 jul 2026): Mensajería interna (chat) — PROBADO

- Chat **1:1**, **por grupo** (auto-provisionado) y **a medida**; tiempo real por **SSE**
  (`sse.js` hub en memoria + `GET /api/mensajes/stream?token=`), adjuntos (reusa `/api/upload`),
  **leído/no-leídos** (por `ultimo_leido_mensaje_id`), **"escribiendo…"** y **moderación del pastor**
  (soft-delete en grupo/custom, nunca 1:1).
- Backend nuevo `mensajes.js` (`/api/mensajes`), tablas `conversacion`, `conversacion_miembro`,
  `mensaje`. Permisos en `auth.js` (`puedeIniciarChatCon`, `verificarToken`). Los mensajes **no**
  llenan la campana: push (offline) + badge de no-leídos.
- Frontend: vista **💬 Mensajes** con `EventSource`.
- **Pruebas automatizadas** (nuevas): `npm test` en `backend/` — hub SSE, permisos y API
  (1:1, canal de grupo, no-leídos, leído, contactos, grupo a medida, moderación, entrega SSE en vivo).
```

- [ ] **Step 6: Correr toda la suite + commit**

Run: `cd backend && npm test`
Expected: PASS (todos).

```bash
git add web/sw.js backend/src/push.js backend/src/seed.js app/ESTADO.md
git commit -m "feat(chat): push abre conversacion + seed demo + ESTADO Fase 6"
```

---

## Self-Review (cobertura del spec)

- **§1 Alcance** (1:1, grupo, custom, adjuntos, leído, escribiendo, moderación, SSE+push): Tasks 5–11. ✔
- **§2 Datos** (3 tablas + semántica de leído): Task 1 + Task 6/7. ✔
- **§3 Endpoints**: `/conversaciones` (T6), `/conversacion/:id` GET (T5), `/directo` (T5), `/custom` (T7), `POST /conversacion/:id` (T5), `/escribiendo` (T7), `/leido` (T7), `/contactos` (T7), `DELETE /:mensajeId` (T8), `/stream` (T9). ✔
- **§3 Permisos** (`puedeIniciarChatCon`, membresía, moderación, aislamiento): T3 + validaciones en cada ruta. ✔
- **§3 Notificaciones** (no campana; push offline + badge): T5 (push) + T10 (badge). ✔
- **§4 SSE** (hub, eventos, heartbeat): T2 + T9. ✔
- **§5 Auth del stream** (token por query): T9. ✔
- **§6 Frontend**: T10. ✔
- **§7 Errores** (401/403/404/400, límite 4000, adjuntos por multer): repartido en T5–T9. ✔
- **§8 Pruebas** (los 11 escenarios): cubiertos por T3/T5/T6/T7/T8/T9. UI = verificación manual (T10). ✔
- **§9 Organización** (`mensajes.js`, `sse.js`, edits): estructura de archivos. ✔
- **§10 Decisiones** (pastor no lee 1:1, silenciar reservado, límite adjunto, push): respetadas. ✔

**Placeholder scan:** el único bloque intencionalmente provisional (handler `/directo` con `app.locals`) va acompañado de su versión definitiva y una instrucción explícita de borrarlo (T5, Step 3). Sin TBD/TODO.

**Consistencia de tipos:** `registrar/emitir/estaConectada` (T2) usados igual en T5/T7/T8/T9; `puedeIniciarChatCon(actorId, destinoId)` y `verificarToken(token)` (T3) usados con esa firma en T5/T7/T9; `ultimo_leido_mensaje_id` consistente en T6/T7.

**Riesgo conocido a validar en ejecución:** los nombres de helpers del frontend (`apiFetch`, `subirArchivo`, `elegirDeLista`, `MI_ID`, `TOKEN`, `escapeHtml`) deben mapearse a los reales de `app.js` (T10 Step 1). Es la única parte con incógnitas, por diseño (no hay tests de UI en el repo).
