# Organización de eventos (hoja de logística + cuentas) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un apartado para organizar un evento (cosas a llevar con cantidad + ✓, hora de llegada) y llevar la cuenta del gasto (lista de gastos que se suma), que funciona pegado a un evento del calendario o como lista suelta.

**Architecture:** Enfoque A del spec: una *hoja de organización* (`evento_org`) que opcionalmente referencia un evento; sus cosas (`evento_org_cosa`) y gastos (`evento_org_gasto`) cuelgan de la hoja. Backend nuevo `organizacion.js` (router en `/api/organizacion`). Frontend vanilla JS: apartado nuevo "Organización" para líderes + botón dentro de cada evento.

**Tech Stack:** Node.js ESM, Express, `node:sqlite` (DatabaseSync, síncrono), `zod` + `validar`, frontend vanilla JS. Tests con `node:test`.

## Global Constraints

- `node:sqlite` es síncrono: nada de async en las consultas.
- **Ver** la organización: solo líderes/pastor → `esLiderOAdmin(personaId)` (ya existe en `auth.js`, incluye al pastor).
- **Editar** (hoja, cosas, gastos): SOLO `org.creado_por === personaId` **o** `esPastor(personaId)`.
- Todo aislado por `iglesia_id` en cada consulta; una hoja de otra iglesia → 404.
- Una sola hoja por evento (índice único parcial sobre `evento_id`).
- `total_gastado` NUNCA se persiste: se calcula con `COALESCE(SUM(monto),0)` al leer.
- Hora en formato `HH:MM` (mismo `horaSchema` que `eventos.js`).
- `auditar(iglesia_id, persona_id, accion, 'organizacion', detalle)` en las mutaciones.
- Frontend: `escHtml` en todo dato de usuario, `conBoton(botonActual(), ...)` anti doble-submit, `toast` para feedback.

## File Structure

- Create: `backend/src/organizacion.js` — router completo de la organización.
- Create: `backend/test/organizacion.test.js` — tests del módulo.
- Modify: `backend/src/db.js` — 3 tablas + índice único parcial.
- Modify: `backend/src/server.js` — importar y montar el router.
- Modify: `backend/src/eventos.js` — cascada: al borrar un evento, borrar su hoja.
- Modify: `web/app.js` — NAV + `vistaOrganizacion` + vista de hoja + botón en evento.
- Modify: `web/styles.css` — estilos mínimos de la hoja.

---

### Task 1: Esquema (3 tablas + índice)

**Files:**
- Modify: `backend/src/db.js` (tras la tabla `asignacion`, cerca de la línea 108)

**Interfaces:**
- Produces: tablas `evento_org(id, iglesia_id, evento_id, titulo, fecha, hora_llegada, creado_por, creada_en)`, `evento_org_cosa(id, org_id, nombre, cantidad, listo, orden)`, `evento_org_gasto(id, org_id, concepto, monto, creado_en)`; índice único parcial `idx_evento_org_evento` sobre `evento_org(evento_id)`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/organizacion.test.js`:

```js
// ============================================================
//  Organización de eventos: hoja (cosas + gastos), permisos y cascadas.
// ============================================================
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';

let db;
before(async () => { db = await cargarDb(); });

test('el esquema crea las 3 tablas y el índice único por evento', () => {
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['evento_org', 'evento_org_cosa', 'evento_org_gasto'])
    assert.ok(tablas.includes(t), 'falta la tabla ' + t);

  db.exec('PRAGMA foreign_keys = ON');
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Org A','ORGA')").run();
  const iglesiaId = Number(ig.lastInsertRowid);
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha) VALUES (?, 'Culto', '2026-08-01')").run(iglesiaId);
  const eventoId = Number(ev.lastInsertRowid);
  db.prepare('INSERT INTO evento_org (iglesia_id, evento_id) VALUES (?,?)').run(iglesiaId, eventoId);
  // Segunda hoja para el MISMO evento: debe fallar por el índice único.
  assert.throws(() => db.prepare('INSERT INTO evento_org (iglesia_id, evento_id) VALUES (?,?)').run(iglesiaId, eventoId));
  // Dos hojas SUELTAS (evento_id NULL) sí conviven (índice parcial).
  db.prepare("INSERT INTO evento_org (iglesia_id, titulo) VALUES (?, 'Suelta 1')").run(iglesiaId);
  db.prepare("INSERT INTO evento_org (iglesia_id, titulo) VALUES (?, 'Suelta 2')").run(iglesiaId);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org WHERE evento_id IS NULL AND iglesia_id = ?').get(iglesiaId).n, 2);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && node --test test/organizacion.test.js`
Expected: FAIL — `falta la tabla evento_org`.

- [ ] **Step 3: Añadir el esquema**

En `backend/src/db.js`, justo después del bloque `CREATE TABLE IF NOT EXISTS asignacion (...)` (termina cerca de la línea 108), añadir dentro del mismo string de `db.exec(...)`:

```sql
CREATE TABLE IF NOT EXISTS evento_org (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id   INTEGER NOT NULL REFERENCES iglesia(id),
  evento_id    INTEGER REFERENCES evento(id),
  titulo       TEXT,
  fecha        TEXT,
  hora_llegada TEXT,
  creado_por   INTEGER REFERENCES persona(id),
  creada_en    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_evento_org_evento ON evento_org(evento_id) WHERE evento_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS evento_org_cosa (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id   INTEGER NOT NULL REFERENCES evento_org(id),
  nombre   TEXT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  listo    INTEGER NOT NULL DEFAULT 0,
  orden    INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS evento_org_gasto (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id    INTEGER NOT NULL REFERENCES evento_org(id),
  concepto  TEXT NOT NULL,
  monto     REAL NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
```

