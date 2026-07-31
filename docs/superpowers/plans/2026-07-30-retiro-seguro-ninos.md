# Quién puede retirar a cada niño — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la maestra tenga dónde mirar quién puede retirar a cada niño, y que la ficha del niño se pueda corregir y borrar.

**Architecture:** La columna `nino.autorizados` y el `INSERT` que la guarda **ya existen**; el frontend no la menciona nunca. Se añade el campo en pantalla y dos rutas nuevas (`PATCH`/`DELETE`) al módulo, que hoy **solo sabe crear**.

**Tech Stack:** Node ESM · Express 4 · `node:sqlite` · zod 4 · frontend vanilla JS (template strings en `innerHTML`) · tests `node:test` · Playwright (Python).

**Spec:** `docs/superpowers/specs/2026-07-30-retiro-seguro-ninos-design.md`

## Global Constraints

- **Aislamiento entre iglesias:** resolver el niño **acotado por iglesia en la misma consulta** (`WHERE id = ? AND iglesia_id = ?`), nunca comprobarlo una línea después. Es el fallo exacto que el 30 jul se encontró en `musica.js`, donde borrar una canción vaciaba el orden del servicio de **otra** congregación. Si no es de tu iglesia: **404**, no 403.
- **Editar y borrar se auditan** con `auditar(iglesia_id, persona_id, accion, 'ninos', detalle)`. ⚠️ **`auditar` ya no está importado en `ninos.js`**: se quitó el 30 jul al retirar la asistencia, que era lo único que auditaba. Hay que volver a importarlo.
- **El borrado va en transacción**, y **las asistencias primero**: `asistencia_nino.nino_id` referencia `nino(id)`, así que borrar el niño primero revienta con `FOREIGN KEY constraint failed`.
- **Editar es `soloEncargado`** (`esLiderEdEstricto`): el pastor solo observa y recibe **403**.
- **Sin migración:** `autorizados` ya existe en `db.js:297`. No se toca el esquema.
- **`autorizados`: máximo 300 caracteres.** Mensajes de validación en castellano **dentro del esquema zod**; en zod 4 el parámetro es `error`, **nunca `errorMap`** (se ignora en silencio).
- **Nada de teléfono ni RUT** de los autorizados: son terceros que no firmaron nada. Nombre y parentesco.
- La suite completa (`cd backend && npm test`) está en **443 tests en verde** y no debe bajar.
- Commits en castellano, minúsculas, `tipo(ámbito): efecto para la persona`. Sin coautoría ni menciones a Claude.

---

### Task 1: Corregir la ficha de un niño

**Files:**
- Modify: `backend/src/ninos.js` (import de `auth.js`, y ruta nueva tras el `POST /ninos`)
- Test: `backend/test/ninos-editar-borrar.test.js` (nuevo)

**Interfaces:**
- Consumes: `soloEncargado` y `claseDeIglesia`, ya en el archivo; `validar` de `./seguridad.js`; `auditar` de `./auth.js`.
- Produces: `PATCH /api/ninos/ninos/:id` con cualquier subconjunto de `{nombre, edad, familia, alergias, autorizados}` → `{ok:true}`, o **404** si el niño no es de tu iglesia. Task 2 añade el `DELETE` al mismo archivo; Task 4 lo consume.

⚠️ **La ruta lleva `ninos/ninos`** porque el router se monta en `/api/ninos` y el recurso ya se llama `/ninos` (mismo prefijo que el `POST` que ya existe). Es feo, pero cambiarlo rompería el alta que funciona.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/ninos-editar-borrar.test.js`:

```js
// ============================================================
//  Escuela Dominical: corregir y borrar la ficha de un nino.
//  El modulo solo sabia crear: no habia ni un PATCH ni un DELETE, asi que
//  "quien puede retirarlo" no se podia cambiar nunca — y es justo el dato que
//  cambia (la abuela se muda, los padres se separan).
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

function limpiarExtra() {
  for (const t of ['asistencia_nino', 'leccion', 'nino', 'clase_ed', 'auditoria'])
    db.exec('DELETE FROM ' + t);
}
beforeEach(() => { limpiarExtra(); reiniciar(db); SEM = sembrarMinimo(db); });

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

