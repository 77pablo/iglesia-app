# La fuente del gasto — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un gasto de la hoja de Organización pueda decir si lo pagó la
caja de la iglesia, si se le devuelve a quien lo puso, o si es un aporte que
no se devuelve — y que un gasto mal anotado se pueda corregir, dejando quién
lo cambió y cuándo.

**Architecture:** Una columna aditiva (`evento_org_gasto.fuente`), una ruta
nueva (`PATCH /organizacion/gastos/:gastoId`) que audita el cambio, el
resumen "Quién puso qué" partido en tres consultas en vez de un único
`GROUP BY`, y el frontend de la hoja mostrando esa fuente por línea y por
resumen. No se toca Tesorería, no se toca ningún gasto ya guardado.

**Tech Stack:** Node ESM · Express 4 · `node:sqlite` · zod 4 · frontend
vanilla JS (template strings en `innerHTML`) · tests `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-31-fuente-del-gasto-design.md`

## Global Constraints

- **Aislamiento entre iglesias:** la ruta nueva (`PATCH /gastos/:gastoId`)
  resuelve el gasto **acotado por `iglesia_id` en la misma consulta**
  (`JOIN evento_org ... WHERE g.id = ? AND o.iglesia_id = ?`), nunca
  comprobarlo una línea después. Es el fallo que ya se coló una vez en
  `musica.js` (borrado que cruzaba congregaciones). Si el gasto no es de tu
  iglesia: **404**, no 403.
- **La corrección se audita** con
  `auditar(iglesia_id, persona_id, 'editar_gasto', 'organizacion', detalle)`.
  `auditar` ya está importado en `organizacion.js` (se usa para
  crear/editar/borrar/duplicar la hoja) — no hace falta volver a importarlo.
- **No reciclar `pagado_por IS NULL`** con el significado "pagó la iglesia".
  La caja se distingue por la columna nueva `fuente = 'caja'`, nunca por el
  hueco de `pagado_por` a secas — un gasto histórico con `pagado_por` y
  `fuente` ambos `NULL` sigue significando "no se sabe quién puso".
- **Nada de zonas horarias.** `evento_org_gasto.creado_en` sigue en UTC
  (`datetime('now')`) mientras `movimiento.fecha` (Tesorería) usa hora local
  (`date('now','localtime')`) — ese desfase es real pero **no se toca en este
  plan**, porque ninguna tarea aquí cruza esas dos tablas. No agregar ninguna
  columna de fecha nueva a `evento_org_gasto` sin pensarlo dos veces.
- **Mensajes de validación en castellano dentro del esquema zod.** En zod 4 el
  parámetro para el mensaje de un enum es `error`, **nunca `errorMap`** (se
  ignora en silencio: ver `registro.js:23-26`).
- **`escHtml` en todo dato de usuario** que vaya a `innerHTML` o a un
  atributo. **`modalConfirm` mete su mensaje crudo en `innerHTML`**: si algún
  paso arma un mensaje de confirmación con el concepto o el nombre de una
  persona, hay que envolverlo en `escHtml(...)` antes de interpolarlo — un
  plan de este proyecto ya metió un XSS ahí por olvidarlo.
- **Puramente aditivo:** ningún gasto ya guardado cambia de valor. La columna
  `fuente` nace `NULL` para todo lo existente y se lee como "no especificado",
  igual que ya se leía el `pagado_por` histórico.
- La suite completa (`cd backend && npm test`) está en **456 tests en verde**
  (medido el 31-jul-2026; este plan se escribió cuando eran 455, y **todos los
  números de más abajo ya están corregidos a partir de 456**) y no debe bajar.
- Commits en castellano, minúsculas, `tipo(ámbito): efecto para la persona`.
  Sin coautoría ni menciones a Claude.

---

### Task 1: La columna `fuente` (migración aditiva)

**Files:**
- Modify: `backend/src/db.js` (junto a la migración de `pagado_por`)
- Test: `backend/test/organizacion-fuente-gasto.test.js` (nuevo)

**Interfaces:**
- Produces: la tabla `evento_org_gasto` gana la columna `fuente TEXT`,
  `NULL` para toda fila existente. Consumida por las Tasks 2-4.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/organizacion-fuente-gasto.test.js`:

```js
// ============================================================
//  La fuente del gasto: la pago la caja de la iglesia, se le devuelve a quien
//  puso el dinero, o es un aporte que no se devuelve. Y la posibilidad de
//  corregir un gasto ya anotado, dejando quien y cuando en la auditoria.
//  Ver spec: docs/superpowers/specs/2026-07-31-fuente-del-gasto-design.md
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

// Siembra una iglesia con pastor, lider (admin de grupo) y feligres.
function sembrar(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const nueva = (usuario, nombre, pastor = 0) => Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,'x',?,1)"
  ).run(iglesiaId, usuario + '_' + codigo, nombre, pastor).lastInsertRowid);
  const pastorId = nueva('pas', 'Pastor');
  const liderId = nueva('lid', 'Lider');
  const feligresId = nueva('fel', 'Feligres Juan');
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  const grupoId = Number(g.lastInsertRowid);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(liderId, grupoId);
  return { iglesiaId, pastorId, liderId, feligresId, grupoId };
}

// Crea una hoja suelta; devuelve {hojaId, auth}.
async function hoja(b, S, titulo = 'Almuerzo') {
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  const res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo }) });
  return { hojaId: (await res.json()).id, auth };
}

test('la columna fuente existe en evento_org_gasto y nace NULL', async () => {
  const cols = db.prepare('PRAGMA table_info(evento_org_gasto)').all().map(c => c.name);
  assert.ok(cols.includes('fuente'), 'falta la columna fuente');

  const b = await servidor();
  const S = sembrar('COL1');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 3000 }) });
  const { id } = await res.json();
  assert.equal(db.prepare('SELECT fuente FROM evento_org_gasto WHERE id = ?').get(id).fuente, null);
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/organizacion-fuente-gasto.test.js`
Expected: FALLA — `cols.includes('fuente')` es `false`.

- [ ] **Step 3: Agregar la columna**

En `backend/src/db.js`, justo después de la línea de `agregarColumna('evento_org_gasto', 'pagado_por', ...)` (línea 584):

```js
// EVENTO_ORG_GASTO: la fuente del gasto — la pago la caja de la iglesia, se
// le devuelve a quien puso el dinero, o es un aporte que no se devuelve.
// NULL = de antes de esta casilla, no se especifico (igual que ya se leia el
// pagado_por historico). OJO: cuando fuente='caja', pagado_por tambien queda
// NULL, pero el significado NO sale de pagado_por — sale de esta columna. No
// es reciclar el hueco historico, es dejar de necesitar mirarlo solo.
agregarColumna('evento_org_gasto', 'fuente', 'TEXT');
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd backend && node --test test/organizacion-fuente-gasto.test.js`
Expected: PASA — 1 test.

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **457 tests, 0 fail** (456 + 1).

- [ ] **Step 6: Commit**

```bash
git add backend/src/db.js backend/test/organizacion-fuente-gasto.test.js
git commit -m "feat(organizacion): columna fuente para saber quien pago un gasto de verdad"
```

---

### Task 2: Registrar un gasto con su fuente

**Files:**
- Modify: `backend/src/organizacion.js` (`gastoSchema` y `r.post('/:id/gastos', ...)`, líneas 326-344)
- Test: `backend/test/organizacion-fuente-gasto.test.js` (añadir)

**Interfaces:**
- Consumes: la columna `fuente` de Task 1.
- Produces: `POST /api/organizacion/:id/gastos` acepta `fuente` opcional
  (`'caja'` \| `'devuelve'` \| `'aporte'`); si no viene, se comporta
  exactamente como hoy. Task 3 lo usa para armar el resumen; Task 4 reutiliza
  la lista `FUENTES_GASTO`.

⚠️ **`fuente` es opcional en el `POST`, a propósito.** Si se hiciera
obligatoria, cada uno de los ~10 `POST /gastos` que ya existen en
`backend/test/organizacion.test.js` y `organizacion-responsable.test.js`
empezaría a fallar con 400. El frontend (Task 5) la va a mandar siempre; la
API se queda retrocompatible con quien no la mande.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/organizacion-fuente-gasto.test.js`, después del test
de Task 1:

```js
test('gasto pagado por la caja: no lleva persona y la fuente queda "caja"', async () => {
  const b = await servidor();
  const S = sembrar('CAJA');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Carne', monto: 30000, fuente: 'caja' }) });
  assert.equal(res.status, 200);
  const { id } = await res.json();
  const fila = db.prepare('SELECT pagado_por, fuente FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.pagado_por, null, 'nadie puso plata de su bolsillo');
  assert.equal(fila.fuente, 'caja');
});

test('gasto de una persona sin indicar fuente: se guarda como antes (compatibilidad)', async () => {
  const b = await servidor();
  const S = sembrar('COMP');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Jugos', monto: 5000 }) });
  const { id } = await res.json();
  const fila = db.prepare('SELECT pagado_por, fuente FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.pagado_por, S.liderId, 'sigue pagando quien registra, como siempre');
  assert.equal(fila.fuente, null, 'sin la casilla, queda "no especificado", igual que antes de que existiera');
});

test('gasto marcado como aporte y como "se devuelve" guardan su fuente', async () => {
  const b = await servidor();
  const S = sembrar('MARC');
  const { hojaId, auth } = await hoja(b, S);
  let res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Bebidas', monto: 8000, pagado_por: S.feligresId, fuente: 'devuelve' }) });
  const bebidas = (await res.json()).id;
  res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 4000, pagado_por: S.feligresId, fuente: 'aporte' }) });
  const pan = (await res.json()).id;
  assert.equal(db.prepare('SELECT fuente FROM evento_org_gasto WHERE id = ?').get(bebidas).fuente, 'devuelve');
  assert.equal(db.prepare('SELECT fuente FROM evento_org_gasto WHERE id = ?').get(pan).fuente, 'aporte');
});

test('fuente invalida -> 400 en castellano, sin nombrar el campo', async () => {
  const b = await servidor();
  const S = sembrar('FINV');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000, fuente: 'donacion' }) });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.doesNotMatch(error, /fuente/, 'no debe soltarle al usuario el nombre tecnico del campo');
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/organizacion-fuente-gasto.test.js`
Expected: FALLA — hoy `fuente` no se guarda ni se valida (las dos primeras
pruebas pasan de casualidad porque no comprueban `fuente`; la de "caja" falla
porque hoy `fuente: 'caja'` simplemente se ignora y no limpia `pagado_por`; la
de inválida falla porque hoy no hay ninguna validación de `fuente`, así que no
devuelve 400).

