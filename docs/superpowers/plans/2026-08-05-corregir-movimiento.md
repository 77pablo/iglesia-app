# Corregir un movimiento de Tesorería — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La tesorera puede corregir monto, descripción y categoría de cualquier movimiento, con rastro "antes → después" visible para quien supervisa (tesorera, pastor, obispo).

**Architecture:** Un `PATCH /api/tesoreria/movimientos/:id` parcial que solo escribe (y solo audita) lo que de verdad cambió, `UPDATE`+`auditar()` en una transacción; el listado gana un conteo `correcciones` por fila (subconsulta a `auditoria` por `ref_tabla`/`ref_id`); un endpoint de historial de lectura; el frontend pinta ✏️ para la tesorera, la marca "corregido" para todos, y el historial en `modalDetalle`. Spec: `docs/superpowers/specs/2026-08-05-corregir-movimiento-design.md`.

**Tech Stack:** Node 24 (`node:test`, `node:sqlite`), Express, zod 4, frontend vanilla.

## Global Constraints

- Rama: `feat/corregir-movimiento` (creada en la Task 1, desde `main`).
- Suite en verde entre tarea y tarea: `cd backend && npm test`.
- **Solo se audita lo que cambió de verdad** — un PATCH que reenvía valores idénticos no escribe ni audita nada.
- `UPDATE` y `auditar()` **en la misma transacción** (`BEGIN`/`COMMIT`/`ROLLBACK`).
- El `SET` del UPDATE se construye desde **lista blanca de columnas** (monto/descripcion/categoria), nunca desde las claves del body.
- `tipo` y `fecha` NO se corrigen: `validar()` los descarta en silencio y un test lo fija.
- Movimiento de otra iglesia → **404** en la misma consulta (no se confirma que exista).
- Frontend: todo texto de persona pasa por `escHtml()`; controles clicables son `<button>` (el barrido `botones-reales.test.js` patrulla); fechas de auditoría con `fechaDeUTC()` (son UTC), fechas de movimiento con el texto crudo/`fechaTxt` como ya hace `filaMov`.
- El PATCH del frontend **manda solo lo tocado** (comparado contra el valor original); guardar sin cambios no llama a la API.
- Esquema real de `auditoria` (verificado): columnas `id, iglesia_id, actor_id, accion, modulo, detalle, fecha, ref_tabla, ref_id`. Firma: `auditar(iglesiaId, actorId, accion, modulo, detalle, {tabla, id})`.
- Mensajes de commit: minúsculas, sin tildes, `tipo(ámbito): qué -- por qué`, terminados en `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Backend — `PATCH /movimientos/:id` con rastro condicional

**Files:**
- Create: `backend/test/corregir-movimiento.test.js`
- Modify: `backend/src/tesoreria.js` (nueva ruta después de `POST /movimientos`, línea ~86)

**Interfaces:**
- Produces: `PATCH /api/tesoreria/movimientos/:id` — body parcial `{monto?, descripcion?, categoria?}`, al menos uno; 200 `{ok:true}` (o `{ok:true, sinCambios:true}` si nada difería), 400 sin campos, 403 no-tesorero, 404 otra iglesia. Apuntes en `auditoria` con `accion='movimiento_corregir'`, `modulo='tesoreria'`, `ref_tabla='movimiento'`, `ref_id=<id>`, `detalle` con solo los campos cambiados.
- La Task 2 depende de la forma exacta del apunte (accion y ref).

- [ ] **Step 1: Crear la rama**

```bash
cd "C:/Users/pdani/Documents/App-Iglesia/app" && git checkout -b feat/corregir-movimiento
```

- [ ] **Step 2: Escribir los tests que fallan**

Crear `backend/test/corregir-movimiento.test.js` (mismo arnés in-process de `campanias.test.js`):

```js
// -----------------------------------------------------------------------------
//  Corregir un movimiento de tesoreria (spec 2026-08-05-corregir-movimiento).
//
//  Lo que sostiene todo: SOLO se escribe (y SOLO se audita) lo que de verdad
//  cambio, y el UPDATE viaja con su apunte en la misma transaccion. Un PATCH
//  que reenvia lo mismo no deja rastro — la leccion repetida cinco veces en
//  este proyecto (formularios que reenvian campos que nadie toco).
// -----------------------------------------------------------------------------
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let dbDirecta, srv, base, signToken, SEM, tesorero;

