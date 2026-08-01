# Campañas de tesorería — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el tesorero pueda crear campañas, registrar aportes, borrarlos y cerrar la campaña — y que esa plata aparezca en los libros una sola vez.

**Architecture:** El total de una campaña deja de guardarse en `campania.recaudado` y pasa a **calcularse** sumando los movimientos de tipo `ingreso` que llevan su `campania_id`. Un número derivado del otro, en vez de dos que mantener sincronizados.

**Tech Stack:** Node ESM + Express 4 + `node:sqlite` (`DatabaseSync`, **NO** better-sqlite3) + zod 4. Frontend vanilla JS en `web/app.js`. Pruebas con `node:test` en `backend/test/`.

**Spec:** `docs/superpowers/specs/2026-08-01-campanias-tesoreria-design.md`

## Global Constraints

- **El aislamiento entre iglesias se resuelve EN LA MISMA CONSULTA** con `iglesia_id`. A una campaña de otra iglesia se le responde **404, no 403**.
- **Las escrituras llevan `soloTesorero` y `limiterSensible`**, igual que las que ya existen en ese archivo.
- **Las cuatro escrituras se auditan** con `auditar()` (`backend/src/auth.js:191`, firma: `auditar(iglesiaId, actorId, accion, modulo, detalle = '', ref = null)`). Borrar dinero sin dejar rastro de quién fue no es aceptable.
- **`campania.recaudado` queda MUERTA.** Ningún código de la app la lee ni la escribe. La única excepción es la migración de la Task 1, una sola vez. No la incluyas en ningún `SELECT`.
- **`escHtml` en todo dato de usuario** que llegue a `innerHTML` o a un atributo. Hay un barrido automático (`backend/test/xss-interpolaciones-atributo.test.js`) que lo exige en los atributos.
- **`datetime('now')` de SQLite es UTC.** Lo que se guarde con eso hay que pintarlo en el frontend con `fechaDeUTC()` (`web/app.js:2647`), nunca con `.slice(0,10)`.
- **zod 4:** el parámetro de mensaje de un enum es `error`, **nunca** `errorMap` (se ignora en silencio).
- **Commits en español, en minúscula**, formato `tipo(ámbito): efecto para la persona`. **Sin coautoría, sin mencionar a Claude ni a ninguna IA.**
- **Nunca uses `scripts/with_server.py`**: en Windows deja el node huérfano y la siguiente ejecución lee una base de datos vieja.
- Suite: `cd backend && npm test` (~80 s). Hoy son **566** y nunca puede bajar.

## ⚠️ Nada de transacciones de adorno

La spec decía que aportar y borrar debían ser transacciones. **Con este diseño ya no hace falta**: al calcularse el total, aportar es un solo `INSERT` y borrar un solo `DELETE`, y una sentencia suelta ya es atómica. El modelo derivado eliminó el problema de las dos escrituras en vez de obligar a envolverlo.

**No añadas `BEGIN`/`COMMIT` a esas rutas.** La única transacción real de este trabajo no existe: la migración de la Task 1 hace un `INSERT ... SELECT`, que también es una sentencia.

## Estructura de archivos

| Archivo | Responsabilidad | Qué le pasa |
|---|---|---|
| `backend/src/db.js` | Esquema y migraciones | Se añade `migrarCampaniaAMovimientos()` y una columna `cerrada_en` |
| `backend/src/tesoreria.js` | Rutas de dinero | Se reescriben `GET`/`POST /campanias` y `PATCH .../aportar`; se añaden `DELETE .../aportes/:movId` y `PATCH .../cerrar` |
| `backend/test/campanias.test.js` | Pruebas de campañas | **Nuevo** |
| `web/app.js` | Frontend | La tarjeta 🎯 Campañas pasa a tener botones |
| `ESTADO.md` | Estado del proyecto | Se documenta |

---

### Task 1: La migración

**Files:**
- Modify: `backend/src/db.js` (junto a las otras `migrarX`, cerca de `migrarAnonimizadaEn`)
- Test: `backend/test/campanias.test.js` (crear)

**Interfaces:**
- Produce: `migrarCampaniaAMovimientos(conexion = db)`, **exportada**. La columna `movimiento.campania_id INTEGER` y la columna `campania.cerrada_en TEXT`. Las Tasks 2-5 dependen de las dos columnas.

- [ ] **Step 1: Escribir la prueba que falla**

Crea `backend/test/campanias.test.js`. Para el montaje de la base de datos de prueba, **copia el patrón de `backend/test/bandeja-portal.test.js`**, que ya prueba una migración de este mismo tipo llamándola dos veces.

