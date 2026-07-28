# Organización v2 — Responsable por cosa, aviso y "Mi parte" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada cosa a llevar tenga un responsable, que a esa persona se le avise, y que pueda ver y marcar lo suyo sin que se le abra la hoja entera.

**Architecture:** Dos columnas idempotentes sobre `evento_org_cosa` (sin tablas nuevas). El feligrés accede por una **rendija**: dos rutas (`GET /mis-cosas`, `PATCH /mis-cosas/:cosaId`) registradas **después** de `r.use(authMiddleware)` y **antes** del gate de líderes, que devuelven solo sus propias líneas — nunca gastos, totales ni cosas de otros. El aviso reusa el patrón de `asignaciones.js` (fila en `notificacion` + `enviarPush().catch()`), y el recordatorio de día-1 se suma como tercer generador en `recordatorios.js`.

**Tech Stack:** Node.js ESM, Express, `node:sqlite` (`DatabaseSync`, síncrono), `zod` + `validar`, frontend vanilla JS. Tests con `node:test`.

## Global Constraints

- `node:sqlite` es SÍNCRONO: nada de async en las consultas.
- Decisiones del dueño ya tomadas: **el responsable puede ser cualquier persona activa de la iglesia** (no solo del grupo), y **el feligrés NO ve los gastos** — solo su línea.
- Aislamiento por `iglesia_id` en toda consulta. Cosa/hoja de otra iglesia → 404.
- Editar la hoja (incluido asignar responsable) sigue siendo del **creador o el pastor** (`hojaEditable`). Marcar "ya lo tengo" es del **responsable**, y se autoriza por `responsable_id === persona_id`, no por `hojaEditable`.
- PATCH parcial: campo ausente CONSERVA su valor. `responsable_id: null` explícito = desasignar.
- Comentarios en español, **sin tildes** en `backend/src/` (estilo del repo). El frontend sí lleva tildes.
- Frontend: `escHtml` en todo dato de usuario, `conBoton(botonActual(), ...)`, `toast`, `modalConfirm`.
- Al terminar cada tarea: `cd backend && node --test` completo en verde. Base al empezar: **206 tests**.

## File Structure

- Modify: `backend/src/db.js` — 2 columnas idempotentes (junto a los otros `agregarColumna`, ~línea 566).
- Modify: `backend/src/organizacion.js` — `armarHoja` expone el responsable; `editarCosaSchema` acepta `responsable_id`; aviso al asignar; 2 rutas nuevas de la rendija.
- Modify: `backend/src/recordatorios.js` — tercer generador (día-1).
- Modify: `web/app.js` — chip "Asignar" en la hoja (líder) + sección "📦 Mi parte" en Mi Servicio (todos).
- Test: `backend/test/organizacion-responsable.test.js` — archivo nuevo, para no engordar `organizacion.test.js`.

---

### Task 1: Columnas + el responsable visible en la hoja

**Files:**
- Modify: `backend/src/db.js` (tras `agregarColumna('movimiento', ...)`, ~línea 566)
- Modify: `backend/src/organizacion.js` (función `armarHoja`)
- Test: `backend/test/organizacion-responsable.test.js` (crear)

**Interfaces:**
- Produces: columnas `evento_org_cosa.responsable_id` (INTEGER, FK a persona) y `evento_org_cosa.asignada_en` (TEXT). `armarHoja` devuelve en cada cosa: `responsable_id`, `responsable_nombre`, `responsable_activo`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/organizacion-responsable.test.js`:

```js
// ============================================================
//  Organizacion v2: responsable por cosa, aviso y "Mi parte".
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

// Siembra: iglesia + pastor + lider (admin de grupo) + feligres + grupo.
function sembrar(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const nueva = (usuario, nombre, pastor = 0) => Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,'x',?,1)"
  ).run(iglesiaId, usuario + '_' + codigo, nombre, pastor).lastInsertRowid);
  const pastorId = nueva('pas', 'Pastor', 1);
  const liderId = nueva('lid', 'Lider');
  const feligresId = nueva('fel', 'Feligres Juan');
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  const grupoId = Number(g.lastInsertRowid);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(liderId, grupoId);
  return { iglesiaId, pastorId, liderId, feligresId, grupoId };
}