before(async () => {
  dbDirecta = await cargarDb();
  ({ signToken } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(res => srv.once('listening', res));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(res => srv.close(res)));

beforeEach(() => {
  reiniciar(dbDirecta);
  dbDirecta.exec('DELETE FROM movimiento');
  dbDirecta.exec('DELETE FROM campania');
  dbDirecta.exec('DELETE FROM auditoria');
  SEM = sembrarMinimo(dbDirecta);
  // sembrarMinimo no trae tesorero: se asciende a miembro1, igual que en
  // campanias.test.js (soloTesorero exige rol='tesorero' en una pertenencia).
  dbDirecta.prepare("UPDATE pertenencia SET rol = 'tesorero' WHERE persona_id = ? AND grupo_id = ?")
    .run(SEM.miembro1.id, SEM.grupoId);
  tesorero = SEM.miembro1;
});

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});
const patchMov = (id, cuerpo, quien = tesorero) =>
  fetch(`${base}/api/tesoreria/movimientos/${id}`, { method: 'PATCH', headers: H(quien), body: JSON.stringify(cuerpo) });

const crearMov = (campos = {}) => Number(dbDirecta.prepare(
  `INSERT INTO movimiento (iglesia_id, tipo, categoria, monto, descripcion, creado_por, campania_id)
   VALUES (?,?,?,?,?,?,?)`
).run(campos.iglesia_id ?? SEM.iglesiaId, campos.tipo ?? 'ingreso', campos.categoria ?? 'ofrenda',
      campos.monto ?? 5000, campos.descripcion ?? 'Ofrenda dominical', tesorero.id,
      campos.campania_id ?? null).lastInsertRowid);

const movDe = (id) => dbDirecta.prepare('SELECT * FROM movimiento WHERE id = ?').get(id);
const apuntesDe = (id) => dbDirecta.prepare(
  "SELECT * FROM auditoria WHERE ref_tabla='movimiento' AND ref_id=? AND accion='movimiento_corregir' ORDER BY id"
).all(id);

test('la tesorera corrige el monto: cambia, y queda UN apunte con antes -> despues', async () => {
  const id = crearMov({ monto: 5000 });
  const res = await patchMov(id, { monto: 50000 });
  assert.equal(res.status, 200);
  assert.equal(movDe(id).monto, 50000);
  const apuntes = apuntesDe(id);
  assert.equal(apuntes.length, 1, 'corregir dinero sin rastro no es aceptable');
  assert.ok(apuntes[0].detalle.includes('5000') && apuntes[0].detalle.includes('50000'),
    `el apunte no dice antes y despues: ${apuntes[0].detalle}`);
  assert.equal(apuntes[0].actor_id, tesorero.id);
});

test('el pastor NO corrige: 403 y el movimiento intacto', async () => {
  const id = crearMov({ monto: 5000 });
  const res = await patchMov(id, { monto: 1 }, SEM.pastor);
  assert.equal(res.status, 403);
  assert.equal(movDe(id).monto, 5000);
  assert.equal(apuntesDe(id).length, 0);
});