```js
// -----------------------------------------------------------------------------
//  Campanias de tesoreria.
//
//  Lo que sostiene todo lo demas: el total de una campania NO se guarda, se
//  CALCULA sumando los ingresos que llevan su campania_id. Con dos numeros que
//  mantener sincronizados (la barra y los libros) podian discrepar; con uno
//  derivado del otro, no pueden.
// -----------------------------------------------------------------------------
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

test('la migracion crea el ingreso del saldo anterior UNA sola vez', async () => {
  const { db, migrarCampaniaAMovimientos } = await montarDbDePrueba();

  // Una campania del mundo viejo: tiene recaudado pero ningun movimiento.
  db.prepare("INSERT INTO campania (iglesia_id, nombre, meta, recaudado) VALUES (1,'Techo',500000,50000)").run();

  migrarCampaniaAMovimientos(db);
  const tras1 = db.prepare("SELECT COUNT(*) AS n FROM movimiento WHERE campania_id IS NOT NULL").get().n;
  assert.equal(tras1, 1, 'el saldo anterior tiene que convertirse en un ingreso, o esa plata desaparece de la barra');

  // La segunda llamada NO puede volver a insertarlo. Si el relleno quedara
  // FUERA de la guarda de existencia de la columna, correria en cada arranque
  // y el dinero de la campania se multiplicaria en cada reinicio.
  migrarCampaniaAMovimientos(db);
  const tras2 = db.prepare("SELECT COUNT(*) AS n FROM movimiento WHERE campania_id IS NOT NULL").get().n;
  assert.equal(tras2, 1, 'la migracion se ejecuto dos veces y duplico el dinero');
});

test('el ingreso del saldo anterior se distingue de un aporte de verdad', async () => {
  const { db, migrarCampaniaAMovimientos } = await montarDbDePrueba();
  db.prepare("INSERT INTO campania (iglesia_id, nombre, meta, recaudado) VALUES (1,'Techo',500000,50000)").run();
  migrarCampaniaAMovimientos(db);
  const m = db.prepare("SELECT * FROM movimiento WHERE campania_id IS NOT NULL").get();

  assert.equal(m.tipo, 'ingreso');
  assert.equal(m.monto, 50000);
  // Su fecha sera la del dia de la migracion, no la del dinero real (esa fecha
  // no se guardo nunca). Por eso la descripcion tiene que decirlo: si no,
  // quien revise las cuentas ve plata de hace meses fechada hoy.
  assert.equal(m.descripcion, 'Saldo anterior de la campaña');
  assert.equal(m.creado_por, null, 'no lo registro ninguna persona');
});

test('una campania sin saldo anterior no genera ningun ingreso', async () => {
  const { db, migrarCampaniaAMovimientos } = await montarDbDePrueba();
  db.prepare("INSERT INTO campania (iglesia_id, nombre, meta, recaudado) VALUES (1,'Viaje',100000,0)").run();
  migrarCampaniaAMovimientos(db);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM movimiento").get().n, 0,
    'una campania a cero no puede inventarse un ingreso de 0');
});
```

- [ ] **Step 2: Ejecutarla y ver que falla**

Ejecuta: `cd backend && node --test test/campanias.test.js`
Se espera: **FALLA** — `migrarCampaniaAMovimientos` no existe.

- [ ] **Step 3: Escribir la migración**

En `backend/src/db.js`, junto a las otras funciones `migrarX`:

```js
// CAMPANIA: el total recaudado pasa a CALCULARSE sumando los ingresos que
// llevan campania_id, en vez de guardarse en campania.recaudado.
//
// El motivo: la ruta de aportar solo sumaba a esa columna y no creaba ningun
// movimiento, asi que la barra de la campania subia SIN que la plata apareciera
// en Movimientos ni en Transparencia. Dos contabilidades que no cuadraban, en
// la pantalla del dinero. Con un numero derivado del otro no pueden discrepar.
//
// ⚠️ campania.recaudado queda MUERTA: ningun codigo de la app la lee ni la
// escribe. La unica excepcion es esta migracion, una sola vez.
export function migrarCampaniaAMovimientos(conexion = db) {
  const yaExiste = conexion.prepare('PRAGMA table_info(movimiento)').all()
    .some(c => c.name === 'campania_id');
  if (yaExiste) return;
  conexion.exec('ALTER TABLE movimiento ADD COLUMN campania_id INTEGER');

  // ⚠️ El relleno va DENTRO de la guarda, igual que migrarAnonimizadaEn y
  // migrarEstadoContactoPublico. Fuera, correria en CADA arranque y duplicaria
  // el dinero de todas las campanias en cada reinicio.
  //
  // La fecha sale del default de la tabla: el dia de la migracion, no el del
  // dinero real (esa fecha no se guardo nunca). Por eso la descripcion lo dice.
  conexion.prepare(
    `INSERT INTO movimiento (iglesia_id, tipo, categoria, monto, descripcion, creado_por, campania_id)
     SELECT iglesia_id, 'ingreso', NULL, recaudado, 'Saldo anterior de la campaña', NULL, id
       FROM campania WHERE recaudado > 0`
  ).run();
}
migrarCampaniaAMovimientos();

// Cuando se cerro la campania (NULL = activa). Una campania cerrada ya no
// admite aportes; no se borra, para no perder el historial de para que se junto.
agregarColumna('campania', 'cerrada_en', 'TEXT');
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Ejecuta: `cd backend && node --test test/campanias.test.js`
Se espera: **3 pruebas, 3 pasan.**

- [ ] **Step 5: Comprobar que la prueba MUERDE**

Saca el `INSERT ... SELECT` **fuera** de la guarda (ponlo después del `if (yaExiste) return;`, es decir, que corra siempre). Ejecuta.
Se espera: **falla** `'la migracion se ejecuto dos veces y duplico el dinero'`.
Deshaz el cambio. **Anota el resultado en tu informe.**

- [ ] **Step 6: Suite completa y commit**

Ejecuta: `cd backend && npm test` → **569 pass, 0 fail** (566 + 3).

```bash
git add backend/src/db.js backend/test/campanias.test.js
git commit -m "feat(tesoreria): el total de una campana sale de los movimientos

