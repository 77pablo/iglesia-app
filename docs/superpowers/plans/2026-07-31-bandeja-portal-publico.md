# La bandeja de mensajes del portal público — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el pastor pueda leer los mensajes que la gente manda desde el
formulario "Planifica tu visita" del portal público — que hoy se guardan en
`contacto_publico` y **no los lee nadie** — y marcar cuáles ya atendió.

**Architecture:** Una columna aditiva (`contacto_publico.estado`) con una
migración de una sola vez que marca lo ya guardado como `previo`, dos rutas
nuevas de solo-pastor en `publico.js` (registradas **antes** de la ruta
paramétrica que se traga todo), una pantalla nueva en `web/app.js` con la
sección de `previo` plegada, y tres arreglos de alrededor: la notificación
pulsable, el "Ver más" de Notificaciones y las dos frases del portal que
prometen contactar sin poder hacerlo.

**Tech Stack:** Node ESM · Express 4 · `node:sqlite` · zod 4 · frontend vanilla
JS (template strings en `innerHTML`) · tests `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-31-bandeja-portal-publico-design.md`

## Global Constraints

- **Aislamiento entre iglesias:** el `GET` filtra por `req.user.iglesia_id`. El
  `PATCH` resuelve el mensaje **acotado por iglesia en la misma consulta**
  (`WHERE id = ? AND iglesia_id = ?`), nunca en una comprobación posterior — es
  el fallo que ya se coló una vez en `musica.js`. Si el mensaje no es de tu
  iglesia: **404, no 403** (un 403 confirmaría que ese id existe).
- **🔴 El nombre y el mensaje los escribe un desconocido de internet**, sin
  cuenta y sin moderación. Es el dato menos confiable de toda la app. **Todo lo
  que salga de `contacto_publico` a la pantalla va por `escHtml`**, sin
  excepción, y nada de eso se pasa a `modalConfirm`/`modalPrompt` sin escapar
  (los dos meten su mensaje crudo en `innerHTML`; este proyecto ya metió un XSS
  ahí).
- **Orden de registro de rutas:** las rutas nuevas van **antes** de
  `r.get('/:codigoIglesia')` (`publico.js:80`). Esa ruta paramétrica se traga
  cualquier cosa. El archivo ya resolvió esto con `/info` y lo dejó escrito en
  un comentario (`publico.js:35-39`).
- **El endpoint público no gana ninguna capacidad de lectura.** El aviso de
  seguridad de la cabecera de `publico.js` (`publico.js:5-12`) sigue siendo
  cierto tal cual está: la bandeja es autenticada y de pastor.
- **Mensajes de validación en castellano dentro del esquema zod.** En zod 4 el
  parámetro es `error`, **nunca `errorMap`** (se ignora en silencio:
  `registro.js:23-26`).
- **La suite está en 456 tests** (verificado con `cd backend && npm test` el
  31-jul-2026) **y no puede bajar.** Este plan añade 13 tests: **debe terminar
  en 469, 0 fail.**
- Commits en castellano, minúsculas, `tipo(ámbito): efecto para la persona`.
  Sin coautoría ni menciones a Claude.

## Estructura de archivos

| Archivo | Responsabilidad | Tareas |
|---|---|---|
| `backend/src/db.js` | La columna `estado` y la migración de una sola vez, exportada para poder probarla | 1 |
| `backend/src/publico.js` | Las dos rutas de la bandeja, antes de la paramétrica | 2, 3 |
| `backend/src/auth.js` | `mensajes_portal` en los módulos del pastor | 4 |
| `web/app.js` | La pantalla, el ayudante de fecha UTC→local, la notificación pulsable y el "Ver más" | 4, 5 |
| `web/publico.html` | Las dos frases | 6 |
| `web/legal/privacidad.html` | La sección 4.9, en borrador para el abogado | 6 |
| `backend/test/bandeja-portal.test.js` | Todas las pruebas, incluida la de escapado a nivel de código fuente (nuevo) | 1, 2, 3, 4 |
| `ESTADO.md` | Dejarlo escrito | 7 |

---

### Task 1: La columna `estado` y la migración de una sola vez

**Files:**
- Modify: `backend/src/db.js` (junto al resto de `agregarColumna`, ~línea 570-590)
- Test: `backend/test/bandeja-portal.test.js` (nuevo)

**Interfaces:**
- Produces: `contacto_publico` gana `estado TEXT NOT NULL DEFAULT 'nuevo'`, con
  valores `'nuevo'` · `'atendido'` · `'previo'`. Y `db.js` exporta
  `migrarEstadoContactoPublico()`, idempotente, que las Tasks 2 y 3 consumen
  indirectamente y que la prueba del doble arranque llama a mano.

> 🔴 **El peligro de esta tarea, y por qué la migración se exporta.** El
> `UPDATE` que marca lo viejo como `'previo'` debe correr **una sola vez**. Si
> quedara fuera de su guarda, correría en cada arranque del servidor y mandaría
> a `'previo'` todos los mensajes nuevos y todos los ya atendidos: la bandeja
> seguiría abriendo, sin errores y sin avisar nada, pero dejaría de mostrar
> mensajes nuevos **para siempre** — el mismo fallo que este trabajo viene a
> arreglar, ahora silencioso. Se saca a una función exportada precisamente para
> que una prueba pueda llamarla dos veces y demostrar que la segunda no hace
> nada. `agregarColumna()` por sí solo ya es idempotente (`db.js:567-569`); el
> que no lo es, y por eso necesita la guarda, es el `UPDATE`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/bandeja-portal.test.js`:

```js
// ============================================================
//  La bandeja de mensajes del portal publico.
//  contacto_publico se escribia y NO la leia nadie: cero SELECT en todo el
//  proyecto fuera de los tests. Aqui se cubre la columna estado (con su
//  migracion de una sola vez), el listado de solo-pastor y el marcar atendido.
//  Ver spec: docs/superpowers/specs/2026-07-31-bandeja-portal-publico-design.md
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