- [ ] **Step 3: Cambiar el esquema y la ruta**

En `backend/src/organizacion.js`, reemplazar:

```js
// ---------- Gastos (se suman en total_gastado) ----------
// El total NO se guarda en ninguna columna: se recalcula al leer la hoja, asi
// nunca queda descuadrado respecto a las filas de gastos.
const gastoSchema = z.object({
  concepto: z.string().trim().min(1, 'falta el concepto'),
  monto: z.coerce.number().positive('el monto debe ser mayor a 0'),
  // Opcional: si no viene, paga quien registra el gasto (el caso normal).
  pagado_por: z.coerce.number().int().positive().optional()
});
r.post('/:id/gastos', validar(gastoSchema), (req, res) => {
  const org = hojaEditable(req, res, Number(req.params.id));
  if (!org) return;
  const quienPago = req.body.pagado_por ?? req.user.persona_id;
  // Solo gente de la misma iglesia: atribuirle un pago a un tercero de otra
  // congregacion no significa nada y ensucia el resumen de a quien devolver.
  const p = db.prepare('SELECT id FROM persona WHERE id = ? AND iglesia_id = ?')
    .get(quienPago, req.user.iglesia_id);
  if (!p) return res.status(400).json({ error: 'Esa persona no esta en tu iglesia' });
  const info = db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto, pagado_por) VALUES (?,?,?,?)')
    .run(org.id, req.body.concepto, req.body.monto, quienPago);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});
```

por:

```js
// ---------- Gastos (se suman en total_gastado) ----------
// El total NO se guarda en ninguna columna: se recalcula al leer la hoja, asi
// nunca queda descuadrado respecto a las filas de gastos.
//
// FUENTES_GASTO: quien puso el dinero de verdad, no solo quien queda anotado.
// 'caja' no lleva persona (pago la iglesia directo). 'devuelve'/'aporte' SI
// llevan persona: la diferencia es si se le debe devolver o no.
const FUENTES_GASTO = ['caja', 'devuelve', 'aporte'];
const gastoSchema = z.object({
  concepto: z.string().trim().min(1, 'falta el concepto'),
  monto: z.coerce.number().positive('el monto debe ser mayor a 0'),
  // Opcional: si no viene, paga quien registra el gasto (el caso normal).
  pagado_por: z.coerce.number().int().positive().optional(),
  // Opcional para no romper llamadas viejas: sin ella, el gasto queda "no
  // especificado" (fuente NULL), igual que antes de que esta casilla
  // existiera. El frontend (Task 5) la manda siempre.
  fuente: z.enum(FUENTES_GASTO, { error: 'la fuente del gasto no es valida' }).optional()
});
r.post('/:id/gastos', validar(gastoSchema), (req, res) => {
  const org = hojaEditable(req, res, Number(req.params.id));
  if (!org) return;
  // "La caja de la iglesia" no tiene persona: pagado_por queda NULL. Ese NULL
  // NO reutiliza el significado historico de "no se sabe quien puso" — lo
  // que distingue un caso del otro es la columna fuente, no el hueco vacio.
  const esCaja = req.body.fuente === 'caja';
  const quienPago = esCaja ? null : (req.body.pagado_por ?? req.user.persona_id);
  if (quienPago != null) {
    // Solo gente de la misma iglesia: atribuirle un pago a un tercero de otra
    // congregacion no significa nada y ensucia el resumen de a quien devolver.
    const p = db.prepare('SELECT id FROM persona WHERE id = ? AND iglesia_id = ?')
      .get(quienPago, req.user.iglesia_id);
    if (!p) return res.status(400).json({ error: 'Esa persona no esta en tu iglesia' });
  }
  const info = db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto, pagado_por, fuente) VALUES (?,?,?,?,?)')
    .run(org.id, req.body.concepto, req.body.monto, quienPago, req.body.fuente || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});
```

⚠️ `FUENTES_GASTO` queda declarada a nivel de módulo (fuera de las dos
funciones) porque Task 4 la reutiliza en el esquema del `PATCH`.

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd backend && node --test test/organizacion-fuente-gasto.test.js`
Expected: PASA — 5 tests.

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **461 tests, 0 fail** (457 + 4).

- [ ] **Step 6: Commit**

```bash
git add backend/src/organizacion.js backend/test/organizacion-fuente-gasto.test.js
git commit -m "feat(organizacion): anotar si un gasto lo pago la caja, se devuelve o es un aporte"
```

---

### Task 3: El resumen "Quién puso qué", partido en tres bloques

**Files:**
- Modify: `backend/src/organizacion.js` (`armarHoja`, líneas 79-91)
- Modify: `backend/test/organizacion-responsable.test.js` (3 asserts que leían `hoja.aportes`)
- Test: `backend/test/organizacion-fuente-gasto.test.js` (añadir)

**Interfaces:**
- Consumes: la columna `fuente` de Task 1/2.
- Produces: `GET /organizacion/:id` y `GET /organizacion/evento/:eventoId`
  devuelven `total_caja`, `por_devolver` y `aportes_donados` **en vez de**
  `aportes`. Task 5 (frontend) consume estos tres campos.

⚠️ **Esto cambia la forma de la respuesta**, así que dos tests que ya existen
en `organizacion-responsable.test.js` y leen `hoja.aportes` se rompen a
propósito en este Task, y hay que corregirlos en el mismo paso (no es un
efecto colateral no revisado: es la actualización que este Task exige).

🔴 **NO DESPLEGAR entre esta tarea y la Task 5.** El frontend lee `h.aportes`
en un solo sitio (`web/app.js:4054`) y la Task 5 es la que lo actualiza. Con
la Task 3 desplegada y la Task 5 no, `h.aportes` llega `undefined`, la lista
de personas desaparece y **todo el dinero de la hoja se muestra bajo "Sin
registrar quién puso"** — la pantalla no da ningún error, simplemente miente
sobre a quién hay que devolverle. Las tareas se commitean por separado (así
está el plan), pero el despliegue es de la 3 y la 5 juntas.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/organizacion-fuente-gasto.test.js`:

```js
test('el resumen separa lo que pago la caja, lo por devolver y los aportes donados', async () => {
  const b = await servidor();
  const S = sembrar('RESU');
  const { hojaId, auth } = await hoja(b, S, 'Asado');
  // El ejemplo del spec: el pastor adelanta la carne, la lider pone las
  // bebidas y se le devuelven, Rosa (aqui: la feligresa) pone el pan y no
  // quiere que se lo devuelvan.
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Carne', monto: 30000, fuente: 'caja' }) });
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Bebidas', monto: 8000, pagado_por: S.liderId, fuente: 'devuelve' }) });
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 4000, pagado_por: S.feligresId, fuente: 'aporte' }) });

  const hojaRes = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hojaRes.total_gastado, 42000);
  assert.equal(hojaRes.total_caja, 30000);
  assert.equal(hojaRes.por_devolver.length, 1);
  assert.deepEqual({ ...hojaRes.por_devolver[0] }, { persona_id: S.liderId, nombre: 'Lider', total: 8000 });
  assert.equal(hojaRes.aportes_donados.length, 1);
  assert.deepEqual({ ...hojaRes.aportes_donados[0] }, { persona_id: S.feligresId, nombre: 'Feligres Juan', total: 4000 });
});

test('gasto antiguo sin persona ni fuente: no aparece en ningun bloque de personas, solo en el total', async () => {
  const b = await servidor();
  const S = sembrar('VIEJ2');
  const { hojaId, auth } = await hoja(b, S, 'Historica');
  db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto) VALUES (?,?,?)').run(hojaId, 'Gasto antiguo', 5000);

  const hojaRes = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hojaRes.total_gastado, 5000);
  assert.equal(hojaRes.total_caja, 0);
  assert.deepEqual(hojaRes.por_devolver, []);
  assert.deepEqual(hojaRes.aportes_donados, []);
});

test('gasto antiguo CON persona pero sin fuente sigue contando como "por devolver"', async () => {
  const b = await servidor();
  const S = sembrar('VIEJ3');
  const { hojaId, auth } = await hoja(b, S, 'De transicion');
  // Asi quedaban los gastos ANTES de que existiera la casilla fuente: con
  // persona, sin fuente. Ese significado (hay que devolverle) no cambia.
  db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto, pagado_por) VALUES (?,?,?,?)')
    .run(hojaId, 'Gasto de transicion', 7000, S.liderId);

  const hojaRes = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hojaRes.por_devolver.length, 1);
  assert.deepEqual({ ...hojaRes.por_devolver[0] }, { persona_id: S.liderId, nombre: 'Lider', total: 7000 });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/organizacion-fuente-gasto.test.js`