Aportar solo sumaba a una columna y no creaba ningun movimiento: la plata subia
en la barra de la campana sin aparecer en Movimientos ni en Transparencia. Dos
contabilidades que no cuadraban entre si, en la pantalla del dinero.

Ahora el total se calcula sumando los ingresos de la campana, asi que la barra
y los libros no pueden discrepar. Si alguna campana tenia saldo anterior, la
migracion le crea su ingreso para que esa plata no desaparezca."
```

---

### Task 2: Leer y crear campañas

**Files:**
- Modify: `backend/src/tesoreria.js:82-95`
- Test: `backend/test/campanias.test.js` (añadir)

**Interfaces:**
- Consume: `movimiento.campania_id` y `campania.cerrada_en` de la Task 1.
- Produce: `GET /api/tesoreria/campanias` devuelve un array de
  `{ id, nombre, meta, cerrada_en, recaudado, aportes: [{ id, monto, fecha }] }`.
  La Task 6 (frontend) depende de esos nombres exactos.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añade a `backend/test/campanias.test.js` (por HTTP, con el patrón de servidor de prueba de `backend/test/bandeja-portal.test.js`):

```js
test('el total de la campania sale de los movimientos, no de la columna recaudado', async () => {
  // Se inserta el ingreso A MANO, sin pasar por la ruta de aportar: asi se
  // demuestra que el total se CALCULA y no que lo escribio quien aporto.
  const { campaniaId } = await crearCampania({ nombre: 'Techo', meta: 500000 });
  await insertarIngresoDirecto({ campaniaId, monto: 30000 });

  const camps = await get('/api/tesoreria/campanias');
  const c = camps.find(x => x.id === campaniaId);
  assert.equal(c.recaudado, 30000, 'el total no se esta calculando desde los movimientos');
  assert.equal(c.aportes.length, 1);
  assert.equal(c.aportes[0].monto, 30000);
});

test('la columna muerta recaudado no viaja al frontend', async () => {
  // Si viajara, alguien la pintaria tarde o temprano y volveriamos a tener dos
  // numeros distintos para lo mismo.
  const { campaniaId } = await crearCampania({ nombre: 'Viaje', meta: 100000 });
  const camps = await get('/api/tesoreria/campanias');
  const c = camps.find(x => x.id === campaniaId);
  assert.ok(!('recaudado' in c) || typeof c.recaudado === 'number',
    'recaudado solo puede existir como total calculado');
  // El calculado vale 0 aqui; lo que no puede es venir de la columna.
  assert.equal(c.recaudado, 0);
});

test('una campania de OTRA iglesia no aparece', async () => {
  const { campaniaId } = await crearCampaniaEnOtraIglesia({ nombre: 'Ajena' });
  const camps = await get('/api/tesoreria/campanias');
  assert.ok(!camps.some(c => c.id === campaniaId), 'se filtro una campania de otra iglesia');
});

test('el nombre de la campania tiene un tope', async () => {
  // Sin tope, un nombre de 50.000 caracteres entra en la base y luego rompe
  // cualquier pantalla que lo pinte.
  const res = await post('/api/tesoreria/campanias', { nombre: 'x'.repeat(101) });
  assert.equal(res.status, 400);
});