// reiniciar() NO limpia contacto_publico (ver helpers.js:23-28), asi que se
// borra a mano: si no, los mensajes de un test se cuelan en el siguiente.
beforeEach(() => {
  reiniciar(db);
  db.exec('DELETE FROM contacto_publico');
  SEM = sembrarMinimo(db);
});

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});

// Inserta un mensaje directo en la BD. `estado` a null = deja el DEFAULT.
function mensaje(texto, iglesiaId = SEM.iglesiaId, estado = null) {
  const id = Number(db.prepare(
    'INSERT INTO contacto_publico (iglesia_id, nombre, mensaje) VALUES (?,?,?)'
  ).run(iglesiaId, 'Visitante ' + texto, texto).lastInsertRowid);
  if (estado) db.prepare('UPDATE contacto_publico SET estado = ? WHERE id = ?').run(estado, id);
  return id;
}

test('la columna estado existe y un mensaje nuevo nace "nuevo"', () => {
  const cols = db.prepare('PRAGMA table_info(contacto_publico)').all().map(c => c.name);
  assert.ok(cols.includes('estado'), 'falta la columna estado');

  const id = mensaje('Quiero visitarlos');
  assert.equal(db.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(id).estado, 'nuevo');
});

test('un mensaje que entra por el formulario publico tambien nace "nuevo"', async () => {
  const ig = db.prepare('SELECT codigo_unico FROM iglesia WHERE id = ?').get(SEM.iglesiaId);
  const res = await fetch(base + '/api/publico/' + ig.codigo_unico + '/contacto', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Maria', mensaje: 'Hola' })
  });
  assert.equal(res.status, 200);
  const fila = db.prepare("SELECT estado FROM contacto_publico WHERE nombre = 'Maria'").get();
  assert.equal(fila.estado, 'nuevo', 'el DEFAULT de la columna manda sobre la migracion de una sola vez');
});

test('🔴 la migracion es de UNA sola vez: llamarla otra vez no toca nada', async () => {
  const { migrarEstadoContactoPublico } = await import('../src/db.js');
  const nuevoId = mensaje('Recien llegado');
  const atendidoId = mensaje('Ya resuelto', SEM.iglesiaId, 'atendido');

  // Simula un segundo arranque del servidor contra la MISMA base de datos.
  migrarEstadoContactoPublico();

  assert.equal(db.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(nuevoId).estado,
    'nuevo', 'un arranque posterior NO puede mandar los mensajes nuevos a "previo"');
  assert.equal(db.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(atendidoId).estado,
    'atendido', 'ni deshacer lo que el pastor ya atendio');
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/bandeja-portal.test.js`
Expected: FALLA — `cols.includes('estado')` es `false`, y el `import` de
`migrarEstadoContactoPublico` da `undefined` (no es una función).

- [ ] **Step 3: Añadir la columna y la migración**

En `backend/src/db.js`, junto al resto de llamadas a `agregarColumna` (después
de la de `evento_org_gasto`, ~línea 584), añadir:

```js
// CONTACTO_PUBLICO: en que estado esta cada mensaje del portal publico.
//   'nuevo'    -> llego y nadie lo ha atendido (DEFAULT de la columna)
//   'atendido' -> el pastor lo marco
//   'previo'   -> ya estaba guardado ANTES de que existiera la bandeja; nadie
//                 lo vio nunca porque no habia donde. No es 'atendido' (seria
//                 mentira: la app afirmaria que el pastor lo atendio) ni
//                 'nuevo' (la primera apertura serian meses de deuda de golpe).
//
// OJO: esta funcion se exporta SOLO para que una prueba pueda llamarla dos
// veces y demostrar que la segunda no hace nada. El UPDATE tiene que quedar
// DENTRO de la guarda: fuera, correria en cada arranque y mandaria a 'previo'
// todos los mensajes nuevos, sin dar ningun error y dejando la bandeja ciega.
export function migrarEstadoContactoPublico() {
  if (columnaExiste('contacto_publico', 'estado')) return;
  agregarColumna('contacto_publico', 'estado', "TEXT NOT NULL DEFAULT 'nuevo'");
  db.exec("UPDATE contacto_publico SET estado = 'previo'");
}
migrarEstadoContactoPublico();
```

Y en la lista de índices (junto a `idx_contactopublico_iglesia`, `db.js:648`),
cambiar ese índice por uno que cubra también el estado, que es como lo va a
consultar la bandeja:

```js
  CREATE INDEX IF NOT EXISTS idx_contactopublico_iglesia ON contacto_publico(iglesia_id, estado);
```

⚠️ `CREATE INDEX IF NOT EXISTS` con el mismo nombre **no** reemplaza el índice
viejo en una base de datos que ya existe: la ve creada y no hace nada. No es un
problema (el índice viejo por `iglesia_id` sigue sirviendo para estas
consultas, solo que sin cubrir `estado`), y **no** hay que añadir un `DROP
INDEX`: no vale la pena tocar el esquema de producción por una optimización de
este tamaño. Se cambia la línea para que una base de datos nueva nazca bien.

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd backend && node --test test/bandeja-portal.test.js`
Expected: PASA — 3 tests.

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **459 tests, 0 fail** (456 + 3).

- [ ] **Step 6: Commit**

```bash
git add backend/src/db.js backend/test/bandeja-portal.test.js
git commit -m "feat(portal): estado de los mensajes del portal, y los ya guardados como anteriores"
```

---

### Task 2: `GET /api/publico/mensajes` — la bandeja del pastor

**Files:**
- Modify: `backend/src/publico.js` (después de `PATCH /info`, **antes** de `r.get('/:codigoIglesia')` en la línea 80)
- Test: `backend/test/bandeja-portal.test.js` (añadir)

**Interfaces:**
- Consumes: la columna `estado` de Task 1; `authMiddleware` y `esPastor`, **ya
  importados** en `publico.js:17`.
- Produces: `GET /api/publico/mensajes` → `{ items, hayMas, offset, previos }`
  donde `items` son los `nuevo` + `atendido` (nunca los `previo`) y `previos`
  es **cuántos** hay en la sección plegada. Con `?previos=1` → los `previo`, y
  `previos` vale `0`. La Task 4 (frontend) consume las cuatro claves.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/bandeja-portal.test.js`:

```js
// ---------- La bandeja ----------

test('el pastor ve los mensajes de SU iglesia y no los de otra', async () => {
  const otraIg = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRABAND')").run().lastInsertRowid);
  mensaje('De mi iglesia');
  mensaje('De la otra', otraIg);

  const res = await fetch(base + '/api/publico/mensajes', { headers: H(SEM.pastor) });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].mensaje, 'De mi iglesia');
});