// SEM.lider pasa a ser la encargada de Escuela Dominical.
function conEncargada() {
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)')
    .run(SEM.lider.id, SEM.grupoId, 'lider_ed');
}
function claseConNino(nombre = 'Sofia', autorizados = null) {
  const claseId = Number(db.prepare("INSERT INTO clase_ed (iglesia_id, nombre) VALUES (?, 'Parvulos')")
    .run(SEM.iglesiaId).lastInsertRowid);
  const ninoId = Number(db.prepare('INSERT INTO nino (iglesia_id, clase_id, nombre, autorizados) VALUES (?,?,?,?)')
    .run(SEM.iglesiaId, claseId, nombre, autorizados).lastInsertRowid);
  return { claseId, ninoId };
}
const editar = (persona, id, cuerpo, iglesiaId) => fetch(base + '/api/ninos/ninos/' + id, {
  method: 'PATCH', headers: H(persona, iglesiaId), body: JSON.stringify(cuerpo)
});

test('la encargada corrige quien puede retirar al nino', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia', 'Ana (abuela)');

  const res = await editar(SEM.lider, ninoId, { autorizados: 'Ana Rojas (abuela), Juan Perez (papa)' });
  assert.equal(res.status, 200);

  const fila = db.prepare('SELECT nombre, autorizados FROM nino WHERE id = ?').get(ninoId);
  assert.equal(fila.autorizados, 'Ana Rojas (abuela), Juan Perez (papa)');
  assert.equal(fila.nombre, 'Sofia', 'lo que no se mando no debe cambiar');
});

test('lo que no se manda no se toca', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia', 'Ana (abuela)');
  db.prepare("UPDATE nino SET alergias = 'mani', familia = 'Rojas' WHERE id = ?").run(ninoId);

  await editar(SEM.lider, ninoId, { nombre: 'Sofia Rojas' });

  const fila = db.prepare('SELECT nombre, alergias, familia, autorizados FROM nino WHERE id = ?').get(ninoId);
  assert.equal(fila.nombre, 'Sofia Rojas');
  assert.equal(fila.alergias, 'mani');
  assert.equal(fila.familia, 'Rojas');
  assert.equal(fila.autorizados, 'Ana (abuela)');
});

test('un encargado de OTRA iglesia recibe 404 y no cambia nada', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia', 'Ana (abuela)');

  const otraIglesia = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA')")
    .run().lastInsertRowid);
  const otroGrupo = Number(db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Ninos', '#2f7')")
    .run(otraIglesia).lastInsertRowid);
  const ajeno = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,'ed2','Encargada Ajena','x',1)"
  ).run(otraIglesia).lastInsertRowid);
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(ajeno, otroGrupo, 'lider_ed');

  const res = await editar({ id: ajeno }, ninoId, { autorizados: 'Cualquiera' }, otraIglesia);
  assert.equal(res.status, 404, 'no debe poder tocar a un nino de otra congregacion');

  const fila = db.prepare('SELECT autorizados FROM nino WHERE id = ?').get(ninoId);
  assert.equal(fila.autorizados, 'Ana (abuela)', 'y desde luego no debe haberlo cambiado');
});

test('el pastor solo observa: 403 al editar', async () => {
  conEncargada();
  const { ninoId } = claseConNino();
  const res = await editar(SEM.pastor, ninoId, { autorizados: 'Quien sea' });
  assert.equal(res.status, 403);
});

test('editar queda auditado', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia');
  await editar(SEM.lider, ninoId, { autorizados: 'Ana (abuela)' });

  const log = db.prepare("SELECT accion, modulo, detalle FROM auditoria WHERE accion = 'editar_nino'").get();
  assert.ok(log, 'editar la ficha de un menor tiene que dejar rastro');
  assert.equal(log.modulo, 'ninos');
  assert.match(log.detalle, /Sofia/);
});