> Nota: si el `db.exec(...)` del esquema está partido en varias llamadas, añadir este bloque a la misma llamada que crea `asignacion` (todas comparten el mismo string de esquema; verifica que quede DENTRO de las comillas invertidas).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && node --test test/organizacion.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/db.js backend/test/organizacion.test.js
git commit -m "feat(organizacion): esquema de hoja de organizacion (cosas + gastos)"
```

---

### Task 2: Router `organizacion.js` — hoja (crear/leer/editar/borrar) + gates + montaje

**Files:**
- Create: `backend/src/organizacion.js`
- Modify: `backend/src/server.js` (import + `app.use`)
- Test: `backend/test/organizacion.test.js`

**Interfaces:**
- Consumes: `authMiddleware`, `esPastor`, `esLiderOAdmin`, `auditar` (auth.js); `validar` (seguridad.js).
- Produces (rutas bajo `/api/organizacion`):
  - `GET /` → array de hojas de la iglesia con `total_gastado` y `n_cosas`.
  - `GET /evento/:eventoId` → hoja del evento (la crea vacía la 1a vez); objeto `{...org, evento, cosas:[], gastos:[], total_gastado, puede_editar}`.
  - `GET /:id` → misma forma; 404 si no es de la iglesia.
  - `POST /` `{titulo, fecha?, hora_llegada?}` → `{ok, id}`.
  - `PATCH /:id` `{titulo?, fecha?, hora_llegada?}` → `{ok}`.
  - `DELETE /:id` → `{ok}` (borra cosas+gastos+hoja en transacción).
  - Helpers internos (usados por Task 3 y 4): `puedeEditarOrg(personaId, org)`, `armarHoja(org)`, `hojaEditable(req,res,orgId)` (responde 404/403 y devuelve el row o null).

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `backend/test/organizacion.test.js`:

```js
import { signToken } from '../src/auth.js';

// Arranca el server HTTP real una vez para los tests de endpoints.
let base, srv;
async function servidor() {
  if (srv) return base;
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  return base;
}
function tok(personaId, iglesiaId) { return signToken({ id: personaId, iglesia_id: iglesiaId }); }

// Siembra una iglesia con un líder (admin de grupo) y un feligrés común.
function sembrarOrg(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const pas = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,1,1)").run(iglesiaId, 'pas_' + codigo, 'Pastor', 'x');
  const lid = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)").run(iglesiaId, 'lid_' + codigo, 'Lider', 'x');
  const fel = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)").run(iglesiaId, 'fel_' + codigo, 'Feligres', 'x');
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  const grupoId = Number(g.lastInsertRowid);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(Number(lid.lastInsertRowid), grupoId);
  return { iglesiaId, pastorId: Number(pas.lastInsertRowid), liderId: Number(lid.lastInsertRowid), feligresId: Number(fel.lastInsertRowid), grupoId };
}

test('hoja suelta: crear, leer, gate de visibilidad y edición', async () => {
  const b = await servidor();
  const S = sembrarOrg('SUEL');
  // feligrés común NO ve la organización
  let res = await fetch(b + '/api/organizacion', { headers: { Authorization: 'Bearer ' + tok(S.feligresId, S.iglesiaId) } });
  assert.equal(res.status, 403);
  // líder crea una hoja suelta
  res = await fetch(b + '/api/organizacion', { method: 'POST', headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'Almuerzo', hora_llegada: '12:30' }) });
  assert.equal(res.status, 200);
  const { id } = await res.json();
  // la lee y trae puede_editar=true para el creador
  res = await fetch(b + '/api/organizacion/' + id, { headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId) } });
  const hoja = await res.json();
  assert.equal(hoja.titulo, 'Almuerzo');
  assert.equal(hoja.hora_llegada, '12:30');
  assert.equal(hoja.total_gastado, 0);
  assert.deepEqual(hoja.cosas, []);
  assert.equal(hoja.puede_editar, true);
});

test('hoja de evento: se crea sola al abrirla; una por evento; otra iglesia no la ve', async () => {
  const b = await servidor();
  const S = sembrarOrg('EVEN');
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha, grupo_id) VALUES (?, 'Retiro', '2026-08-10', ?)").run(S.iglesiaId, S.grupoId);
  const eventoId = Number(ev.lastInsertRowid);
  // 1a apertura crea la hoja
  let res = await fetch(b + '/api/organizacion/evento/' + eventoId, { headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId) } });
  assert.equal(res.status, 200);
  const h1 = await res.json();
  assert.equal(h1.evento_id, eventoId);
  assert.equal(h1.evento.titulo, 'Retiro');
  // 2a apertura devuelve la MISMA (no duplica)
  res = await fetch(b + '/api/organizacion/evento/' + eventoId, { headers: { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId) } });
  const h2 = await res.json();
  assert.equal(h2.id, h1.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org WHERE evento_id = ?').get(eventoId).n, 1);
  // otra iglesia no puede abrir ese evento
  const O = sembrarOrg('OTRA');
  res = await fetch(b + '/api/organizacion/evento/' + eventoId, { headers: { Authorization: 'Bearer ' + tok(O.liderId, O.iglesiaId) } });
  assert.equal(res.status, 404);
});