test('solo el tesorero crea campanias; el pastor observa', async () => {
  const res = await postComoPastor('/api/tesoreria/campanias', { nombre: 'Techo' });
  assert.equal(res.status, 403);
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Ejecuta: `cd backend && node --test test/campanias.test.js`
Se espera: **FALLAN** — la respuesta no trae `aportes` y el nombre no tiene tope.

- [ ] **Step 3: Escribir el código**

En `backend/src/tesoreria.js`, **sustituye** las líneas 82-95 (desde `r.get('/campanias'...` hasta el cierre del `r.post('/campanias'...)`) por:

```js
// Los aportes de una campania son movimientos: no hay tabla aparte.
const aportesDe = (campaniaId, ig) => db.prepare(
  `SELECT id, monto, fecha FROM movimiento
    WHERE campania_id = ? AND iglesia_id = ? AND tipo = 'ingreso'
    ORDER BY fecha DESC, id DESC`
).all(campaniaId, ig);

// ⚠️ El SELECT NO trae `recaudado`: esa columna esta muerta (ver
// migrarCampaniaAMovimientos en db.js). El total que se devuelve se CALCULA
// aqui sumando los aportes, para que la barra de la campania y los libros no
// puedan decir cosas distintas.
r.get('/campanias', (req, res) => {
  const ig = req.user.iglesia_id;
  const filas = db.prepare(
    `SELECT id, nombre, meta, cerrada_en FROM campania
      WHERE iglesia_id = ?
      ORDER BY (cerrada_en IS NOT NULL), id DESC`
  ).all(ig);
  res.json(filas.map(c => {
    const aportes = aportesDe(c.id, ig);
    return { ...c, aportes, recaudado: aportes.reduce((a, x) => a + x.monto, 0) };
  }));
});

const campaniaSchema = z.object({
  // .max(100) como el resto de los textos cortos del archivo: sin tope, un
  // nombre enorme entra en la base y luego rompe la pantalla que lo pinta.
  nombre: z.string().trim().min(1, 'falta el nombre').max(100, 'el nombre es demasiado largo'),
  meta: z.coerce.number().optional()
});
r.post('/campanias', soloTesorero, limiterSensible, validar(campaniaSchema), (req, res) => {
  const { nombre, meta } = req.body;
  const metaNum = meta;
  // recaudado se sigue insertando a 0 solo porque la columna es NOT NULL DEFAULT
  // 0 y sigue existiendo; nadie la vuelve a leer.
  const info = db.prepare('INSERT INTO campania (iglesia_id, nombre, meta, recaudado) VALUES (?,?,?,0)')
    .run(req.user.iglesia_id, nombre, (Number.isFinite(metaNum) && metaNum > 0) ? metaNum : 0);
  auditar(req.user.iglesia_id, req.user.persona_id, 'campania_crear', 'tesoreria', nombre,
    { tabla: 'campania', id: info.lastInsertRowid });
  res.json({ ok: true, id: info.lastInsertRowid });
});
```

- [ ] **Step 4: El nombre de la campaña en la lista de Movimientos**

Un ingreso de campaña tiene que decir de qué campaña es. Ese nombre sale de un
**JOIN**, no de una copia guardada en el movimiento.

Añade esta prueba:

```js
test('un ingreso de campania dice de que campania es, sin copiar el nombre', async () => {
  const { campaniaId } = await crearCampania({ nombre: 'Techo' });
  await insertarIngresoDirecto({ campaniaId, monto: 1000 });
  const movs = await get('/api/tesoreria/movimientos');
  const m = movs.items.find(x => x.campania_id === campaniaId);
  assert.equal(m.campania_nombre, 'Techo',
    'el listado no trae el nombre de la campania: la persona ve un ingreso suelto sin saber de que es');
});
```

Y en `backend/src/tesoreria.js`, en `GET /movimientos` (hoy `:44-46`), **sustituye**
la consulta por:

```js
  // LEFT JOIN, no una copia del nombre en el movimiento: una copia habria que
  // mantenerla sincronizada, y eso es exactamente el problema que este trabajo
  // viene a quitar de la tesoreria.
  const rows = db.prepare(
    `SELECT m.*, c.nombre AS campania_nombre
       FROM movimiento m LEFT JOIN campania c ON c.id = m.campania_id
      WHERE m.iglesia_id = ?
      ORDER BY m.fecha DESC, m.id DESC LIMIT ? OFFSET ?`
  ).all(req.user.iglesia_id, LIMIT + 1, offset);
```

En `web/app.js`, `filaMov()` tiene que mostrar `campania_nombre` cuando venga
—escapado con `escHtml`— en lugar de la categoría.

- [ ] **Step 5: Ejecutar, suite y commit**

Ejecuta: `cd backend && node --test test/campanias.test.js` → todas pasan.
Ejecuta: `cd backend && npm test` → **0 fallan.**

```bash
git add backend/src/tesoreria.js backend/test/campanias.test.js web/app.js
git commit -m "feat(tesoreria): las campanas llegan con su total y sus aportes

El total se calcula al leerlas, sumando sus ingresos. La columna recaudado ya
no viaja al frontend: si viajara, alguien la pintaria tarde o temprano y
volveriamos a tener dos numeros distintos para lo mismo.

El nombre pasa a tener tope de 100 caracteres; no tenia ninguno."
```

---

### Task 3: Aportar de verdad, y cerrar la campaña

**Files:**
- Modify: `backend/src/tesoreria.js` (la ruta `aportar`, hoy en `:99-105`)
- Test: `backend/test/campanias.test.js` (añadir)

**Interfaces:**
- Consume: `aportesDe()` de la Task 2.
- Produce: `PATCH /api/tesoreria/campanias/:id/aportar` (crea el ingreso) y `PATCH /api/tesoreria/campanias/:id/cerrar`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
test('un aporte aparece en los libros, no solo en la barra de la campania', async () => {
  // Esta es LA prueba de este trabajo. Sin ella volveriamos a tener plata que
  // sube en la campania y no existe en ningun libro.
  const { campaniaId } = await crearCampania({ nombre: 'Techo', meta: 500000 });
  await patch(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 50000 });

  const movs = await get('/api/tesoreria/movimientos');
  assert.ok(movs.items.some(m => m.monto === 50000 && m.tipo === 'ingreso'),
    'el aporte no aparece en Movimientos: la plata estaria solo en la barra');

  const trans = await get('/api/tesoreria/transparencia');
  assert.equal(trans.recaudado, 50000,
    'el aporte no cuenta en Transparencia: los libros y la campania dirian cosas distintas');
});

test('aportar a una campania CERRADA se rechaza en el servidor', async () => {
  // Esconder el boton no basta: la ruta se puede llamar directamente.
  const { campaniaId } = await crearCampania({ nombre: 'Techo' });
  await patch(`/api/tesoreria/campanias/${campaniaId}/cerrar`, {});
  const res = await patchRaw(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 1000 });
  assert.equal(res.status, 409);

  const camps = await get('/api/tesoreria/campanias');
  assert.equal(camps.find(c => c.id === campaniaId).recaudado, 0,
    'entro plata en una campania cerrada');
});