test('una lista de autorizados larguisima -> 400 en castellano', async () => {
  conEncargada();
  const { ninoId } = claseConNino();
  const res = await editar(SEM.lider, ninoId, { autorizados: 'x'.repeat(301) });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.doesNotMatch(error, /autorizados/, 'no debe soltarle al usuario el nombre tecnico del campo');
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/ninos-editar-borrar.test.js`
Expected: FALLA — la ruta no existe (404 en todos).

- [ ] **Step 3: Volver a importar `auditar`**

En `backend/src/ninos.js`, el import de `./auth.js` perdió `auditar` el 30 jul (llevaba un comentario que decía por qué). Reemplazar ese comentario y la línea por:

```js
import { authMiddleware, esLiderEdOPastor, esLiderEdEstricto, esObispo, auditar } from './auth.js';
```

- [ ] **Step 4: Añadir la ruta**

En `backend/src/ninos.js`, justo después del `r.post('/ninos', …)` que ya existe:

```js
// Corregir la ficha. Nace con esta fase: el modulo solo sabia crear, asi que la
// lista de autorizados no se podia cambiar nunca — y es justo el dato que cambia.
const editarNinoSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre').optional(),
  edad: z.string().trim().optional(),
  familia: z.string().trim().optional(),
  alergias: z.string().trim().optional(),
  autorizados: z.string().trim().max(300, 'la lista de quién puede retirarlo es muy larga (máximo 300 caracteres)').optional()
});
r.patch('/ninos/:id', soloEncargado, validar(editarNinoSchema), (req, res) => {
  // Acotado por iglesia en la MISMA consulta. Resolver primero y comprobar
  // despues es como se colo el borrado que cruzaba iglesias en musica.js.
  const nino = db.prepare('SELECT id, nombre FROM nino WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, req.user.iglesia_id);
  if (!nino) return res.status(404).json({ error: 'Niño no encontrado' });

  // Solo se tocan los campos que vinieron: un PATCH no debe borrar lo que no menciona.
  const PERMITIDOS = ['nombre', 'edad', 'familia', 'alergias', 'autorizados'];
  const campos = PERMITIDOS.filter(c => c in req.body);
  if (!campos.length) return res.status(400).json({ error: 'Datos inválidos: no mandaste nada que cambiar' });
  const sets = campos.map(c => `${c} = ?`).join(', ');
  const vals = campos.map(c => (req.body[c] === '' ? null : req.body[c]));
  db.prepare(`UPDATE nino SET ${sets} WHERE id = ?`).run(...vals, nino.id);

  auditar(req.user.iglesia_id, req.user.persona_id, 'editar_nino', 'ninos', nino.nombre);
  res.json({ ok: true });
});
```

⚠️ `sets` se construye desde la lista blanca `PERMITIDOS`, nunca desde las claves del body: es lo que impide que alguien inyecte SQL por el nombre de un campo.

- [ ] **Step 5: Correr el test y verlo pasar**

Run: `cd backend && node --test test/ninos-editar-borrar.test.js`
Expected: PASA — 6 tests.

- [ ] **Step 6: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **449 tests, 0 fail** (443 + 6).

- [ ] **Step 7: Commit**

```bash
git add backend/src/ninos.js backend/test/ninos-editar-borrar.test.js
git commit -m "feat(ninos): poder corregir la ficha de un nino, que antes era para siempre"
```

---

### Task 2: Borrar un niño, con su historial

**Files:**
- Modify: `backend/src/ninos.js` (ruta nueva tras el `PATCH`)
- Test: `backend/test/ninos-editar-borrar.test.js` (añadir al final)

**Interfaces:**
- Consumes: lo de Task 1.
- Produces: `DELETE /api/ninos/ninos/:id` → `{ok:true}`, o **404**. Task 4 lo consume.

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `backend/test/ninos-editar-borrar.test.js` (reutiliza los helpers de arriba, no dupliques el arnés):

```js
// ------------------------------------------------------------
//  Borrar la ficha, y con ella su historial de asistencia.
//  Ese historial ya no lo muestra ninguna pantalla (la asistencia de ninos se
//  retiro el 30 jul), asi que conservarlo seria guardar datos de un menor que
//  nadie puede consultar.
// ------------------------------------------------------------
const borrar = (persona, id, iglesiaId) => fetch(base + '/api/ninos/ninos/' + id, {
  method: 'DELETE', headers: H(persona, iglesiaId)
});

test('borrar un nino con asistencias historicas se lleva las dos cosas', async () => {
  conEncargada();
  const { claseId, ninoId } = claseConNino('Sofia');
  db.prepare('INSERT INTO asistencia_nino (clase_id, nino_id, fecha) VALUES (?,?,?)')
    .run(claseId, ninoId, '2026-07-05');
  db.prepare('INSERT INTO asistencia_nino (clase_id, nino_id, fecha) VALUES (?,?,?)')
    .run(claseId, ninoId, '2026-07-12');

  const res = await borrar(SEM.lider, ninoId);
  assert.equal(res.status, 200);

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM nino WHERE id = ?').get(ninoId).n, 0);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM asistencia_nino WHERE nino_id = ?').get(ninoId).n, 0,
    'no deben quedar asistencias huerfanas apuntando a un nino que ya no existe'
  );
});