test('un lider que no es pastor recibe 403', async () => {
  mensaje('Algo');
  const res = await fetch(base + '/api/publico/mensajes', { headers: H(SEM.lider) });
  assert.equal(res.status, 403);
});

test('la bandeja NO trae los "previo", pero si dice cuantos hay', async () => {
  mensaje('Reciente');
  mensaje('Viejo 1', SEM.iglesiaId, 'previo');
  mensaje('Viejo 2', SEM.iglesiaId, 'previo');

  const d = await (await fetch(base + '/api/publico/mensajes', { headers: H(SEM.pastor) })).json();
  assert.equal(d.items.length, 1, 'los previo no pueden aparecer en la bandeja de trabajo');
  assert.equal(d.items[0].mensaje, 'Reciente');
  assert.equal(d.previos, 2, 'pero el pastor tiene que saber cuantos hay esperando');
});

test('?previos=1 trae los "previo" y nada mas', async () => {
  mensaje('Reciente');
  mensaje('Viejo', SEM.iglesiaId, 'previo');

  const d = await (await fetch(base + '/api/publico/mensajes?previos=1', { headers: H(SEM.pastor) })).json();
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].mensaje, 'Viejo');
  assert.equal(d.previos, 0, 'ya se estan mostrando: no hay un contador aparte que pintar');
});