test('movimiento de otra iglesia: 404 sin confirmar que exista', async () => {
  const otra = Number(dbDirecta.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA')").run().lastInsertRowid);
  const ajeno = crearMov({ iglesia_id: otra });
  const res = await patchMov(ajeno, { monto: 1 });
  assert.equal(res.status, 404);
  assert.equal(movDe(ajeno).monto, 5000);
});

test('PATCH con los MISMOS valores: 200 y CERO apuntes nuevos', async () => {
  const id = crearMov({ monto: 5000, descripcion: 'Ofrenda dominical', categoria: 'ofrenda' });
  const res = await patchMov(id, { monto: 5000, descripcion: 'Ofrenda dominical', categoria: 'ofrenda' });
  assert.equal(res.status, 200);
  assert.equal(apuntesDe(id).length, 0,
    'se audito un cambio que nadie hizo: es el fallo del "Juan Perez -> Juan Perez"');
});

test('PATCH sin ningun campo -> 400', async () => {
  const id = crearMov();
  const res = await patchMov(id, {});
  assert.equal(res.status, 400);
});

test('tipo y fecha se descartan en silencio: el movimiento no los cambia', async () => {
  const id = crearMov({ tipo: 'ingreso' });
  const antes = movDe(id);
  const res = await patchMov(id, { tipo: 'gasto', fecha: '2020-01-01', monto: 7000 });
  assert.equal(res.status, 200);
  const despues = movDe(id);
  assert.equal(despues.tipo, 'ingreso', 'el tipo NO se corrige: cambiarlo es borrar+crear');
  assert.equal(despues.fecha, antes.fecha, 'la fecha NO se corrige (mueve totales mensuales)');
  assert.equal(despues.monto, 7000);
});

test('corregir el monto de un aporte ajusta el recaudado CALCULADO, tambien con la campania cerrada', async () => {
  const camp = Number(dbDirecta.prepare(
    "INSERT INTO campania (iglesia_id, nombre, meta, recaudado, cerrada_en) VALUES (?,?,0,0,datetime('now'))"
  ).run(SEM.iglesiaId, 'Techo').lastInsertRowid);
  const aporte = crearMov({ monto: 10000, campania_id: camp, descripcion: 'Aporte a campaña' });
  const res = await patchMov(aporte, { monto: 15000 });
  assert.equal(res.status, 200, 'cerrada rechaza aportes NUEVOS, no arreglos de tecleo');
  const r = await fetch(`${base}/api/tesoreria/campanias`, { headers: H(tesorero) });
  const campanias = await r.json();
  assert.equal(campanias.find(c => c.id === camp).recaudado, 15000,
    'la barra no reflejo la correccion: habria dos contabilidades otra vez');
});

test('descripcion vacia se guarda como NULL (misma normalizacion que el POST)', async () => {
  const id = crearMov({ descripcion: 'con typo' });
  const res = await patchMov(id, { descripcion: '' });
  assert.equal(res.status, 200);
  assert.equal(movDe(id).descripcion, null);
  assert.equal(apuntesDe(id).length, 1);
});
```

- [ ] **Step 3: Correr — debe FALLAR**

```bash
cd backend && node --test test/corregir-movimiento.test.js
```

Expected: FAIL — el PATCH devuelve 404 (la ruta no existe; Express cae al 404 general).

- [ ] **Step 4: Implementar la ruta**

En `backend/src/tesoreria.js`, después del `POST /movimientos` (línea ~86) y antes de la sección de campañas:

```js
// --- Corregir un movimiento (spec 2026-08-05): monto, descripcion, categoria ---
// El tipo NO se corrige (cambiarlo es borrar+crear, y borrar esta prohibido) y
// la fecha tampoco (mueve los totales mensuales; ver reportes.js:21-29 antes de
// tocar cualquier fecha). validar() descarta esas claves en silencio y el test
// lo deja fijado.
const correccionSchema = z.object({
  monto: z.coerce.number().positive('el monto debe ser un numero mayor que cero').optional(),
  descripcion: z.string().trim().max(500).optional(),
  categoria: z.string().trim().max(100).optional()
}).refine(b => b.monto !== undefined || b.descripcion !== undefined || b.categoria !== undefined,
  { message: 'no viene ningun campo que corregir' });

r.patch('/movimientos/:id', soloTesorero, limiterSensible, validar(correccionSchema), (req, res) => {
  const ig = req.user.iglesia_id;
  // La iglesia va en la MISMA consulta: al movimiento de otra iglesia se le
  // responde 404, no 403 (no se confirma que exista) — convencion del archivo.
  const m = db.prepare('SELECT id, monto, descripcion, categoria FROM movimiento WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, ig);
  if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' });

  // '' significa "borrar el texto": se normaliza a NULL, igual que el POST
  // (descripcion || null). Sin esto, '' y NULL serian dos vacios distintos.
  const norm = v => (v === '' ? null : v);

  // El SET se arma desde esta lista blanca, NUNCA desde las claves del body
  // (regla del repo desde el PATCH de ninos). Y SOLO entra lo que de verdad
  // es distinto: lo demas ni se escribe ni se audita.
  const sets = [], vals = [], cambios = [];
  const pedir = (col, nuevo, viejo) => {
    if (nuevo === undefined) return;
    const n = norm(nuevo);
    if (n === (viejo ?? null)) return;
    sets.push(`${col} = ?`); vals.push(n);
    cambios.push(`${col}: ${viejo ?? '(vacio)'} -> ${n ?? '(vacio)'}`);
  };
  pedir('monto', req.body.monto, m.monto);
  pedir('descripcion', req.body.descripcion, m.descripcion);
  pedir('categoria', req.body.categoria, m.categoria);

  if (!sets.length) return res.json({ ok: true, sinCambios: true });

  // UPDATE y apunte en la MISMA transaccion (convencion fijada el 31-jul):
  // una correccion de dinero no puede quedar aplicada sin rastro.
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE movimiento SET ${sets.join(', ')} WHERE id = ? AND iglesia_id = ?`)
      .run(...vals, m.id, ig);
    auditar(ig, req.user.persona_id, 'movimiento_corregir', 'tesoreria', cambios.join(' · '),
      { tabla: 'movimiento', id: m.id });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.json({ ok: true });
});
```

⚠️ Comprobar cómo obtiene el resto del archivo el id del actor: si las rutas existentes usan `req.user.persona_id`, usar eso mismo (mirar `POST /movimientos`, línea 84).

- [ ] **Step 5: Correr — debe PASAR, y suite completa**

```bash
cd backend && node --test test/corregir-movimiento.test.js && npm test
```

Expected: 8/8 del archivo nuevo y suite completa en verde.

- [ ] **Step 6: Commit**

```bash
git add backend/test/corregir-movimiento.test.js backend/src/tesoreria.js
git commit -m "feat(tesoreria): corregir un movimiento con rastro -- solo lo que cambio, en transaccion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Backend — conteo `correcciones` en los listados + historial

**Files:**
- Modify: `backend/src/tesoreria.js:49-54` (`GET /movimientos`) y nueva ruta `GET /movimientos/:id/historial`
- Modify: `backend/src/obispo.js:113` (detalle de tesorería del mes)
- Modify: `backend/test/corregir-movimiento.test.js` (tests nuevos al final)

**Interfaces:**
- Consumes: la forma del apunte de la Task 1 (`accion='movimiento_corregir'`, `ref_tabla='movimiento'`, `ref_id`).
- Produces: `GET /movimientos` → cada item gana `correcciones` (número ≥ 0). `GET /movimientos/:id/historial` → `[{fecha, detalle, actor}]` (fecha UTC; actor puede ser null si la persona se borró). El detalle del obispo gana `correcciones` por fila.

- [ ] **Step 1: Tests que fallan**

Añadir al final de `backend/test/corregir-movimiento.test.js`:

```js
test('GET /movimientos trae `correcciones` por fila: 0 y el conteo real', async () => {
  const limpio = crearMov();
  const tocado = crearMov({ monto: 100 });
  await patchMov(tocado, { monto: 200 });
  await patchMov(tocado, { monto: 300 });
  const r = await fetch(`${base}/api/tesoreria/movimientos`, { headers: H(tesorero) });
  const { items } = await r.json();
  assert.equal(items.find(x => x.id === limpio).correcciones, 0);
  assert.equal(items.find(x => x.id === tocado).correcciones, 2);
});

test('el historial devuelve los apuntes con el nombre del actor', async () => {
  const id = crearMov({ monto: 100 });
  await patchMov(id, { monto: 200 });
  const r = await fetch(`${base}/api/tesoreria/movimientos/${id}/historial`, { headers: H(SEM.pastor) });
  assert.equal(r.status, 200, 'el pastor VE el historial (supervisa, no toca)');
  const filas = await r.json();
  assert.equal(filas.length, 1);
  assert.equal(filas[0].actor, tesorero.nombre);
  assert.ok(filas[0].detalle.includes('100') && filas[0].detalle.includes('200'));
  assert.ok(filas[0].fecha, 'sin fecha no hay rastro que valga');
});

test('historial de un movimiento de otra iglesia -> 404', async () => {
  const otra = Number(dbDirecta.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra2','OTRA2')").run().lastInsertRowid);
  const ajeno = crearMov({ iglesia_id: otra });
  const r = await fetch(`${base}/api/tesoreria/movimientos/${ajeno}/historial`, { headers: H(tesorero) });
  assert.equal(r.status, 404);
});

test('el detalle del obispo trae `correcciones` por fila', async () => {
  const obispoId = Number(dbDirecta.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, rol_global, activo) VALUES (NULL,'obispo2','Obispo','x',0,'obispo',1)"
  ).run().lastInsertRowid);
  const id = crearMov({ monto: 100 });
  await patchMov(id, { monto: 200 });
  const mes = dbDirecta.prepare("SELECT strftime('%Y-%m', fecha) AS m FROM movimiento WHERE id = ?").get(id).m;
  const r = await fetch(`${base}/api/obispo/iglesia/${SEM.iglesiaId}/tesoreria?mes=${mes}`, {
    headers: { Authorization: 'Bearer ' + signToken({ id: obispoId, iglesia_id: null }) }
  });
  assert.equal(r.status, 200);
  const filas = await r.json();
  assert.ok(filas.some(f => f.correcciones === 1),
    'el obispo no ve la marca: la mitad de la decision 2 de la spec');
});
```

⚠️ Si el token del obispo con `iglesia_id: null` no pasa `authMiddleware`, mirar cómo lo firman los tests existentes del obispo (`grep -ln "rol_global.*obispo" backend/test/`) y copiar ESA forma; el test debe quedar con un obispo real, no con un atajo.

- [ ] **Step 2: Correr — debe FALLAR**

```bash
cd backend && node --test test/corregir-movimiento.test.js
```

Expected: los 4 nuevos FALLAN (`correcciones` undefined, historial 404).

- [ ] **Step 3: Implementar**

En `tesoreria.js`, el SELECT de `GET /movimientos` (línea ~49) gana la subconsulta:

```js
  const rows = db.prepare(
    `SELECT m.*, c.nombre AS campania_nombre,
            (SELECT COUNT(*) FROM auditoria a
              WHERE a.ref_tabla = 'movimiento' AND a.ref_id = m.id
                AND a.accion = 'movimiento_corregir') AS correcciones
       FROM movimiento m LEFT JOIN campania c ON c.id = m.campania_id
      WHERE m.iglesia_id = ?
      ORDER BY m.fecha DESC, m.id DESC LIMIT ? OFFSET ?`
  ).all(req.user.iglesia_id, LIMIT + 1, offset);
```

Nueva ruta, junto al PATCH:

```js
// El historial de correcciones de UN movimiento. Lo ve quien ve el modulo
// (tesorera, pastor, obispo): el gate del router ya lo garantiza. Se pide al
// tocar la marca, no viaja con el listado.
r.get('/movimientos/:id/historial', (req, res) => {
  const ig = req.user.iglesia_id;
  const m = db.prepare('SELECT id FROM movimiento WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, ig);
  if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' });
  // LEFT JOIN: si el actor ejercio ARCO y su fila quedo anonimizada, el apunte
  // sigue valiendo con el nombre que tenga; si la fila no existe, actor null.
  res.json(db.prepare(
    `SELECT a.fecha, a.detalle, p.nombre AS actor
       FROM auditoria a LEFT JOIN persona p ON p.id = a.actor_id
      WHERE a.ref_tabla = 'movimiento' AND a.ref_id = ? AND a.accion = 'movimiento_corregir'
        AND a.iglesia_id = ?
      ORDER BY a.id DESC`
  ).all(m.id, ig));
});
```

En `obispo.js:113`, el SELECT del detalle gana el mismo conteo (con alias `m`):

```js
  res.json(db.prepare(
    `SELECT m.tipo, m.categoria, m.monto, m.descripcion, m.fecha, m.comprobante_url,
            (SELECT COUNT(*) FROM auditoria a
              WHERE a.ref_tabla = 'movimiento' AND a.ref_id = m.id
                AND a.accion = 'movimiento_corregir') AS correcciones
       FROM movimiento m
      WHERE m.iglesia_id = ? AND strftime('%Y-%m', m.fecha) = ?
      ORDER BY m.fecha DESC, m.id DESC`
  ).all(ig.id, mes));
```

- [ ] **Step 4: Correr — debe PASAR, y suite completa**

```bash
cd backend && node --test test/corregir-movimiento.test.js && npm test
```

- [ ] **Step 5: Commit**

```bash
git add backend/test/corregir-movimiento.test.js backend/src/tesoreria.js backend/src/obispo.js
git commit -m "feat(tesoreria): conteo de correcciones en los listados e historial por movimiento -- la marca la ve quien supervisa

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — el panel de corrección de la tesorera

**Files:**
- Modify: `web/app.js` — `filaMov` (línea ~2621), `vistaTesoreria`/`cargarMasMovimientos` (caché de filas), funciones nuevas `formCorregirMov`/`guardarCorreccionMov`
- Modify: `backend/test/frontend-textos.test.js` o el arnés que corresponda **solo si** un barrido protesta (leer su mensaje primero)

**Interfaces:**
- Consumes: `PATCH /api/tesoreria/movimientos/:id` (Task 1), `correcciones` por fila (Task 2).
- Produces: `Tz._movs` (caché de las filas pintadas, se rellena en `vistaTesoreria` y `cargarMasMovimientos`); `formCorregirMov(id)`, `guardarCorreccionMov(id)`, contenedor `#mov-corregir-<id>` por fila. La Task 4 añade la marca en esta misma `filaMov`.

- [ ] **Step 1: Implementar** (sin test de navegador — no existe banco; el candado va en el Step 3)

1. Donde `vistaTesoreria` recibe `movs` y en `cargarMasMovimientos` donde recibe `items`, guardar las filas en una caché global de módulo:

```js
window._movsTz = movs;                    // en vistaTesoreria, antes de pintar
// y en cargarMasMovimientos:
window._movsTz = (window._movsTz||[]).concat(items);
```

2. `filaMov` gana el botón ✏️ (solo tesorera) y el contenedor del panel. La fila actual es `<div class="item-card flex">…</div>`; pasa a envolver:

```js
function filaMov(m){
  return `<div class="item-card"><div class="flex">
    <div style="flex:1"><b>${m.tipo==='ingreso'?'↑':'↓'} ${m.campania_nombre?escHtml(m.campania_nombre):escHtml(cap(m.categoria||m.tipo))}</b>
    <div class="muted small">${escHtml(m.descripcion||'')} · ${escHtml(m.fecha)}${m.comprobante_url?` · 📎 <a href="${escHtml(safeUrl(m.comprobante_url))}" target="_blank">comprobante</a>`:''}</div></div>
    <b style="color:${m.tipo==='ingreso'?'var(--green-tx)':'var(--red-tx)'}">${m.tipo==='ingreso'?'+':'−'}${money(m.monto)}</b>
    ${esTesoreroUI()?`<button class="btn-ico" title="Corregir este movimiento" onclick="formCorregirMov(${m.id})">✏️</button>`:''}
  </div><div id="mov-corregir-${m.id}"></div></div>`;
}
```

3. El panel en sitio, prellenado de la fila recién leída (la caché que acaba de pintar la lista, no una caché de otra pantalla):

```js
// Corregir un movimiento: panel en sitio (la convencion de los 17). Se
// prellena de la fila que la lista acaba de leer, y el PATCH manda SOLO lo
// que quedo distinto del original — mandar el formulario entero es el fallo
// que este proyecto ya cerro cinco veces (el "Juan Perez -> Juan Perez").
function formCorregirMov(id){
  const z=$('mov-corregir-'+id); if(!z) return;
  if(z.innerHTML){ z.innerHTML=''; return; }   // segundo toque: cerrar
  const m=(window._movsTz||[]).find(x=>x.id===id); if(!m) return;
  z.innerHTML=`<div class="card" style="margin-top:8px">
    <label for="mc-monto-${id}">Monto</label>
    <input id="mc-monto-${id}" type="number" min="0.01" step="0.01" value="${Number(m.monto)}" />
    <label for="mc-desc-${id}">Descripción</label>
    <input id="mc-desc-${id}" value="${escJsAttr(m.descripcion||'')}" />
    <label for="mc-cat-${id}">Categoría</label>
    <input id="mc-cat-${id}" value="${escJsAttr(m.categoria||'')}" />
    <p id="mc-error-${id}" class="error"></p>
    <div class="row" style="margin-top:10px">
      <button class="btn small-btn" onclick="guardarCorreccionMov(${id})">Guardar corrección</button>
      <button class="btn ghost small-btn" onclick="formCorregirMov(${id})">Cancelar</button>
    </div></div>`;
}
async function guardarCorreccionMov(id){
  const m=(window._movsTz||[]).find(x=>x.id===id); if(!m) return;
  const body={};
  const monto=Number($('mc-monto-'+id).value);
  if(!(monto>0)){ $('mc-error-'+id).textContent='Monto inválido'; return; }
  if(monto!==Number(m.monto)) body.monto=monto;
  const desc=$('mc-desc-'+id).value.trim();
  if(desc!==(m.descripcion||'')) body.descripcion=desc;
  const cat=$('mc-cat-'+id).value.trim();
  if(cat!==(m.categoria||'')) body.categoria=cat;
  if(!Object.keys(body).length){ toast('No cambiaste nada'); return; }
  await conBoton(botonActual(), async()=>{
    try{
      await api('/tesoreria/movimientos/'+id,{method:'PATCH',body:JSON.stringify(body)});
      toast('✏️ Corregido'); vistaTesoreria();
    }catch(e){ $('mc-error-'+id).textContent=e.message; }
  });
}
```

⚠️ Antes de usar `escJsAttr`, comprobar que existe con ese nombre (`grep -n "function escJsAttr" web/app.js`) — si el repo usa otro ayudante para `value="..."`, usar ese. ⚠️ Si `conBoton`/`botonActual` no existen con esos nombres, mirar cómo lo hace `guardarMov` (línea ~2685) y copiar su forma exacta.

- [ ] **Step 2: Probar a mano el camino feliz** con el servidor local (`cd backend && DISABLE_RATE_LIMIT=1 npm start` o el comando del repo; usuarios seed: `raquel`/1234 tesorera, `pastor`/1234): corregir un monto, ver el toast, la lista repintada, y que el pastor NO ve ✏️. Anotar en el reporte qué se probó.

- [ ] **Step 3: Candado de fuente** — añadir a `backend/test/corregir-movimiento.test.js`:

Arriba del archivo, junto a los imports existentes: `import fs from 'node:fs';`

```js
test('el frontend manda SOLO lo tocado: guardarCorreccionMov compara contra el original', () => {
  const fuente = fs.readFileSync(new URL('../../web/app.js', import.meta.url), 'utf8');
  const fn = fuente.match(/async function guardarCorreccionMov\([\s\S]*?\n\}/);
  assert.ok(fn, 'no se encontro guardarCorreccionMov en web/app.js');
  assert.ok(/if\s*\(\s*monto\s*!==\s*Number\(m\.monto\)\s*\)/.test(fn[0]),
    'el monto viaja siempre: volveria el formulario que reenvia lo que nadie toco');
  assert.ok(!fn[0].includes('tipo'), 'el frontend no debe ofrecer cambiar el tipo');
});
```

(`[\s\S]` cruza CRLF — la lección de siempre.)

- [ ] **Step 4: Suite completa**

```bash
cd backend && npm test
```

Expected: verde, incluidos los barridos de `web/app.js` (`botones-reales`, XSS de atributos). Si el barrido XSS protesta por `value="${escJsAttr(...)}"`, leer su mensaje: `escJsAttr` debería estar en su lista de ayudantes seguros; si no lo está, reportarlo ANTES de añadir excepciones.

- [ ] **Step 5: Commit**

```bash
git add web/app.js backend/test/corregir-movimiento.test.js
git commit -m "feat(tesoreria): panel de correccion en sitio -- el PATCH manda solo lo tocado

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — la marca "corregido" y el historial

**Files:**
- Modify: `web/app.js` — `filaMov` (la de la Task 3), función nueva `verHistorialMov`, y la fila del detalle del obispo en `obTesoreria` (línea ~3352)

**Interfaces:**
- Consumes: `correcciones` por fila (Task 2), `GET /movimientos/:id/historial` (Task 2), `modalDetalle` (existente, línea ~3339), `fechaDeUTC` (existente).
- Produces: `verHistorialMov(id)`; la marca en `filaMov` y en la fila del obispo.

- [ ] **Step 1: Implementar**

1. En `filaMov`, junto al bloque del título (dentro del `<div style="flex:1">`, tras el `<b>…</b>`), la marca cuando hay correcciones — es un control real (abre el historial), así que es `<button>`:

```js
${m.correcciones>0?` <button class="btn-plano estado-chip" title="Ver historial de correcciones" onclick="verHistorialMov(${m.id})">✏️ corregido</button>`:''}
```

2. La función del historial (fechas de auditoría son UTC → `fechaDeUTC`):

```js
// El historial de correcciones de un movimiento. Fechas con fechaDeUTC():
// auditoria.fecha es datetime('now') = UTC (ver reportes.js:21-29 antes de
// tocar cualquier fecha de este proyecto).
async function verHistorialMov(id){
  try{
    const filas=await api('/tesoreria/movimientos/'+id+'/historial');
    modalDetalle('✏️ Historial de correcciones', filas.length
      ? '<div class="list">'+filas.map(h=>`<div class="item-card">
          <div class="muted small">${escHtml(fechaDeUTC(h.fecha))} · ${escHtml(h.actor||'(cuenta eliminada)')}</div>
          <div>${escHtml(h.detalle)}</div></div>`).join('')+'</div>'
      : '<p class="muted small">Sin correcciones.</p>');
  }catch(e){ toast(e.message); }
}
```

3. En `obTesoreria` (línea ~3352), la fila del map gana la marca **sin** onclick (el obispo es cuenta de sistema sin iglesia propia; el historial por API le daría 404 — la marca informa, el detalle vive en la iglesia). Dentro del `<div style="flex:1">`, tras el `<b>`:

```js
${x.correcciones>0?' <span class="estado-chip" title="Este movimiento fue corregido">✏️ corregido</span>':''}
```

- [ ] **Step 2: Probar a mano**: como `raquel`, corregir un movimiento dos veces y abrir el historial (dos filas, la más nueva arriba, "antes → después" legible). Como `pastor`: ve la marca y el historial, no ve ✏️ de editar. Anotar lo probado en el reporte.

- [ ] **Step 3: Suite completa** (los barridos patrullan el `onclick` nuevo: es `<button>`, debe pasar)

```bash
cd backend && npm test
```

- [ ] **Step 4: Commit**

```bash
git add web/app.js
git commit -m "feat(tesoreria): la marca corregido y su historial -- lo ve quien supervisa, edita solo la tesorera

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: ESTADO.md al día

**Files:**
- Modify: `ESTADO.md`

**Interfaces:** ninguna.

- [ ] **Step 1:** Leer las primeras ~120 líneas de `ESTADO.md` para absorber la voz. Añadir una sección `## 🆕 5 DE AGOSTO DE 2026 · NOCHE — ✏️ una ofrenda mal tecleada ya se puede corregir` después de la sección de la tarde, contando: qué puede corregir la tesorera y qué no (tipo y fecha, con el porqué); que solo se audita lo que cambió; la marca y quién la ve (premisa corregida de Transparencia — la congregación NO ve Tesorería, la decisión se re-preguntó); los aportes de campaña corregibles con la barra que se ajusta sola; las consecuencias asumidas de la spec (historial huérfano si se borra un aporte corregido, sin control de concurrencia). Actualizar la línea de cabecera (rama nueva fusionada o no, según el estado real al escribir). Suite: el número real de `npm test`, con la nota de caducidad. Tachar en la sección del 1-ago de campañas la frase que decía que borrar un aporte era "la única cosa que se puede deshacer en toda la tesorería" — con `~~...~~` y nota **(desfasado el 5-ago: ...)**, porque ahora corregir existe.

- [ ] **Step 2:** `cd backend && npm test` (el número para la sección).

- [ ] **Step 3: Commit**

```bash
git add ESTADO.md
git commit -m "docs(estado): corregir movimientos de tesoreria -- que entro, que no, y por que

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura de la spec:** PATCH+transacción+auditoría condicional → Task 1 · conteo+historial+obispo → Task 2 · panel tesorera → Task 3 · marca+historial UI+obispo → Task 4 · docs → Task 5. Los 9 tests de la spec están (1-7 en Task 1 —el 8 de normalización se sumó—, 8-9 y obispo en Task 2).
- **Consistencia:** `movimiento_corregir`/`ref_tabla='movimiento'` idénticos en Tasks 1-2; `correcciones` idéntico en Tasks 2-4; `window._movsTz` definido en Task 3 y usado ahí mismo.
- **Columnas de auditoria verificadas contra `db.js:213-221` y `auth.js:191-195`** (actor_id, modulo, fecha — no persona_id/creado_en).
- **Números de línea** válidos sobre `main` (`3eb5d43`); si drifted, localizar por el texto citado.