Expected: FALLA — `hojaRes.total_caja` es `undefined`, `hojaRes.por_devolver`
también (hoy el campo se llama `aportes` y mezcla los tres casos).

- [ ] **Step 3: Reescribir `armarHoja`**

En `backend/src/organizacion.js`, reemplazar:

```js
  const gastos = db.prepare(
    `SELECT g.id, g.concepto, g.monto, g.creado_en, g.pagado_por, p.nombre AS pagado_por_nombre
       FROM evento_org_gasto g LEFT JOIN persona p ON p.id = g.pagado_por
      WHERE g.org_id = ? ORDER BY g.id`
  ).all(org.id);
  const total = db.prepare('SELECT COALESCE(SUM(monto),0) AS t FROM evento_org_gasto WHERE org_id = ?').get(org.id).t;
  // "Quien puso que": cuanto puso cada persona, de mayor a menor. Es lo que se
  // mira al final para saber a quien devolverle cuanto.
  const aportes = db.prepare(
    `SELECT g.pagado_por AS persona_id, p.nombre, SUM(g.monto) AS total
       FROM evento_org_gasto g JOIN persona p ON p.id = g.pagado_por
      WHERE g.org_id = ? GROUP BY g.pagado_por, p.nombre ORDER BY total DESC, p.nombre`
  ).all(org.id);
  const evento = org.evento_id
    ? db.prepare('SELECT id, titulo, fecha, hora_inicio, lugar FROM evento WHERE id = ?').get(org.evento_id)
    : null;
  return { ...org, evento, cosas, gastos, aportes, total_gastado: total };
```

por:

```js
  const gastos = db.prepare(
    `SELECT g.id, g.concepto, g.monto, g.creado_en, g.pagado_por, g.fuente, p.nombre AS pagado_por_nombre
       FROM evento_org_gasto g LEFT JOIN persona p ON p.id = g.pagado_por
      WHERE g.org_id = ? ORDER BY g.id`
  ).all(org.id);
  const total = db.prepare('SELECT COALESCE(SUM(monto),0) AS t FROM evento_org_gasto WHERE org_id = ?').get(org.id).t;
  // "Quien puso que", partido en tres, porque ya no es una sola cosa:
  //  - lo que pago la caja directo (no hay a quien devolverle nada)
  //  - lo que alguien puso y HAY que devolverle (incluye lo de antes de esta
  //    casilla, fuente NULL con persona: es lo que ya significaba)
  //  - lo que alguien puso como aporte y NO se devuelve
  const totalCaja = db.prepare(
    `SELECT COALESCE(SUM(monto),0) AS t FROM evento_org_gasto WHERE org_id = ? AND fuente = 'caja'`
  ).get(org.id).t;
  const porDevolver = db.prepare(
    `SELECT g.pagado_por AS persona_id, p.nombre, SUM(g.monto) AS total
       FROM evento_org_gasto g JOIN persona p ON p.id = g.pagado_por
      WHERE g.org_id = ? AND g.pagado_por IS NOT NULL AND (g.fuente = 'devuelve' OR g.fuente IS NULL)
      GROUP BY g.pagado_por, p.nombre ORDER BY total DESC, p.nombre`
  ).all(org.id);
  const aportesDonados = db.prepare(
    `SELECT g.pagado_por AS persona_id, p.nombre, SUM(g.monto) AS total
       FROM evento_org_gasto g JOIN persona p ON p.id = g.pagado_por
      WHERE g.org_id = ? AND g.fuente = 'aporte'
      GROUP BY g.pagado_por, p.nombre ORDER BY total DESC, p.nombre`
  ).all(org.id);
  const evento = org.evento_id
    ? db.prepare('SELECT id, titulo, fecha, hora_inicio, lugar FROM evento WHERE id = ?').get(org.evento_id)
    : null;
  return { ...org, evento, cosas, gastos, total_gastado: total,
    total_caja: totalCaja, por_devolver: porDevolver, aportes_donados: aportesDonados };
```

- [ ] **Step 4: Actualizar los dos tests que leían `hoja.aportes`**

En `backend/test/organizacion-responsable.test.js`, tres reemplazos:

1. Dentro del test `'gastos: se registra quien puso el dinero y la hoja resume cuanto puso cada uno'`:

```js
  // Resumen "quien puso que": una fila por persona, de mayor a menor.
  assert.equal(hoja.aportes.length, 2);
  assert.deepEqual({ ...hoja.aportes[0] }, { persona_id: S.liderId, nombre: 'Lider', total: 20000 });
  assert.deepEqual({ ...hoja.aportes[1] }, { persona_id: S.feligresId, nombre: 'Feligres Juan', total: 10500 });
```

por:

```js
  // Resumen "por devolver": una fila por persona, de mayor a menor (ninguno
  // de estos gastos tiene fuente, asi que caen todos en "por devolver").
  assert.equal(hoja.por_devolver.length, 2);
  assert.deepEqual({ ...hoja.por_devolver[0] }, { persona_id: S.liderId, nombre: 'Lider', total: 20000 });
  assert.deepEqual({ ...hoja.por_devolver[1] }, { persona_id: S.feligresId, nombre: 'Feligres Juan', total: 10500 });
```

2. Dentro del test `'gastos: no se puede atribuir el pago a alguien de otra iglesia'`:

```js
  assert.deepEqual(hoja.aportes, []);
```

por:

```js
  assert.deepEqual(hoja.por_devolver, []);
```

3. Dentro del test `'gastos antiguos sin pagador: cuentan en el total pero no en el resumen'`:

```js
  assert.equal(hoja.aportes.length, 1, 'solo el gasto con pagador aparece en el resumen');
  assert.equal(hoja.aportes[0].total, 3000);
```

por:

```js
  assert.equal(hoja.por_devolver.length, 1, 'solo el gasto con pagador aparece en el resumen');
  assert.equal(hoja.por_devolver[0].total, 3000);
```

- [ ] **Step 5: Correr el test y verlo pasar**

Run: `cd backend && node --test test/organizacion-fuente-gasto.test.js test/organizacion-responsable.test.js`
Expected: PASA — 8 tests nuevos en `organizacion-fuente-gasto.test.js` (el
total acumulado del archivo) y todos los de `organizacion-responsable.test.js`
en verde.

- [ ] **Step 6: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **464 tests, 0 fail** (461 + 3).

- [ ] **Step 7: Commit**

```bash
git add backend/src/organizacion.js backend/test/organizacion-fuente-gasto.test.js backend/test/organizacion-responsable.test.js
git commit -m "feat(organizacion): separar en el resumen lo que pago la caja, lo por devolver y los aportes"
```

---

### Task 4: Corregir un gasto, con rastro de quién y cuándo

**Files:**
- Modify: `backend/src/organizacion.js` (ruta nueva, después de `r.post('/:id/gastos', ...)`)
- Test: `backend/test/organizacion-fuente-gasto.test.js` (añadir)

**Interfaces:**
- Consumes: `FUENTES_GASTO` (Task 2), `hojaEditable` y `auditar` (ya
  importados en el archivo).
- Produces: `PATCH /api/organizacion/gastos/:gastoId` → `{ok:true}`, con
  `concepto`, `monto`, `pagado_por` y `fuente` todos opcionales (PATCH
  parcial). **404** si el gasto no es de tu iglesia, **403** si no puedes
  editar la hoja, **400** si los datos no cuadran. Deja un registro en
  `auditoria`. Task 5 (frontend) lo consume.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/organizacion-fuente-gasto.test.js`:

```js
// ---------- Corregir un gasto ----------

test('el creador corrige concepto y monto de un gasto', async () => {
  const b = await servidor();
  const S = sembrar('EDIT');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000 }) });
  const { id } = await res.json();

  const pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ concepto: 'Pan integral', monto: 1500 }) });
  assert.equal(pres.status, 200);
  const fila = db.prepare('SELECT concepto, monto FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.concepto, 'Pan integral');
  assert.equal(fila.monto, 1500);
});

test('cambiar la fuente de una persona a "la caja" limpia el pagado_por', async () => {
  const b = await servidor();
  const S = sembrar('CAM1');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Carne', monto: 20000, pagado_por: S.liderId, fuente: 'devuelve' }) });
  const { id } = await res.json();

  const pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'caja' }) });
  assert.equal(pres.status, 200);
  const fila = db.prepare('SELECT pagado_por, fuente FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.pagado_por, null);
  assert.equal(fila.fuente, 'caja');
});

test('cambiar de la caja a una persona exige indicar quien, si no 400', async () => {
  const b = await servidor();
  const S = sembrar('CAM2');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Carne', monto: 20000, fuente: 'caja' }) });
  const { id } = await res.json();

  let pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'devuelve' }) });
  assert.equal(pres.status, 400, 'no puede quedar "se devuelve" sin nadie a quien devolverle');

  pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'devuelve', pagado_por: S.feligresId }) });
  assert.equal(pres.status, 200);
  const fila = db.prepare('SELECT pagado_por, fuente FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.pagado_por, S.feligresId);
});

test('un lider de OTRA iglesia recibe 404 y no cambia nada', async () => {
  const b = await servidor();
  const S = sembrar('OTR1');
  const O = sembrar('OTR2');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000 }) });
  const { id } = await res.json();

  const authAjeno = { Authorization: 'Bearer ' + tok(O.liderId, O.iglesiaId), 'Content-Type': 'application/json' };
  const pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: authAjeno, body: JSON.stringify({ monto: 9999 }) });
  assert.equal(pres.status, 404);
  assert.equal(db.prepare('SELECT monto FROM evento_org_gasto WHERE id = ?').get(id).monto, 1000);
});