test('editar/borrar hoja: solo creador o pastor; otro líder 403', async () => {
  const b = await servidor();
  const S = sembrarOrg('EDIT');
  // otro líder de la misma iglesia
  const lid2 = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)").run(S.iglesiaId, 'lid2', 'Lider2', 'x');
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'admin')").run(Number(lid2.lastInsertRowid), S.grupoId);
  const lid2Id = Number(lid2.lastInsertRowid);
  // líder crea
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'Mia' }) });
  const { id } = await res.json();
  // otro líder NO puede editar
  res = await fetch(b + '/api/organizacion/' + id, { method: 'PATCH', headers: { Authorization: 'Bearer ' + tok(lid2Id, S.iglesiaId), 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'Hackeada' }) });
  assert.equal(res.status, 403);
  // el pastor SÍ puede editar
  res = await fetch(b + '/api/organizacion/' + id, { method: 'PATCH', headers: { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId), 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'Por el pastor' }) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT titulo FROM evento_org WHERE id = ?').get(id).titulo, 'Por el pastor');
  // el creador borra
  res = await fetch(b + '/api/organizacion/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId) } });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org WHERE id = ?').get(id).n, 0);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && node --test test/organizacion.test.js`
Expected: FAIL — el `POST /api/organizacion` responde 404 (ruta inexistente) porque el router aún no está montado.

- [ ] **Step 3: Crear `backend/src/organizacion.js`**

```js
// ============================================================
//  Organización de eventos: hoja de logística (cosas a llevar) + cuentas
//  (gastos que se suman). Puede ir pegada a un evento o ser una lista suelta.
//  Ver: solo líderes/pastor (esLiderOAdmin). Editar: solo el creador o el pastor.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import db from './db.js';
import { authMiddleware, esPastor, esLiderOAdmin, auditar } from './auth.js';
import { validar } from './seguridad.js';

const r = Router();
r.use(authMiddleware);

// Gate de visibilidad: la organización es cosa de líderes/pastor.
r.use((req, res, next) => {
  if (!esLiderOAdmin(req.user.persona_id)) return res.status(403).json({ error: 'Solo líderes o el pastor' });
  next();
});

const horaSchema = z.string().trim().regex(/^\d{2}:\d{2}$/, 'hora inválida (usa HH:MM)').optional().or(z.literal(''));

// ¿Puede editar esta hoja? Solo su creador o el pastor.
function puedeEditarOrg(personaId, org) {
  return org.creado_por === personaId || esPastor(personaId);
}

// Arma la hoja completa (cosas + gastos + total + evento) a partir de su row.
function armarHoja(org) {
  const cosas = db.prepare('SELECT id, nombre, cantidad, listo, orden FROM evento_org_cosa WHERE org_id = ? ORDER BY orden, id').all(org.id);
  const gastos = db.prepare('SELECT id, concepto, monto, creado_en FROM evento_org_gasto WHERE org_id = ? ORDER BY id').all(org.id);
  const total = db.prepare('SELECT COALESCE(SUM(monto),0) AS t FROM evento_org_gasto WHERE org_id = ?').get(org.id).t;
  const evento = org.evento_id
    ? db.prepare('SELECT id, titulo, fecha, hora_inicio, lugar FROM evento WHERE id = ?').get(org.evento_id)
    : null;
  return { ...org, evento, cosas, gastos, total_gastado: total };
}

// Carga la hoja completa por id (acotada a la iglesia) o null.
function cargarHoja(id, iglesiaId) {
  const org = db.prepare('SELECT * FROM evento_org WHERE id = ? AND iglesia_id = ?').get(id, iglesiaId);
  return org ? armarHoja(org) : null;
}

// Obtiene el row de la hoja y valida edición. Responde 404/403 y devuelve null,
// o devuelve el row si el usuario puede editarla.
function hojaEditable(req, res, orgId) {
  const org = db.prepare('SELECT * FROM evento_org WHERE id = ? AND iglesia_id = ?').get(orgId, req.user.iglesia_id);
  if (!org) { res.status(404).json({ error: 'Hoja no encontrada' }); return null; }
  if (!puedeEditarOrg(req.user.persona_id, org)) { res.status(403).json({ error: 'Solo quien creó la lista o el pastor' }); return null; }
  return org;
}

// --- Lista de hojas de la iglesia (para el apartado de líderes) ---
r.get('/', (req, res) => {
  const filas = db.prepare(
    `SELECT o.*, e.titulo AS evento_titulo, e.fecha AS evento_fecha,
        (SELECT COALESCE(SUM(monto),0) FROM evento_org_gasto g WHERE g.org_id = o.id) AS total_gastado,
        (SELECT COUNT(*) FROM evento_org_cosa c WHERE c.org_id = o.id) AS n_cosas
       FROM evento_org o LEFT JOIN evento e ON e.id = o.evento_id
      WHERE o.iglesia_id = ? ORDER BY o.creada_en DESC`
  ).all(req.user.iglesia_id);
  res.json(filas);
});

// --- Hoja de un evento (se crea vacía la 1a vez que se abre) ---
r.get('/evento/:eventoId', (req, res) => {
  const eventoId = Number(req.params.eventoId);
  const ev = db.prepare('SELECT id FROM evento WHERE id = ? AND iglesia_id = ?').get(eventoId, req.user.iglesia_id);
  if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
  let org = db.prepare('SELECT * FROM evento_org WHERE evento_id = ? AND iglesia_id = ?').get(eventoId, req.user.iglesia_id);
  if (!org) {
    const info = db.prepare('INSERT INTO evento_org (iglesia_id, evento_id, creado_por) VALUES (?,?,?)')
      .run(req.user.iglesia_id, eventoId, req.user.persona_id);
    org = db.prepare('SELECT * FROM evento_org WHERE id = ?').get(Number(info.lastInsertRowid));
    auditar(req.user.iglesia_id, req.user.persona_id, 'crear_org', 'organizacion', 'evento ' + eventoId);
  }
  res.json({ ...armarHoja(org), puede_editar: puedeEditarOrg(req.user.persona_id, org) });
});

// --- Detalle de una hoja por id ---
r.get('/:id', (req, res) => {
  const org = db.prepare('SELECT * FROM evento_org WHERE id = ? AND iglesia_id = ?').get(Number(req.params.id), req.user.iglesia_id);
  if (!org) return res.status(404).json({ error: 'Hoja no encontrada' });
  res.json({ ...armarHoja(org), puede_editar: puedeEditarOrg(req.user.persona_id, org) });
});