test('borrar un nino sin historial funciona igual', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Mateo');
  assert.equal((await borrar(SEM.lider, ninoId)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM nino').get().n, 0);
});

test('borrar NO se lleva por delante a los demas ninos ni sus asistencias', async () => {
  conEncargada();
  const { claseId, ninoId } = claseConNino('Sofia');
  const otro = Number(db.prepare('INSERT INTO nino (iglesia_id, clase_id, nombre) VALUES (?,?,?)')
    .run(SEM.iglesiaId, claseId, 'Mateo').lastInsertRowid);
  db.prepare('INSERT INTO asistencia_nino (clase_id, nino_id, fecha) VALUES (?,?,?)')
    .run(claseId, otro, '2026-07-05');

  await borrar(SEM.lider, ninoId);

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM nino WHERE id = ?').get(otro).n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM asistencia_nino WHERE nino_id = ?').get(otro).n, 1);
});

test('un encargado de OTRA iglesia recibe 404 y el nino sigue ahi', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia');

  const otraIglesia = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA')")
    .run().lastInsertRowid);
  const otroGrupo = Number(db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Ninos', '#2f7')")
    .run(otraIglesia).lastInsertRowid);
  const ajeno = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,'ed2','Encargada Ajena','x',1)"
  ).run(otraIglesia).lastInsertRowid);
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(ajeno, otroGrupo, 'lider_ed');

  assert.equal((await borrar({ id: ajeno }, ninoId, otraIglesia)).status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM nino WHERE id = ?').get(ninoId).n, 1);
});

test('el pastor solo observa: 403 al borrar', async () => {
  conEncargada();
  const { ninoId } = claseConNino();
  assert.equal((await borrar(SEM.pastor, ninoId)).status, 403);
});