test('un lider que no creo la hoja (ni pastor) recibe 403', async () => {
  const b = await servidor();
  const S = sembrar('PERM');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000 }) });
  const { id } = await res.json();

  const lid2 = Number(db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)")
    .run(S.iglesiaId, 'lid2_PERM', 'Lider2', 'x').lastInsertRowid);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(lid2, S.grupoId);
  const authOtro = { Authorization: 'Bearer ' + tok(lid2, S.iglesiaId), 'Content-Type': 'application/json' };
  const pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: authOtro, body: JSON.stringify({ monto: 9999 }) });
  assert.equal(pres.status, 403);
});

test('corregir un gasto queda auditado con quien y que cambio', async () => {
  const b = await servidor();
  const S = sembrar('AUDI');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000 }) });
  const { id } = await res.json();

  await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 1200 }) });

  const log = db.prepare("SELECT actor_id, detalle FROM auditoria WHERE accion = 'editar_gasto'").get();
  assert.ok(log, 'corregir un gasto tiene que dejar rastro');
  assert.equal(log.actor_id, S.liderId);
  // Con separador de miles: este texto se le muestra a la gente en la hoja
  // (Task 6), asi que se guarda ya formateado.
  assert.match(log.detalle, /\$1\.000/);
  assert.match(log.detalle, /\$1\.200/);
});

test('monto invalido al corregir -> 400', async () => {
  const b = await servidor();
  const S = sembrar('MINV');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000 }) });
  const { id } = await res.json();

  const pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ monto: -5 }) });
  assert.equal(pres.status, 400);
});

// ---------- El gasto historico "no se sabe quien puso" ----------
// Estas dos pruebas existen por un fallo real que traia este mismo plan: exigia
// pagador SIEMPRE que la fuente final no fuera 'caja', asi que un gasto
// historico (fuente y pagado_por vacios) no se podia ni corregir de ortografia.

test('corregir SOLO el concepto de un gasto historico no le inventa un pagador', async () => {
  const b = await servidor();
  const S = sembrar('HIST1');
  const { hojaId, auth } = await hoja(b, S);
  // Asi son los gastos mas antiguos: sin pagador y sin fuente.
  const id = Number(db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto) VALUES (?,?,?)')
    .run(hojaId, 'Pna', 5000).lastInsertRowid);

  const pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ concepto: 'Pan' }) });
  assert.equal(pres.status, 200, 'arreglar una falta de ortografia no puede fallar');

  const fila = db.prepare('SELECT concepto, pagado_por, fuente FROM evento_org_gasto WHERE id = ?').get(id);
  assert.equal(fila.concepto, 'Pan');
  assert.equal(fila.pagado_por, null, 'sigue sin saberse quien puso: nadie le presto plata a la iglesia por corregir un texto');
  assert.equal(fila.fuente, null);

  // Y el resumen sigue contandolo como "sin registrar", no como una deuda.
  const hojaRes = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.deepEqual(hojaRes.por_devolver, []);
  assert.deepEqual(hojaRes.aportes_donados, []);
  assert.equal(hojaRes.total_gastado, 5000);
});

