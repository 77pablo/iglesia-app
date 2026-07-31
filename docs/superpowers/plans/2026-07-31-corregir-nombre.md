# Corregir el nombre de una persona — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que "juan perez" pueda corregirse a "Juan Pérez" — por la propia persona desde "Mi perfil", o por el pastor desde Admin > Usuarios si ella no puede — sin dejar el historial de aprobaciones con el nombre viejo.

**Architecture:** Dos rutas que **ya existen amplían su esquema**: `PATCH /api/directorio/perfil` (autoservicio) y `PATCH /api/admin/usuarios/:id` (el pastor sobre otro) aceptan un campo `nombre` nuevo. No hay rutas nuevas, no hay migración: `persona.nombre` ya es `TEXT NOT NULL` sin restricción de formato. La única copia denormalizada real (`aprobacion_log.actor_nombre`) se sincroniza con el mismo patrón de una línea que ya usa `cuenta.js` al anonimizar una cuenta eliminada.

**Tech Stack:** Node ESM · Express 4 · `node:sqlite` · zod 4 · frontend vanilla JS (template strings en `innerHTML`) · tests `node:test` · Playwright (Python).

**Spec:** `docs/superpowers/specs/2026-07-31-corregir-nombre-design.md`

## Global Constraints

- **Aislamiento entre iglesias:** `PATCH /api/admin/usuarios/:id` ya resuelve la persona acotada por iglesia en la misma consulta (`personaDeIglesia(id, ig)`, `admin.js:78-80`, usada en la ruta desde `admin.js:89`) — no hay guardia nueva que escribir, solo hay que asegurarse de seguir usando `p.id` (la fila ya resuelta) y nunca `req.params.id` crudo en el `UPDATE`. `PATCH /api/directorio/perfil` solo toca `req.user.persona_id` (la propia sesión), así que no recibe ningún id ajeno.
- **Mensajes de validación en castellano dentro del esquema zod.** En zod 4 el parámetro es `error`, **nunca `errorMap`** (se ignora en silencio: ya mordió una vez en `registro.js`, ver `ESTADO.md`). Aquí no hace falta ninguno de los dos: `.min()`/`.max()` con el string como segundo argumento (el patrón que ya usa `crearUsuarioSchema` en `admin.js`) basta.
- **`escHtml` en todo dato de usuario** que vaya a `innerHTML` o a un atributo. El nombre de una persona **es justo el dato del que trata este plan**, y viaja en dos sitios nuevos: el `value` prellenado de un `<input>` y el mensaje de `modalPrompt`. ⚠️ **`modalPrompt` (como `modalConfirm`) mete su primer argumento crudo en `innerHTML`** (`web/app.js:2933-2934`, comentario explícito: *"así que lo que se interpole ahí va con `escHtml()`"*). Un plan reciente metió un XSS ahí por olvidarlo.
- **La suite está en 456 tests (verificado corriendo `npm test` antes de empezar) y no puede bajar.** Este plan añade 14 tests de backend (5 en la Task 1, 9 en la Task 2): **debe terminar en 470, 0 fail.**
- Commits en castellano, minúsculas, `tipo(ámbito): efecto para la persona`. Sin coautoría ni menciones a Claude (ver `git log --oneline`: `feat(ninos): poder corregir la ficha de un nino, que antes era para siempre`, etc.).

---

### Task 1: Autoservicio — corregir el propio nombre desde "Mi perfil"

**Files:**
- Modify: `backend/src/directorio.js` (import de `auth.js`, `perfilSchema`, `PATCH /perfil`)
- Test: `backend/test/corregir-nombre.test.js` (nuevo)

**Interfaces:**
- Consumes: `validar` de `./seguridad.js` (ya importado); `auditar` de `./auth.js` (nuevo en el import).
- Produces: `PATCH /api/directorio/perfil` acepta ahora `{ nombre }` junto al resto de campos ya existentes → `{ok:true}`, o **400** en castellano si `nombre` viene vacío o pasa de 120 caracteres. Task 3 lo consume desde el frontend.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/corregir-nombre.test.js`:

```js
// ============================================================
//  Corregir el nombre de una persona.
//  "juan perez" quedaba asi para siempre: ni "Mi perfil" (directorio.js) ni
//  "Cambiar mi cuenta" (cuenta.js) aceptaban 'nombre'. Este archivo cubre los
//  dos caminos: el propio (autoservicio) y el del pastor sobre otra persona.
// ============================================================
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

