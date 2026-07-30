# "No puedo servir ese día" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una persona pueda marcar "del 5 al 12 de agosto no puedo servir", y que su líder lo vea **antes** de asignarle algo.

**Architecture:** La tabla `fecha_no_disp` y el aviso al asignar **ya existen** (`db.js:149-156`, `asignaciones.js:51-54`, `web/app.js:1117`); nadie escribe en ella. Se añade un módulo backend propio (`disponibilidad.js`) con cuatro rutas, una sección en "Mi Servicio" para que cada quien marque lo suyo, y una marca en el desplegable de personas de la pantalla "Servicio".

**Tech Stack:** Node ESM · Express 4.21 · `node:sqlite` (DatabaseSync) · zod 4 · frontend vanilla JS (template strings en `innerHTML`) · tests `node:test` · Playwright (Python) para navegador.

**Spec:** `docs/superpowers/specs/2026-07-30-no-puedo-servir-design.md`

## Global Constraints

- **Nunca convertir zonas horarias.** `desde`/`hasta` son fechas sin hora en texto `YYYY-MM-DD` y se comparan como texto. Cinco fallos de este proyecto salieron de convertir a hora local cosas que no lo necesitaban. No usar `fechaLocal()` ni `new Date()` para estos campos.
- **`persona_id` sale SIEMPRE del token** (`req.user.persona_id`), nunca del body ni de la URL.
- **Aislamiento entre iglesias:** `fecha_no_disp` no tiene columna de iglesia; cuelga de la persona. Toda consulta que cruce personas debe unir con `persona` y filtrar por `iglesia_id`.
- **Mensajes de validación en castellano dentro del esquema zod.** Desde el 30 jul el middleware `validar()` los reaprovecha; una clave sin mensaje propio sale como "revisa el campo". En zod 4 el parámetro es `error`, **nunca `errorMap`** (se ignora en silencio).
- **Motivo:** máximo 200 caracteres.
- **Borrar lo ajeno responde 404**, no 403, para no confirmar que existe.
- La suite completa (`cd backend && npm test`) está en **420 tests en verde** y no debe bajar.
- Commits en castellano, minúsculas, `tipo(ámbito): efecto para la persona`. Sin coautoría ni menciones a Claude.

---

### Task 1: El módulo de disponibilidad — mis periodos

**Files:**
- Create: `backend/src/disponibilidad.js`
- Modify: `backend/src/server.js` (añadir el `app.use`, junto a los demás routers ~línea 364)
- Test: `backend/test/disponibilidad.test.js`

**Interfaces:**
- Consumes: `authMiddleware` de `./auth.js`; `validar` de `./seguridad.js`; `db` de `./db.js`.
- Produces: `GET /api/disponibilidad/mias` → `[{id, desde, hasta, motivo}]` ordenado por `desde`. `POST /api/disponibilidad` con `{desde, hasta, motivo?}` → `{ok:true, id}`. `DELETE /api/disponibilidad/:id` → `{ok:true}` o 404. Task 2 añade una ruta más a este mismo router; Task 4 consume estas tres.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/disponibilidad.test.js`:

```js
// ============================================================
//  "No puedo servir ese dia": cada quien marca sus propias fechas.
//  La tabla fecha_no_disp existia desde siempre y nadie la escribia.
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

beforeEach(() => { db.exec('DELETE FROM fecha_no_disp'); reiniciar(db); SEM = sembrarMinimo(db); });

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

const crear = (persona, cuerpo) => fetch(base + '/api/disponibilidad', {
  method: 'POST', headers: H(persona), body: JSON.stringify(cuerpo)
});

test('marco un periodo y lo veo en mi lista', async () => {
  const res = await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', motivo: 'Viaje' });
  assert.equal(res.status, 200);

  const mias = await (await fetch(base + '/api/disponibilidad/mias', { headers: H(SEM.miembro1) })).json();
  assert.equal(mias.length, 1);
  assert.equal(mias[0].desde, '2026-08-05');
  assert.equal(mias[0].hasta, '2026-08-12');
  assert.equal(mias[0].motivo, 'Viaje');
});