test('pero si el PATCH SI toca la fuente, entonces si exige pagador', async () => {
  const b = await servidor();
  const S = sembrar('HIST2');
  const { hojaId, auth } = await hoja(b, S);
  const id = Number(db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto) VALUES (?,?,?)')
    .run(hojaId, 'Pan', 5000).lastInsertRowid);

  let pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'devuelve' }) });
  assert.equal(pres.status, 400, 'no puede quedar "se devuelve" sin nadie a quien devolverle');

  pres = await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ fuente: 'devuelve', pagado_por: S.feligresId }) });
  assert.equal(pres.status, 200);
  assert.equal(db.prepare('SELECT pagado_por FROM evento_org_gasto WHERE id = ?').get(id).pagado_por, S.feligresId);
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/organizacion-fuente-gasto.test.js`
Expected: FALLA — la ruta `PATCH /gastos/:gastoId` no existe (404 en todos
los `PATCH`, incluido el que esperaba 400).

- [ ] **Step 3: Añadir la ruta**

En `backend/src/organizacion.js`, justo después del `r.post('/:id/gastos', ...)` que quedó de la Task 2, y antes del `r.delete('/gastos/:gastoId', ...)` que ya existe:

```js
// Corregir un gasto (monto mal tecleado, fuente equivocada). A diferencia
// del resto de los items de la hoja (que nunca dejaron rastro de nada), esta
// SI se audita: es la condicion explicita del dueño para poder corregir.
const editarGastoSchema = z.object({
  concepto: z.string().trim().min(1, 'falta el concepto').optional(),
  monto: z.coerce.number().positive('el monto debe ser mayor a 0').optional(),
  pagado_por: z.coerce.number().int().positive().nullable().optional(),
  fuente: z.enum(FUENTES_GASTO, { error: 'la fuente del gasto no es valida' }).optional()
});
r.patch('/gastos/:gastoId', validar(editarGastoSchema), (req, res) => {
  // Acotado por iglesia en la MISMA consulta: es el fallo que ya se colo una
  // vez en musica.js (borrado que cruzaba congregaciones). El resto de las
  // rutas de cosas/gastos de este archivo resuelven sin ese acotador y
  // filtran despues via hojaEditable (que si filtra) — sigue siendo seguro,
  // pero esta ruta nueva no repite ese patron.
  const gasto = db.prepare(
    `SELECT g.* FROM evento_org_gasto g JOIN evento_org o ON o.id = g.org_id
      WHERE g.id = ? AND o.iglesia_id = ?`
  ).get(Number(req.params.gastoId), req.user.iglesia_id);
  if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });
  const org = hojaEditable(req, res, gasto.org_id);   // valida permiso (403); iglesia ya validada arriba
  if (!org) return;

  const concepto = req.body.concepto ?? gasto.concepto;
  const monto = req.body.monto ?? gasto.monto;

  // fuente y pagado_por se corrigen juntos, pero SOLO se exige coherencia
  // cuando el PATCH toca alguno de los dos. Un gasto historico (fuente y
  // pagado_por ambos NULL, "no se sabe quien puso") tiene que poder corregir
  // su concepto o su monto SIN verse obligado a inventarle un pagador: si no,
  // arreglar una falta de ortografia le adjudicaria a alguien una deuda que
  // nadie contrajo.
  const tocaFuente = req.body.fuente !== undefined;
  const tocaPagador = req.body.pagado_por !== undefined;
  const fuente = tocaFuente ? req.body.fuente : gasto.fuente;
  let pagadoPor = tocaPagador ? req.body.pagado_por : gasto.pagado_por;

  if (fuente === 'caja') {
    // Pago la caja: no hay persona, pase lo que pase se haya mandado.
    pagadoPor = null;
  } else if (tocaFuente || tocaPagador) {
    // Solo aqui se exige que haya alguien: el PATCH esta cambiando de verdad
    // quien puso el dinero. Si no toca ninguno de los dos, se conserva lo que
    // hubiera -- incluido "no se sabe".
    if (pagadoPor == null) return res.status(400).json({ error: 'Elige quien puso el dinero, o marca que pago la caja' });
  }
  if (pagadoPor != null) {
    const p = db.prepare('SELECT id FROM persona WHERE id = ? AND iglesia_id = ?').get(pagadoPor, req.user.iglesia_id);
    if (!p) return res.status(400).json({ error: 'Esa persona no esta en tu iglesia' });
  }

  db.prepare('UPDATE evento_org_gasto SET concepto=?, monto=?, pagado_por=?, fuente=? WHERE id=?')
    .run(concepto, monto, pagadoPor, fuente, gasto.id);

  // El detalle guarda que cambio; quien y cuando ya los guarda auditar() solo
  // (actor_id y fecha son columnas propias de la tabla auditoria).
  auditar(req.user.iglesia_id, req.user.persona_id, 'editar_gasto', 'organizacion',
    `"${gasto.concepto}" ${montoTxt(gasto.monto)} -> "${concepto}" ${montoTxt(monto)}`);
  res.json({ ok: true });
});
```

Y arriba del todo del archivo, junto al resto de ayudantes de módulo (antes de
`armarHoja`), añadir:

```js
// Los montos del detalle de auditoria se guardan ya formateados, porque ese
// texto se le va a MOSTRAR a la gente en la hoja (ver la Task 6): "$12.000" y
// no "$12000", igual que money() en el frontend.
//
// A mano y no con toLocaleString('es-CL'): no se usa en ningun sitio del
// backend hoy (cero coincidencias en backend/src/), y haria que el texto ya
// guardado dependiera de la configuracion regional del servidor.
function montoTxt(n) {
  return '$' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd backend && node --test test/organizacion-fuente-gasto.test.js`
Expected: PASA — 17 tests (el total del archivo).

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **473 tests, 0 fail** (464 + 9).

- [ ] **Step 6: Commit**

```bash
git add backend/src/organizacion.js backend/test/organizacion-fuente-gasto.test.js
git commit -m "feat(organizacion): poder corregir un gasto, con quien y cuando en la auditoria"
```

---

### Task 5: La pantalla — casilla de fuente, mostrarla, corregir y borrar

**Files:**
- Modify: `web/app.js` — `Org._llenarQuienPago()` (~línea 4118-4128), el
  formulario de gasto y el resumen dentro de `Org._render()` (~líneas
  4046-4113), `Org.addGasto`/`Org.borrarGasto` (~líneas 4153-4180)

**Interfaces:**
- Consumes: `POST /organizacion/:id/gastos` con `fuente` (Task 2),
  `PATCH /organizacion/gastos/:gastoId` (Task 4), `total_caja` /
  `por_devolver` / `aportes_donados` (Task 3).
- Produces: dos `<select>` en el formulario de gasto; cada gasto muestra su
  fuente y un botón ✏️ para corregirlo; el resumen muestra los tres bloques.

⚠️ **Esta tarea reescribe `Org._render()`, `Org._llenarQuienPago()` y
reemplaza `Org.addGasto` por `Org.guardarGasto`/`Org.editarGasto`/
`Org.cancelarEdicionGasto` de punta a punta, en los pasos que siguen.** Se
hace en una sola tarea (no partida en dos) porque el HTML del formulario
(Step 2) y la función que ese HTML invoca (Step 6) tienen que cambiar juntos:
publicar solo el HTML dejaría un botón "Añadir" apuntando a una función que
todavía no existe.

- [ ] **Step 1: La opción "La caja de la iglesia" en el selector**

En `web/app.js`, dentro de `Org._llenarQuienPago()`, reemplazar:

```js
  async _llenarQuienPago(){
    const sel=$('org-gasto-quien'); if(!sel) return;
    try{
      if(!Org._personas) Org._personas=await api('/directorio');
      sel.innerHTML='<option value="">Lo puse yo</option>'+
        Org._personas.map(p=>`<option value="${p.id}">${escHtml(p.nombre)}</option>`).join('');
    }catch{ /* si falla, queda "Lo puse yo", que es el caso normal */ }
  },
```

por:

```js
  async _llenarQuienPago(){
    const sel=$('org-gasto-quien'); if(!sel) return;
    try{
      if(!Org._personas) Org._personas=await api('/directorio');
      sel.innerHTML='<option value="">Lo puse yo</option><option value="caja">La caja de la iglesia</option>'+
        Org._personas.map(p=>`<option value="${p.id}">${escHtml(p.nombre)}</option>`).join('');
    }catch{ /* si falla, quedan "Lo puse yo" y "La caja", que cubren el caso normal */ }
    Org.cambioQuienPago(sel.value);
  },
  // El segundo selector (se devuelve / es un aporte) solo tiene sentido si hay
  // una persona: si pago la caja no hay a quien devolverle nada, y si el gasto
  // es de los antiguos "sin registrar" no se esta afirmando nada de nadie.
  cambioQuienPago(valor){
    const f=$('org-gasto-fuente');
    if(f) f.style.display = (valor==='caja'||valor==='sin') ? 'none' : '';
  },
  // "Sin registrar quien puso" NO es una opcion al crear un gasto: ese conjunto
  // esta cerrado y solo puede achicarse (ver el spec). Solo aparece mientras se
  // corrige un gasto que YA estaba asi, para poder arreglarle el concepto o el
  // monto sin verse obligado a inventarle un pagador.
  _opcionSinRegistrar(mostrar){
    const sel=$('org-gasto-quien'); if(!sel) return;
    const ya=sel.querySelector('option[value="sin"]');
    if(mostrar && !ya){
      const o=document.createElement('option');
      o.value='sin'; o.textContent='Sin registrar quién puso';
      sel.appendChild(o);
    }else if(!mostrar && ya){ ya.remove(); }
  },
```

- [ ] **Step 2: El segundo selector y el aviso en el título del primero**

En `web/app.js`, dentro de `Org._render()`, reemplazar:

```js
        ${ed?`<div class="row no-print" style="gap:6px;margin-top:10px">
          <input id="org-gasto-concepto" placeholder="Ej. Pan">
          <input id="org-gasto-monto" type="number" min="1" placeholder="Monto" style="max-width:110px">
          <select id="org-gasto-quien" style="max-width:150px" title="¿Quién puso el dinero?">
            <option value="">Lo puse yo</option>
          </select>
          <button class="btn small-btn" onclick="Org.addGasto()">Añadir</button></div>`:''}
```

por:

```js
        ${ed?`<div class="row no-print" style="gap:6px;margin-top:10px;flex-wrap:wrap">
          <input id="org-gasto-concepto" placeholder="Ej. Pan">
          <input id="org-gasto-monto" type="number" min="1" placeholder="Monto" style="max-width:110px">
          <select id="org-gasto-quien" style="max-width:150px" title="¿Quién puso el dinero?" onchange="Org.cambioQuienPago(this.value)">
            <option value="">Lo puse yo</option>
          </select>
          <select id="org-gasto-fuente" style="max-width:130px" title="¿Se le devuelve?">
            <option value="devuelve">Se devuelve</option>
            <option value="aporte">Es un aporte</option>
          </select>
          <button class="btn small-btn" id="org-gasto-guardar" onclick="Org.guardarGasto()">Añadir</button>
          <button class="link" id="org-gasto-cancelar" style="display:none" onclick="Org.cancelarEdicionGasto()">Cancelar</button></div>`:''}
```

⚠️ `Org.addGasto()` deja de existir con este nombre — el Step 6 de esta misma
tarea lo reemplaza por `Org.guardarGasto()` (que sirve tanto para añadir como
para corregir).

- [ ] **Step 3: Cada gasto muestra su fuente y gana un botón de corregir**

En `web/app.js`, dentro de `Org._render()`, reemplazar:

```js
    const gastos=h.gastos.map(g=>`<div class="org-row">
        <span>${escHtml(g.concepto)} — <b>${money(g.monto)}</b>${g.pagado_por_nombre?` <span class="muted small">· puso ${escHtml(g.pagado_por_nombre)}</span>`:''}</span>
        ${ed?`<button class="link icon-only" style="color:var(--red-tx)" aria-label="Quitar el gasto ${escHtml(g.concepto)}" onclick="Org.borrarGasto(${g.id})">✕</button>`:''}
      </div>`).join('') || '<p class="muted small">Sin gastos todavía.</p>';
```

por:

```js
    const gastos=h.gastos.map(g=>{
      // Como se lee la fuente en la fila: 'caja' no tiene persona (le pone su
      // propio texto); con persona, el matiz (se devuelve / es aporte) solo
      // se agrega si YA se especifico — un gasto de antes de esta casilla
      // (fuente NULL con persona) se ve igual que siempre, sin inventar nada.
      const fuenteTxt = g.fuente==='caja' ? 'pagó la caja de la iglesia'
        : g.pagado_por_nombre ? `puso ${escHtml(g.pagado_por_nombre)}${g.fuente==='aporte'?' (aporte, no se devuelve)':g.fuente==='devuelve'?' (se le devuelve)':''}`
        : '';
      return `<div class="org-row">
        <span>${escHtml(g.concepto)} — <b>${money(g.monto)}</b>${fuenteTxt?` <span class="muted small">· ${fuenteTxt}</span>`:''}</span>
        ${ed?`<div class="row" style="width:auto;gap:4px">
          <button class="link icon-only" aria-label="Corregir el gasto ${escHtml(g.concepto)}" onclick="Org.editarGasto(${g.id})">✏️</button>
          <button class="link icon-only" style="color:var(--red-tx)" aria-label="Quitar el gasto ${escHtml(g.concepto)}" onclick="Org.borrarGasto(${g.id})">✕</button>
        </div>`:''}
      </div>`;
    }).join('') || '<p class="muted small">Sin gastos todavía.</p>';
```

- [ ] **Step 4: El resumen en tres bloques**

En `web/app.js`, dentro de `Org._render()`, reemplazar:

```js
    // "Quién puso qué": lo que se mira al final para saber a quién devolverle cuánto.
    // Los gastos anteriores a esta función no tienen a nadie registrado, así que
    // la suma de los aportes puede quedar por debajo del total: se dice en vez de
    // callarlo, si no el resumen parece una cuenta mal hecha.
    const listaAportes=h.aportes||[];
    const sumaAportes=listaAportes.reduce((s,a)=>s+Number(a.total||0),0);
    const sinRegistrar=Number(h.total_gastado||0)-sumaAportes;
    const aportes=listaAportes.length
      ? `<div class="org-aportes"><b class="muted small">Quién puso qué</b>${listaAportes.map(a=>
          `<div class="org-row"><span>${escHtml(a.nombre)}</span><b>${money(a.total)}</b></div>`).join('')}
          ${sinRegistrar>0?`<div class="org-row muted small"><span>Sin registrar quién puso</span><b>${money(sinRegistrar)}</b></div>`:''}</div>`
      : '';
```

por:

```js
    // "Quién puso qué", en tres bloques (ya no es una sola lista): lo que
    // pagó la caja, a quién hay que devolverle, y los aportes donados. Lo que
    // no cae en ninguno de los tres es de antes de que existiera pagado_por
    // (ni siquiera hay a quién atribuirlo): se dice aparte en vez de
    // callarlo, si no el resumen parece una cuenta mal hecha.
    const totalCaja=Number(h.total_caja||0);
    const porDevolver=h.por_devolver||[];
    const aportesDonados=h.aportes_donados||[];
    const sumaConocida=totalCaja
      +porDevolver.reduce((s,a)=>s+Number(a.total||0),0)
      +aportesDonados.reduce((s,a)=>s+Number(a.total||0),0);
    const sinRegistrar=Number(h.total_gastado||0)-sumaConocida;
    const hayResumen=totalCaja>0||porDevolver.length||aportesDonados.length||sinRegistrar>0;
    const aportes=hayResumen
      ? `<div class="org-aportes"><b class="muted small">Quién puso qué</b>
          ${totalCaja>0?`<div class="org-row"><span>Pagó la caja de la iglesia</span><b>${money(totalCaja)}</b></div>`:''}
          ${porDevolver.map(a=>`<div class="org-row"><span>Por devolver: ${escHtml(a.nombre)}</span><b>${money(a.total)}</b></div>`).join('')}
          ${aportesDonados.map(a=>`<div class="org-row"><span>Aporte donado: ${escHtml(a.nombre)}</span><b>${money(a.total)}</b></div>`).join('')}
          ${sinRegistrar>0?`<div class="org-row muted small"><span>Sin registrar quién puso</span><b>${money(sinRegistrar)}</b></div>`:''}</div>`
      : '';
```

(El resto de `_render` sigue igual: sigue interpolando `${aportes}` donde ya
lo hacía — línea `${aportes}` dentro de la card de gastos.)

- [ ] **Step 5: Limpiar el estado de edición al abrir la hoja**

En `web/app.js`, dentro de `Org._render(h, origen)`, justo después de
`Org._hoja=h;` (primera línea de la función), agregar:

```js
    Org._gastoEditando=null;   // una hoja recien abierta nunca esta "editando" un gasto
```

- [ ] **Step 6: Reemplazar `addGasto`/`borrarGasto` por `guardarGasto`/`editarGasto`**

En `web/app.js`, reemplazar:

```js
  async addGasto(){
    const concepto=$('org-gasto-concepto').value.trim(); const monto=Number($('org-gasto-monto').value);
    if(!concepto) return toast('Escribe el concepto');
    if(!(monto>0)) return toast('El monto debe ser mayor a 0');
    const quien=Number(($('org-gasto-quien')||{}).value)||null;   // vacío = lo puse yo
    await conBoton(botonActual(), async()=>{
      const cuerpo = quien ? {concepto,monto,pagado_por:quien} : {concepto,monto};
      try{ await api('/organizacion/'+Org._hoja.id+'/gastos',{method:'POST',body:JSON.stringify(cuerpo)}); Org._recargar(); }
      catch(e){ toast((e&&e.message)||'No se pudo añadir'); }
    });
  },
```

por:

```js
  _gastoEditando:null,
  // Abre el formulario ya lleno con los datos del gasto, para corregirlo. Los
  // inputs son los mismos del alta: no hace falta un panel aparte.
  editarGasto(id){
    const g=(Org._hoja&&Org._hoja.gastos||[]).find(x=>x.id===id); if(!g) return;
    Org._gastoEditando=id;
    $('org-gasto-concepto').value=g.concepto;
    $('org-gasto-monto').value=g.monto;
    // Un gasto de los antiguos (sin fuente y sin pagador) NO se puede pintar
    // como "Lo puse yo": esa opcion afirma que paga quien esta editando, y
    // guardar una correccion de ortografia le adjudicaria una deuda que nadie
    // contrajo. Para ese caso se anade la opcion "Sin registrar quien puso".
    const sinRegistrar = g.fuente==null && g.pagado_por==null;
    Org._opcionSinRegistrar(sinRegistrar);
    const quien = sinRegistrar ? 'sin' : (g.fuente==='caja' ? 'caja' : String(g.pagado_por||''));
    $('org-gasto-quien').value=quien;
    Org.cambioQuienPago(quien);
    $('org-gasto-fuente').value = g.fuente==='aporte' ? 'aporte' : 'devuelve';
    $('org-gasto-guardar').textContent='Guardar cambios';
    $('org-gasto-cancelar').style.display='inline-flex';
    $('org-gasto-concepto').scrollIntoView({behavior:'smooth', block:'center'});
  },
  cancelarEdicionGasto(){
    Org._gastoEditando=null;
    Org._opcionSinRegistrar(false);   // no debe quedar disponible para un gasto NUEVO
    $('org-gasto-concepto').value=''; $('org-gasto-monto').value='';
    $('org-gasto-quien').value=''; Org.cambioQuienPago('');
    $('org-gasto-fuente').value='devuelve';
    $('org-gasto-guardar').textContent='Añadir';
    $('org-gasto-cancelar').style.display='none';
  },
  // Sirve para añadir (Org._gastoEditando vacío) y para corregir (con id):
  // mismo patrón que formNino/guardarNino en el módulo de Escuela Dominical.
  async guardarGasto(){
    const concepto=$('org-gasto-concepto').value.trim();
    const monto=Number($('org-gasto-monto').value);
    if(!concepto) return toast('Escribe el concepto');
    if(!(monto>0)) return toast('El monto debe ser mayor a 0');
    const quien=($('org-gasto-quien')||{}).value||'';   // '' = yo · 'caja' = caja · 'sin' = no tocar · id = otra persona
    // 'sin' manda SOLO concepto y monto: sin fuente ni pagado_por, el PATCH
    // deja los dos como estaban (ver la regla del backend en la Task 4). Es lo
    // que permite corregir un gasto antiguo sin cambiar de quien es el dinero.
    const cuerpo = quien==='sin'
      ? {concepto,monto}
      : quien==='caja'
      ? {concepto,monto,fuente:'caja'}
      : {concepto,monto,fuente:($('org-gasto-fuente')||{}).value||'devuelve',
         pagado_por: quien?Number(quien):ME.persona.id};
    const id=Org._gastoEditando;
    await conBoton(botonActual(), async()=>{
      try{
        if(id) await api('/organizacion/gastos/'+id,{method:'PATCH',body:JSON.stringify(cuerpo)});
        else   await api('/organizacion/'+Org._hoja.id+'/gastos',{method:'POST',body:JSON.stringify(cuerpo)});
        Org.cancelarEdicionGasto();
        Org._recargar();
        toast(id?'Gasto corregido':'Gasto añadido');
      }catch(e){ toast((e&&e.message)||'No se pudo guardar'); }
    });
  },
```

⚠️ `pagado_por: quien?Number(quien):ME.persona.id` — a diferencia de la
versión vieja (que dejaba `pagado_por` sin mandar y el servidor lo
completaba con quien hace el `POST`), acá se manda siempre explícito. Es lo
que evita la ambigüedad al **corregir**: un `PATCH` sin `pagado_por` significa
"no lo toques", no "asígnalo a quien pide" — si no se manda explícito, un
gasto que antes era "de la caja" y se corrige a "lo puse yo" se quedaría sin
persona y el servidor respondería 400 (ver Task 4, prueba "cambiar de la caja
a una persona exige indicar quien").

🔴 **Y por eso mismo existe la rama `'sin'`, que es la única que NO manda
`pagado_por`.** Sin ella, este plan tenía un fallo de dinero real: un gasto
antiguo de los que dicen "Sin registrar quién puso" se pintaba en el selector
como *"Lo puse yo"* (porque `String(g.pagado_por||'')` da `''` cuando no hay
pagador), y entonces `quien?…:ME.persona.id` mandaba **el id de quien estaba
editando**. Resultado: arreglar una falta de ortografía movía ese gasto de
"Sin registrar quién puso — $5.000" a "Por devolver: Abel — $5.000". La
iglesia pasaba a deberle plata a quien corrigió el texto, guardado en silencio
y sin ningún error por pantalla. Las dos ramas —`'sin'` aquí y la condición
`tocaFuente || tocaPagador` en la Task 4— son las dos mitades del mismo
arreglo: **si se implementa solo una, el fallo sigue vivo.**

- [ ] **Step 7: `borrarGasto` sigue igual — solo confirmar que su `escHtml` sigue en orden**

`Org.borrarGasto` no cambia (sigue borrando sin corrección posible, es
territorio de la Task de borrado, no de esta). Confirmar que sigue así en
`web/app.js` (no se toca):

```js
  async borrarGasto(id){
    // escHtml: modalConfirm mete el mensaje crudo en innerHTML, y tanto el
    // concepto como el nombre de quien pagó vienen de la base de datos.
    const g=(Org._hoja&&Org._hoja.gastos||[]).find(x=>x.id===id);
    const quien=g&&g.pagado_por_nombre?` que puso ${escHtml(g.pagado_por_nombre)}`:'';
    modalConfirm(
      g?`¿Borrar el gasto "${escHtml(g.concepto)}" de ${money(g.monto)}${quien}? No queda registro de él.`
       :'¿Borrar este gasto? No queda registro de él.',
      async()=>{
        try{ await api('/organizacion/gastos/'+id,{method:'DELETE'}); Org._recargar(); }
        catch(e){ toast((e&&e.message)||'No se pudo borrar'); }
      }, {danger:true});
  },
```

- [ ] **Step 8: Probarlo en el navegador**

Servidor propio en un puerto libre, `DISABLE_RATE_LIMIT=1`, `JWT_SECRET=local`,
`DB_PATH` a una BD de usar y tirar en el scratchpad. Siembra con
`node src/seed.js`. Iglesia `MONTESION`, clave `1234`.

⚠️ **NO uses `scripts/with_server.py`**: en Windows deja el node huérfano y la
corrida siguiente lee su BD vieja. Mata tu proceso al terminar.

Comprobar, entrando como líder:
- Abrir una hoja de Organización, añadir un gasto marcando "La caja de la
  iglesia" → aparece "pagó la caja de la iglesia" en la fila y en el resumen,
  sin selector de "se devuelve/aporte" visible.
- Añadir un gasto de una persona marcando "Es un aporte" → aparece "(aporte,
  no se devuelve)" en la fila, y en el resumen bajo "Aporte donado".
- Añadir un gasto de una persona con "Se devuelve" (el default) → aparece
  bajo "Por devolver" en el resumen.
- Tocar ✏️ en cualquier gasto → el formulario se llena con sus datos, el botón
  dice "Guardar cambios"; cambiar el monto y guardar → la fila se actualiza.
  Tocar "Cancelar" a mitad de una corrección → el formulario vuelve a "Añadir"
  vacío, sin guardar nada.
- 🔴 **El gasto antiguo sin pagador (el caso que este plan tenía roto).**
  Créalo a mano contra la BD de prueba, que por la app no se puede:
  `INSERT INTO evento_org_gasto (org_id, concepto, monto) VALUES (<hoja>, 'Pna', 5000);`
  Recarga la hoja. Tiene que verse en el resumen como **"Sin registrar quién
  puso — $5.000"**. Toca ✏️: el selector debe decir **"Sin registrar quién
  puso"**, *no* "Lo puse yo", y el desplegable de se-devuelve/aporte debe estar
  oculto. Corrige el concepto a "Pan" y guarda. **Comprueba que el resumen
  sigue diciendo "Sin registrar quién puso — $5.000"** y que no apareció
  ninguna línea "Por devolver". Si aparece tu nombre ahí, el arreglo no está
  completo.
- Después de esa corrección, toca "+ Añadir" con el formulario limpio: la
  opción "Sin registrar quién puso" **ya no debe estar** en el selector (no se
  pueden crear gastos nuevos sin pagador).
- Imprimir la "🧾 Rendición" (o vista previa de impresión) → el papel muestra
  los tres bloques del resumen igual que en pantalla.
- Sin errores de consola en ningún paso.

- [ ] **Step 9: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **473, 0 fail** — esta tarea no toca backend; si el número cambia,
algo se salió de alcance.

- [ ] **Step 10: Commit**

```bash
git add web/app.js
git commit -m "feat(organizacion): mostrar la fuente de cada gasto y poder corregirlo desde la pantalla"
```

---

### Task 6: Que la auditoría sepa a qué hoja se refiere

**Files:**
- Modify: `backend/src/db.js` (junto al resto de `agregarColumna`, y la lista de índices)
- Modify: `backend/src/auth.js:186-190` (`auditar`)
- Modify: `backend/src/organizacion.js` (la llamada a `auditar` del `PATCH` de la Task 4)
- Test: `backend/test/organizacion-fuente-gasto.test.js` (añadir)

**Interfaces:**
- Consumes: el `PATCH /organizacion/gastos/:gastoId` de la Task 4.
- Produces: `auditoria` gana `ref_tabla TEXT` y `ref_id INTEGER`; `auditar()`
  gana un **sexto parámetro opcional** `ref` con forma `{tabla, id}`. La Task 7
  los consulta.

> **El problema que resuelve.** `auditoria` (`db.js:220-228`) guarda **qué**
> pasó, **quién** y **cuándo**, pero **no a qué registro se refiere** — solo un
> `detalle` de texto libre. No hay forma limpia de pedir "las correcciones de la
> hoja 7", y por eso el rastro solo se leía abriendo la base de datos por fuera.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/organizacion-fuente-gasto.test.js`:

```js
// ---------- La referencia: a que se refiere cada apunte de auditoria ----------

test('auditoria gana ref_tabla/ref_id, y nacen vacias en todo lo historico', () => {
  const cols = db.prepare('PRAGMA table_info(auditoria)').all().map(c => c.name);
  assert.ok(cols.includes('ref_tabla'), 'falta ref_tabla');
  assert.ok(cols.includes('ref_id'), 'falta ref_id');
});

test('auditar() SIN el parametro nuevo sigue escribiendo igual (los ~40 sitios que ya la usan)', async () => {
  const { auditar } = await import('../src/auth.js');
  const S = sembrar('AUDCOMP');
  auditar(S.iglesiaId, S.liderId, 'accion_de_siempre', 'un_modulo', 'detalle');

  const fila = db.prepare("SELECT * FROM auditoria WHERE accion = 'accion_de_siempre'").get();
  assert.ok(fila, 'la llamada de 5 argumentos no puede dejar de funcionar');
  assert.equal(fila.detalle, 'detalle');
  assert.equal(fila.ref_tabla, null);
  assert.equal(fila.ref_id, null);
});

test('corregir un gasto deja la referencia apuntando a la HOJA, no al gasto', async () => {
  const b = await servidor();
  const S = sembrar('REF1');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 1000 }) });
  const { id } = await res.json();

  await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 1200 }) });

  const log = db.prepare("SELECT ref_tabla, ref_id FROM auditoria WHERE accion = 'editar_gasto'").get();
  assert.equal(log.ref_tabla, 'evento_org');
  assert.equal(log.ref_id, hojaId, 'apunta a la hoja: si se borra el gasto, su correccion no queda huerfana');
  assert.notEqual(log.ref_id, id, 'NO al gasto');
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/organizacion-fuente-gasto.test.js`
Expected: FALLA — `cols.includes('ref_tabla')` es `false`.

- [ ] **Step 3: Las dos columnas y su índice**

En `backend/src/db.js`, junto al resto de llamadas a `agregarColumna`:

```js
// AUDITORIA: a que registro se refiere el apunte. Sin esto la tabla guarda QUE
// paso, QUIEN y CUANDO, pero no SOBRE QUE — y no hay forma limpia de pedir "las
// correcciones de la hoja 7". NULL en todo lo historico y en los ~40 sitios que
// llaman a auditar() sin la referencia; hoy solo la rellena Organizacion.
agregarColumna('auditoria', 'ref_tabla', 'TEXT');
agregarColumna('auditoria', 'ref_id', 'INTEGER');
```

Y en la lista de índices (junto a `idx_auditoria_iglesia`, `db.js:622`):

```js
  CREATE INDEX IF NOT EXISTS idx_auditoria_ref ON auditoria(ref_tabla, ref_id);
```

- [ ] **Step 4: El sexto parámetro de `auditar()`**

En `backend/src/auth.js`, reemplazar:

```js
export function auditar(iglesiaId, actorId, accion, modulo, detalle = '') {
  db.prepare(
    'INSERT INTO auditoria (iglesia_id, actor_id, accion, modulo, detalle) VALUES (?,?,?,?,?)'
  ).run(iglesiaId, actorId, accion, modulo, detalle);
}
```

por:

```js
// `ref` es OPCIONAL y va al final a proposito: los ~40 sitios que ya llaman a
// esta funcion con 5 argumentos no se tocan y siguen escribiendo NULL en las
// dos columnas nuevas. Con {tabla, id} el apunte queda consultable ("dame las
// correcciones de la hoja 7"), que es lo que permite ENSENAR el rastro en vez
// de solo guardarlo.
export function auditar(iglesiaId, actorId, accion, modulo, detalle = '', ref = null) {
  db.prepare(
    'INSERT INTO auditoria (iglesia_id, actor_id, accion, modulo, detalle, ref_tabla, ref_id) VALUES (?,?,?,?,?,?,?)'
  ).run(iglesiaId, actorId, accion, modulo, detalle, ref ? ref.tabla : null, ref ? ref.id : null);
}
```

- [ ] **Step 5: Que el `PATCH` mande la referencia**

En `backend/src/organizacion.js`, en el `r.patch('/gastos/:gastoId', ...)` de la
Task 4, reemplazar:

```js
  auditar(req.user.iglesia_id, req.user.persona_id, 'editar_gasto', 'organizacion',
    `"${gasto.concepto}" ${montoTxt(gasto.monto)} -> "${concepto}" ${montoTxt(monto)}`);
```

por:

```js
  // La referencia apunta a la HOJA (gasto.org_id), no al gasto: si manana se
  // borra el gasto, su correccion sigue apareciendo en el historial de la hoja.
  // Apuntando al gasto, el rastro quedaria huerfano justo en el caso en que mas
  // importa (alguien corrige un monto y despues borra la linea entera).
  auditar(req.user.iglesia_id, req.user.persona_id, 'editar_gasto', 'organizacion',
    `"${gasto.concepto}" ${montoTxt(gasto.monto)} -> "${concepto}" ${montoTxt(monto)}`,
    { tabla: 'evento_org', id: gasto.org_id });
```

- [ ] **Step 6: Correr el test y verlo pasar**

Run: `cd backend && node --test test/organizacion-fuente-gasto.test.js`
Expected: PASA — 20 tests (el total del archivo).

- [ ] **Step 7: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **476 tests, 0 fail** (473 + 3).

- [ ] **Step 8: Commit**

```bash
git add backend/src/db.js backend/src/auth.js backend/src/organizacion.js backend/test/organizacion-fuente-gasto.test.js
git commit -m "feat(auditoria): que un apunte sepa a que registro se refiere"
```

---

### Task 7: El historial de correcciones, visible en la hoja y en el papel

**Files:**
- Modify: `backend/src/organizacion.js` (`armarHoja`, el que quedó tras la Task 3)
- Modify: `web/app.js` — `Org._render()`, dentro de la tarjeta de gastos
- Test: `backend/test/organizacion-fuente-gasto.test.js` (añadir)

**Interfaces:**
- Consumes: `ref_tabla`/`ref_id` (Task 6).
- Produces: `GET /organizacion/:id` y `GET /organizacion/evento/:eventoId`
  devuelven además `correcciones`: `[{ id, detalle, fecha, actor_nombre }]`,
  de la más reciente a la más antigua.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/organizacion-fuente-gasto.test.js`:

```js
// ---------- El historial, en la hoja ----------

test('la hoja devuelve sus correcciones, con el nombre de quien corrigio', async () => {
  const b = await servidor();
  const S = sembrar('HIST');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 12000 }) });
  const { id } = await res.json();

  await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 8000 }) });

  const hojaRes = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hojaRes.correcciones.length, 1);
  assert.equal(hojaRes.correcciones[0].actor_nombre, 'Lider');
  assert.match(hojaRes.correcciones[0].detalle, /\$12\.000/);
  assert.match(hojaRes.correcciones[0].detalle, /\$8\.000/);
});