// --- Crear hoja suelta ---
const crearHojaSchema = z.object({
  titulo: z.string().trim().min(1, 'falta el título'),
  fecha: z.string().trim().optional().or(z.literal('')),
  hora_llegada: horaSchema
});
r.post('/', validar(crearHojaSchema), (req, res) => {
  const { titulo, fecha, hora_llegada } = req.body;
  const info = db.prepare('INSERT INTO evento_org (iglesia_id, titulo, fecha, hora_llegada, creado_por) VALUES (?,?,?,?,?)')
    .run(req.user.iglesia_id, titulo, fecha || null, hora_llegada || null, req.user.persona_id);
  auditar(req.user.iglesia_id, req.user.persona_id, 'crear_org', 'organizacion', titulo);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

// --- Editar hoja (título/fecha/hora) ---
const editarHojaSchema = z.object({
  titulo: z.string().trim().min(1).optional(),
  fecha: z.string().trim().optional().or(z.literal('')),
  hora_llegada: horaSchema
});
r.patch('/:id', validar(editarHojaSchema), (req, res) => {
  const org = hojaEditable(req, res, Number(req.params.id));
  if (!org) return;
  const { titulo, fecha, hora_llegada } = req.body;
  db.prepare('UPDATE evento_org SET titulo=?, fecha=?, hora_llegada=? WHERE id=?').run(
    titulo ?? org.titulo,
    fecha === undefined ? org.fecha : (fecha || null),
    hora_llegada === undefined ? org.hora_llegada : (hora_llegada || null),
    org.id
  );
  auditar(req.user.iglesia_id, req.user.persona_id, 'editar_org', 'organizacion', String(org.id));
  res.json({ ok: true });
});

// --- Borrar hoja (+ cosas + gastos) ---
r.delete('/:id', (req, res) => {
  const org = hojaEditable(req, res, Number(req.params.id));
  if (!org) return;
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM evento_org_cosa WHERE org_id=?').run(org.id);
    db.prepare('DELETE FROM evento_org_gasto WHERE org_id=?').run(org.id);
    db.prepare('DELETE FROM evento_org WHERE id=?').run(org.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: 'No se pudo borrar la hoja' }); }
  auditar(req.user.iglesia_id, req.user.persona_id, 'borrar_org', 'organizacion', org.titulo || ('evento ' + org.evento_id));
  res.json({ ok: true });
});

export default r;
export { puedeEditarOrg, armarHoja, hojaEditable };
```

- [ ] **Step 4: Montar el router en `server.js`**

Junto a los otros imports de routers (tras la línea `import superadminRouter from './superadmin.js';`, ~línea 43):

```js
import organizacionRouter from './organizacion.js';
```

Junto a los otros `app.use('/api/...')` (tras `app.use('/api/eventos', eventosRouter);`, ~línea 245):

```js
app.use('/api/organizacion', organizacionRouter);
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd backend && node --test test/organizacion.test.js`
Expected: PASS (los 4 tests: esquema + 3 de hoja).

- [ ] **Step 6: Commit**

```bash
git add backend/src/organizacion.js backend/src/server.js backend/test/organizacion.test.js
git commit -m "feat(organizacion): router de hojas (crear/leer/editar/borrar) + gates"
```

---

### Task 3: Cosas (añadir / marcar ✓ / borrar)

**Files:**
- Modify: `backend/src/organizacion.js`
- Test: `backend/test/organizacion.test.js`

**Interfaces:**
- Consumes: `hojaEditable`, `validar`, `z`.
- Produces:
  - `POST /:id/cosas` `{nombre, cantidad?}` → `{ok, id}`.
  - `PATCH /cosas/:cosaId` `{nombre?, cantidad?, listo?}` → `{ok}`.
  - `DELETE /cosas/:cosaId` → `{ok}`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/organizacion.test.js`:

```js
test('cosas: añadir, marcar listo y borrar (con permiso)', async () => {
  const b = await servidor();
  const S = sembrarOrg('COSA');
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'Lista' }) });
  const { id } = await res.json();
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };

  // añadir cosa con cantidad
  res = await fetch(b + `/api/organizacion/${id}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Jugos nectar', cantidad: 5 }) });
  assert.equal(res.status, 200);
  const cosaId = (await res.json()).id;
  // se ve en la hoja
  res = await fetch(b + '/api/organizacion/' + id, { headers: auth });
  let hoja = await res.json();
  assert.equal(hoja.cosas.length, 1);
  assert.equal(hoja.cosas[0].nombre, 'Jugos nectar');
  assert.equal(hoja.cosas[0].cantidad, 5);
  assert.equal(hoja.cosas[0].listo, 0);
  // marcar listo
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ listo: true }) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT listo FROM evento_org_cosa WHERE id = ?').get(cosaId).listo, 1);
  // un feligrés no puede tocar la cosa (403 por el gate + permiso)
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok(S.feligresId, S.iglesiaId) } });
  assert.equal(res.status, 403);
  // el creador la borra
  res = await fetch(b + `/api/organizacion/cosas/${cosaId}`, { method: 'DELETE', headers: auth });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org_cosa WHERE id = ?').get(cosaId).n, 0);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && node --test test/organizacion.test.js`
Expected: FAIL — `POST /:id/cosas` responde 404 (ruta inexistente).

- [ ] **Step 3: Implementar las rutas de cosas**

En `backend/src/organizacion.js`, ANTES de `export default r;`, añadir:

```js
// ---------- Cosas a llevar ----------
const cosaSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre'),
  cantidad: z.coerce.number().int().min(1).optional()
});
r.post('/:id/cosas', validar(cosaSchema), (req, res) => {
  const org = hojaEditable(req, res, Number(req.params.id));
  if (!org) return;
  const info = db.prepare('INSERT INTO evento_org_cosa (org_id, nombre, cantidad) VALUES (?,?,?)')
    .run(org.id, req.body.nombre, req.body.cantidad || 1);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

const editarCosaSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  cantidad: z.coerce.number().int().min(1).optional(),
  listo: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional()
});
r.patch('/cosas/:cosaId', validar(editarCosaSchema), (req, res) => {
  const cosa = db.prepare('SELECT * FROM evento_org_cosa WHERE id = ?').get(Number(req.params.cosaId));
  if (!cosa) return res.status(404).json({ error: 'Cosa no encontrada' });
  const org = hojaEditable(req, res, cosa.org_id);   // valida iglesia + permiso
  if (!org) return;
  const { nombre, cantidad, listo } = req.body;
  db.prepare('UPDATE evento_org_cosa SET nombre=?, cantidad=?, listo=? WHERE id=?').run(
    nombre ?? cosa.nombre,
    cantidad ?? cosa.cantidad,
    listo === undefined ? cosa.listo : (listo ? 1 : 0),
    cosa.id
  );
  res.json({ ok: true });
});

r.delete('/cosas/:cosaId', (req, res) => {
  const cosa = db.prepare('SELECT * FROM evento_org_cosa WHERE id = ?').get(Number(req.params.cosaId));
  if (!cosa) return res.status(404).json({ error: 'Cosa no encontrada' });
  const org = hojaEditable(req, res, cosa.org_id);
  if (!org) return;
  db.prepare('DELETE FROM evento_org_cosa WHERE id=?').run(cosa.id);
  res.json({ ok: true });
});
```

> Nota de orden de rutas: `/:id/cosas` y `/cosas/:cosaId` no colisionan (una tiene 2 segmentos, la otra empieza por el literal `cosas`). Express las distingue bien.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && node --test test/organizacion.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/organizacion.js backend/test/organizacion.test.js
git commit -m "feat(organizacion): cosas a llevar (anadir, marcar listo, borrar)"
```

---

### Task 4: Gastos + total_gastado

**Files:**
- Modify: `backend/src/organizacion.js`
- Test: `backend/test/organizacion.test.js`

**Interfaces:**
- Consumes: `hojaEditable`, `validar`, `z`.
- Produces:
  - `POST /:id/gastos` `{concepto, monto}` (monto > 0) → `{ok, id}`.
  - `DELETE /gastos/:gastoId` → `{ok}`.
  - `total_gastado` en las respuestas de hoja refleja la suma (ya implementado en `armarHoja`).

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/organizacion.test.js`:

```js
test('gastos: dos gastos suman el total; borrar uno recalcula; monto>0', async () => {
  const b = await servidor();
  const S = sembrarOrg('GAST');
  const auth = { Authorization: 'Bearer ' + tok(S.liderId, S.iglesiaId), 'Content-Type': 'application/json' };
  let res = await fetch(b + '/api/organizacion', { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'Cuentas' }) });
  const { id } = await res.json();

  // monto inválido (0) → 400
  res = await fetch(b + `/api/organizacion/${id}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Nada', monto: 0 }) });
  assert.equal(res.status, 400);

  // dos gastos
  res = await fetch(b + `/api/organizacion/${id}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Jugos', monto: 8000 }) });
  assert.equal(res.status, 200);
  res = await fetch(b + `/api/organizacion/${id}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Pan', monto: 5000 }) });
  const gasto2 = (await res.json()).id;

  // total = 13000
  res = await fetch(b + '/api/organizacion/' + id, { headers: auth });
  let hoja = await res.json();
  assert.equal(hoja.total_gastado, 13000);
  assert.equal(hoja.gastos.length, 2);

  // borrar uno → total = 8000
  res = await fetch(b + `/api/organizacion/gastos/${gasto2}`, { method: 'DELETE', headers: auth });
  assert.equal(res.status, 200);
  res = await fetch(b + '/api/organizacion/' + id, { headers: auth });
  hoja = await res.json();
  assert.equal(hoja.total_gastado, 8000);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && node --test test/organizacion.test.js`
Expected: FAIL — `POST /:id/gastos` responde 404 (ruta inexistente).

- [ ] **Step 3: Implementar las rutas de gastos**

En `backend/src/organizacion.js`, ANTES de `export default r;`, añadir:

```js
// ---------- Gastos (se suman en total_gastado) ----------
const gastoSchema = z.object({
  concepto: z.string().trim().min(1, 'falta el concepto'),
  monto: z.coerce.number().positive('el monto debe ser mayor a 0')
});
r.post('/:id/gastos', validar(gastoSchema), (req, res) => {
  const org = hojaEditable(req, res, Number(req.params.id));
  if (!org) return;
  const info = db.prepare('INSERT INTO evento_org_gasto (org_id, concepto, monto) VALUES (?,?,?)')
    .run(org.id, req.body.concepto, req.body.monto);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

r.delete('/gastos/:gastoId', (req, res) => {
  const gasto = db.prepare('SELECT * FROM evento_org_gasto WHERE id = ?').get(Number(req.params.gastoId));
  if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });
  const org = hojaEditable(req, res, gasto.org_id);
  if (!org) return;
  db.prepare('DELETE FROM evento_org_gasto WHERE id=?').run(gasto.id);
  res.json({ ok: true });
});
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && node --test test/organizacion.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/organizacion.js backend/test/organizacion.test.js
git commit -m "feat(organizacion): gastos del evento con total que se suma"
```

---

### Task 5: Cascada al borrar un evento + suite completa

**Files:**
- Modify: `backend/src/eventos.js` (la transacción de `DELETE /:id`, ~líneas 265-276)
- Test: `backend/test/organizacion.test.js`

**Interfaces:**
- Produces: al borrar un evento, su `evento_org` (y cosas/gastos) se borra en la misma transacción; sin referencias huérfanas.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/organizacion.test.js`:

```js
test('borrar el evento borra su hoja de organización (cascada)', async () => {
  const b = await servidor();
  const S = sembrarOrg('CASC');
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha, grupo_id, estado, creado_por) VALUES (?, 'Borrable', '2026-08-20', ?, 'aprobado', ?)").run(S.iglesiaId, S.grupoId, S.pastorId);
  const eventoId = Number(ev.lastInsertRowid);
  const auth = { Authorization: 'Bearer ' + tok(S.pastorId, S.iglesiaId), 'Content-Type': 'application/json' };
  // abrir hoja (la crea) + una cosa + un gasto
  let res = await fetch(b + '/api/organizacion/evento/' + eventoId, { headers: auth });
  const hojaId = (await res.json()).id;
  await fetch(b + `/api/organizacion/${hojaId}/cosas`, { method: 'POST', headers: auth, body: JSON.stringify({ nombre: 'Sillas', cantidad: 10 }) });
  await fetch(b + `/api/organizacion/${hojaId}/gastos`, { method: 'POST', headers: auth, body: JSON.stringify({ concepto: 'Arriendo', monto: 20000 }) });

  // borrar el evento vía su endpoint (el pastor puede)
  res = await fetch(b + '/api/eventos/' + eventoId, { method: 'DELETE', headers: auth });
  assert.equal(res.status, 200);

  // no queda ni la hoja ni sus hijos, ni referencias rotas
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org WHERE id = ?').get(hojaId).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org_cosa WHERE org_id = ?').get(hojaId).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM evento_org_gasto WHERE org_id = ?').get(hojaId).n, 0);
  db.exec('PRAGMA foreign_keys = ON');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0, 'quedaron referencias huérfanas');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && node --test test/organizacion.test.js`
Expected: FAIL — tras borrar el evento, la hoja sigue existiendo (`evento_org` no se borra) y/o `foreign_key_check` encuentra huérfanos.

- [ ] **Step 3: Añadir la cascada en `eventos.js`**

En `backend/src/eventos.js`, dentro de la transacción del `DELETE /:id` (el bloque `db.exec('BEGIN'); try { ... }`), añadir estas líneas ANTES de `db.prepare('DELETE FROM evento WHERE id=?').run(ev.id);`:

```js
    // Hoja(s) de organización del evento: borra cosas + gastos + la hoja.
    db.prepare('DELETE FROM evento_org_cosa  WHERE org_id IN (SELECT id FROM evento_org WHERE evento_id=?)').run(ev.id);
    db.prepare('DELETE FROM evento_org_gasto WHERE org_id IN (SELECT id FROM evento_org WHERE evento_id=?)').run(ev.id);
    db.prepare('DELETE FROM evento_org WHERE evento_id=?').run(ev.id);
```

- [ ] **Step 4: Correr TODA la suite y verificar que pasa**

Run: `cd backend && node --test`
Expected: PASS — toda la suite (los tests previos del proyecto + los 7 de organización).

- [ ] **Step 5: Commit**

```bash
git add backend/src/eventos.js backend/test/organizacion.test.js
git commit -m "feat(organizacion): borrar un evento borra su hoja de organizacion"
```

---

### Task 6: Frontend — apartado "Organización" + hoja + botón en evento

**Files:**
- Modify: `web/app.js` (NAV, `NAV_ICON`, `tieneModulo`, `navTo`, `verDia`; nuevo bloque `Org`)
- Modify: `web/styles.css` (estilos mínimos)

**Interfaces:**
- Consumes: `api`, `escHtml`, `toast`, `conBoton`, `botonActual`, `puedePublicar`, `fechaTxt`, endpoints de Tasks 2-4.
- Produces: apartado `organizacion` en el menú (visible a líderes), `vistaOrganizacion()`, objeto `Org` con `abrir(id)`, `abrirEvento(eventoId)`, `nuevaHoja()`, y handlers de cosas/gastos.

- [ ] **Step 1: Añadir el item de menú y sus enganches**

En `web/app.js`, en el array `NAV` (línea ~8), añadir tras `['tesoreria','💰','Tesorería'],`:

```js
  ['organizacion','🗒️','Organización'],
```

En `NAV_ICON` (objeto que empieza ~línea 313), añadir una entrada (icono de portapapeles):

```js
  organizacion:_ic('<rect x="8" y="4" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><path d="M8 12h8M8 16h5"/>'),
```

En `tieneModulo(k)` (función ~línea 274), añadir antes del `return mods.includes(k);` final:

```js
  if(k==='organizacion') return puedePublicar();   // solo líderes/pastor
```

En `navTo(key)` (el bloque de `return vista...`, ~línea 475), añadir:

```js
  if(key==='organizacion') return vistaOrganizacion();
```

- [ ] **Step 2: Añadir el bloque `Org` (lista + hoja + handlers)**

En `web/app.js`, al final del archivo (o junto a las demás vistas), pegar este bloque completo:

```js
// ============================================================
//  ORGANIZACIÓN DE EVENTOS: hoja de cosas a llevar + gastos (total que se suma).
//  Ver: líderes/pastor. Editar: solo el creador o el pastor (lo dice puede_editar).
// ============================================================
function fmtMonto(n){ return '$'+Number(n||0).toLocaleString('es-CL'); }

async function vistaOrganizacion(){
  const c=$('content');
  c.innerHTML=`<div class="head-row"><h2>🗒️ Organización</h2>
    <button class="btn small-btn" onclick="Org.nuevaHoja()">➕ Nueva lista</button></div>
    <div id="org-lista" class="muted">Cargando…</div>`;
  try{
    const hojas=await api('/organizacion');
    const z=$('org-lista'); z.className='';
    z.innerHTML = hojas.length ? hojas.map(h=>{
      const titulo = h.evento_titulo || h.titulo || '(sin título)';
      const fecha = h.evento_fecha || h.fecha;
      return `<div class="item-card flex" style="margin-top:10px;cursor:pointer" onclick="Org.abrir(${h.id})">
        <div style="flex:1"><div class="item-titulo">${escHtml(titulo)}</div>
          <div class="muted small">${h.evento_id?'📅 De un evento':'📝 Lista suelta'}${fecha?' · '+fechaTxt(fecha):''} · ${h.n_cosas||0} cosa(s)</div></div>
        <div style="text-align:right"><b>${fmtMonto(h.total_gastado)}</b><div class="muted small">gastado</div></div>
      </div>`;
    }).join('') : '<p class="muted small">Aún no hay listas. Crea una con "Nueva lista".</p>';
  }catch(e){ const z=$('org-lista'); z.className='error'; z.textContent=(e&&e.message)||'No se pudo cargar'; }
}

const Org = {
  // Crea una lista suelta (pide título) y la abre.
  async nuevaHoja(){
    const titulo=prompt('Título de la lista (ej. "Almuerzo de jóvenes")'); if(!titulo||!titulo.trim()) return;
    await conBoton(botonActual(), async()=>{
      try{ const r=await api('/organizacion',{method:'POST',body:JSON.stringify({titulo:titulo.trim()})}); Org.abrir(r.id); }
      catch(e){ toast((e&&e.message)||'No se pudo crear'); }
    });
  },
  // Abre la hoja de un evento (la crea vacía la 1a vez).
  async abrirEvento(eventoId){
    try{ const h=await api('/organizacion/evento/'+eventoId); Org._render(h); }
    catch(e){ toast((e&&e.message)||'No se pudo abrir'); }
  },
  // Abre una hoja por id.
  async abrir(id){
    try{ const h=await api('/organizacion/'+id); Org._render(h); }
    catch(e){ toast((e&&e.message)||'No se pudo abrir'); }
  },
  _hoja:null,
  _render(h){
    Org._hoja=h;
    const ed=!!h.puede_editar;
    const titulo=(h.evento&&h.evento.titulo)||h.titulo||'(sin título)';
    const fecha=(h.evento&&h.evento.fecha)||h.fecha;
    const cosas=h.cosas.map(x=>`<div class="org-row">
        <label class="org-check"><input type="checkbox" ${x.listo?'checked':''} ${ed?'':'disabled'} onchange="Org.toggleCosa(${x.id}, this.checked)">
          <span class="${x.listo?'org-listo':''}">${escHtml(x.nombre)} <b>×${x.cantidad}</b></span></label>
        ${ed?`<button class="link" style="color:var(--red)" onclick="Org.borrarCosa(${x.id})">✕</button>`:''}
      </div>`).join('') || '<p class="muted small">Sin cosas todavía.</p>';
    const gastos=h.gastos.map(g=>`<div class="org-row">
        <span>${escHtml(g.concepto)} — <b>${fmtMonto(g.monto)}</b></span>
        ${ed?`<button class="link" style="color:var(--red)" onclick="Org.borrarGasto(${g.id})">✕</button>`:''}
      </div>`).join('') || '<p class="muted small">Sin gastos todavía.</p>';

    $('content').innerHTML=`
      <div class="head-row"><h2>🗒️ ${escHtml(titulo)}</h2>
        <button class="btn ghost small-btn" onclick="vistaOrganizacion()">← Volver</button></div>
      <div class="card">
        <div class="muted small">${h.evento_id?'📅 De un evento':'📝 Lista suelta'}${fecha?' · '+fechaTxt(fecha):''}</div>
        <div style="margin-top:10px"><b>🕐 Hora de llegada:</b>
          ${ed?`<input id="org-hora" type="time" value="${h.hora_llegada||''}" onchange="Org.guardarHora(this.value)" style="max-width:130px;display:inline-block">`
              :`<span>${escHtml(h.hora_llegada||'—')}</span>`}</div>
      </div>
      <div class="card" style="margin-top:14px"><h3 style="font-size:16px">📦 Cosas a llevar</h3>
        <div id="org-cosas">${cosas}</div>
        ${ed?`<div class="row" style="gap:6px;margin-top:10px">
          <input id="org-cosa-nombre" placeholder="Ej. Jugos nectar">
          <input id="org-cosa-cant" type="number" min="1" value="1" style="max-width:80px">
          <button class="btn small-btn" onclick="Org.addCosa()">Añadir</button></div>`:''}
      </div>
      <div class="card" style="margin-top:14px"><h3 style="font-size:16px">💵 Gastos</h3>
        <div id="org-gastos">${gastos}</div>
        <div class="org-total">Total gastado: <b>${fmtMonto(h.total_gastado)}</b></div>
        ${ed?`<div class="row" style="gap:6px;margin-top:10px">
          <input id="org-gasto-concepto" placeholder="Ej. Pan">
          <input id="org-gasto-monto" type="number" min="1" placeholder="Monto" style="max-width:110px">
          <button class="btn small-btn" onclick="Org.addGasto()">Añadir</button></div>`:''}
        ${ed?`<div style="margin-top:16px;text-align:right"><button class="link" style="color:var(--red)" onclick="Org.borrarHoja()">🗑️ Borrar esta lista</button></div>`:''}
      </div>`;
  },
  _recargar(){ if(Org._hoja) Org.abrir(Org._hoja.id); },
  async addCosa(){
    const nombre=$('org-cosa-nombre').value.trim(); const cantidad=Number($('org-cosa-cant').value)||1;
    if(!nombre) return toast('Escribe qué llevar');
    await conBoton(botonActual(), async()=>{
      try{ await api('/organizacion/'+Org._hoja.id+'/cosas',{method:'POST',body:JSON.stringify({nombre,cantidad})}); Org._recargar(); }
      catch(e){ toast((e&&e.message)||'No se pudo añadir'); }
    });
  },
  async toggleCosa(id, listo){
    try{ await api('/organizacion/cosas/'+id,{method:'PATCH',body:JSON.stringify({listo})}); }
    catch(e){ toast((e&&e.message)||'No se pudo actualizar'); Org._recargar(); }
  },
  async borrarCosa(id){
    await conBoton(botonActual(), async()=>{
      try{ await api('/organizacion/cosas/'+id,{method:'DELETE'}); Org._recargar(); }
      catch(e){ toast((e&&e.message)||'No se pudo borrar'); }
    });
  },
  async addGasto(){
    const concepto=$('org-gasto-concepto').value.trim(); const monto=Number($('org-gasto-monto').value);
    if(!concepto) return toast('Escribe el concepto');
    if(!(monto>0)) return toast('El monto debe ser mayor a 0');
    await conBoton(botonActual(), async()=>{
      try{ await api('/organizacion/'+Org._hoja.id+'/gastos',{method:'POST',body:JSON.stringify({concepto,monto})}); Org._recargar(); }
      catch(e){ toast((e&&e.message)||'No se pudo añadir'); }
    });
  },
  async borrarGasto(id){
    await conBoton(botonActual(), async()=>{
      try{ await api('/organizacion/gastos/'+id,{method:'DELETE'}); Org._recargar(); }
      catch(e){ toast((e&&e.message)||'No se pudo borrar'); }
    });
  },
  async guardarHora(v){
    try{ await api('/organizacion/'+Org._hoja.id,{method:'PATCH',body:JSON.stringify({hora_llegada:v})}); toast('✅ Hora guardada'); }
    catch(e){ toast((e&&e.message)||'No se pudo guardar'); }
  },
  borrarHoja(){
    modalConfirm('¿Borrar esta lista con sus cosas y gastos? No se puede deshacer.', async()=>{
      try{ await api('/organizacion/'+Org._hoja.id,{method:'DELETE'}); toast('🗑️ Lista borrada'); vistaOrganizacion(); }
      catch(e){ toast((e&&e.message)||'No se pudo borrar'); }
    }, { okLabel:'Sí, borrar', danger:true });
  }
};
```

- [ ] **Step 3: Botón "Organización" dentro de cada evento (para líderes)**

En `web/app.js`, dentro de `verDia(fecha)` (~línea 751), en la columna de acciones del evento, añadir el botón para líderes. Reemplazar:

```js
      ${(puede||puedeBorrar)?`<div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
        ${puede?`<button class="link" onclick="editarEvento(${e.id})">✏️ Editar</button>`:''}
        ${puedeBorrar?`<button class="link" style="color:var(--red)" onclick="borrarEvento(${e.id})">🗑️ Borrar</button>`:''}
      </div>`:''}</div>`;
```

por (añade el botón de organización, visible a cualquier líder/pastor):

```js
      ${(puede||puedeBorrar||puedePublicar())?`<div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
        ${puedePublicar()?`<button class="link" onclick="Org.abrirEvento(${e.id})">🗒️ Organización</button>`:''}
        ${puede?`<button class="link" onclick="editarEvento(${e.id})">✏️ Editar</button>`:''}
        ${puedeBorrar?`<button class="link" style="color:var(--red)" onclick="borrarEvento(${e.id})">🗑️ Borrar</button>`:''}
      </div>`:''}</div>`;
```

- [ ] **Step 4: Estilos mínimos**

En `web/styles.css`, al final del archivo, añadir:

```css
/* Organización de eventos */
.org-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);}
.org-row:last-child{border-bottom:none;}
.org-check{display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;}
.org-listo{text-decoration:line-through;color:var(--muted);}
.org-total{margin-top:10px;padding-top:10px;border-top:2px solid var(--border);text-align:right;font-size:1.1rem;}
```

- [ ] **Step 5: Verificar en el navegador (Playwright) y commit**

Verificación manual/automatizada (reusar `scripts/with_server.py` con `SUPERADMIN_PASSWORD` y una BD temporal; o probar con un usuario líder de la demo): entrar como líder, abrir "Organización", crear una lista suelta, añadir 2 cosas y marcar una, añadir 2 gastos y ver el total, volver, y abrir la hoja de un evento desde el calendario (día → evento → "🗒️ Organización"). Sin errores de consola.

```bash
git add web/app.js web/styles.css
git commit -m "feat(organizacion): apartado Organizacion + hoja de cosas y gastos"
```

---

## Notas de cierre (no son tareas)

- Al terminar las 6 tareas: correr la suite completa (`cd backend && node --test`, debe seguir verde) y una pasada visual del apartado en el navegador (claro y oscuro).
- Fusionar `feat/organizacion-eventos` (o la rama que se use) a `main`; Pablo hace push con GitHub Desktop (push a `main` = redeploy en Render). Ver [[app-iglesia-deploy]].
- Fuera de alcance v1 (del spec): integración con Tesorería, costo/responsable por línea, plantillas, export PDF, notificaciones "trae tu parte".

## Self-Review (hecho)

- **Cobertura del spec:** modelo (T1), permisos ver/editar (T2), hoja suelta + lazy evento (T2), cosas (T3), gastos+total (T4), cascada evento (T5) e iglesia (ya cubierta por `eliminarIglesia.js`, sin cambios), frontend nav+hoja+botón (T6), pruebas backend + Playwright. ✔
- **Placeholders:** ninguno; todo el código va completo. ✔
- **Consistencia de tipos:** `puedeEditarOrg/armarHoja/hojaEditable` definidos en T2 y reusados en T3/T4; `total_gastado`, `puede_editar`, `evento_org(_cosa/_gasto)` con los mismos nombres en todo el plan; endpoints del frontend calzan con las rutas del backend. ✔