test('el motivo es opcional', async () => {
  assert.equal((await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-05' })).status, 200);
  const mias = await (await fetch(base + '/api/disponibilidad/mias', { headers: H(SEM.miembro1) })).json();
  assert.equal(mias[0].motivo, null);
});

test('solo veo los mios, nunca los de otro', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', motivo: 'Viaje' });
  const mias = await (await fetch(base + '/api/disponibilidad/mias', { headers: H(SEM.miembro2) })).json();
  assert.deepEqual(mias, []);
});

test('el persona_id del body se ignora: manda el del token', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', persona_id: SEM.miembro2.id });
  const fila = db.prepare('SELECT persona_id FROM fecha_no_disp').get();
  assert.equal(fila.persona_id, SEM.miembro1.id, 'debe quedar a nombre de quien lo mando, no de quien diga el body');
});

test('borro el mio', async () => {
  const { id } = await (await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12' })).json();
  const res = await fetch(base + '/api/disponibilidad/' + id, { method: 'DELETE', headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM fecha_no_disp').get().n, 0);
});

test('NO puedo borrar el de otro, y responde 404 (no confirma que exista)', async () => {
  const { id } = await (await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12' })).json();
  const res = await fetch(base + '/api/disponibilidad/' + id, { method: 'DELETE', headers: H(SEM.miembro2) });
  assert.equal(res.status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM fecha_no_disp').get().n, 1, 'no debe haberlo borrado');
});

test('hasta anterior a desde -> 400 en castellano', async () => {
  const res = await crear(SEM.miembro1, { desde: '2026-08-12', hasta: '2026-08-05' });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /anterior/i);
  assert.doesNotMatch(error, /hasta|desde/, 'no debe soltarle al usuario el nombre tecnico del campo');
});

test('un motivo larguisimo -> 400', async () => {
  const res = await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', motivo: 'x'.repeat(201) });
  assert.equal(res.status, 400);
});

test('una fecha con formato raro -> 400', async () => {
  assert.equal((await crear(SEM.miembro1, { desde: '5/8/2026', hasta: '2026-08-12' })).status, 400);
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/disponibilidad.test.js`
Expected: FALLA — todas las peticiones dan 404 porque `/api/disponibilidad` no está montado.

- [ ] **Step 3: Escribir el módulo**

Crear `backend/src/disponibilidad.js`:

```js
// ============================================================
//  Disponibilidad: "no puedo servir del X al Y".
//
//  La tabla fecha_no_disp existia desde siempre y asignaciones.js YA la
//  consulta al asignar, pero nadie la escribia nunca. Esto es la mitad que
//  faltaba. Ver docs/superpowers/specs/2026-07-30-no-puedo-servir-design.md
//
//  Cada quien marca SOLO lo suyo: el persona_id sale del token, nunca del body.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware } from './auth.js';
import { validar } from './seguridad.js';

const r = Router();
r.use(authMiddleware);

// Fecha sin hora. NO se convierte a zona horaria en ningun momento: se guarda y
// se compara como texto YYYY-MM-DD, que ordena igual que cronologicamente.
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const periodoSchema = z.object({
  desde: z.string().trim().regex(FECHA, 'elige la fecha de inicio (día, mes y año)'),
  hasta: z.string().trim().regex(FECHA, 'elige la fecha de término (día, mes y año)'),
  motivo: z.string().trim().max(200, 'el motivo es muy largo (máximo 200 caracteres)').optional()
}).refine(p => p.hasta >= p.desde, {
  error: 'la fecha de término no puede ser anterior a la de inicio',
  path: ['hasta']
});

// GET /api/disponibilidad/mias
r.get('/mias', (req, res) => {
  res.json(db.prepare(
    'SELECT id, desde, hasta, motivo FROM fecha_no_disp WHERE persona_id = ? ORDER BY desde'
  ).all(req.user.persona_id));
});

// POST /api/disponibilidad
r.post('/', validar(periodoSchema), (req, res) => {
  const { desde, hasta, motivo } = req.body;
  const info = db.prepare(
    'INSERT INTO fecha_no_disp (persona_id, desde, hasta, motivo) VALUES (?,?,?,?)'
  ).run(req.user.persona_id, desde, hasta, motivo || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

// DELETE /api/disponibilidad/:id — solo el propio.
// 404 (y no 403) a proposito: no confirma que ese periodo exista.
r.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM fecha_no_disp WHERE id = ? AND persona_id = ?')
    .run(req.params.id, req.user.persona_id);
  if (!info.changes) return res.status(404).json({ error: 'Periodo no encontrado' });
  res.json({ ok: true });
});

export default r;
```

- [ ] **Step 4: Montar el router**

En `backend/src/server.js`, junto al import de los demás routers, añadir:

```js
import disponibilidadRouter from './disponibilidad.js';
```

Y junto a `app.use('/api/asignaciones', asignacionesRouter);` (~línea 364):

```js
app.use('/api/disponibilidad', disponibilidadRouter);
```

- [ ] **Step 5: Correr el test y verlo pasar**

Run: `cd backend && node --test test/disponibilidad.test.js`
Expected: PASA — 9 tests.

⚠️ Si falla el test de `hasta` anterior a `desde` con un mensaje en inglés, el `.refine` no está entregando su mensaje: comprobar que se usa `error:` y no `message:` (zod 4).

- [ ] **Step 6: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **429 tests, 0 fail** (420 + 9).

- [ ] **Step 7: Commit**

```bash
git add backend/src/disponibilidad.js backend/src/server.js backend/test/disponibilidad.test.js
git commit -m "feat(disponibilidad): que cada quien pueda decir cuando no puede servir"
```

---

### Task 2: Que el líder sepa quién no puede, antes de asignar

**Files:**
- Modify: `backend/src/disponibilidad.js` (una ruta más)
- Test: `backend/test/disponibilidad.test.js` (añadir al final)

**Interfaces:**
- Consumes: el router de Task 1; `esLiderOAdmin` de `./auth.js`.
- Produces: `GET /api/disponibilidad/no-disponibles?fecha=YYYY-MM-DD` → array plano de `persona_id` (números, sin repetir). **No devuelve motivos.** Task 5 lo consume.

⚠️ **Esta ruta estrena `validar(schema, 'query')`, que no se usa en ningún sitio del proyecto todavía.** Express 4 permite reasignar `req.query`; en Express 5 no. El test de abajo lo demuestra en vez de darlo por bueno — si al correrlo el 400 no llega, hay que validar la query a mano en el handler.

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `backend/test/disponibilidad.test.js`:

```js
// ------------------------------------------------------------
//  El lider ve quien no puede ANTES de asignar.
// ------------------------------------------------------------
const noDisp = (persona, fecha, iglesiaId) =>
  fetch(base + '/api/disponibilidad/no-disponibles?fecha=' + fecha, { headers: H(persona, iglesiaId) });

test('el lider ve el id de quien marco no disponible ese dia', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', motivo: 'Viaje' });
  const ids = await (await noDisp(SEM.lider, '2026-08-07')).json();
  assert.deepEqual(ids, [SEM.miembro1.id]);
});

test('los bordes del periodo cuentan como no disponible', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12' });
  assert.deepEqual(await (await noDisp(SEM.lider, '2026-08-05')).json(), [SEM.miembro1.id]);
  assert.deepEqual(await (await noDisp(SEM.lider, '2026-08-12')).json(), [SEM.miembro1.id]);
  assert.deepEqual(await (await noDisp(SEM.lider, '2026-08-13')).json(), []);
});

test('NO devuelve los motivos: al lider le basta con saber quien', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', motivo: 'Tratamiento medico' });
  const texto = await (await noDisp(SEM.lider, '2026-08-07')).text();
  assert.doesNotMatch(texto, /Tratamiento/, 'el motivo no debe viajar en esta respuesta');
});

test('dos periodos solapados de la misma persona no la duplican', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12' });
  await crear(SEM.miembro1, { desde: '2026-08-07', hasta: '2026-08-20' });
  assert.deepEqual(await (await noDisp(SEM.lider, '2026-08-08')).json(), [SEM.miembro1.id]);
});

test('un lider de OTRA iglesia no ve a mi gente', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12' });

  const otraIglesia = Number(db.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA')"
  ).run().lastInsertRowid);
  const pastorAjeno = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,'pastor2','Pastor Ajeno','x',1,1)"
  ).run(otraIglesia).lastInsertRowid);

  const ids = await (await noDisp({ id: pastorAjeno }, '2026-08-07', otraIglesia)).json();
  assert.deepEqual(ids, [], 'no debe ver a nadie de la iglesia de al lado');
});