test('borrar queda auditado', async () => {
  conEncargada();
  const { ninoId } = claseConNino('Sofia');
  await borrar(SEM.lider, ninoId);

  const log = db.prepare("SELECT accion, modulo, detalle FROM auditoria WHERE accion = 'eliminar_nino'").get();
  assert.ok(log, 'borrar la ficha de un menor tiene que dejar rastro');
  assert.equal(log.modulo, 'ninos');
  assert.match(log.detalle, /Sofia/);
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/ninos-editar-borrar.test.js`
Expected: FALLA — la ruta no existe.

- [ ] **Step 3: Añadir la ruta**

En `backend/src/ninos.js`, justo después del `PATCH`:

```js
r.delete('/ninos/:id', soloEncargado, (req, res) => {
  const nino = db.prepare('SELECT id, nombre FROM nino WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, req.user.iglesia_id);
  if (!nino) return res.status(404).json({ error: 'Niño no encontrado' });

  // Las asistencias van PRIMERO: asistencia_nino.nino_id referencia nino(id), y
  // al reves salta FOREIGN KEY constraint failed. En transaccion, para no dejar
  // asistencias huerfanas si algo falla a medias.
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM asistencia_nino WHERE nino_id = ?').run(nino.id);
    db.prepare('DELETE FROM nino WHERE id = ?').run(nino.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'No se pudo eliminar al niño' });
  }
  auditar(req.user.iglesia_id, req.user.persona_id, 'eliminar_nino', 'ninos', nino.nombre);
  res.json({ ok: true });
});
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd backend && node --test test/ninos-editar-borrar.test.js`
Expected: PASA — 12 tests.

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **455 tests, 0 fail**.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ninos.js backend/test/ninos-editar-borrar.test.js
git commit -m "feat(ninos): poder sacar de la lista a un nino que ya no viene"
```

---

### Task 3: El campo en pantalla — "Quién puede retirarlo"

**Files:**
- Modify: `web/app.js` — `cargarNinos()` (~línea 2275) y `formNino()`/`guardarNino()` (~2287-2295)

**Interfaces:**
- Consumes: `POST /api/ninos/ninos` (ya existía y **ya aceptaba `autorizados`**; el frontend simplemente no lo mandaba).
- Produces: la ficha muestra la línea; el alta guarda el campo. Task 4 reutiliza `formNino`.

⚠️ **`guardarNino()` hoy no manda `autorizados`** aunque el servidor lo acepta desde siempre. Ese es el hueco entero de esta tarea.

- [ ] **Step 1: Mostrar la línea en la ficha**

En `cargarNinos()`, reemplazar el `c.innerHTML=` por:

```js
    c.innerHTML=n.length? n.map(x=>`<div class="item-card"><b>${escHtml(x.nombre)}</b>${x.edad?' <span class="muted small">'+escHtml(String(x.edad))+' años</span>':''}
      ${x.alergias?` <span class="estado-chip estado-rechazado">⚠️ ${escHtml(x.alergias)}</span>`:''}
      <div class="muted small">${x.familia?'Familia '+escHtml(x.familia):''}</div>
      ${x.autorizados?`<div class="muted small">🤝 Puede retirarlo: ${escHtml(x.autorizados)}</div>`:''}</div>`).join('') : '<p class="small">Sin niños.</p>';
```

⚠️ `escHtml` **obligatorio**: lo escribe una persona y va a `innerHTML`. Esta app ha tenido cinco XSS almacenados y la CSP usa `'unsafe-inline'`, así que no cubre nada.

- [ ] **Step 2: Añadir el campo al formulario**

En `formNino()`, antes del botón Guardar:

```js
    <label for="n-autorizados" style="margin-top:10px">Quién puede retirarlo</label>
    <input id="n-autorizados" maxlength="300" placeholder="Ej. Ana Rojas (abuela), Juan Pérez (papá)"/>
    <p class="muted small" style="margin-top:4px">Nombre y parentesco. No hace falta teléfono ni RUT.</p>
```

- [ ] **Step 3: Mandarlo al guardar**

En `guardarNino()`, añadir `autorizados` al cuerpo:

```js
    body:JSON.stringify({clase_id:_claseActual,nombre:$('n-nombre').value.trim(),edad:$('n-edad').value,familia:$('n-familia').value.trim(),alergias:$('n-alergias').value.trim(),autorizados:$('n-autorizados').value.trim()})
```

- [ ] **Step 4: Probarlo en el navegador**

Servidor propio en un puerto libre, `DISABLE_RATE_LIMIT=1`, `JWT_SECRET=local`, `DB_PATH` a una BD de usar y tirar en el scratchpad. Siembra con `node src/seed.js`. Iglesia `MONTESION`, clave `1234`; la encargada de Escuela Dominical del seed es **`marta`**.

⚠️ **NO uses `scripts/with_server.py`**: en Windows deja el node huérfano y la corrida siguiente lee su BD vieja. Mata tu proceso al terminar.

Comprobar: inscribir un niño con autorizados → la línea "🤝 Puede retirarlo" sale en su ficha · un niño sin autorizados **no** pinta la línea vacía · sin errores de consola.

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **455, 0 fail** — esta tarea no toca backend; si el número cambia, algo se salió de alcance.

- [ ] **Step 6: Commit**

```bash
git add web/app.js
git commit -m "feat(ninos): que la maestra tenga donde mirar quien puede retirar al nino"
```

---

### Task 4: Corregir y borrar desde la pantalla

**Files:**
- Modify: `web/app.js` — `cargarNinos()`, `formNino()`, `guardarNino()`, y dos funciones nuevas

**Interfaces:**
- Consumes: `PATCH /api/ninos/ninos/:id` (Task 1), `DELETE /api/ninos/ninos/:id` (Task 2); helpers ya existentes `modalConfirm(msg, cb, {okLabel, danger})`, `api()`, `escHtml()`, `escJsAttr()`, `toast()`, `conBoton()`, `botonActual()`.
- Produces: funciones globales `formNino(id)` (reutilizada para editar) y `borrarNino(id)`.

- [ ] **Step 1: Botones en cada ficha**

En `cargarNinos()`, envolver la tarjeta para que lleve los dos botones. La tarjeta pasa a ser `item-card flex`:

```js
    const editar = esLiderEdUI();
    c.innerHTML=n.length? n.map(x=>`<div class="item-card flex">
      <div style="flex:1"><b>${escHtml(x.nombre)}</b>${x.edad?' <span class="muted small">'+escHtml(String(x.edad))+' años</span>':''}
      ${x.alergias?` <span class="estado-chip estado-rechazado">⚠️ ${escHtml(x.alergias)}</span>`:''}
      <div class="muted small">${x.familia?'Familia '+escHtml(x.familia):''}</div>
      ${x.autorizados?`<div class="muted small">🤝 Puede retirarlo: ${escHtml(x.autorizados)}</div>`:''}</div>
      ${editar?`<div class="row" style="width:auto;gap:8px">
        <button class="btn ghost small-btn" aria-label="Corregir la ficha de ${escHtml(x.nombre)}" onclick="formNino(${x.id})">Editar</button>
        <button class="btn ghost small-btn" aria-label="Borrar a ${escHtml(x.nombre)}" onclick="borrarNino(${x.id})">🗑️</button></div>`:''}</div>`).join('') : '<p class="small">Sin niños.</p>';
```

- [ ] **Step 2: Que `formNino` sirva también para editar**

Reemplazar `formNino()` y `guardarNino()` por:

```js
function formNino(id){ const z=$('form-nino'); if(z.innerHTML && !id){z.innerHTML='';return;}
  const x=(window._ninos||[]).find(n=>n.id===id)||{};
  z.innerHTML=`<div class="form-panel">
    <div class="row"><input id="n-nombre" placeholder="Nombre" value="${escHtml(x.nombre||'')}"/><input id="n-edad" type="number" placeholder="Edad" style="max-width:90px" value="${escHtml(String(x.edad||''))}"/></div>
    <input id="n-familia" placeholder="Familia" style="margin-top:10px" value="${escHtml(x.familia||'')}"/>
    <input id="n-alergias" placeholder="Alergias / notas" style="margin-top:10px" value="${escHtml(x.alergias||'')}"/>
    <label for="n-autorizados" style="margin-top:10px">Quién puede retirarlo</label>
    <input id="n-autorizados" maxlength="300" placeholder="Ej. Ana Rojas (abuela), Juan Pérez (papá)" value="${escHtml(x.autorizados||'')}"/>
    <p class="muted small" style="margin-top:4px">Nombre y parentesco. No hace falta teléfono ni RUT.</p>
    <button class="btn small-btn" style="margin-top:10px" onclick="guardarNino(${id||0})">${id?'Guardar cambios':'Guardar'}</button></div>`; }
async function guardarNino(id){
  const nombre=$('n-nombre').value.trim();
  if(!nombre) return toast('Pon el nombre');
  const datos={nombre,edad:$('n-edad').value,familia:$('n-familia').value.trim(),
    alergias:$('n-alergias').value.trim(),autorizados:$('n-autorizados').value.trim()};
  await conBoton(botonActual(), async()=>{
    try{
      if(id) await api('/ninos/ninos/'+id,{method:'PATCH',body:JSON.stringify(datos)});
      else   await api('/ninos/ninos',{method:'POST',body:JSON.stringify({clase_id:_claseActual,...datos})});
      $('form-nino').innerHTML=''; cargarNinos(); toast(id?'Ficha corregida':'Niño agregado');
    }catch(e){ toast(e.message); }
  }, 'Guardando…');
}
```

⚠️ Los `value="${escHtml(…)}"` son obligatorios: sin ellos, un nombre con comillas cierra el atributo.

- [ ] **Step 3: El borrado, con doble confirmación**

Añadir después de `guardarNino`:

```js
function borrarNino(id){
  const x=(window._ninos||[]).find(n=>n.id===id)||{};
  modalConfirm(`¿Borrar la ficha de ${x.nombre||'este niño'}?`, ()=>{
    modalConfirm('Se irá también su historial de asistencia. Esto NO se puede deshacer.', async()=>{
      try{ await api('/ninos/ninos/'+id,{method:'DELETE'}); cargarNinos(); toast('Ficha borrada'); }
      catch(e){ toast(e.message); }
    }, {okLabel:'Sí, borrar', danger:true});
  }, {okLabel:'Continuar', danger:true});
}
```

- [ ] **Step 4: Probarlo en el navegador**

Mismo montaje que la Task 3, entrando como **`marta`** (encargada) y como **`pastor`** (solo observa).

Comprobar: los botones salen para `marta` y **no** para el pastor · Editar abre el panel **relleno** y guarda los cambios · el borrado pide **dos** confirmaciones y en la primera se puede cancelar sin que pase nada · tras borrar, el niño desaparece de la lista · sin errores de consola.

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **455, 0 fail**.

- [ ] **Step 6: Commit**

```bash
git add web/app.js
git commit -m "feat(ninos): corregir y borrar la ficha desde la pantalla"
```

---

### Task 5: Dejarlo escrito

**Files:**
- Modify: `ESTADO.md`

- [ ] **Step 1: Actualizar `ESTADO.md`**

Añadir una sección con: qué se construyó, el número nuevo de tests, y **las dos cosas que no hay que olvidar**: (a) esto dice quién *puede* retirar al niño, **no** quién se lo llevó — esa mitad se fue con la asistencia de niños el mismo día; (b) el módulo **sigue sin poder editar ni borrar clases ni lecciones**, solo niños. Retirar de "por dónde retomar" el punto del retiro seguro y dejar anotado lo que queda abierto.

- [ ] **Step 2: Commit**

```bash
git add ESTADO.md
git commit -m "docs(estado): quien puede retirar a cada nino, cerrado"
```