// Crea una hoja suelta con una cosa; devuelve {hojaId, cosaId}.
async function hojaConCosa(b, S, titulo = 'Almuerzo') {
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo }) });
  const hojaId = (await res.json()).id;
  res = await fetch(b + `/api/organizacion/${hojaId}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Jugos nectar', cantidad: 5 }) });
  const cosaId = (await res.json()).id;
  return { hojaId, cosaId, auth };
}

test('el esquema guarda responsable y la hoja lo devuelve con nombre y estado', async () => {
  const b = await servidor();
  const S = sembrar('RESP');
  const { hojaId, cosaId, auth } = await hojaConCosa(b, S);

  // Sin asignar: los tres campos vienen vacios, no ausentes.
  let hoja = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hoja.cosas[0].responsable_id, null);
  assert.equal(hoja.cosas[0].responsable_nombre, null);

  // Se asigna directo en la BD (el endpoint llega en la Task 2).
  db.prepare('UPDATE evento_org_cosa SET responsable_id = ? WHERE id = ?').run(S.feligresId, cosaId);
  hoja = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hoja.cosas[0].responsable_id, S.feligresId);
  assert.equal(hoja.cosas[0].responsable_nombre, 'Feligres Juan');
  assert.equal(hoja.cosas[0].responsable_activo, 1);

  // Cuenta desactivada: el dato NO se borra, se marca como inactivo para que la
  // interfaz pueda decir "reasignar" en vez de dejar la linea huerfana.
  db.prepare('UPDATE persona SET activo = 0 WHERE id = ?').run(S.feligresId);
  hoja = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hoja.cosas[0].responsable_id, S.feligresId);
  assert.equal(hoja.cosas[0].responsable_nombre, 'Feligres Juan');
  assert.equal(hoja.cosas[0].responsable_activo, 0);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && node --test test/organizacion-responsable.test.js`
Expected: FAIL — `responsable_id` es `undefined` (la columna no existe y `armarHoja` no la selecciona).

- [ ] **Step 3: Añadir las columnas**

En `backend/src/db.js`, junto a los otros `agregarColumna` (después del bloque de `movimiento`, ~línea 566):

```js
// EVENTO_ORG_COSA: quien se comprometio a traer esta cosa (Organizacion v2).
//  responsable_id: persona de la MISMA iglesia y activa al momento de asignar.
//  asignada_en: cuando se asigno; el recordatorio de dia-1 y el "no re-avisar"
//  se apoyan en este dato.
agregarColumna('evento_org_cosa', 'responsable_id', 'INTEGER REFERENCES persona(id)');
agregarColumna('evento_org_cosa', 'asignada_en', 'TEXT');
```

- [ ] **Step 4: Exponer el responsable en `armarHoja`**

En `backend/src/organizacion.js`, reemplazar la consulta de `cosas` dentro de `armarHoja`:

```js
  // LEFT JOIN (no INNER): una cosa sin responsable debe seguir apareciendo.
  // responsable_activo permite avisar en la hoja "cuenta inactiva - reasignar"
  // sin borrar el dato a espaldas del lider.
  const cosas = db.prepare(
    `SELECT c.id, c.nombre, c.cantidad, c.listo, c.orden, c.responsable_id,
            p.nombre AS responsable_nombre, p.activo AS responsable_activo
       FROM evento_org_cosa c LEFT JOIN persona p ON p.id = c.responsable_id
      WHERE c.org_id = ? ORDER BY c.orden, c.id`
  ).all(org.id);
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && node --test test/organizacion-responsable.test.js`
Expected: PASS (1 test).

- [ ] **Step 6: Correr la suite completa**

Run: `cd backend && node --test`
Expected: PASS — 207 tests (206 de base + 1 nuevo).

- [ ] **Step 7: Commit**

```bash
git add backend/src/db.js backend/src/organizacion.js backend/test/organizacion-responsable.test.js
git commit -m "feat(organizacion): columna de responsable por cosa y su estado en la hoja"
```

---

### Task 2: Asignar responsable (PATCH) + aviso al asignado

**Files:**
- Modify: `backend/src/organizacion.js` (`editarCosaSchema` y el handler `PATCH /cosas/:cosaId`)
- Test: `backend/test/organizacion-responsable.test.js`

**Interfaces:**
- Consumes: `hojaEditable`, `validar`, `z` (ya existen en el archivo).
- Produces: `PATCH /api/organizacion/cosas/:cosaId` acepta `responsable_id` (número | `null`). Al asignar a alguien NUEVO, inserta fila en `notificacion` (tipo `'organizacion'`) y llama `enviarPush`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/organizacion-responsable.test.js`:

```js
test('asignar responsable: valida la persona, avisa una sola vez y permite desasignar', async () => {
  const b = await servidor();
  const S = sembrar('ASIG');
  const { cosaId, auth } = await hojaConCosa(b, S);
  const avisos = () => db.prepare("SELECT COUNT(*) n FROM notificacion WHERE persona_id = ? AND tipo = 'organizacion'").get(S.feligresId).n;

  // Asignar a un feligres de la iglesia: 200 + aviso + asignada_en
  let res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });
  assert.equal(res.status, 200);
  const fila = db.prepare('SELECT responsable_id, asignada_en FROM evento_org_cosa WHERE id = ?').get(cosaId);
  assert.equal(fila.responsable_id, S.feligresId);
  assert.ok(fila.asignada_en, 'debe registrar cuando se asigno');
  assert.equal(avisos(), 1);

  // Re-mandar el MISMO responsable no vuelve a avisar (el lider edita la lista
  // muchas veces mientras la arma; no se puede bombardear a la gente).
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });
  assert.equal(res.status, 200);
  assert.equal(avisos(), 1);

  // Cambiar el nombre de la cosa tampoco avisa.
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ nombre: 'Jugos de naranja' }) });
  assert.equal(res.status, 200);
  assert.equal(avisos(), 1);
  assert.equal(db.prepare('SELECT responsable_id FROM evento_org_cosa WHERE id = ?').get(cosaId).responsable_id, S.feligresId,
    'un PATCH que no menciona responsable_id no debe desasignar');

  // Desasignar con null explicito.
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: null }) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT responsable_id FROM evento_org_cosa WHERE id = ?').get(cosaId).responsable_id, null);
});