test('un feligres cualquiera no puede consultar la lista', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12' });
  assert.equal((await noDisp(SEM.miembro2, '2026-08-07')).status, 403);
});

test('sin fecha o con fecha invalida -> 400 (esto estrena validar(...,"query"))', async () => {
  assert.equal((await noDisp(SEM.lider, '')).status, 400);
  assert.equal((await noDisp(SEM.lider, '7-8-2026')).status, 400);
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/disponibilidad.test.js`
Expected: FALLA — la ruta no existe; `/no-disponibles` cae en el `GET /mias`... no, da 404.

- [ ] **Step 3: Añadir la ruta**

En `backend/src/disponibilidad.js`, cambiar el import de `auth.js` y añadir la ruta **antes** de `export default r;`:

```js
import { authMiddleware, esLiderOAdmin } from './auth.js';
```

```js
// GET /api/disponibilidad/no-disponibles?fecha=YYYY-MM-DD
// Para que el lider lo vea ANTES de asignar (hoy el aviso llega despues, cuando
// a la persona ya le salio el push "te asignaron").
//
// Devuelve SOLO ids, nunca motivos: con eso basta para pintar la marca en el
// desplegable, y no le manda al navegador del lider los motivos de toda la iglesia.
const fechaQuerySchema = z.object({
  fecha: z.string().trim().regex(FECHA, 'elige una fecha')
});
r.get('/no-disponibles', validar(fechaQuerySchema, 'query'), (req, res) => {
  if (!esLiderOAdmin(req.user.persona_id))
    return res.status(403).json({ error: 'Solo quien asigna servicios puede ver esto' });
  // El JOIN con persona es lo que impide ver a gente de otra iglesia:
  // fecha_no_disp NO tiene columna de iglesia, cuelga de la persona.
  const filas = db.prepare(
    `SELECT DISTINCT f.persona_id
       FROM fecha_no_disp f
       JOIN persona p ON p.id = f.persona_id
      WHERE p.iglesia_id = ? AND ? BETWEEN f.desde AND f.hasta`
  ).all(req.user.iglesia_id, req.query.fecha);
  res.json(filas.map(f => f.persona_id));
});
```

⚠️ Colocarla **antes** de `r.delete('/:id', …)` no hace falta (son métodos distintos), pero sí debe ir **después** de `r.use(authMiddleware)`.

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd backend && node --test test/disponibilidad.test.js`
Expected: PASA — 16 tests.

Si el último test falla (no llega el 400), `validar(…, 'query')` no funciona en este Express: sustituir el middleware por una comprobación a mano dentro del handler:
```js
if (!FECHA.test(String(req.query.fecha || ''))) return res.status(400).json({ error: 'Datos inválidos: elige una fecha' });
```
y dejar anotado en el test por qué.

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **436 tests, 0 fail**.

- [ ] **Step 6: Commit**

```bash
git add backend/src/disponibilidad.js backend/test/disponibilidad.test.js
git commit -m "feat(disponibilidad): que el lider lo sepa antes de asignar, no despues"
```

---

### Task 3: Darse de baja borra también los periodos

**Files:**
- Modify: `backend/src/cuenta.js` (dentro de la transacción de eliminación, junto a `DELETE FROM push_sub`, ~línea 199)
- Test: `backend/test/disponibilidad.test.js` (añadir al final)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada que otras tareas usen.

**Por qué:** el motivo es texto libre y puede ser un dato delicado ("operación de mi mamá"). Hoy la baja **anonimiza** la persona (le pone `usuario = 'eliminado_<id>'`) en vez de borrar la fila, así que los periodos sobrevivirían enganchados a la persona anonimizada. `cuenta.js` ya limpia `reset_codigo`, notificaciones de cumpleaños, `push_sub` y `dispositivo_push`; falta esta.

- [ ] **Step 1: Escribir el test que falla**

La ruta de baja es **`POST /api/cuenta/eliminar`** (`cuenta.js:161`), sin cuerpo. Ojo con las guardas que ya tiene: devuelve 409 al super-admin y al pastor único de la iglesia. `SEM.miembro1` no es ninguno de los dos, así que sirve.

Añadir al final de `backend/test/disponibilidad.test.js`:

```js
test('al eliminar mi cuenta desaparecen mis periodos de no disponible', async () => {
  await crear(SEM.miembro1, { desde: '2026-08-05', hasta: '2026-08-12', motivo: 'Tratamiento medico' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM fecha_no_disp').get().n, 1);

  const res = await fetch(base + '/api/cuenta/eliminar', { method: 'POST', headers: H(SEM.miembro1), body: '{}' });
  assert.equal(res.status, 200);

  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM fecha_no_disp WHERE persona_id = ?').get(SEM.miembro1.id).n, 0,
    'el motivo es un dato personal: no puede sobrevivir a la baja'
  );
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/disponibilidad.test.js`
Expected: FALLA — queda 1 fila.

- [ ] **Step 3: Añadir el borrado**

En `backend/src/cuenta.js`, **dentro de la transacción**, junto a las otras dos líneas de limpieza:

```js
    db.prepare('DELETE FROM push_sub WHERE persona_id = ?').run(pid);
    db.prepare('DELETE FROM dispositivo_push WHERE persona_id = ?').run(pid);
    // El motivo de "no puedo servir" es texto libre y puede ser delicado
    // ("operacion de mi mama"): no debe sobrevivir a la baja.
    db.prepare('DELETE FROM fecha_no_disp WHERE persona_id = ?').run(pid);
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd backend && node --test test/disponibilidad.test.js`
Expected: PASA — 17 tests.

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **437 tests, 0 fail**.

- [ ] **Step 6: Commit**

```bash
git add backend/src/cuenta.js backend/test/disponibilidad.test.js
git commit -m "fix(cuenta): darse de baja tambien borra los motivos de no disponible"
```

---

### Task 4: La sección en "Mi Servicio"

**Files:**
- Modify: `web/app.js` — `vistaMiServicio()` (~línea 1027-1080)

**Interfaces:**
- Consumes: `GET /api/disponibilidad/mias`, `POST /api/disponibilidad`, `DELETE /api/disponibilidad/:id` (Task 1). Helpers ya existentes: `api()`, `escHtml()`, `fechaSelectHTML(prefijo, valor, opts)`, `fechaSelectValor(prefijo)`, `fechaTxt()`, `toast()`, `conBoton()`, `modalConfirm()`.
- Produces: funciones globales `cargarNoDisp()`, `formNoDisp()`, `guardarNoDisp()`, `borrarNoDisp(id)`.

⚠️ **Trampa:** `vistaMiServicio` hace `if(!total){ … return; }` en la línea 1036 — se corta y muestra "No tienes nada asignado por ahora". **Quien no sirve nunca no llegaría jamás a la sección nueva.** Hay que pintar la sección en los dos caminos.

- [ ] **Step 1: Reestructurar el corte temprano**

En `web/app.js`, reemplazar la línea 1036:

```js
  if(!total){ cont.className=''; cont.innerHTML='<div class="placeholder"><div class="big">🙌</div><p>No tienes nada asignado por ahora.</p></div>'; return; }
```

por:

```js
  // Ojo: aunque no tengas NADA asignado, la seccion de "cuando no puedo servir"
  // tiene que salir igual — si no, quien todavia no sirve nunca podria marcar
  // sus fechas, que es justo cuando mas falta hace avisarlo.
  const vacio = !total ? '<div class="placeholder"><div class="big">🙌</div><p>No tienes nada asignado por ahora.</p></div>' : '';
```

Y en la **línea 1082**, reemplazar:

```js
  cont.innerHTML=html;
```

por:

```js
  cont.innerHTML = vacio + html + seccionNoDisp();
  cargarNoDisp();
```

(Los números de línea son los de hoy; si el archivo se movió, buscar `cont.innerHTML=html;` dentro de `vistaMiServicio`.)

- [ ] **Step 2: Escribir las funciones nuevas**

Añadir en `web/app.js`, justo después de `vistaMiServicio`:

```js
// ============================================================
//  "Cuando no puedo servir" — cada quien marca SOLO lo suyo.
//  La tabla existia desde siempre y asignaciones.js ya avisaba al lider; lo que
//  faltaba era esto. Ver docs/superpowers/specs/2026-07-30-no-puedo-servir-design.md
// ============================================================
function seccionNoDisp(){
  return `<h3 class="section-title">📆 Cuándo no puedo servir</h3>
    <div class="card">
      <div class="head-row"><p class="muted small" style="margin:0">Marca los días que no estarás. Tu líder lo verá al asignar.</p>
        <button class="btn small-btn" onclick="formNoDisp()">+ Marcar fechas</button></div>
      <div id="form-nodisp"></div>
      <div id="nodisp-lista" class="muted">…</div>
    </div>`;
}
async function cargarNoDisp(){
  const c=$('nodisp-lista'); if(!c) return;
  try{
    const p=await api('/disponibilidad/mias');
    c.className=p.length?'list':'muted';
    c.innerHTML=p.length? p.map(x=>`<div class="item-card flex">
      <div style="flex:1"><div class="item-titulo">${fechaTxt(x.desde)} – ${fechaTxt(x.hasta)}</div>
        ${x.motivo?`<div class="muted small">${escHtml(x.motivo)}</div>`:''}</div>
      <button class="btn ghost small-btn" aria-label="Quitar este periodo" onclick="borrarNoDisp(${x.id})">✕</button>
    </div>`).join('') : '<p class="small">No has marcado ningún día.</p>';
  }catch{
    c.className='muted';
    c.innerHTML='<p class="error small">No se pudo cargar · <a href="javascript:cargarNoDisp()" class="link" style="display:inline;padding:0">Reintentar</a></p>';
  }
}
function formNoDisp(){ const z=$('form-nodisp'); if(z.innerHTML){z.innerHTML='';return;}
  z.innerHTML=`<div class="form-panel">
    <label>Desde</label><div>${fechaSelectHTML('nd1','')}</div>
    <label style="margin-top:10px">Hasta</label><div>${fechaSelectHTML('nd2','')}</div>
    <label for="nd-motivo" style="margin-top:10px">Motivo (opcional)</label>
    <input id="nd-motivo" maxlength="200" placeholder="Ej. Viaje"/>
    <button class="btn small-btn" style="margin-top:12px" onclick="guardarNoDisp()">Guardar</button></div>`; }
async function guardarNoDisp(){
  const desde=fechaSelectValor('nd1'), hasta=fechaSelectValor('nd2');
  if(!desde||!hasta) return toast('Elige las dos fechas');
  await conBoton(botonActual(), async()=>{
    try{
      await api('/disponibilidad',{method:'POST',body:JSON.stringify({desde,hasta,motivo:$('nd-motivo').value.trim()})});
      $('form-nodisp').innerHTML=''; cargarNoDisp(); toast('📆 Fechas marcadas');
    }catch(e){ toast(e.message); }
  }, 'Guardando…');
}
function borrarNoDisp(id){
  modalConfirm('¿Quitar este periodo? Volverás a aparecer como disponible esos días.', async()=>{
    try{ await api('/disponibilidad/'+id,{method:'DELETE'}); cargarNoDisp(); toast('Quitado'); }
    catch(e){ toast(e.message); }
  }, {okLabel:'Quitar', danger:true});
}
```

- [ ] **Step 3: Comprobar los nombres de los helpers**

Run: `cd .. && grep -n "function conBoton\|function botonActual\|function modalConfirm\|function fechaTxt" web/app.js`
Expected: los cuatro existen. Si `botonActual` no existe o `modalConfirm` tiene otra firma, ajustar la llamada a lo que haya (no inventar helpers).

- [ ] **Step 4: Probarlo en el navegador**

Levantar servidor propio (puerto poco común, BD de usar y tirar en el scratchpad, **nunca** `backend/iglesia.db`):

```bash
cd backend
DB_PATH=<scratchpad>/nodisp.db DISABLE_RATE_LIMIT=1 PORT=3192 JWT_SECRET=local node src/seed.js
DB_PATH=<scratchpad>/nodisp.db DISABLE_RATE_LIMIT=1 PORT=3192 JWT_SECRET=local node src/server.js
```

⚠️ **NO usar `scripts/with_server.py`**: en Windows deja el proceso node huérfano y la corrida siguiente se conecta a él con su BD vieja, dando resultados falsos sin avisar. Matar el proceso al terminar.

Comprobar a mano o con Playwright, entrando como `pastor` y como un feligrés sin asignaciones (iglesia `MONTESION`, clave `1234`):
- la sección aparece en "Mi Servicio" **también cuando no hay nada asignado**;
- se marca un periodo y sale en la lista;
- la equis pide confirmación y lo quita;
- `hasta` anterior a `desde` muestra el mensaje en castellano;
- sin errores de consola.

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **437 tests, 0 fail** — este paso no toca backend, así que si el número cambia, algo se salió de alcance.

- [ ] **Step 6: Commit**

```bash
git add web/app.js
git commit -m "feat(mi servicio): marcar los dias en que no puedo servir"
```

---

### Task 5: La marca en el desplegable del líder

**Files:**
- Modify: `web/app.js` — `vistaServicio()` (~línea 1095-1112)

**Interfaces:**
- Consumes: `GET /api/disponibilidad/no-disponibles?fecha=` (Task 2); `api()`, `escHtml()`, `fechaTxt()`.
- Produces: función global `pintarNoDispServicio()`.

⚠️ El desplegable de evento **no tiene opción vacía**: viene con el primero ya seleccionado (`web/app.js:1100`). Hay que pintar la marca también al abrir la pantalla, no solo al cambiar de evento.

- [ ] **Step 1: Guardar las fechas de los eventos y enganchar el `change`**

En `vistaServicio()`, reemplazar el bloque que construye los `<option>` y el `innerHTML` por:

```js
    // La fecha de cada evento viaja en el <option> para saber que dia consultar.
    const ev=eventos.map(e=>`<option value="${e.id}" data-fecha="${escHtml(e.fecha)}">${escHtml(e.titulo)} (${fechaTxt(e.fecha)})</option>`).join('');
    const ps=personas.map(p=>`<option value="${p.id}">${escHtml(p.nombre)}</option>`).join('');
```

y en el `innerHTML`, cambiar la línea del select de evento por:

```js
      <label for="sv-ev">Evento</label><select id="sv-ev" onchange="pintarNoDispServicio()">${ev}</select>
```

Al final del `try`, después del `innerHTML`, añadir:

```js
    pintarNoDispServicio();   // el select de evento ya viene con uno elegido
```

- [ ] **Step 2: Escribir `pintarNoDispServicio`**

Añadir después de `vistaServicio`:

```js
// Marca en el desplegable a quien dijo que no puede ese dia.
// Se hace ANTES de asignar a proposito: el aviso de despues llega cuando a la
// persona ya le salto el push "te asignaron".
async function pintarNoDispServicio(){
  const selEv=$('sv-ev'), selP=$('sv-persona');
  if(!selEv||!selP) return;
  const fecha=selEv.selectedOptions[0]?.dataset.fecha||'';
  // Limpiar siempre primero: si falla la consulta, mejor sin marcas que con
  // marcas del evento anterior, que serian mentira.
  for(const o of selP.options) o.textContent=o.dataset.nombre||o.textContent;
  for(const o of selP.options) if(!o.dataset.nombre) o.dataset.nombre=o.textContent;
  if(!fecha) return;
  try{
    const ids=await api('/disponibilidad/no-disponibles?fecha='+encodeURIComponent(fecha));
    const set=new Set(ids.map(String));
    for(const o of selP.options) if(set.has(o.value)) o.textContent=o.dataset.nombre+' ⚠️ no disponible';
  }catch{ /* sin marcas: nunca bloquea ni rompe la pantalla */ }
}
```

- [ ] **Step 3: Probarlo en el navegador**

Con el mismo servidor de la Task 4 (`pastor` / `1234`):
- crear un evento con fecha conocida;
- entrar como un miembro y marcarse no disponible ese día;
- volver como `pastor` a "Servicio": el nombre sale con `⚠️ no disponible` **al abrir**, sin tocar nada;
- cambiar a un evento de otra fecha y ver que la marca desaparece;
- asignar igual y comprobar que sigue saliendo el aviso de siempre ("✅ Asignado y avisado. ⚠️ …") — **no debe bloquear**;
- sin errores de consola.

Matar el proceso node al terminar.

- [ ] **Step 4: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **437 tests, 0 fail**.

- [ ] **Step 5: Commit**

```bash
git add web/app.js
git commit -m "feat(servicio): ver quien no puede antes de asignarle, no despues"
```

---

### Task 6: Dejarlo escrito

**Files:**
- Modify: `ESTADO.md`

- [ ] **Step 1: Actualizar `ESTADO.md`**

Añadir una sección con: qué se construyó, que `repetir` sigue sin usarse **y por qué** (la consulta de `asignaciones.js:53` no la mira), que el motivo lo ve el líder sin aviso previo (riesgo asumido, primer sitio donde mirar si la gente escribe cosas delicadas), y el número nuevo de tests. Retirar de "por dónde retomar" el punto de "no puedo servir ese día", que queda cerrado.

- [ ] **Step 2: Commit**

```bash
git add ESTADO.md
git commit -m "docs(estado): 'no puedo servir ese dia' cerrado"
```