test('cerrar deja la campania consultable, no la borra', async () => {
  const { campaniaId } = await crearCampania({ nombre: 'Techo' });
  await patch(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 50000 });
  await patch(`/api/tesoreria/campanias/${campaniaId}/cerrar`, {});

  const c = (await get('/api/tesoreria/campanias')).find(x => x.id === campaniaId);
  assert.ok(c, 'la campania desaparecio al cerrarla');
  assert.ok(c.cerrada_en, 'no quedo constancia de cuando se cerro');
  assert.equal(c.recaudado, 50000, 'se perdio lo que se habia juntado');
});

test('no se puede aportar ni cerrar una campania de otra iglesia', async () => {
  const { campaniaId } = await crearCampaniaEnOtraIglesia({ nombre: 'Ajena' });
  assert.equal((await patchRaw(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 1 })).status, 404);
  assert.equal((await patchRaw(`/api/tesoreria/campanias/${campaniaId}/cerrar`, {})).status, 404);
});

test('el pastor no puede aportar ni cerrar', async () => {
  const { campaniaId } = await crearCampania({ nombre: 'Techo' });
  assert.equal((await patchComoPastor(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 1 })).status, 403);
  assert.equal((await patchComoPastor(`/api/tesoreria/campanias/${campaniaId}/cerrar`, {})).status, 403);
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Ejecuta: `cd backend && node --test test/campanias.test.js`
Se espera: **FALLAN** — el aporte no llega a Movimientos y `cerrar` no existe.

- [ ] **Step 3: Escribir el código**

**Sustituye** la ruta `r.patch('/campanias/:id/aportar', ...)` entera (hoy `:99-105`) por:

```js
const aportarSchema = z.object({
  monto: z.coerce.number().positive('el aporte debe ser un numero mayor que cero')
});
// Aportar CREA UN INGRESO de verdad. Antes solo sumaba a campania.recaudado, y
// esa plata no aparecia en ningun libro.
//
// Un solo INSERT: no hace falta transaccion. Con el total calculado ya no hay
// dos escrituras que puedan quedar a medias — ese problema lo elimino el
// diseno, no un BEGIN/COMMIT.
r.patch('/campanias/:id/aportar', soloTesorero, limiterSensible, validar(aportarSchema), (req, res) => {
  const ig = req.user.iglesia_id;
  // La iglesia va en la MISMA consulta: a una campania de otra iglesia se le
  // responde 404, no 403 (no se confirma que exista).
  const c = db.prepare('SELECT id, nombre, cerrada_en FROM campania WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, ig);
  if (!c) return res.status(404).json({ error: 'Campaña no encontrada' });
  if (c.cerrada_en)
    return res.status(409).json({ error: 'Esta campaña está cerrada: ya no admite aportes' });

  const { monto } = req.body;
  // ⚠️ La descripcion NO lleva el nombre de la campania. Copiarlo aqui seria
  // denormalizarlo, que es justo lo que este trabajo viene a evitar: el nombre
  // se saca con un JOIN al listar los movimientos (ver Task 2). Hoy no se puede
  // renombrar una campania, asi que copiarlo "funcionaria" — pero el dia que
  // alguien anada esa funcion, las copias quedarian mintiendo en silencio.
  const info = db.prepare(
    `INSERT INTO movimiento (iglesia_id, tipo, monto, descripcion, creado_por, campania_id)
     VALUES (?, 'ingreso', ?, ?, ?, ?)`
  ).run(ig, monto, 'Aporte a campaña', req.user.persona_id, c.id);

  auditar(ig, req.user.persona_id, 'campania_aporte', 'tesoreria', `${c.nombre}: ${monto}`,
    { tabla: 'movimiento', id: info.lastInsertRowid });
  res.json({ ok: true });
});

// Cerrar: la campania deja de admitir aportes pero SIGUE consultable. No se
// borra, para no perder el historial de para que se junto.
//
// `cerrada_en IS NULL` en el WHERE: cerrar dos veces no reescribe la fecha del
// primer cierre.
r.patch('/campanias/:id/cerrar', soloTesorero, limiterSensible, (req, res) => {
  const ig = req.user.iglesia_id;
  const c = db.prepare('SELECT id, nombre FROM campania WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, ig);
  if (!c) return res.status(404).json({ error: 'Campaña no encontrada' });
  // datetime('now') es UTC: el frontend lo pinta con fechaDeUTC().
  db.prepare("UPDATE campania SET cerrada_en = datetime('now') WHERE id = ? AND iglesia_id = ? AND cerrada_en IS NULL")
    .run(c.id, ig);
  auditar(ig, req.user.persona_id, 'campania_cerrar', 'tesoreria', c.nombre,
    { tabla: 'campania', id: c.id });
  res.json({ ok: true });
});
```

- [ ] **Step 4: Ejecutar, comprobar que muerden, suite y commit**

Ejecuta: `cd backend && node --test test/campanias.test.js` → todas pasan.

**Comprobación de mutación:** quita la comprobación de `c.cerrada_en` en `aportar`, ejecuta, confirma que falla `'aportar a una campania CERRADA se rechaza en el servidor'`, deshaz. **Anótalo en tu informe.**

Ejecuta: `cd backend && npm test` → **0 fallan.**

```bash
git add backend/src/tesoreria.js backend/test/campanias.test.js
git commit -m "feat(tesoreria): aportar a una campana registra el ingreso en los libros

Antes solo subia la barra: esa plata no aparecia en Movimientos ni en
Transparencia, asi que la iglesia veia dos totales distintos del mismo dinero.

Y una campana se puede cerrar: deja de admitir aportes pero sigue consultable,
para no perder el historial de para que se junto. El rechazo esta en el
servidor, no en esconder el boton."
```

---

### Task 4: Borrar un aporte mal tecleado

**Files:**
- Modify: `backend/src/tesoreria.js` (añadir la ruta junto a las anteriores)
- Test: `backend/test/campanias.test.js` (añadir)

**Interfaces:**
- Produce: `DELETE /api/tesoreria/campanias/:id/aportes/:movId`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
test('borrar un aporte lo quita de la campania Y de los libros', async () => {
  const { campaniaId } = await crearCampania({ nombre: 'Techo', meta: 500000 });
  await patch(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 500000 });  // el error de tecleo
  const c = (await get('/api/tesoreria/campanias')).find(x => x.id === campaniaId);
  const aporteId = c.aportes[0].id;

  await del(`/api/tesoreria/campanias/${campaniaId}/aportes/${aporteId}`);

  const c2 = (await get('/api/tesoreria/campanias')).find(x => x.id === campaniaId);
  assert.equal(c2.recaudado, 0, 'el aporte sigue contando en la campania');
  const trans = await get('/api/tesoreria/transparencia');
  assert.equal(trans.recaudado, 0, 'el ingreso sigue en los libros: la correccion no sirvio de nada');
});