test('una hoja sin correcciones devuelve la lista vacia, no undefined', async () => {
  const b = await servidor();
  const S = sembrar('SINC');
  const { hojaId, auth } = await hoja(b, S);

  const hojaRes = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.deepEqual(hojaRes.correcciones, []);
});

test('borrar el gasto NO borra su correccion del historial de la hoja', async () => {
  const b = await servidor();
  const S = sembrar('BORR');
  const { hojaId, auth } = await hoja(b, S);
  const res = await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 12000 }) });
  const { id } = await res.json();
  await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ monto: 8000 }) });

  await fetch(b + `/api/organizacion/gastos/${id}`, { method: 'DELETE', headers: auth });

  const hojaRes = await (await fetch(b + '/api/organizacion/' + hojaId, { headers: auth })).json();
  assert.equal(hojaRes.correcciones.length, 1, 'es justo el caso en que mas importa que el rastro siga ahi');
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/organizacion-fuente-gasto.test.js`
Expected: FALLA — `hojaRes.correcciones` es `undefined`.

- [ ] **Step 3: Que `armarHoja` traiga el historial**

En `backend/src/organizacion.js`, dentro de `armarHoja`, justo antes del
`const evento = org.evento_id`, añadir:

```js
  // El historial de correcciones de ESTA hoja. Viaja con la hoja (que ya es una
  // sola respuesta) en vez de por una ruta aparte: son cero filas en el caso
  // normal. Acotado tambien por iglesia_id, no solo por la referencia.
  const correcciones = db.prepare(
    `SELECT a.id, a.detalle, a.fecha, p.nombre AS actor_nombre
       FROM auditoria a LEFT JOIN persona p ON p.id = a.actor_id
      WHERE a.ref_tabla = 'evento_org' AND a.ref_id = ? AND a.iglesia_id = ?
        AND a.accion = 'editar_gasto'
      ORDER BY a.id DESC`
  ).all(org.id, org.iglesia_id);