test('asignar responsable: rechaza personas de otra iglesia, inactivas o inexistentes', async () => {
  const b = await servidor();
  const A = sembrar('ASGA');
  const B = sembrar('ASGB');
  const { cosaId, auth } = await hojaConCosa(b, A);

  // Persona de OTRA iglesia -> 400 (no se filtra que exista: es un dato invalido)
  let res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: B.feligresId }) });
  assert.equal(res.status, 400);

  // Persona inexistente -> 400
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: 999999 }) });
  assert.equal(res.status, 400);

  // Persona desactivada -> 400 (no se puede asignar a alguien que no puede entrar)
  db.prepare('UPDATE persona SET activo = 0 WHERE id = ?').run(A.feligresId);
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: A.feligresId }) });
  assert.equal(res.status, 400);
  db.prepare('UPDATE persona SET activo = 1 WHERE id = ?').run(A.feligresId);

  // Y la cosa quedo intacta
  assert.equal(db.prepare('SELECT responsable_id FROM evento_org_cosa WHERE id = ?').get(cosaId).responsable_id, null);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && node --test test/organizacion-responsable.test.js`
Expected: FAIL — el PATCH ignora `responsable_id` (zod lo descarta), así que `responsable_id` sigue `null` y `avisos()` da 0.

- [ ] **Step 3: Implementar**

En `backend/src/organizacion.js`, añadir el import del push junto a los demás (arriba del archivo):

```js
import { enviarPush } from './push.js';
```

Ampliar `editarCosaSchema`:

```js
const editarCosaSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  cantidad: z.coerce.number().int().min(1).optional(),
  listo: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
  // null explicito = desasignar. Ausente = no tocar (PATCH parcial de v1).
  responsable_id: z.coerce.number().int().positive().nullable().optional()
});
```

Reemplazar el handler `r.patch('/cosas/:cosaId', ...)` completo por:

```js
r.patch('/cosas/:cosaId', validar(editarCosaSchema), (req, res) => {
  const cosa = db.prepare('SELECT * FROM evento_org_cosa WHERE id = ?').get(Number(req.params.cosaId));
  if (!cosa) return res.status(404).json({ error: 'Cosa no encontrada' });
  const org = hojaEditable(req, res, cosa.org_id);   // valida iglesia (404) y permiso (403)
  if (!org) return;
  const { nombre, cantidad, listo, responsable_id } = req.body;

  // El responsable puede ser CUALQUIER persona activa de la iglesia (decision
  // del dueño): media hoja es suelta y no cuelga de ningun grupo, y quien trae
  // la torta a veces no esta en el grupo.
  if (responsable_id != null) {
    const p = db.prepare('SELECT id FROM persona WHERE id = ? AND iglesia_id = ? AND activo = 1')
      .get(responsable_id, req.user.iglesia_id);
    if (!p) return res.status(400).json({ error: 'Esa persona no esta en tu iglesia o su cuenta esta inactiva' });
  }

  const cambiaResponsable = responsable_id !== undefined && responsable_id !== cosa.responsable_id;
  db.prepare('UPDATE evento_org_cosa SET nombre=?, cantidad=?, listo=?, responsable_id=?, asignada_en=? WHERE id=?').run(
    nombre ?? cosa.nombre,
    cantidad ?? cosa.cantidad,
    listo === undefined ? cosa.listo : (listo ? 1 : 0),
    responsable_id === undefined ? cosa.responsable_id : responsable_id,
    cambiaResponsable && responsable_id != null ? new Date().toISOString().slice(0, 19).replace('T', ' ') : cosa.asignada_en,
    cosa.id
  );

  // Avisar SOLO cuando el responsable cambia de verdad: el lider edita la lista
  // muchas veces mientras la arma y no puede bombardear a la gente.
  if (cambiaResponsable && responsable_id != null) {
    const nom = nombre ?? cosa.nombre;
    const cant = cantidad ?? cosa.cantidad;
    const titulo = `📦 Traer: ${nom} ×${cant}`;
    const donde = org.titulo || 'un evento';
    const texto = `Para "${donde}"` + (org.hora_llegada ? ` · llegar ${org.hora_llegada}` : '');
    db.prepare('INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?,?,?,?)')
      .run(responsable_id, 'organizacion', titulo, texto);
    enviarPush([responsable_id], { titulo, texto }).catch(() => {});
  }
  res.json({ ok: true });
});
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && node --test test/organizacion-responsable.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && node --test`
Expected: PASS — 209 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/organizacion.js backend/test/organizacion-responsable.test.js
git commit -m "feat(organizacion): asignar responsable a una cosa y avisarle"
```