test('esta ruta NO puede borrar un movimiento normal', async () => {
  // El agujero que hay que cerrar: si alcanzara movimientos sin campania,
  // seria una forma de borrar la contabilidad entera de la iglesia.
  const { campaniaId } = await crearCampania({ nombre: 'Techo' });
  const movId = await crearMovimientoNormal({ tipo: 'ingreso', monto: 90000 });

  const res = await delRaw(`/api/tesoreria/campanias/${campaniaId}/aportes/${movId}`);
  assert.equal(res.status, 404);

  const movs = await get('/api/tesoreria/movimientos');
  assert.ok(movs.items.some(m => m.id === movId), 'se borro un movimiento que no era un aporte');
});

test('no se puede borrar un aporte de otra campania ni de otra iglesia', async () => {
  const { campaniaId: a } = await crearCampania({ nombre: 'Techo' });
  const { campaniaId: b } = await crearCampania({ nombre: 'Viaje' });
  await patch(`/api/tesoreria/campanias/${a}/aportar`, { monto: 1000 });
  const aporteDeA = (await get('/api/tesoreria/campanias')).find(x => x.id === a).aportes[0].id;

  // Pidiendolo por la campania equivocada.
  assert.equal((await delRaw(`/api/tesoreria/campanias/${b}/aportes/${aporteDeA}`)).status, 404);

  const c = (await get('/api/tesoreria/campanias')).find(x => x.id === a);
  assert.equal(c.recaudado, 1000, 'se borro pidiendolo por otra campania');
});