```

Y añadir `correcciones` al objeto que devuelve:

```js
  return { ...org, evento, cosas, gastos, total_gastado: total,
    total_caja: totalCaja, por_devolver: porDevolver, aportes_donados: aportesDonados,
    correcciones };
```

⚠️ `LEFT JOIN` y no `JOIN` en `persona`: si la cuenta de quien corrigió se
elimina, la corrección debe seguir apareciendo (con el nombre vacío), no
desaparecer del historial.

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd backend && node --test test/organizacion-fuente-gasto.test.js`
Expected: PASA — 23 tests (el total del archivo).

- [ ] **Step 5: El bloque en la pantalla**

En `web/app.js`, dentro de `Org._render()`, justo **antes** de la línea
`const aportes=hayResumen` (el resumen que dejó la Task 5), añadir:

```js
    // Historial de correcciones de la hoja. Solo aparece si hubo alguna.
    // escHtml en las dos cosas: el detalle lleva DENTRO el concepto que tecleó
    // una persona (y con comillas dobles: `"Pan" $12.000 -> "Pan" $8.000`), y
    // el nombre sale de la base de datos.
    const correcciones=(h.correcciones||[]).length
      ? `<div class="org-aportes" style="margin-top:14px"><b class="muted small">Correcciones</b>
          ${h.correcciones.map(c=>`<div class="org-row"><span class="muted small">
            ${escHtml(c.actor_nombre||'Alguien')} · ${escHtml(c.detalle||'')}</span>
            <span class="muted small">${escHtml(fechaDeUTC(c.fecha))}</span></div>`).join('')}</div>`
      : '';
```