beforeEach(() => {
  reiniciar(db);
  db.exec('DELETE FROM auditoria');
  db.exec('DELETE FROM aprobacion_log');
  SEM = sembrarMinimo(db);
});

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

const corregirPropio = (persona, nombre) => fetch(base + '/api/directorio/perfil', {
  method: 'PATCH', headers: H(persona), body: JSON.stringify({ nombre })
});

function logAprobacion(actorId, actorNombre) {
  db.prepare(
    `INSERT INTO aprobacion_log (iglesia_id, evento_titulo, fecha_evento, grupo, accion, motivo, actor_id, actor_nombre)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(SEM.iglesiaId, 'Retiro de jóvenes', '2026-08-15', 'Jovenes', 'aprobado', null, actorId, actorNombre);
}

test('PATCH /api/directorio/perfil: corrige el propio nombre', async () => {
  const res = await corregirPropio(SEM.miembro1, 'Juan Pérez');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  const fila = db.prepare('SELECT nombre FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(fila.nombre, 'Juan Pérez');
});

test('PATCH /api/directorio/perfil: nombre vacio -> 400 en castellano', async () => {
  const res = await corregirPropio(SEM.miembro1, '');
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /nombre/i);

  const fila = db.prepare('SELECT nombre FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(fila.nombre, 'Miembro Uno', 'no debe haber cambiado nada');
});

test('PATCH /api/directorio/perfil: nombre de 121+ caracteres -> 400 en castellano', async () => {
  const res = await corregirPropio(SEM.miembro1, 'x'.repeat(121));
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /120|largo/i);
});

test('PATCH /api/directorio/perfil: sincroniza aprobacion_log.actor_nombre, y no toca las de otro actor', async () => {
  logAprobacion(SEM.miembro1.id, 'Miembro Uno');
  logAprobacion(SEM.pastor.id, 'Pastor');

  await corregirPropio(SEM.miembro1, 'Juan Pérez');

  const mia = db.prepare('SELECT actor_nombre FROM aprobacion_log WHERE actor_id = ?').get(SEM.miembro1.id);
  const ajena = db.prepare('SELECT actor_nombre FROM aprobacion_log WHERE actor_id = ?').get(SEM.pastor.id);
  assert.equal(mia.actor_nombre, 'Juan Pérez', 'el historial de aprobaciones no debe quedar con el nombre viejo');
  assert.equal(ajena.actor_nombre, 'Pastor', 'y no debe tocar la fila de otra persona');
});

test('PATCH /api/directorio/perfil: corregir el nombre queda auditado con el nombre viejo y el nuevo', async () => {
  await corregirPropio(SEM.miembro1, 'Juan Pérez');

  const log = db.prepare("SELECT * FROM auditoria WHERE accion = 'corregir_nombre'").get();
  assert.ok(log, 'corregir el nombre tiene que dejar rastro');
  assert.equal(log.modulo, 'directorio');
  assert.equal(log.actor_id, SEM.miembro1.id);
  assert.match(log.detalle, /Miembro Uno/);
  assert.match(log.detalle, /Juan Pérez/);
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/corregir-nombre.test.js`
Expected: FALLA — `nombre` no está en `perfilSchema`, así que `validar()` lo descarta en silencio y nada cambia (el primer test falla porque `fila.nombre` sigue siendo `'Miembro Uno'`).

- [ ] **Step 3: Importar `auditar` en `directorio.js`**

En `backend/src/directorio.js`, reemplazar:

```js
import { authMiddleware } from './auth.js';
```

por:

```js
import { authMiddleware, auditar } from './auth.js';
```

- [ ] **Step 4: Añadir `nombre` a `perfilSchema` y a la ruta**

En `backend/src/directorio.js`, reemplazar el bloque `perfilSchema` + `r.patch('/perfil', ...)` completo por:

```js
const perfilSchema = z.object({
  // El nombre nace con esta fase: "Mi perfil" ya dejaba corregir telefono,
  // correo, foto y cumpleanos, pero no el dato que mas se nota cuando esta
  // mal — quien se registro como "juan perez" quedaba asi para siempre.
  nombre: z.string().trim().min(1, 'falta el nombre')
    .max(120, 'el nombre es demasiado largo (máximo 120 caracteres)').optional(),
  telefono: z.string().trim().max(50).optional(),
  email: z.string().trim().max(200).optional(),
  cumple: z.string().trim().refine(v => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v),
    'la fecha debe ser YYYY-MM-DD o vacia').optional(),
  // La foto de perfil se sube por /api/upload. Aceptar cualquier host permitia
  // apuntarla a un servidor ajeno que registra a todo el que abre el directorio.
  foto_url: zRutaSubidaOpcional(1000).optional(),
  mostrar_telefono: z.coerce.number().int().min(0).max(1).optional(),
  mostrar_email: z.coerce.number().int().min(0).max(1).optional()
});
r.patch('/perfil', validar(perfilSchema), (req, res) => {
  // Se necesita el nombre VIEJO antes de sobreescribirlo, solo para dejarlo
  // en la auditoria (que dice "de que a que" cambio).
  const nombreViejo = req.body.nombre !== undefined
    ? db.prepare('SELECT nombre FROM persona WHERE id = ?').get(req.user.persona_id).nombre
    : null;

  const campos = ['nombre', 'telefono', 'email', 'cumple', 'foto_url', 'mostrar_telefono', 'mostrar_email'];
  const sets = [];
  const valores = [];
  for (const c of campos) {
    if (req.body[c] === undefined) continue;
    sets.push(`${c} = ?`);
    valores.push(req.body[c]);
  }
  if (sets.length) {
    valores.push(req.user.persona_id);
    db.prepare(`UPDATE persona SET ${sets.join(', ')} WHERE id = ?`).run(...valores);
  }

  // Derecho a rectificacion (ARCO): sincroniza la UNICA copia denormalizada
  // que hay (aprobacion_log.actor_nombre, ver spec) con el mismo patron de una
  // linea que ya usa cuenta.js al anonimizar una cuenta eliminada, y deja
  // rastro de quien se corrigio a si mismo y que decia antes.
  if (req.body.nombre !== undefined) {
    db.prepare('UPDATE aprobacion_log SET actor_nombre = ? WHERE actor_id = ?')
      .run(req.body.nombre, req.user.persona_id);
    auditar(req.user.iglesia_id, req.user.persona_id, 'corregir_nombre', 'directorio',
      `${nombreViejo} → ${req.body.nombre}`);
  }
  res.json({ ok: true });
});
```

⚠️ `sets` se sigue construyendo desde la lista blanca `campos`, nunca desde las
claves del body: es lo que impide inyectar SQL por el nombre de un campo. Solo
se le añadió `'nombre'` a esa lista, ya blindada.

- [ ] **Step 5: Correr el test y verlo pasar**

Run: `cd backend && node --test test/corregir-nombre.test.js`
Expected: PASA — 5 tests.

- [ ] **Step 6: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **461 tests, 0 fail** (456 + 5).

- [ ] **Step 7: Commit**

```bash
git add backend/src/directorio.js backend/test/corregir-nombre.test.js
git commit -m "feat(directorio): poder corregir el propio nombre, que antes era para siempre"
```

---

### Task 2: El pastor corrige el nombre de otro (cuando esa persona no puede sola)

**Files:**
- Modify: `backend/src/admin.js` (`editarUsuarioSchema`, `PATCH /usuarios/:id`)
- Test: `backend/test/corregir-nombre.test.js` (añadir al final)

**Interfaces:**
- Consumes: lo de Task 1 (mismo patrón de sincronizar `aprobacion_log`); `personaDeIglesia`, `auditar`, ya importados en `admin.js`.
- Produces: `PATCH /api/admin/usuarios/:id` acepta ahora `nombre` junto a `activo`/`es_pastor` → `{ok:true}`, o **404** si la persona no es de tu iglesia, o **403** si intentas tocar una cuenta de sistema (super-admin/obispo) o si quien pide no es pastor. Task 4 lo consume.

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `backend/test/corregir-nombre.test.js` (reutiliza los helpers de arriba, no dupliques el arnés):

```js
// ------------------------------------------------------------
//  El pastor corrige el nombre de OTRA persona.
//  Mismo argumento que ya justifica "Restablecer contraseña" (admin.js): sin
//  eso, quien no puede resolverlo sola (no entra a la app, o no sabe donde
//  mirar) se queda con el nombre mal escrito para siempre.
// ------------------------------------------------------------
const corregirOtro = (actor, id, nombre, iglesiaId = SEM.iglesiaId) => fetch(base + '/api/admin/usuarios/' + id, {
  method: 'PATCH', headers: H(actor, iglesiaId), body: JSON.stringify({ nombre })
});

test('PATCH /api/admin/usuarios/:id: el pastor corrige el nombre de otro', async () => {
  const res = await corregirOtro(SEM.pastor, SEM.miembro1.id, 'Juan Pérez');
  assert.equal(res.status, 200);

  const fila = db.prepare('SELECT nombre FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(fila.nombre, 'Juan Pérez');
});

test('PATCH /api/admin/usuarios/:id: sincroniza aprobacion_log.actor_nombre de la persona corregida', async () => {
  logAprobacion(SEM.miembro1.id, 'Miembro Uno');

  await corregirOtro(SEM.pastor, SEM.miembro1.id, 'Juan Pérez');

  const fila = db.prepare('SELECT actor_nombre FROM aprobacion_log WHERE actor_id = ?').get(SEM.miembro1.id);
  assert.equal(fila.actor_nombre, 'Juan Pérez');
});

test('PATCH /api/admin/usuarios/:id: corregir el nombre queda auditado, sin duplicar editar_usuario', async () => {
  await corregirOtro(SEM.pastor, SEM.miembro1.id, 'Juan Pérez');

  const especifico = db.prepare("SELECT * FROM auditoria WHERE accion = 'corregir_nombre_usuario'").get();
  assert.ok(especifico, 'corregir el nombre de otro tiene que dejar rastro propio');
  assert.equal(especifico.actor_id, SEM.pastor.id);
  assert.match(especifico.detalle, /Miembro Uno/);
  assert.match(especifico.detalle, /Juan Pérez/);

  const generico = db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'editar_usuario'").get();
  assert.equal(generico.n, 0, 'un PATCH que solo trae nombre no debe generar tambien un editar_usuario vacio');
});

test('PATCH /api/admin/usuarios/:id: un lider que NO es pastor -> 403 (no cambia nada)', async () => {
  const res = await corregirOtro(SEM.lider, SEM.miembro1.id, 'Cualquier Cosa');
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT nombre FROM persona WHERE id = ?').get(SEM.miembro1.id).nombre, 'Miembro Uno');
});

test('PATCH /api/admin/usuarios/:id: usuario de OTRA iglesia -> 404 (no cambia nada)', async () => {
  const ig2 = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA3')").run().lastInsertRowid);
  const ajenoId = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,'x','Feligres De Otra','h',1)"
  ).run(ig2).lastInsertRowid);

  const res = await corregirOtro(SEM.pastor, ajenoId, 'Nombre Que No Debe Quedar');
  assert.equal(res.status, 404);
  assert.equal(db.prepare('SELECT nombre FROM persona WHERE id = ?').get(ajenoId).nombre, 'Feligres De Otra');
});

test('PATCH /api/admin/usuarios/:id: corregir el nombre del super-admin -> 403', async () => {
  db.prepare("UPDATE persona SET rol_global = 'super_admin' WHERE id = ?").run(SEM.ajeno.id);
  const res = await corregirOtro(SEM.pastor, SEM.ajeno.id, 'Cualquier Cosa');
  assert.equal(res.status, 403);
});

test('PATCH /api/admin/usuarios/:id: corregir el nombre del obispo -> 403', async () => {
  db.prepare("UPDATE persona SET rol_global = 'obispo' WHERE id = ?").run(SEM.ajeno.id);
  const res = await corregirOtro(SEM.pastor, SEM.ajeno.id, 'Cualquier Cosa');
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT nombre FROM persona WHERE id = ?').get(SEM.ajeno.id).nombre, 'Feligres Ajeno');
});

test('PATCH /api/admin/usuarios/:id: nombre vacio -> 400 en castellano', async () => {
  const res = await corregirOtro(SEM.pastor, SEM.miembro1.id, '');
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /nombre/i);
});

test('PATCH /api/admin/usuarios/:id: nombre de 121+ caracteres -> 400 en castellano', async () => {
  const res = await corregirOtro(SEM.pastor, SEM.miembro1.id, 'x'.repeat(121));
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /120|largo/i);
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/corregir-nombre.test.js`
Expected: FALLA en los tests nuevos — `editarUsuarioSchema` descarta `nombre` en silencio, así que nada cambia y las aserciones de `fila.nombre === 'Juan Pérez'` fallan.

- [ ] **Step 3: Añadir `nombre` a `editarUsuarioSchema` y a la ruta**

En `backend/src/admin.js`, reemplazar el bloque `editarUsuarioSchema` + `r.patch('/usuarios/:id', ...)` completo por:

```js
const editarUsuarioSchema = z.object({
  activo: z.boolean().optional(),
  es_pastor: z.boolean().optional(),
  // Nace con esta fase: antes el pastor solo podia activar/desactivar o
  // marcar pastor, nunca corregir un nombre mal escrito de alguien que no
  // puede arreglarselo solo (no entra a la app, o no sabe donde mirar).
  nombre: z.string().trim().min(1, 'falta el nombre')
    .max(120, 'el nombre es demasiado largo (máximo 120 caracteres)').optional()
});
r.patch('/usuarios/:id', validar(editarUsuarioSchema), (req, res) => {
  const ig = req.user.iglesia_id;
  const p = personaDeIglesia(req.params.id, ig);
  if (!p) return res.status(404).json({ error: 'Usuario no encontrado' });
  const yo = req.user.persona_id;

  // Mismo guardia que el reset de clave: el super-admin y el obispo no son
  // miembros de la congregacion, sus cuentas estan por encima del pastor.
  if (p.rol_global === 'super_admin' || p.rol_global === 'obispo')
    return res.status(403).json({ error: 'Esta cuenta no se administra desde la iglesia' });

  const { activo, es_pastor, nombre } = req.body;
  if (typeof activo === 'boolean') {
    if (p.id === yo && !activo) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
    db.prepare('UPDATE persona SET activo = ? WHERE id = ?').run(activo ? 1 : 0, p.id);
  }
  if (typeof es_pastor === 'boolean') {
    if (p.id === yo && !es_pastor) return res.status(400).json({ error: 'No puedes quitarte a ti mismo el rol de Pastor' });
    db.prepare('UPDATE persona SET es_pastor = ? WHERE id = ?').run(es_pastor ? 1 : 0, p.id);
  }
  // Corregir el nombre de otro: mismo patron de sincronizacion de una linea
  // que ya usa cuenta.js al anonimizar una cuenta eliminada. Se audita aparte
  // (con el nombre viejo y el nuevo) en vez de sumarse al 'editar_usuario' de
  // mas abajo, que no dice QUE cambio.
  if (typeof nombre === 'string') {
    db.prepare('UPDATE persona SET nombre = ? WHERE id = ?').run(nombre, p.id);
    db.prepare('UPDATE aprobacion_log SET actor_nombre = ? WHERE actor_id = ?').run(nombre, p.id);
    auditar(ig, yo, 'corregir_nombre_usuario', 'admin', `${p.nombre} → ${nombre}`);
  }
  // El 'editar_usuario' generico solo tiene sentido cuando de verdad se tocó
  // activo/es_pastor: si el PATCH solo traía nombre, ya quedó auditado arriba
  // con mas detalle (que decia antes, que dice ahora), y duplicarlo aqui solo
  // ensuciaria el log.
  if (typeof activo === 'boolean' || typeof es_pastor === 'boolean') {
    auditar(ig, yo, 'editar_usuario', 'admin', `${p.nombre}`);
  }
  res.json({ ok: true });
});
```

⚠️ El `UPDATE persona` de nombre usa `p.id` (la fila ya resuelta y acotada por
`iglesia_id`), nunca `req.params.id` crudo — es lo que mantiene el aislamiento
entre iglesias sin escribir una guardia nueva.

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd backend && node --test test/corregir-nombre.test.js`
Expected: PASA — 14 tests en total (5 de la Task 1 + 9 de esta).

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **470 tests, 0 fail** (461 + 9).

- [ ] **Step 6: Commit**

```bash
git add backend/src/admin.js backend/test/corregir-nombre.test.js
git commit -m "feat(admin): que el pastor pueda corregir el nombre de quien no puede solo"
```

---

### Task 3: El campo en pantalla — "Mi perfil"

**Files:**
- Modify: `web/app.js` — `vistaPerfilDirectorio()` (~línea 2842) y `guardarPerfilDirectorio()` (~línea 2870)

**Interfaces:**
- Consumes: `PATCH /api/directorio/perfil` (Task 1), que ya acepta `nombre`.
- Produces: la pantalla "Mi perfil" muestra y guarda el nombre.

⚠️ Este archivo lo puede estar tocando otra persona en paralelo (otro módulo).
Antes de editar, reconfirma los números de línea con
`grep -n "function vistaPerfilDirectorio" web/app.js`.

- [ ] **Step 1: Añadir el campo al formulario**

En `vistaPerfilDirectorio()`, justo antes del campo Teléfono, añadir:

```js
    <label for="dp-nombre">Nombre</label>
    <input id="dp-nombre" value="${escHtml(ME.persona.nombre||'')}" maxlength="120"/>
```

⚠️ `escHtml` **obligatorio** en el `value`: sin él, un nombre con comillas
rompe el atributo (mismo patrón que ya usan `dp-tel` y `dp-email` en esa
misma pantalla).

- [ ] **Step 2: Mandarlo al guardar**

En `guardarPerfilDirectorio()`, añadir `nombre` al `body`:

```js
  const body={
    nombre:$('dp-nombre').value.trim(),
    telefono:$('dp-tel').value.trim(),
    email:$('dp-email').value.trim(),
    cumple:fechaSelectValor('dp-cumple'),
    mostrar_telefono:$('dp-mostrar-tel').checked,
    mostrar_email:$('dp-mostrar-email').checked,
  };
```

Y tras guardar con éxito, refrescar `ME.persona.nombre` (varias pantallas lo
leen de memoria, ej. el avatar de esta misma vista):

```js
      await api('/directorio/perfil',{method:'PATCH',body:JSON.stringify(body)});
      if(ME.persona) ME.persona.nombre=body.nombre;
      toast('✅ Perfil actualizado');
      vistaDirectorio();
```

- [ ] **Step 3: Probarlo en el navegador**

Servidor propio en un puerto libre, `DISABLE_RATE_LIMIT=1`, `JWT_SECRET=local`,
`DB_PATH` a una BD de usar y tirar en el scratchpad. Siembra con
`node src/seed.js`. Iglesia `MONTESION`, clave `1234`.

⚠️ **NO uses `scripts/with_server.py`**: en Windows deja el node huérfano y la
corrida siguiente lee su BD vieja. Mata tu proceso al terminar.

Comprobar: entrar a "Mi perfil" → el campo Nombre sale con el nombre actual →
cambiarlo y Guardar → vuelve al Directorio con el nombre nuevo en la propia
tarjeta → sin errores de consola.

- [ ] **Step 4: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **470, 0 fail** — esta tarea no toca backend; si el número cambia,
algo se salió de alcance.

- [ ] **Step 5: Commit**

```bash
git add web/app.js
git commit -m "feat(directorio): que 'Mi perfil' tenga donde corregir el propio nombre"
```

---

### Task 4: Corregir el nombre de otro desde Admin > Usuarios

**Files:**
- Modify: `web/app.js` — `renderAdmin()` (~línea 3011) y una función nueva `adminCorregirNombre(id)`

**Interfaces:**
- Consumes: `PATCH /api/admin/usuarios/:id` (Task 2); helpers ya existentes `modalPrompt(msg, cb, opts)`, `api()`, `escHtml()`, `toast()`.
- Produces: botón "✏️ Corregir nombre" en cada fila de usuario (no en las
  cuentas de sistema), función global `adminCorregirNombre(id)`.

- [ ] **Step 1: Botón en cada fila**

En `renderAdmin()`, en el bloque de botones por usuario (junto a "🔑
Restablecer contraseña"), añadir:

```js
          <button class="link" onclick="adminCorregirNombre(${u.id})">✏️ Corregir nombre</button>
          ${puedeResetear?`<button class="link" onclick="adminResetClave(${u.id})">🔑 Restablecer contraseña</button>`:''}
```

(El botón de corregir nombre va **fuera** del `if(puedeResetear)`: a
diferencia de la clave, no hay ninguna razón de seguridad para bloquear que el
pastor corrija su **propio** nombre por este mismo camino — ya lo puede hacer
desde "Mi perfil", esto es solo un atajo. Las cuentas de sistema ya están
fuera de este bloque entero, por el `esCuentaDeSistema?...` que las envuelve.)

- [ ] **Step 2: La función que abre el cuadro y guarda**

Añadir después de `adminResetClave` (mismo patrón: buscar el usuario en
`window._admin.usuarios`, pedir el dato con un modal, `api()`, refrescar):

```js
function adminCorregirNombre(id){
  const u=(window._admin.usuarios||[]).find(x=>x.id===id); if(!u) return;
  modalPrompt(`Nuevo nombre para <b>${escHtml(u.nombre)}</b>.`, async(nombre)=>{
    try{ await api('/admin/usuarios/'+id,{method:'PATCH',body:JSON.stringify({nombre})});
      toast('✅ Nombre corregido'); vistaAdmin(); }
    catch(e){ toast(e.message); }
  }, {titulo:'Corregir nombre', placeholder:'Nombre completo', valor:u.nombre, okLabel:'Guardar'});
}
```

⚠️ `escHtml(u.nombre)` en el mensaje es **obligatorio**: `modalPrompt` mete su
primer argumento crudo en `innerHTML` (mismo motivo que `modalConfirm`, ver
Global Constraints). El `valor:u.nombre` del tercer argumento **no** necesita
`escHtml`: `modalPrompt` ya lo escapa internamente al ponerlo en el atributo
`value` del `<input>` (`web/app.js:2941`, `value="${escHtml(opts.valor||'')}"`).

- [ ] **Step 3: Probarlo en el navegador**

Mismo montaje que la Task 3, entrando como **`pastor`**.

Comprobar: el botón "✏️ Corregir nombre" sale en cada fila de usuario y **no**
en las cuentas de sistema · se abre con el nombre actual ya escrito en el
campo · guardar refresca la lista con el nombre nuevo · escribir un nombre con
`<script>` o comillas no rompe la pantalla (se ve como texto, no se ejecuta) ·
sin errores de consola.

- [ ] **Step 4: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **470, 0 fail**.

- [ ] **Step 5: Commit**

```bash
git add web/app.js
git commit -m "feat(admin): que el pastor pueda corregir el nombre de otro desde la pantalla"
```

---

### Task 5: Dejarlo escrito

**Files:**
- Modify: `ESTADO.md`
- Modify: `docs/superpowers/specs/2026-07-23-consentimiento-legal-arco-design.md`

- [ ] **Step 1: Cerrar el punto en `ESTADO.md`**

En la sección "👉 POR DÓNDE RETOMAR" donde dice *"3. **Corregir el nombre de
una persona**…"*, marcarlo como hecho (mismo estilo que los puntos ya
tachados con `✅ ~~…~~`) y anotar el número final de tests (**470**) y que
quedó autoservicio + asistido por el pastor.

- [ ] **Step 2: Corregir la afirmación del spec ARCO**

En `docs/superpowers/specs/2026-07-23-consentimiento-legal-arco-design.md`,
la línea:

> **Rectificación** — ya existe (editar perfil en Directorio / cuenta en
> Ajustes): solo se enlaza/menciona.

era falsa para el nombre (no aceptaba ese campo). Añadir una nota al pie de
esa línea señalando que se cerró el 31-jul-2026 con
`docs/superpowers/specs/2026-07-31-corregir-nombre-design.md`, para que quien
lea ese spec después no se crea la promesa vieja sin más.

- [ ] **Step 3: Commit**

```bash
git add ESTADO.md docs/superpowers/specs/2026-07-23-consentimiento-legal-arco-design.md
git commit -m "docs(estado): corregir el nombre de una persona, cerrado"
```