test('el pastor no puede borrar un aporte', async () => {
  const { campaniaId } = await crearCampania({ nombre: 'Techo' });
  await patch(`/api/tesoreria/campanias/${campaniaId}/aportar`, { monto: 1000 });
  const aporteId = (await get('/api/tesoreria/campanias')).find(x => x.id === campaniaId).aportes[0].id;
  assert.equal((await delComoPastor(`/api/tesoreria/campanias/${campaniaId}/aportes/${aporteId}`)).status, 403);
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Se espera: **FALLAN** con 404 de ruta inexistente.

- [ ] **Step 3: Escribir el código**

Añade en `backend/src/tesoreria.js`, después de la ruta de cerrar:

```js
// Borrar un aporte: la unica forma de deshacer un error de tecleo en toda la
// tesoreria. Acotado A PROPOSITO a los aportes de campania — que ningun otro
// movimiento se pueda corregir es un problema mas amplio y es otro trabajo.
//
// ⚠️ `campania_id = ?` es lo que impide que esta ruta alcance un movimiento
// normal: los normales tienen campania_id NULL, y en SQL `NULL = cualquier
// cosa` NUNCA es cierto. Sin esa condicion, esto seria una forma de borrar la
// contabilidad entera de la iglesia pasando cualquier id.
r.delete('/campanias/:id/aportes/:movId', soloTesorero, limiterSensible, (req, res) => {
  const ig = req.user.iglesia_id;
  const m = db.prepare(
    `SELECT id, monto FROM movimiento
      WHERE id = ? AND iglesia_id = ? AND campania_id = ?`
  ).get(req.params.movId, ig, req.params.id);
  if (!m) return res.status(404).json({ error: 'Aporte no encontrado' });

  db.prepare('DELETE FROM movimiento WHERE id = ? AND iglesia_id = ?').run(m.id, ig);
  // Se audita SIEMPRE: borrar dinero sin dejar rastro de quien fue no es
  // aceptable en la pantalla de la tesoreria.
  auditar(ig, req.user.persona_id, 'campania_aporte_borrar', 'tesoreria', String(m.monto),
    { tabla: 'campania', id: Number(req.params.id) });
  res.json({ ok: true });
});
```

- [ ] **Step 4: Ejecutar, comprobar que muerde, suite y commit**

Ejecuta: `cd backend && node --test test/campanias.test.js` → todas pasan.

**Comprobación de mutación:** quita `AND campania_id = ?` del `SELECT`, ejecuta, confirma que falla `'esta ruta NO puede borrar un movimiento normal'`, deshaz. **Anótalo en tu informe** — es la comprobación más importante de esta tarea.

Ejecuta: `cd backend && npm test` → **0 fallan.**

```bash
git add backend/src/tesoreria.js backend/test/campanias.test.js
git commit -m "feat(tesoreria): un aporte mal tecleado se puede borrar

Un $500.000 en vez de $50.000 se quedaba para siempre, y ahora ademas dentro de
los libros. Al borrarlo desaparece de la campana y del libro a la vez, y queda
en la auditoria quien lo hizo.

La ruta solo alcanza movimientos que pertenecen a una campana: los normales
tienen campania_id NULL y en SQL NULL nunca casa. Sin eso seria una forma de
borrar la contabilidad entera."
```

---

### Task 5: La pantalla

**Files:**
- Modify: `web/app.js` (la tarjeta 🎯 Campañas, hoy alrededor de `:2433-2440`)

**Interfaces:**
- Consume: `GET /api/tesoreria/campanias` con la forma de la Task 2, y las rutas de las Tasks 3 y 4.

- [ ] **Step 1: Pintar la tarjeta**

⚠️ **Las dos fechas de esta tarjeta se pintan con funciones DISTINTAS, y no es un
descuido:**

- `a.fecha` es `movimiento.fecha`, cuyo default es `date('now','localtime')`: una
  **fecha de calendario pura**. Va con **`fechaTxt()`**.
- `c.cerrada_en` viene de `datetime('now')`: una **marca de tiempo en UTC**. Va
  con **`fechaDeUTC()`**.

Cambiar una por la otra desplaza la fecha un día. Si te parece una incoherencia
que hay que "unificar", lee `backend/src/reportes.js:21-29` antes de tocar nada.

**Sustituye** el bloque de la tarjeta 🎯 Campañas por:

```js
      <div class="card" style="margin-bottom:18px"><div class="widget-head">🎯 Campañas</div>
        ${esTesoreroUI()?`<div class="row" style="margin:10px 0">
          <button class="btn small-btn" onclick="formCampania()">+ Campaña</button></div>
          <div id="camp-form"></div>`:''}
        ${camps.filter(c=>!c.cerrada_en).length
          ? camps.filter(c=>!c.cerrada_en).map(filaCampania).join('')
          : `<p class="muted small">Todavía no hay campañas.${esTesoreroUI()?' Una campaña sirve para juntar para algo concreto —el techo, un viaje misionero— y ver cuánto falta.':''}</p>`}
        ${camps.some(c=>c.cerrada_en)
          ? `<div class="widget-head" style="margin-top:20px">Cerradas</div>
             ${camps.filter(c=>c.cerrada_en).map(filaCampaniaCerrada).join('')}`
          : ''}
      </div>
```

Y añade las dos funciones, junto a `filaMov()`:

```js
// Una campania activa. Sin meta NO se pinta barra: con el codigo anterior
// saldria "$50.000 / $0" y una barra al 0%, que se lee como un error.
function filaCampania(c){
  const pct = c.meta ? Math.min(100, Math.round(c.recaudado/c.meta*100)) : null;
  return `<div style="margin:14px 0">
    <div style="display:flex;justify-content:space-between;font-size:14px">
      <b>${escHtml(c.nombre)}</b>
      <span class="muted">${money(c.recaudado)}${c.meta?' / '+money(c.meta):''}</span></div>
    ${pct===null?'':`<div class="trend-track" style="margin-top:6px"><div class="trend-bar" style="width:${pct}%">${pct}%</div></div>`}
    ${esTesoreroUI()?`<div class="row" style="margin-top:8px">
      <button class="btn ghost small-btn" onclick="formAporte(${c.id})">+ Aporte</button>
      <button class="btn ghost small-btn" onclick="cerrarCampania(${c.id})">Cerrar campaña</button></div>
      <div id="aporte-form-${c.id}"></div>`:''}
    ${c.aportes.length?`<div class="list" style="margin-top:8px">${c.aportes.map(a=>`
      <div class="item-card flex">
        <span class="muted small">${escHtml(fechaTxt(a.fecha))}</span>
        <b style="flex:1;text-align:right">${money(a.monto)}</b>
        ${esTesoreroUI()?`<button class="btn-ico" title="Borrar este aporte" onclick="borrarAporte(${c.id},${a.id})">🗑️</button>`:''}
      </div>`).join('')}</div>`:''}
  </div>`;
}

// Una campania cerrada: se consulta, no se toca. Ningun boton.
function filaCampaniaCerrada(c){
  return `<div style="margin:12px 0;opacity:.75">
    <div style="display:flex;justify-content:space-between;font-size:14px">
      <b>${escHtml(c.nombre)}</b>
      <span class="muted">${money(c.recaudado)}${c.meta?' / '+money(c.meta):''}</span></div>
    <div class="muted small">Cerrada el ${escHtml(fechaDeUTC(c.cerrada_en))}</div>
  </div>`;
}
```

⚠️ Los `onclick` llevan **solo números** (`c.id`, `a.id`), nunca texto de la
persona. Si en algún momento metes un texto ahí, tiene que ir por `escJsAttr()`.

- [ ] **Step 2: Los formularios y las acciones**

Añade las funciones que faltan siguiendo el patrón de `formMov()`, que ya existe en esa misma pantalla para ingresos y gastos: un formulario que se pinta en un contenedor, con su botón de guardar y su cancelar.

- Crear campaña: pide nombre y meta (la meta **opcional**), llama a `POST /tesoreria/campanias`.
- Aportar: pide el importe, llama a `PATCH /campanias/:id/aportar`.
- Borrar un aporte: **pide confirmación** —se está borrando dinero— y llama a `DELETE /campanias/:id/aportes/:movId`.
- Cerrar campaña: **pide confirmación** y llama a `PATCH /campanias/:id/cerrar`.

Después de cada acción, recarga la vista de tesorería para que los tres sitios (campaña, Movimientos y Transparencia) se vean actualizados a la vez.

- [ ] **Step 3: Comprobar a mano en un navegador**

Levanta el servidor tú (**no uses `scripts/with_server.py`**), base de datos de usar y tirar, entra con `MONTESION` / `1234` como tesorero. Comprueba **y anota cada punto en tu informe**:

1. Crear una campaña con meta: aparece con su barra al 0%.
2. Crear una campaña **sin meta**: aparece sin barra y sin `/ $0`.
3. Aportar $50.000: sube la barra **y** aparece un ingreso en Movimientos **y** sube Transparencia.
4. Borrar ese aporte: baja en los tres sitios.
5. Cerrar la campaña: baja a la sección de cerradas, sin botones, con la fecha correcta (compárala con la fecha de hoy en Chile, **por la tarde si puedes**).
6. Entrar **como pastor**: lo ve todo, sin ningún botón.

- [ ] **Step 4: Suite y commit**

Ejecuta: `cd backend && npm test` → **0 fallan.**

```bash
git add web/app.js
git commit -m "feat(tesoreria): las campanas por fin se pueden usar

La pantalla anunciaba la funcion —'una campana sirve para juntar para algo
concreto, el techo, un viaje misionero'— y no habia ningun boton para crear una
ni para registrar un aporte. Ahora los hay, y ademas se puede borrar un aporte
mal tecleado y cerrar una campana terminada.

Una campana sin meta se muestra sin barra: antes habria salido '$50.000 / $0'
con la barra al 0%, que se lee como un error."
```

---

### Task 6: Dejarlo escrito en ESTADO.md

**Files:**
- Modify: `ESTADO.md` (una sección nueva arriba, con la fecha del día)

- [ ] **Step 1: Escribir la sección**

Tiene que decir:

- Que la pantalla anunciaba la función y no había ningún botón, y que el backend sí existía.
- Que **el total de una campaña se calcula** sumando los ingresos con su `campania_id`, y **por qué**: aportar solo sumaba a `campania.recaudado` sin crear ningún movimiento, así que la barra y los libros podían decir cosas distintas.
- Que **`campania.recaudado` está muerta**: nadie la lee ni la escribe, salvo la migración una vez. Con la advertencia de que sigue en la tabla y de que **no dice la verdad**.
- Que un aporte se puede **borrar**, y que es la **única** cosa que se puede deshacer en toda la tesorería: ningún otro movimiento se puede corregir. Que alguien preguntará por qué, y que la respuesta es que fue una decisión de alcance, no un olvido.
- Que una campaña se **cierra**, no se borra.
- Que la ruta de borrar **no alcanza movimientos normales**, y por qué (`NULL = ?` nunca casa en SQL).
- El número real de la suite, medido en ese momento.

⚠️ Este archivo tiene un historial documentado de afirmaciones falsas en los dos sentidos. **No escribas ninguna cifra que no hayas comprobado justo antes.**

- [ ] **Step 2: Commit**

```bash
git add ESTADO.md
git commit -m "docs(estado): las campanas de tesoreria, y por que recaudado quedo muerta

Queda escrito que campania.recaudado sigue en la tabla y NO dice la verdad: sin
eso, alguien la leera dentro de un ano creyendo que es el total."
```

---

## Verificación final de la rama

1. `cd backend && npm test` → **0 fallan**, y el total no bajó de 566.
2. En un navegador de verdad, con el tesorero y con el pastor.
3. Que aportar, borrar y cerrar responden **404** con una campaña de otra iglesia.
4. `git log --oneline` — ningún commit menciona a Claude ni a ninguna IA.