Y en el HTML de la tarjeta de gastos, interpolarlo **después de `${aportes}` y
antes del bloque `.solo-rendicion`**:

```js
        ${aportes}
        ${correcciones}
        <!-- Solo en el papel de rendicion: el tesorero firma que recibio las
             cuentas. En pantalla no pinta nada, y en la hoja de la puerta
             tampoco (alli no hay cuentas que recibir). -->
        <div class="solo-rendicion">Recibí conforme: ______________________
```

> 🔴 **Dónde va no es un detalle de estilo, y hay dos formas de equivocarse.**
> De esta hoja salen **dos papeles** y lo único que los separa es una clase en
> el `<body>` (`Org._conPapel`, `app.js:4210-4226`):
>
> | Papel | Va a | Lleva |
> |---|---|---|
> | 🖨️ Imprimir | **la puerta de la iglesia** | Cosas a llevar. Sin gastos: `.card-gastos` es `no-print` (`app.js:4098`) |
> | 🧾 Rendición | **el tesorero** | Gastos y cuentas (`.modo-rendicion .card-gastos{display:block!important}`, `styles.css:681`) |
>
> - **Fuera de `.card-gastos`**, el bloque sale en la hoja de la puerta: *"Abel
>   cambió el monto de $12.000 a $8.000"* colgado donde lo lee toda la
>   congregación. Va **dentro**, que ya hereda ocultarse en un papel y verse en
>   el otro.
> - **Envuelto en `no-print`** "porque es de pantalla", no saldría **nunca** en
>   la rendición: esa clase gana con `!important`. El propio CSS lleva escrito
>   el aviso de lo caro que es este fallo (`styles.css:676-680`).
> - Y va **antes** de `.solo-rendicion`, para que la firma quede al final del
>   papel.

- [ ] **Step 6: El ayudante de fecha `fechaDeUTC`**

`auditoria.fecha` es `datetime('now')`: **UTC**, aunque el proceso corra en hora
de Chile. Sin convertir, una corrección hecha a las 21:00 se vería fechada al
día siguiente.

Run: `grep -n "function fechaDeUTC" web/app.js`

- **Si aparece**, no hagas nada: ya lo añadió el plan de la bandeja del portal
  (`2026-07-31-bandeja-portal-publico.md`, Task 4). **No lo dupliques.**
- **Si no aparece**, añádelo justo después de `escHtml` (~línea 2334):

```js
// SQLite guarda datetime('now') en UTC SIEMPRE, aunque el proceso corra en hora
// de Chile. Cortar el texto con .slice(0,10) muestra el dia equivocado: algo
// hecho un lunes a las 21:00 se veria fechado el martes. Se arregla al MOSTRAR,
// nunca cambiando lo guardado (eso volveria inconsistentes las filas viejas con
// las nuevas, y esta app ya se llevo cinco fallos por tocar zonas horarias).
function fechaDeUTC(s){
  if(!s) return '';
  const d=new Date(String(s).replace(' ','T')+'Z');   // sin la Z se leeria como hora local
  return isNaN(d.getTime()) ? String(s).slice(0,10) : d.toLocaleDateString('es-CL');
}
```

- [ ] **Step 7: Probarlo en el navegador**

Mismo montaje que la Task 5 (servidor propio, `DISABLE_RATE_LIMIT=1`,
`JWT_SECRET=local`, BD de usar y tirar, `node src/seed.js`, iglesia
`MONTESION`, clave `1234`). **NO uses `scripts/with_server.py`.**

Comprobar, entrando como líder:
- Abrir una hoja sin correcciones → **no** aparece ningún bloque "Correcciones".
- Corregir el monto de un gasto de $12.000 a $8.000 → aparece el bloque con
  *"Lider · "Pan" $12.000 -> "Pan" $8.000"* y la fecha de hoy (no la de mañana).
- Corregir otro gasto → la corrección más reciente sale **arriba**.
- Borrar ese gasto → **la corrección sigue en el historial**.
- 🖨️ **Imprimir** (vista previa) → el papel de la puerta lleva las cosas a
  llevar y **NO** lleva ni gastos ni correcciones.
- 🧾 **Rendición** (vista previa) → el papel **sí** lleva el historial, entre el
  resumen y la línea de "Recibí conforme".
- Sin errores de consola.

- [ ] **Step 8: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **479 tests, 0 fail** (476 + 3).

- [ ] **Step 9: Commit**

```bash
git add backend/src/organizacion.js web/app.js backend/test/organizacion-fuente-gasto.test.js
git commit -m "feat(organizacion): ver en la hoja quien corrigio un gasto y que cambio"
```

---

### Task 8: Dejarlo escrito

**Files:**
- Modify: `ESTADO.md`

- [ ] **Step 1: Actualizar `ESTADO.md`**

Añadir una sección con qué se construyó — la casilla `fuente` en
`evento_org_gasto`, el `PATCH` para corregir gastos, el resumen partido en tres
bloques, y **el historial de correcciones visible en la hoja y en la rendición
impresa** (con `auditoria.ref_tabla`/`ref_id`) —, el número nuevo de tests
(**479**), y **lo que sigue sin resolver**:

1. Los gastos de la hoja de Organización siguen sin aparecer en **Tesorería**:
   sigue siendo el Camino C, no decidido.
2. **No se registra si ya se devolvió el dinero** (Camino B). El bloque "Por
   devolver" dice cuánto se debe hoy, para siempre.
3. **Borrar un gasto sigue sin dejar rastro**, a propósito: en este módulo
   ningún ítem lo deja al crearse o borrarse, y auditar solo el borrado del
   gasto sería un parche asimétrico. Consecuencia asumida: quien quiera esquivar
   el historial puede borrar y volver a crear.
4. **No hay pantalla de auditoría general.** Lo que se ve es el historial de
   correcciones **de una hoja**; `crear_org`, `editar_org`, `borrar_org` y
   `duplicar_org` siguen sin mostrarse en ningún sitio.
5. **No se comprueba que la persona esté activa** al anotar o corregir un gasto
   (sí se comprueba en las cosas a llevar, `organizacion.js:282-284`). Bug
   preexistente, fuera de alcance.

- [ ] **Step 2: Commit**

```bash
git add ESTADO.md
git commit -m "docs(estado): la fuente del gasto y el historial de correcciones, cerrado"
```