test('la bandeja pagina de 50 en 50 y avisa que hay mas', async () => {
  for (let i = 0; i < 51; i++) mensaje('Mensaje ' + i);

  const p1 = await (await fetch(base + '/api/publico/mensajes', { headers: H(SEM.pastor) })).json();
  assert.equal(p1.items.length, 50);
  assert.equal(p1.hayMas, true);

  const p2 = await (await fetch(base + '/api/publico/mensajes?offset=50', { headers: H(SEM.pastor) })).json();
  assert.equal(p2.items.length, 1);
  assert.equal(p2.hayMas, false);
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/bandeja-portal.test.js`
Expected: FALLA — la ruta no existe. Ojo al síntoma: **no da 404 limpio**, cae
en `r.get('/:codigoIglesia')` (`publico.js:80`), que interpreta `mensajes` como
el código único de una iglesia y responde `404 {error:'Iglesia no encontrada'}`.
Ese síntoma es justo lo que la restricción del orden de rutas evita.

- [ ] **Step 3: Añadir la ruta**

En `backend/src/publico.js`, justo después del `r.patch('/info', ...)` que
termina en la línea 69, y **antes** del comentario de `fechaLocal` y de
`r.get('/:codigoIglesia')`:

```js
// ============================================================
//  LA BANDEJA (solo pastor): los mensajes que la gente manda desde el
//  formulario "Planifica tu visita" del portal publico.
//
//  Registrada AQUI, antes de r.get('/:codigoIglesia'), por lo mismo que
//  /info: esa ruta parametrica se traga cualquier cosa y leeria "mensajes"
//  como el codigo unico de una iglesia.
// ============================================================
const MENSAJES_POR_PAGINA = 50;

function soloPastorBandeja(req, res, next) {
  if (!esPastor(req.user.persona_id))
    return res.status(403).json({ error: 'Solo el pastor puede ver los mensajes del portal' });
  next();
}

r.get('/mensajes', authMiddleware, soloPastorBandeja, (req, res) => {
  // ?previos=1 es la seccion plegada: los mensajes que ya estaban guardados
  // antes de que existiera esta bandeja. Se piden aparte para que la primera
  // apertura no sea un muro de meses acumulados.
  const verPrevios = String(req.query.previos || '') === '1';
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  // Se piden LIMIT+1 filas para saber si quedan mas sin un COUNT extra (mismo
  // patron que notificaciones.js:82-87).
  const filas = verPrevios
    ? db.prepare(
        `SELECT id, nombre, mensaje, creado_en, estado FROM contacto_publico
          WHERE iglesia_id = ? AND estado = 'previo'
          ORDER BY creado_en DESC, id DESC LIMIT ? OFFSET ?`
      ).all(req.user.iglesia_id, MENSAJES_POR_PAGINA + 1, offset)
    : db.prepare(
        // (estado = 'atendido') ordena primero lo que falta por atender, igual
        // que cuidado.js:26. El id DESC desempata dos del mismo segundo.
        `SELECT id, nombre, mensaje, creado_en, estado FROM contacto_publico
          WHERE iglesia_id = ? AND estado <> 'previo'
          ORDER BY (estado = 'atendido'), creado_en DESC, id DESC LIMIT ? OFFSET ?`
      ).all(req.user.iglesia_id, MENSAJES_POR_PAGINA + 1, offset);

  const hayMas = filas.length > MENSAJES_POR_PAGINA;
  const items = hayMas ? filas.slice(0, MENSAJES_POR_PAGINA) : filas;

  // Cuando ya se estan mostrando los previos no hay contador que pintar.
  const previos = verPrevios ? 0 : db.prepare(
    "SELECT COUNT(*) AS n FROM contacto_publico WHERE iglesia_id = ? AND estado = 'previo'"
  ).get(req.user.iglesia_id).n;

  res.json({ items, hayMas, offset, previos });
});
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd backend && node --test test/bandeja-portal.test.js`
Expected: PASA — 8 tests (el total del archivo).

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **464 tests, 0 fail** (459 + 5).

- [ ] **Step 6: Commit**

```bash
git add backend/src/publico.js backend/test/bandeja-portal.test.js
git commit -m "feat(portal): que el pastor pueda leer los mensajes que le manda la gente"
```

---

### Task 3: `PATCH /api/publico/mensajes/:id/atender`

**Files:**
- Modify: `backend/src/publico.js` (justo después del `GET /mensajes` de la Task 2)
- Test: `backend/test/bandeja-portal.test.js` (añadir)

**Interfaces:**
- Consumes: `soloPastorBandeja` (Task 2).
- Produces: `PATCH /api/publico/mensajes/:id/atender` → `{ok:true}`. **404** si
  el mensaje no es de tu iglesia, **403** si no eres pastor. Vale igual para un
  `nuevo` que para un `previo`. La Task 4 lo consume.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/bandeja-portal.test.js`:

```js
// ---------- Marcar atendido ----------

const atender = (persona, id, iglesiaId) => fetch(base + '/api/publico/mensajes/' + id + '/atender', {
  method: 'PATCH', headers: H(persona, iglesiaId)
});

test('el pastor marca un mensaje como atendido y baja en el orden', async () => {
  const viejo = mensaje('Primero');
  const nuevo = mensaje('Segundo');

  const res = await atender(SEM.pastor, viejo);
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(viejo).estado, 'atendido');

  const d = await (await fetch(base + '/api/publico/mensajes', { headers: H(SEM.pastor) })).json();
  assert.equal(d.items[0].id, nuevo, 'lo que falta por atender va primero');
  assert.equal(d.items[1].id, viejo);
});

test('marcar atendido un "previo" lo saca de la seccion plegada y baja su numero', async () => {
  const previo = mensaje('De hace meses', SEM.iglesiaId, 'previo');

  await atender(SEM.pastor, previo);

  const d = await (await fetch(base + '/api/publico/mensajes', { headers: H(SEM.pastor) })).json();
  assert.equal(d.previos, 0, 'ya no es un mensaje que la app escondio: es uno que el pastor resolvio');
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].estado, 'atendido');
});

test('el pastor de OTRA iglesia recibe 404 y el mensaje no cambia', async () => {
  const otraIg = Number(db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRAPATCH')").run().lastInsertRowid);
  const pastor2 = { id: Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,'p2','Pastor Dos','x',1,1)"
  ).run(otraIg).lastInsertRowid) };
  const mio = mensaje('Mio');

  const res = await atender(pastor2, mio, otraIg);
  assert.equal(res.status, 404, 'un 403 confirmaria que ese id existe en alguna parte');
  assert.equal(db.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(mio).estado,
    'nuevo', 'que no cambie es parte de la prueba, no solo el codigo de error');
});

test('un lider que no es pastor recibe 403 al marcar atendido', async () => {
  const id = mensaje('Algo');
  const res = await atender(SEM.lider, id);
  assert.equal(res.status, 403);
  assert.equal(db.prepare('SELECT estado FROM contacto_publico WHERE id = ?').get(id).estado, 'nuevo');
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/bandeja-portal.test.js`
Expected: FALLA — la ruta no existe (404 en todos los `PATCH`, incluido el que
esperaba 200).

- [ ] **Step 3: Añadir la ruta**

En `backend/src/publico.js`, justo después del `r.get('/mensajes', ...)`:

```js
// Marcar un mensaje como atendido. Vale igual para uno 'nuevo' que para uno
// 'previo': un previo atendido deja de ser "un mensaje que la app escondio" y
// pasa a ser "uno que el pastor resolvio".
//
// No hay camino de vuelta a 'nuevo' a proposito (ver "Fuera de alcance" del
// spec): marcar atendido es una afirmacion del pastor, no un filtro.
r.patch('/mensajes/:id/atender', authMiddleware, soloPastorBandeja, (req, res) => {
  // Acotado por iglesia en la MISMA consulta, no en una comprobacion posterior:
  // es el fallo que ya se colo una vez en musica.js (borrado que cruzaba
  // congregaciones).
  const info = db.prepare(
    "UPDATE contacto_publico SET estado = 'atendido' WHERE id = ? AND iglesia_id = ?"
  ).run(Number(req.params.id), req.user.iglesia_id);
  // 404 y no 403: un 403 confirmaria que ese id existe en otra iglesia.
  if (info.changes === 0) return res.status(404).json({ error: 'Mensaje no encontrado' });
  res.json({ ok: true });
});
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd backend && node --test test/bandeja-portal.test.js`
Expected: PASA — 12 tests (el total del archivo).

- [ ] **Step 5: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **468 tests, 0 fail** (464 + 4).

- [ ] **Step 6: Commit**

```bash
git add backend/src/publico.js backend/test/bandeja-portal.test.js
git commit -m "feat(portal): marcar como atendido un mensaje del portal publico"
```

---

### Task 4: La pantalla

**Files:**
- Modify: `backend/src/auth.js:127-128` (módulos del pastor)
- Modify: `web/app.js` — `NAV` (línea 8-30), `navTo()` (línea 595+), un ayudante
  de fecha nuevo junto a `escHtml` (~línea 2334), y la vista nueva
- Test: `backend/test/bandeja-portal.test.js` (añadir la prueba de escapado)

**Interfaces:**
- Consumes: `GET /api/publico/mensajes` (Task 2) y
  `PATCH /api/publico/mensajes/:id/atender` (Task 3).
- Produces: la clave de módulo `'mensajes_portal'`, las funciones globales
  `vistaMensajesPortal()`, `cargarMasMensajesPortal()`,
  `verPreviosPortal()` y `atenderMensajePortal(id)`. La Task 5 usa
  `'mensajes_portal'` como destino de la notificación.

> ⚠️ **La clave se parece peligrosamente a una que ya existe.** Dos sitios
> tratan `'mensajes'` (el chat) de forma especial: `tieneModulo()` la deja
> pasar siempre (`app.js:400`) y `buildNav()` le cuelga el badge de no leídos
> (`app.js:590`). Los dos comparan con `===`, así que `'mensajes_portal'` **no**
> hereda ninguna de las dos cosas — comprobado. No cambies esas comparaciones
> por `startsWith`/`includes`: esta pantalla se volvería visible para toda la
> iglesia.

- [ ] **Step 1: Escribir el test de escapado que falla**

El dato de esta pantalla lo escribe un desconocido de internet, así que el
escapado se fija con una prueba a nivel de código fuente, igual que el proyecto
ya hace con los filtros de comillas en los `onclick`.

Añadir a `backend/test/bandeja-portal.test.js`:

⚠️ El `import` va **arriba del todo del archivo**, junto a los otros tres, no
donde se pega el test: aunque ESM lo permitiría a nivel de módulo, mezclarlo
entre los tests despista a quien lea el archivo después.

```js
// (arriba, junto al resto de imports)
import { readFileSync } from 'node:fs';
```

```js
// ---------- Escapado en la pantalla ----------

test('la bandeja escapa el nombre y el mensaje del visitante', () => {
  const src = readFileSync(new URL('../../web/app.js', import.meta.url), 'utf8');
  const i = src.indexOf('function filaMensajePortal');
  assert.ok(i > 0, 'falta filaMensajePortal en web/app.js');
  // Se mira solo el cuerpo de esa funcion, no el archivo entero.
  const cuerpo = src.slice(i, src.indexOf('\n}', i));
  assert.match(cuerpo, /escHtml\(m\.nombre\)/, 'el nombre lo escribe un desconocido de internet');
  assert.match(cuerpo, /escHtml\(m\.mensaje\)/, 'el mensaje tambien');
  assert.doesNotMatch(cuerpo, /\$\{m\.nombre\}/, 'nunca el nombre crudo');
  assert.doesNotMatch(cuerpo, /\$\{m\.mensaje\}/, 'nunca el mensaje crudo');
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && node --test test/bandeja-portal.test.js`
Expected: FALLA — `filaMensajePortal` no existe todavía en `web/app.js`.

- [ ] **Step 3: Darle el módulo al pastor**

En `backend/src/auth.js`, en la lista de módulos del pastor (líneas 127-128),
añadir `'mensajes_portal'`:

```js
    ['calendario_completo','asistencia','panel_pastor','musicos','servicio_gestion',
     'cuidado_pastoral','ninos','tesoreria','admin','reportes','mensajes_portal'].forEach(m => mods.add(m));
```

⚠️ **Solo aquí.** El obispo tiene su propia lista cerrada (`auth.js:122-123`) y
no debe recibirlo, igual que hoy no recibe `cuidado_pastoral`.

- [ ] **Step 4: La entrada del menú**

En `web/app.js`, en `NAV` (línea 8-30), justo después de la línea de
`cuidado_pastoral`:

```js
  ['mensajes_portal','📬','Mensajes del portal'],
```

Y en `navTo()`, junto a la línea de `cuidado_pastoral` (`app.js:611`):

```js
  if(key==='mensajes_portal') return vistaMensajesPortal();
```

- [ ] **Step 5: El ayudante de fecha UTC → local**

En `web/app.js`, justo después de `escHtml` (~línea 2334), añadir:

```js
// SQLite guarda datetime('now') en UTC SIEMPRE, aunque el proceso corra en hora
// de Chile. Cortar el texto con .slice(0,10) muestra el dia equivocado: un
// mensaje enviado un lunes a las 21:00 se veria fechado el martes. Se arregla
// al MOSTRAR, nunca cambiando lo guardado (eso volveria inconsistentes las
// filas viejas con las nuevas, y esta app ya se llevo cinco fallos por tocar
// zonas horarias sin necesidad).
//
// La fecha sale en la zona de quien mira, que es lo correcto: para la iglesia
// es Chile, y para el pastor de viaje es donde este.
function fechaDeUTC(s){
  if(!s) return '';
  const d=new Date(String(s).replace(' ','T')+'Z');   // sin la Z se leeria como hora local
  return isNaN(d.getTime()) ? String(s).slice(0,10) : d.toLocaleDateString('es-CL');
}
```

- [ ] **Step 6: La vista**

En `web/app.js`, después de las funciones de Cuidado pastoral (~línea 2095),
añadir:

```js
// ============================================================
//  MENSAJES DEL PORTAL PÚBLICO (solo el pastor)
//  Los manda gente sin cuenta desde "Planifica tu visita". Antes se guardaban
//  y no los leía nadie: no había ninguna pantalla que los mostrara.
// ============================================================
let _mpOffset=0, _mpPreviosOffset=0;

// TODO el texto de aquí lo escribe un desconocido de internet, sin cuenta y sin
// moderación: es el dato menos confiable de la app. escHtml SIEMPRE.
function filaMensajePortal(m){
  const chip = m.estado==='atendido'
    ? '<span class="estado-chip estado-aceptado">✅ Atendido</span>'
    : m.estado==='previo'
    ? '<span class="estado-chip estado-pendiente">📥 Anterior</span>'
    : '<span class="estado-chip estado-rechazado">🆕 Nuevo</span>';
  const boton = m.estado==='atendido' ? ''
    : `<button class="btn ghost small-btn" onclick="atenderMensajePortal(${m.id})">Marcar atendido</button>`;
  return `<div class="item-card" style="margin-top:10px">
    <div class="flex" style="align-items:flex-start">
      <div style="flex:1"><b>${escHtml(m.nombre)}</b>
        <div class="muted small" style="white-space:pre-wrap;margin-top:4px">${escHtml(m.mensaje)}</div>
        <div class="muted small" style="margin-top:6px">${escHtml(fechaDeUTC(m.creado_en))}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">
        ${chip}${boton}
      </div>
    </div></div>`;
}

async function vistaMensajesPortal(){
  _mpOffset=0; _mpPreviosOffset=0;
  $('content').innerHTML='<div id="mp" class="muted">Cargando…</div>';
  try{
    const d=await api('/publico/mensajes');
    const z=$('mp'); z.className='';
    const lista = d.items.length
      ? d.items.map(filaMensajePortal).join('')
      : '<div class="placeholder"><div class="big">📬</div><p>No hay mensajes del portal.</p></div>';
    // La sección de los anteriores nace PLEGADA: es lo que evita que la primera
    // apertura sea un muro de meses acumulados. El número va a la vista para
    // que no se ignoren sin querer.
    const previos = d.previos>0
      ? `<button class="link" id="mp-ver-previos" style="margin-top:18px" onclick="verPreviosPortal()">
           ▸ 📥 Mensajes anteriores a esta bandeja (${d.previos})</button>
         <div id="mp-previos"></div>`
      : '';
    z.innerHTML=`<div id="mp-lista">${lista}</div>
      ${d.hayMas?'<button class="btn ghost small-btn" id="mp-mas" style="margin-top:10px" onclick="cargarMasMensajesPortal()">Ver más</button>':''}
      ${previos}`;
  }catch(e){ $('mp').innerHTML='<p class="error">'+escHtml(e.message||'No se pudieron cargar')+'</p>'; }
}

async function cargarMasMensajesPortal(){
  await conBoton($('mp-mas'), async()=>{
    const siguiente=_mpOffset+50;
    try{
      const d=await api('/publico/mensajes?offset='+siguiente);
      _mpOffset=siguiente;
      $('mp-lista').insertAdjacentHTML('beforeend', d.items.map(filaMensajePortal).join(''));
      if(!d.hayMas){ const b=$('mp-mas'); if(b) b.remove(); }
    }catch(e){ toast(e.message); }
  });
}

async function verPreviosPortal(){
  await conBoton($('mp-ver-previos'), async()=>{
    try{
      const d=await api('/publico/mensajes?previos=1&offset='+_mpPreviosOffset);
      $('mp-previos').insertAdjacentHTML('beforeend', d.items.map(filaMensajePortal).join(''));
      const btn=$('mp-ver-previos');
      if(d.hayMas){ _mpPreviosOffset+=50; if(btn) btn.textContent='Ver más anteriores'; }
      else if(btn) btn.remove();
    }catch(e){ toast(e.message); }
  });
}

async function atenderMensajePortal(id){
  try{
    await api('/publico/mensajes/'+id+'/atender',{method:'PATCH'});
    toast('✅ Marcado como atendido');
    vistaMensajesPortal();
  }catch(e){ toast(e.message); }
}
```

- [ ] **Step 7: Correr el test y verlo pasar**

Run: `cd backend && node --test test/bandeja-portal.test.js`
Expected: PASA — 13 tests (el total del archivo).

- [ ] **Step 8: Probarlo en el navegador**

Servidor propio en un puerto libre, `DISABLE_RATE_LIMIT=1`, `JWT_SECRET=local`,
`DB_PATH` a una BD de usar y tirar en el scratchpad. Siembra con
`node src/seed.js`. Iglesia `MONTESION`, clave `1234`, usuario `pastor`.

⚠️ **NO uses `scripts/with_server.py`**: en Windows deja el node huérfano y la
corrida siguiente lee su BD vieja. Mata tu proceso al terminar.

Prepara los datos a mano contra esa BD:

```sql
INSERT INTO contacto_publico (iglesia_id, nombre, mensaje, estado) VALUES
  (1, 'María González', 'Quiero visitarlos el domingo', 'nuevo'),
  (1, '<script>alert(1)</script>', 'Mensaje con <b>etiquetas</b> y "comillas"', 'nuevo'),
  (1, 'Juan de hace meses', 'Nadie leyó esto nunca', 'previo');
```

Comprobar entrando como **`pastor`**:
- 📬 "Mensajes del portal" sale en el menú · entrando como `abel` (líder)
  **no** sale.
- La bandeja abre mostrando los dos `nuevo`, y **abajo la línea plegada**
  "📥 Mensajes anteriores a esta bandeja (1)" — el viejo **no** está arriba.
- 🔴 El nombre con `<script>` se ve **como texto**, no ejecuta nada, y la
  consola no muestra ningún error. Las comillas y las etiquetas del mensaje
  también se ven como texto.
- Tocar la línea plegada despliega el mensaje viejo.
- "Marcar atendido" en el viejo → el contador de anteriores desaparece y el
  mensaje aparece arriba con ✅ Atendido.
- "Marcar atendido" en uno nuevo → baja al final de la lista.
- Sin errores de consola en ningún paso.

- [ ] **Step 9: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **469 tests, 0 fail** (468 + 1).

- [ ] **Step 10: Commit**

```bash
git add backend/src/auth.js web/app.js backend/test/bandeja-portal.test.js
git commit -m "feat(portal): la pantalla donde el pastor lee los mensajes del portal"
```

---

### Task 5: La notificación pulsable y el "Ver más" de Notificaciones

**Files:**
- Modify: `web/app.js` — `_destinoNotif()` (línea 1252-1254) y
  `verNotificaciones()` (línea 1226-1251)

**Interfaces:**
- Consumes: la clave `'mensajes_portal'` (Task 4); `GET /api/notificaciones`,
  que **ya** devuelve `{items, noLeidas, hayMas, offset}`
  (`notificaciones.js:79-92`) — no hay nada que cambiar en el backend.
- Produces: `cargarMasNotificaciones()`, función global nueva.

> El "Ver más" **no es solo para estos mensajes**: hoy cualquier notificación
> más allá de las 50 primeras es irrecuperable para cualquier persona de
> cualquier iglesia. El backend ya paginaba; la pantalla nunca lo usó.

- [ ] **Step 1: La notificación pulsable**

En `web/app.js`, reemplazar:

```js
function _destinoNotif(tipo){
  return {aprobacion:'calendario', musica:'musicos', grupo:'mi_grupo', recordatorio:'mi_servicio', predica:'predica'}[tipo]||'';
}
```

por:

```js
function _destinoNotif(tipo){
  // contacto_publico: sin esta línea la notificación 📬 del portal no se puede
  // pulsar (abrirNotif no navega si el destino es ''), y era el único aviso de
  // que alguien había escrito.
  return {aprobacion:'calendario', musica:'musicos', grupo:'mi_grupo', recordatorio:'mi_servicio',
    predica:'predica', contacto_publico:'mensajes_portal'}[tipo]||'';
}
```

- [ ] **Step 2: El "Ver más"**

En `web/app.js`, dentro de `verNotificaciones()`, reemplazar:

```js
    cont.innerHTML=botonLeer + d.items.map(n=>{
      const dest=_destinoNotif(n.tipo);
      const accion=n.tipo==='aprobacion'?'Revisar y aprobar ›':(dest?'Ver ›':'');
      return `<div class="notif-item ${n.leida?'':'no-leida'}" ${dest?`style="cursor:pointer" onclick="abrirNotif('${n.tipo}')"`:''}>
      <div style="font-weight:600">${escHtml(n.titulo)}</div>${n.texto?`<div class="muted small">${escHtml(n.texto)}</div>`:''}
      ${accion?`<div class="small" style="color:var(--primary);font-weight:600;margin-top:4px">${accion}</div>`:''}</div>`;
    }).join('');
    actualizarCampana();
```

por:

```js
    _notifOffset=0;
    cont.innerHTML=botonLeer + `<div id="ln-lista">${d.items.map(filaNotif).join('')}</div>` +
      (d.hayMas?'<button class="btn ghost small-btn" id="ln-mas" style="margin-top:10px" onclick="cargarMasNotificaciones()">Ver más</button>':'');
    actualizarCampana();
```

Y justo después de `verNotificaciones()`, antes de `_destinoNotif`, añadir:

```js
// Se saca a su propia función porque ahora la usan dos sitios: la carga inicial
// y el "Ver más".
function filaNotif(n){
  const dest=_destinoNotif(n.tipo);
  const accion=n.tipo==='aprobacion'?'Revisar y aprobar ›':(dest?'Ver ›':'');
  return `<div class="notif-item ${n.leida?'':'no-leida'}" ${dest?`style="cursor:pointer" onclick="abrirNotif('${n.tipo}')"`:''}>
    <div style="font-weight:600">${escHtml(n.titulo)}</div>${n.texto?`<div class="muted small">${escHtml(n.texto)}</div>`:''}
    ${accion?`<div class="small" style="color:var(--primary);font-weight:600;margin-top:4px">${accion}</div>`:''}</div>`;
}
// El backend ya paginaba de 50 en 50 y mandaba hayMas (notificaciones.js:79-92);
// esta pantalla simplemente nunca lo miró, así que pasadas 50 notificaciones las
// viejas eran irrecuperables para cualquiera.
let _notifOffset=0;
async function cargarMasNotificaciones(){
  await conBoton($('ln-mas'), async()=>{
    const siguiente=_notifOffset+50;
    try{
      const d=await api('/notificaciones?offset='+siguiente);
      _notifOffset=siguiente;
      $('ln-lista').insertAdjacentHTML('beforeend', d.items.map(filaNotif).join(''));
      if(!d.hayMas){ const b=$('ln-mas'); if(b) b.remove(); }
    }catch(e){ toast(e.message); }
  });
}
```

⚠️ `let _notifOffset=0;` se declara **una sola vez** a nivel de módulo. La línea
`_notifOffset=0;` dentro de `verNotificaciones()` solo lo reinicia al abrir la
pantalla; no lleva `let`.

- [ ] **Step 3: Probarlo en el navegador**

Mismo montaje que la Task 4. Prepara más de 50 notificaciones para el pastor:

```sql
INSERT INTO notificacion (persona_id, tipo, titulo, texto)
SELECT 1, 'admin', 'Aviso ' || value, 'Relleno'
FROM (WITH RECURSIVE c(value) AS (SELECT 1 UNION ALL SELECT value+1 FROM c WHERE value<60) SELECT value FROM c);
```

Comprobar:
- Mandar un mensaje desde `/publico.html?ig=MONTESION` → al pastor le llega la
  notificación 📬 · **tocarla lleva a la bandeja** (antes no hacía nada).
- La pantalla de Notificaciones muestra 50 y un botón "Ver más" · tocarlo añade
  las siguientes y el botón desaparece cuando ya no quedan.
- Sin errores de consola.

- [ ] **Step 4: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **469, 0 fail** — esta tarea no toca backend; si el número cambia,
algo se salió de alcance.

- [ ] **Step 5: Commit**

```bash
git add web/app.js
git commit -m "feat(notificaciones): que el aviso del portal se pueda pulsar, y poder ver las viejas"
```

---

### Task 6: Las dos frases del portal y la Política de Privacidad

**Files:**
- Modify: `web/publico.html:105` y `web/publico.html:316`
- Modify: `web/legal/privacidad.html` (sección 4.9 nueva, después de 4.8 que
  empieza en la línea 395 y antes de la sección 5, línea 426)

**Interfaces:** ninguna — es texto.

- [ ] **Step 1: La frase del formulario**

En `web/publico.html:105`, reemplazar:

```html
      <p class="muted small" style="margin-bottom:16px">Cuéntanos que quieres visitarnos o que necesitas y te contactaremos pronto.</p>
```

por:

```html
      <p class="muted small" style="margin-bottom:16px">Cuéntanos que quieres visitarnos o que necesitas. Tu mensaje le llega directo al pastor.</p>
```

- [ ] **Step 2: La frase de confirmación**

En `web/publico.html:316`, reemplazar:

```js
            msgBox.textContent = '¡Gracias! Recibimos tu mensaje y te contactaremos pronto.';
```

por:

```js
            msgBox.textContent = '¡Gracias! Tu mensaje ya le llegó al pastor.';
```

⚠️ **Las dos frases van juntas.** El formulario no pide correo ni teléfono (y
no se toca, es decisión del dueño), así que la página no puede prometer que
contactará a nadie. Cambiar solo una de las dos deja la promesa viva en la
otra.

- [ ] **Step 3: La sección 4.9 de la Política de Privacidad**

En `web/legal/privacidad.html`, después del bloque de la sección
`<h3>4.8 Datos técnicos y de uso de la Aplicación</h3>` y **antes** de
`<h2>5. Cómo obtenemos tus datos</h2>` (línea 426), añadir:

```html
<h3>4.9 Datos de visitantes del portal público</h3>

<p><strong>[BORRADOR — PENDIENTE DE REVISIÓN LEGAL]</strong></p>

<p>El portal público de cada Iglesia incluye un formulario de contacto
("Planifica tu visita") que puede completar cualquier persona, <strong>sin
necesidad de tener una cuenta en el Sistema</strong>.</p>

<table>
<thead>
<tr>
<th>Dato</th>
<th>Detalle</th>
</tr>
</thead>
<tbody>
<tr>
<td>Nombre</td>
<td>El que la propia persona escribe en el formulario; no se verifica</td>
</tr>
<tr>
<td>Mensaje</td>
<td>Texto libre que la persona redacta. Puede contener los datos personales que ella misma decida incluir</td>
</tr>
<tr>
<td>Fecha de envío</td>
<td>Momento en que se recibió el mensaje</td>
</tr>
</tbody>
</table>

<p><strong>Quién accede:</strong> únicamente el pastor de la Iglesia a la que
se dirigió el mensaje. Ninguna otra Iglesia del Sistema puede verlo.</p>

<p><strong>Finalidad:</strong> permitir que la Iglesia lea y atienda la
solicitud de quien escribe.</p>

<p><strong>Advertencia sobre el contacto:</strong> el formulario
<strong>no solicita</strong> teléfono ni correo electrónico. Por lo tanto, la
Iglesia no dispone de un medio para responder, salvo que la persona lo incluya
voluntariamente en el texto de su mensaje.</p>

<p><strong>Consentimiento:</strong> quien escribe desde el portal público no
posee cuenta en el Sistema y, en consecuencia, <strong>no ha otorgado el
consentimiento versionado</strong> descrito en la sección correspondiente de
esta Política. El tratamiento se limita a lo estrictamente necesario para
atender la solicitud que la propia persona remite por iniciativa propia.</p>

<p><strong>Conservación:</strong> los mensajes se conservan hasta que la
Iglesia decida eliminarlos.</p>
```

⚠️ **Esto es de cumplimiento, no de programación.** Si el borrador y lo que
hace el código se separan, **manda el código** y hay que corregir el texto,
nunca al revés. Va marcado como borrador porque el abogado ya tiene pendientes
los placeholders `[…]` del mismo documento (`privacidad.html:93`, `873`).

- [ ] **Step 4: Comprobar que el índice no necesita cambios**

Run: `grep -n "4\.8\|4\.9" web/legal/privacidad.html`
Expected: el índice de la línea 36 lista solo los apartados de primer nivel
(1, 2, 3…), no los `4.x`. Si apareciera un `4.8` dentro del índice, añadir
también el `4.9` ahí.

- [ ] **Step 5: Comprobarlo en el navegador**

Abrir `/publico.html?ig=MONTESION` y `/legal/privacidad.html`. Comprobar que
las dos frases nuevas salen bien, que la sección 4.9 se ve con el mismo estilo
de tabla que las demás, y que no hay errores de consola.

- [ ] **Step 6: Correr la suite completa**

Run: `cd backend && npm test`
Expected: **469, 0 fail** — esta tarea no toca backend.

- [ ] **Step 7: Commit**

```bash
git add web/publico.html web/legal/privacidad.html
git commit -m "fix(portal): dejar de prometer un contacto que no se puede cumplir, y decirlo en privacidad"
```

---

### Task 7: Dejarlo escrito

**Files:**
- Modify: `ESTADO.md`

- [ ] **Step 1: Actualizar `ESTADO.md`**

En la sección "👉 POR DÓNDE RETOMAR" del 31 jul, el punto **3. Mensajes del
portal público** pasa a hecho (mismo estilo `✅ ~~…~~` que los ya cerrados),
anotando:

- Qué se construyó: la columna `estado` con el valor `previo` para lo ya
  guardado, la bandeja de solo-pastor, marcar atendido, la notificación
  pulsable, el "Ver más" de Notificaciones, las dos frases y la sección 4.9 de
  la Política de Privacidad **en borrador para el abogado**.
- El número nuevo de tests: **469**.
- **Lo que sigue sin resolver**, que hay que decir:
  1. **No se puede responder desde la app**: el formulario sigue sin pedir
     correo ni teléfono (decisión del dueño). La única vía es que la persona lo
     escriba dentro del mensaje.
  2. **La sección de mensajes anteriores puede no abrirse nunca.** Están
     contados y accesibles, pero nada obliga a mirarlos y no generan aviso.
  3. **No se puede borrar un mensaje** ni marcar atendido en bloque.
  4. **La fecha de Cuidado pastoral (`verCaso()` en `app.js:2102`) sigue con el fallo de UTC**
     — se ve el día siguiente para lo escrito después de las 20:00. El ayudante
     `fechaDeUTC` ya existe y lo arregla en una línea; se dejó fuera a
     propósito para no ensuciar este diff.
  5. **La Política de Privacidad 4.9 está en borrador** y necesita al abogado.

- [ ] **Step 2: Commit**

```bash
git add ESTADO.md
git commit -m "docs(estado): la bandeja del portal publico, cerrada"
```