---

### Task 3: La rendija — `GET /mis-cosas` y `PATCH /mis-cosas/:cosaId`

**Files:**
- Modify: `backend/src/organizacion.js` (rutas nuevas, ubicación crítica)
- Test: `backend/test/organizacion-responsable.test.js`

**Interfaces:**
- Produces: `GET /api/organizacion/mis-cosas` → array de `{id, nombre, cantidad, listo, hoja_titulo, fecha, hora_llegada, evento_titulo, lugar}`. **Nunca** gastos ni totales. `PATCH /api/organizacion/mis-cosas/:cosaId` con `{listo}` → `{ok}`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/organizacion-responsable.test.js`:

```js
test('mis-cosas: el feligres ve SOLO su linea, sin gastos ni cosas de otros', async () => {
  const b = await servidor();
  const S = sembrar('MIAS');
  const { hojaId, cosaId, auth } = await hojaConCosa(b, S, 'Almuerzo de jovenes');
  const authFel = { Authorization: 'Bearer ' + tok(S.feligresId, S.iglesiaId), 'Content-Type': 'application/json' };

  // Una segunda cosa que NO es suya, y un gasto en la misma hoja.
  let res = await fetch(b + `/api/organizacion/${hojaId}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Pan', cantidad: 3 }) });
  const cosaAjena = (await res.json()).id;
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Carbon', monto: 12000 }) });
  await fetch(b + '/api/organizacion/' + hojaId, { method: 'PATCH', headers: auth, body: JSON.stringify({ hora_llegada: '12:30' }) });
  await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });

  // El feligres SIGUE sin poder entrar al modulo por la puerta grande.
  assert.equal((await fetch(b + '/api/organizacion', { headers: authFel })).status, 403);
  assert.equal((await fetch(b + '/api/organizacion/' + hojaId, { headers: authFel })).status, 403);

  // Pero ve lo suyo por la rendija.
  res = await fetch(b + '/api/organizacion/mis-cosas', { headers: authFel });
  assert.equal(res.status, 200);
  const mias = await res.json();
  assert.equal(mias.length, 1, 'solo la linea asignada a el');
  assert.equal(mias[0].id, cosaId);
  assert.equal(mias[0].nombre, 'Jugos nectar');
  assert.equal(mias[0].cantidad, 5);
  assert.equal(mias[0].hoja_titulo, 'Almuerzo de jovenes');
  assert.equal(mias[0].hora_llegada, '12:30');
  // Nada de dinero ni de cosas ajenas en la respuesta.
  const crudo = JSON.stringify(mias);
  assert.ok(!crudo.includes('12000') && !crudo.toLowerCase().includes('gasto'), 'no puede filtrarse ningun gasto');
  assert.ok(!crudo.includes('Pan'), 'no puede ver las cosas de otros');
  assert.ok(!crudo.includes('total'), 'no puede ver totales');

  // Marca "ya lo tengo".
  res = await fetch(b + `/api/organizacion/mis-cosas/${cosaId}`, { method: 'PATCH', headers: authFel, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT listo FROM evento_org_cosa WHERE id = ?').get(cosaId).listo, 1);

  // NO puede tocar la linea de otro (403), ni cambiarle el nombre a la suya.
  res = await fetch(b + `/api/organizacion/mis-cosas/${cosaAjena}`, { method: 'PATCH', headers: authFel, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT listo FROM evento_org_cosa WHERE id = ?').get(cosaAjena).listo, 0);
  res = await fetch(b + `/api/organizacion/mis-cosas/${cosaId}`, { method: 'PATCH', headers: authFel, body: JSON.stringify({ nombre: 'Otra cosa' }) });
  assert.equal(db.prepare('SELECT nombre FROM evento_org_cosa WHERE id = ?').get(cosaId).nombre, 'Jugos nectar');
});

test('mis-cosas: exige sesion y no cruza iglesias', async () => {
  const b = await servidor();
  const A = sembrar('MIAA');
  const B = sembrar('MIAB');
  const { cosaId, auth } = await hojaConCosa(b, A);
  await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: A.feligresId }) });

  // Sin token -> 401 (la ruta va DESPUES de authMiddleware, no antes)
  assert.equal((await fetch(b + '/api/organizacion/mis-cosas')).status, 401);

  // Un feligres de otra iglesia no ve nada y no puede marcar la cosa ajena.
  const authB = { Authorization: 'Bearer ' + tok(B.feligresId, B.iglesiaId), 'Content-Type': 'application/json' };
  assert.deepEqual(await (await fetch(b + '/api/organizacion/mis-cosas', { headers: authB })).json(), []);
  const res = await fetch(b + `/api/organizacion/mis-cosas/${cosaId}`, { method: 'PATCH', headers: authB, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 403);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && node --test test/organizacion-responsable.test.js`
Expected: FAIL — `GET /mis-cosas` responde **403** (lo atrapa el gate de líderes) en vez de 200.

- [ ] **Step 3: Implementar las dos rutas**

En `backend/src/organizacion.js`. **La ubicación es crítica:** van DESPUÉS de `r.use(authMiddleware)` y ANTES del `r.use` del gate de visibilidad. Si quedan por encima de `authMiddleware`, `req.user` es `undefined` y las rutas quedan abiertas.

```js
const r = Router();
r.use(authMiddleware);

// ---------- La rendija del feligres ----------
// Estas DOS rutas van a proposito entre authMiddleware y el gate de lideres:
// quien trae algo tiene que poder ver SU linea sin que se le abra la hoja, que
// contiene los gastos. Devuelven solo lo asignado a quien pregunta: nunca
// gastos, nunca totales, nunca las cosas de otros.
r.get('/mis-cosas', (req, res) => {
  const filas = db.prepare(
    `SELECT c.id, c.nombre, c.cantidad, c.listo,
            o.titulo AS hoja_titulo, o.fecha, o.hora_llegada,
            e.titulo AS evento_titulo, e.fecha AS evento_fecha, e.lugar
       FROM evento_org_cosa c
       JOIN evento_org o ON o.id = c.org_id
       LEFT JOIN evento e ON e.id = o.evento_id
      WHERE c.responsable_id = ? AND o.iglesia_id = ?
      ORDER BY COALESCE(e.fecha, o.fecha), c.id`
  ).all(req.user.persona_id, req.user.iglesia_id);
  res.json(filas);
});

// Solo el interruptor "ya lo tengo", y solo sobre lo propio. La autorizacion es
// responsable_id === persona_id, NO hojaEditable: el feligres no edita la hoja.
const misCosasSchema = z.object({ listo: z.union([z.boolean(), z.literal(0), z.literal(1)]) });
r.patch('/mis-cosas/:cosaId', validar(misCosasSchema), (req, res) => {
  const cosa = db.prepare(
    `SELECT c.id, c.responsable_id FROM evento_org_cosa c
       JOIN evento_org o ON o.id = c.org_id
      WHERE c.id = ? AND o.iglesia_id = ?`
  ).get(Number(req.params.cosaId), req.user.iglesia_id);
  if (!cosa || cosa.responsable_id !== req.user.persona_id)
    return res.status(403).json({ error: 'Esa no es una de tus cosas' });
  db.prepare('UPDATE evento_org_cosa SET listo = ? WHERE id = ?').run(req.body.listo ? 1 : 0, cosa.id);
  res.json({ ok: true });
});

// Gate de visibilidad: la organizacion (hojas, gastos, totales) es cosa de
// lideres/pastor. Todo lo que va DEBAJO de esta linea lo exige.
r.use((req, res, next) => {
  ...
```

> Nota: `misCosasSchema` exige `listo` (no es opcional): esta ruta existe solo para eso. Cualquier otro campo del cuerpo se descarta, así que `{nombre:'...'}` no renombra nada.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && node --test test/organizacion-responsable.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && node --test`
Expected: PASS — 211 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/organizacion.js backend/test/organizacion-responsable.test.js
git commit -m "feat(organizacion): el responsable ve y marca su parte sin ver los gastos"
```

---

### Task 4: Recordatorio de día-1 para quien trae algo

**Files:**
- Modify: `backend/src/recordatorios.js` (dentro de `generarRecordatorios`, tras el bloque 2 de eventos, ~línea 100)
- Test: `backend/test/organizacion-responsable.test.js`

**Interfaces:**
- Consumes: `enviarRecordatorio(iglesiaId, personaId, clave, titulo, texto)` y `diasHasta(fechaStr)`, ya existentes en el archivo.
- Produces: recordatorios con clave `org_cosa:<id>:dia-1`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/organizacion-responsable.test.js`:

```js
test('recordatorio: avisa el dia antes a quien trae algo, y una sola vez', async () => {
  const b = await servidor();
  const S = sembrar('RECO');
  const { cosaId, auth } = await hojaConCosa(b, S);
  const { generarRecordatorios } = await import('../src/recordatorios.js');

  // La hoja es para mañana.
  const manana = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  await fetch(b + '/api/organizacion/cosas/' + cosaId, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });
  db.prepare('UPDATE evento_org SET fecha = ? WHERE id = (SELECT org_id FROM evento_org_cosa WHERE id = ?)').run(manana, cosaId);

  const recordatorios = () => db.prepare(
    "SELECT COUNT(*) n FROM recordatorio_enviado WHERE persona_id = ? AND clave = ?"
  ).get(S.feligresId, `org_cosa:${cosaId}:dia-1`).n;

  generarRecordatorios(S.iglesiaId);
  assert.equal(recordatorios(), 1, 'debe recordarle el dia antes');

  // Correrlo de nuevo no duplica (dedupe por clave+persona).
  generarRecordatorios(S.iglesiaId);
  assert.equal(recordatorios(), 1);
});

test('recordatorio: no avisa si la hoja no tiene fecha ni evento', async () => {
  const b = await servidor();
  const S = sembrar('RECN');
  const { cosaId, auth } = await hojaConCosa(b, S);
  const { generarRecordatorios } = await import('../src/recordatorios.js');
  await fetch(b + '/api/organizacion/cosas/' + cosaId, { method: 'PATCH', headers: auth, body: JSON.stringify({ responsable_id: S.feligresId }) });
  // La hoja se creo sin fecha: no hay contra que contar los dias.
  generarRecordatorios(S.iglesiaId);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM recordatorio_enviado WHERE clave LIKE ?").get(`org_cosa:${cosaId}:%`).n, 0);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && node --test test/organizacion-responsable.test.js`
Expected: FAIL — no se crea ningún recordatorio (esperaba 1, obtuvo 0).

- [ ] **Step 3: Implementar el tercer generador**

En `backend/src/recordatorios.js`, dentro de `generarRecordatorios`, después del bloque 2 (eventos) y antes del `return`:

```js
  // 3) Recordatorios de COSAS QUE TRAER (Organizacion): 1 dia antes, a quien se
  // comprometio. La fecha sale del evento si la hoja cuelga de uno; si es una
  // lista suelta, de su propia fecha. Sin fecha no hay contra que contar: se omite.
  const cosas = db.prepare(
    `SELECT c.id, c.nombre, c.cantidad, c.responsable_id,
            COALESCE(e.fecha, o.fecha) AS fecha,
            COALESCE(e.titulo, o.titulo) AS donde, o.hora_llegada
       FROM evento_org_cosa c
       JOIN evento_org o ON o.id = c.org_id
       LEFT JOIN evento e ON e.id = o.evento_id
      WHERE o.iglesia_id = ? AND c.responsable_id IS NOT NULL
        AND c.listo = 0 AND COALESCE(e.fecha, o.fecha) IS NOT NULL`
  ).all(iglesiaId);
  for (const c of cosas) {
    if (diasHasta(c.fecha) !== 1) continue;   // solo "mañana"
    const clave = `org_cosa:${c.id}:dia-1`;
    if (enviarRecordatorio(iglesiaId, c.responsable_id, clave,
      `📦 Mañana: ${c.nombre} ×${c.cantidad}`,
      `No olvides llevar ${c.nombre} (×${c.cantidad}) a "${c.donde}"` +
      (c.hora_llegada ? ` · llegar ${c.hora_llegada}` : '') + '.')) creados++;
  }
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && node --test test/organizacion-responsable.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && node --test`
Expected: PASS — 213 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/recordatorios.js backend/test/organizacion-responsable.test.js
git commit -m "feat(organizacion): recordatorio el dia antes a quien trae algo"
```

---

### Task 5: Frontend — asignar en la hoja y "Mi parte" en Mi Servicio

**Files:**
- Modify: `web/app.js` (bloque `Org._render` y funciones nuevas; `vistaMiServicio` ~línea 907)
- Modify: `web/styles.css` (una regla para el chip del responsable)

**Interfaces:**
- Consumes: `GET /organizacion/mis-cosas`, `PATCH /organizacion/mis-cosas/:id`, `PATCH /organizacion/cosas/:id` con `responsable_id`, y `GET /directorio` (para el selector de personas).

- [ ] **Step 1: Chip de responsable en cada línea de la hoja**

En `web/app.js`, dentro de `Org._render`, reemplazar el `map` de `cosas` por:

```js
    const cosas=h.cosas.map(x=>{
      const inactivo = x.responsable_id && !x.responsable_activo;
      const quien = x.responsable_id
        ? `<button class="link" onclick="Org.asignar(${x.id})" title="Reasignar">👤 ${escHtml(x.responsable_nombre||'')}${inactivo?' <span style="color:var(--red-tx)">(cuenta inactiva — reasignar)</span>':''}</button>`
        : `<button class="link" onclick="Org.asignar(${x.id})">👤 Asignar</button>`;
      return `<div class="org-row">
        <label class="org-check"><input type="checkbox" ${x.listo?'checked':''} ${ed?'':'disabled'} onchange="Org.toggleCosa(${x.id}, this.checked)">
          <span class="${x.listo?'org-listo':''}">${escHtml(x.nombre)} <b>×${x.cantidad}</b></span></label>
        <div class="org-quien">${ed?quien:(x.responsable_nombre?'👤 '+escHtml(x.responsable_nombre):'')}</div>
        ${ed?`<button class="link icon-only" style="color:var(--red-tx)" aria-label="Quitar ${escHtml(x.nombre)}" onclick="Org.borrarCosa(${x.id})">✕</button>`:''}
      </div>`;
    }).join('') || '<p class="muted small">Sin cosas todavía.</p>';
```

- [ ] **Step 2: Modal de selección de persona**

Añadir al objeto `Org` (antes de la llave de cierre):

```js
  // Selector de responsable: cualquier persona activa de la iglesia (decisión
  // del dueño). El directorio ya devuelve a todos con su nombre.
  async asignar(cosaId){
    // GET /directorio devuelve un ARRAY plano de las personas activas de la
    // iglesia, ya ordenado por nombre (directorio.js:44-49), y es visible para
    // todos. No hace falta filtrar por activo ni ordenar aquí.
    let personas=[];
    try{ personas=await api('/directorio'); }
    catch(e){ return toast((e&&e.message)||'No se pudo cargar la lista'); }
    const opciones=personas.map(p=>`<button class="link" style="display:block;padding:8px 0;text-align:left;width:100%"
        onclick="Org.guardarResponsable(${cosaId}, ${p.id})">${escHtml(p.nombre)}</button>`).join('');
    const root=$('modal-root');
    root.innerHTML=`<div class="modal-bg"><div class="modal"><h3>¿Quién lo trae?</h3>
      <input id="org-buscar-persona" placeholder="Buscar por nombre" oninput="Org.filtrarPersonas(this.value)" />
      <div id="org-personas" style="max-height:46vh;overflow:auto;margin-top:10px">${opciones}</div>
      <div class="row" style="margin-top:12px">
        <button class="btn ghost" onclick="cerrarModal()">Cancelar</button>
        <button class="btn" onclick="Org.guardarResponsable(${cosaId}, null)">Quitar responsable</button>
      </div></div></div>`;
    root.classList.add('show');
  },
  filtrarPersonas(q){
    const t=(q||'').toLowerCase();
    $('org-personas').querySelectorAll('button').forEach(b=>{
      b.style.display = b.textContent.toLowerCase().includes(t) ? 'block' : 'none';
    });
  },
  async guardarResponsable(cosaId, personaId){
    cerrarModal();
    try{
      await api('/organizacion/cosas/'+cosaId,{method:'PATCH',body:JSON.stringify({responsable_id:personaId})});
      toast(personaId?'✅ Asignado y avisado':'Responsable quitado');
      Org._recargar();
    }catch(e){ toast((e&&e.message)||'No se pudo asignar'); }
  },
```

- [ ] **Step 3: Sección "Mi parte" en Mi Servicio**

En `web/app.js`, en `vistaMiServicio` (~línea 910), añadir el cuarto endpoint:

```js
  const [servicios,musica,tareas,misCosas]=await Promise.all([
    safe(api('/asignaciones/mio')), safe(api('/musica/mis-asignaciones')), safe(api('/grupo/mis-tareas')),
    safe(api('/organizacion/mis-cosas'))
  ]);
```

Actualizar el conteo total:

```js
  const total=(servicios?.length||0)+(musica?.length||0)+(tareas?.length||0)+(misCosas?.length||0);
```

Y añadir la sección al final del `html` (antes de `cont.innerHTML=html`):

```js
  // 4) Mi parte: lo que me comprometí a llevar (Organización)
  if(misCosas.length){
    html+='<h3 class="section-title">📦 Mi parte</h3><div class="list" style="margin-bottom:18px">'+misCosas.map(c=>{
      const donde=c.evento_titulo||c.hoja_titulo||'';
      const fecha=c.evento_fecha||c.fecha;
      return `<div class="item-card flex">
        <div style="flex:1"><div class="item-titulo ${c.listo?'org-listo':''}">${escHtml(c.nombre)} <b>×${c.cantidad}</b></div>
          <div class="muted small">${escHtml(donde)}${fecha?' · '+fechaTxt(fecha):''}${c.hora_llegada?' · 🕐 llegar '+escHtml(c.hora_llegada):''}${c.lugar?' · 📍 '+escHtml(c.lugar):''}</div></div>
        <button class="btn ${c.listo?'ghost ':''}small-btn" onclick="Org.marcarMio(${c.id}, ${c.listo?0:1})">${c.listo?'✓ Listo':'Ya lo tengo'}</button>
      </div>`;
    }).join('')+'</div>';
  }
```

Y el handler, en el objeto `Org`:

```js
  async marcarMio(id, listo){
    await conBoton(botonActual(), async()=>{
      try{ await api('/organizacion/mis-cosas/'+id,{method:'PATCH',body:JSON.stringify({listo:!!listo})}); vistaMiServicio(); }
      catch(e){ toast((e&&e.message)||'No se pudo actualizar'); }
    });
  },
```

- [ ] **Step 4: Estilo del chip**

En `web/styles.css`, junto a las reglas `.org-*`:

```css
.org-quien{font-size:0.8125rem;flex-shrink:0;max-width:45%;text-align:right;}
@media(max-width:520px){ .org-row{flex-wrap:wrap;} .org-quien{max-width:100%;text-align:left;} }
```

- [ ] **Step 5: Verificar en el navegador**

Sembrar una BD temporal, arrancar el servidor con `DISABLE_RATE_LIMIT=1` y comprobar el circuito completo: entrar como líder → abrir una hoja → asignar una cosa a un feligrés → salir → entrar como ese feligrés → **Mi Servicio** muestra "📦 Mi parte" con la línea → "Ya lo tengo" la marca → el líder ve el ✓ en su hoja. Confirmar que el feligrés **no** ve el apartado Organización en el menú y que `GET /api/organizacion` le sigue dando 403. Sin errores de consola, en claro y oscuro.

> El servidor huérfano del puerto 3000 y la puerta de consentimiento legal son las dos trampas conocidas de este arnés: ver `docs/AUDITORIA-UX-2026-07-27.md`.

- [ ] **Step 6: Commit**

```bash
git add web/app.js web/styles.css
git commit -m "feat(organizacion): asignar responsable en la hoja y Mi parte en Mi Servicio"
```

---

## Notas de cierre (no son tareas)

- Al terminar: suite completa en verde (213 tests) y pasada del auditor (`scripts/auditoria-ux.py`) para confirmar que la línea con responsable no rompe contraste ni área táctil en móvil.
- El spec deja fuera de esta pieza: `pagado_por` en los gastos, imprimir/copiar para WhatsApp, duplicar lista y el presupuesto por línea. Van después, en ese orden.

## Self-Review (hecho)

- **Cobertura del spec:** columnas + `armarHoja` (T1), asignación con validación y aviso una sola vez (T2), la rendija sin gastos (T3), recordatorio día-1 con dedupe (T4), interfaz en la hoja y en Mi Servicio (T5). La aserción de regresión de `foreign_key_check` al eliminar iglesia que pide el spec **ya existe** en `backend/test/organizacion.test.js` (test de cascada) y en `eliminarIglesia`; la FK nueva la cubre ese chequeo sin tarea adicional. ✔
- **Placeholders:** ninguno; todo el código va completo. ✔
- **Consistencia de tipos:** `responsable_id`/`responsable_nombre`/`responsable_activo` con los mismos nombres en T1, T2 y T5; `mis-cosas` devuelve `hoja_titulo`/`evento_titulo`/`hora_llegada`, que es lo que consume T5. ✔
