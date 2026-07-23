# Consentimiento legal + ARCO (autoservicio) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar de forma trazable el consentimiento general (Términos + Privacidad) de toda persona usuaria y permitirle ejercer sus derechos ARCO por autoservicio (descargar datos, retirar consentimiento = anonimizar cuenta).

**Architecture:** Backend Node ESM + Express + `node:sqlite`. Una tabla append-only `consentimiento` guarda el historial (otorgado/revocado + versión + fecha/IP). Un módulo `consentimiento.js` centraliza la versión vigente, el chequeo de vigencia y el registro. El registro nuevo y una puerta bloqueante en `/me` obligan a aceptar; una sección en Ajustes ofrece descargar-mis-datos y eliminar-mi-cuenta (anonimización). Frontend vanilla JS en `web/app.js`.

**Tech Stack:** Node.js ESM, Express, `node:sqlite` (`DatabaseSync`), `zod`, `node:test`, Playwright (verificación visual).

## Global Constraints

- BD = `node:sqlite` (`DatabaseSync`), **NO** better-sqlite3. Tablas nuevas con `CREATE TABLE IF NOT EXISTS`; columnas con el helper `agregarColumna` de `db.js`.
- Routers Express con `import { Router } from 'express'`; sesión vía `authMiddleware` (expone `req.user.persona_id` y `req.user.iglesia_id`).
- Validación de entrada con `zod` + el helper `validar(schema)` de `seguridad.js`.
- Tests con `node:test` + `node:assert/strict`, usando `backend/test/helpers.js` (`cargarDb`, `reiniciar`, `sembrarMinimo`) y `signToken` de `auth.js`. Los tests corren con `DISABLE_RATE_LIMIT=1` (lo fija `helpers.js`).
- Auditoría con `auditar(iglesia_id, persona_id, accion, entidad, detalle?)` de `auth.js`.
- Enlaces legales existentes: `/legal/terminos.html`, `/legal/privacidad.html` (servidos por `express.static(webDir)`).
- Correr tests: `cd backend && node --test`.
- Mensajes de commit terminan con:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Versión de consentimiento inicial: `CONSENT_VERSION = "2026-07-23"`.

---

### Task 1: Modelo de datos + módulo `consentimiento` (helpers)

**Files:**
- Modify: `backend/src/db.js` (zona de `CREATE TABLE` y de índices, ~línea 505-545)
- Modify: `backend/test/helpers.js:25` (añadir `consentimiento` a la lista de `reiniciar`)
- Create: `backend/src/consentimiento.js`
- Test: `backend/test/consentimiento.test.js`

**Interfaces:**
- Produces:
  - `CONSENT_VERSION: string` (constante exportada, `"2026-07-23"`).
  - `tieneConsentimientoVigente(personaId: number, tipo?: string='general') -> boolean`
  - `registrarConsentimiento(personaId: number, iglesiaId: number, accion: 'otorgado'|'revocado', req?) -> void`

- [ ] **Step 1: Crear la tabla en `db.js`**

En `backend/src/db.js`, junto a los otros `CREATE TABLE IF NOT EXISTS` (antes de la sección "Migracion aditiva", ~línea 510), añadir:

```js
db.exec(`
CREATE TABLE IF NOT EXISTS consentimiento (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL,
  persona_id  INTEGER NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'general',
  version     TEXT NOT NULL,
  accion      TEXT NOT NULL,
  fecha       TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT
);
`);
```

Y en la sección de índices (dentro del `db.exec(\`...\`)` que empieza ~línea 543) añadir una línea:

```sql
  CREATE INDEX IF NOT EXISTS idx_consentimiento_persona ON consentimiento(persona_id, tipo, id);
```

- [ ] **Step 2: Añadir `consentimiento` al reset de tests**

En `backend/test/helpers.js:25`, añadir `'consentimiento'` a la lista de tablas que borra `reiniciar` (al principio de la lista, antes de `'mensaje'`):

```js
  for (const t of ['consentimiento', 'mensaje', 'conversacion_miembro', 'conversacion', 'notificacion', 'recordatorio_enviado', 'pertenencia', 'grupo', 'persona', 'iglesia'])
```

- [ ] **Step 3: Escribir el test que falla**

Crear `backend/test/consentimiento.test.js`:

```js
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, SEM, CONSENT_VERSION, tieneConsentimientoVigente, registrarConsentimiento;

before(async () => {
  db = await cargarDb();
  ({ CONSENT_VERSION, tieneConsentimientoVigente, registrarConsentimiento } = await import('../src/consentimiento.js'));
});
beforeEach(() => { reiniciar(db); SEM = sembrarMinimo(db); });

test('sin filas: no hay consentimiento vigente', () => {
  assert.equal(tieneConsentimientoVigente(SEM.miembro1.id), false);
});

test('tras registrar otorgado con la version vigente: vigente=true', () => {
  registrarConsentimiento(SEM.miembro1.id, SEM.iglesiaId, 'otorgado');
  assert.equal(tieneConsentimientoVigente(SEM.miembro1.id), true);
  const fila = db.prepare('SELECT * FROM consentimiento WHERE persona_id = ?').get(SEM.miembro1.id);
  assert.equal(fila.accion, 'otorgado');
  assert.equal(fila.version, CONSENT_VERSION);
  assert.ok(fila.fecha);
});

test('la ultima accion manda: otorgado -> revocado => vigente=false', () => {
  registrarConsentimiento(SEM.miembro1.id, SEM.iglesiaId, 'otorgado');
  registrarConsentimiento(SEM.miembro1.id, SEM.iglesiaId, 'revocado');
  assert.equal(tieneConsentimientoVigente(SEM.miembro1.id), false);
});

test('una version distinta a la vigente no cuenta como vigente', () => {
  db.prepare("INSERT INTO consentimiento (iglesia_id, persona_id, tipo, version, accion, fecha) VALUES (?,?,?,?,?,datetime('now'))")
    .run(SEM.iglesiaId, SEM.miembro1.id, 'general', 'vieja-0.0', 'otorgado');
  assert.equal(tieneConsentimientoVigente(SEM.miembro1.id), false);
});
```

- [ ] **Step 4: Correr el test y verlo fallar**

Run: `cd backend && node --test test/consentimiento.test.js`
Expected: FALLA con "Cannot find module '../src/consentimiento.js'".

- [ ] **Step 5: Implementar `consentimiento.js` (solo helpers, sin router todavía)**

Crear `backend/src/consentimiento.js`:

```js
// ============================================================
//  Consentimiento legal general (Terminos + Privacidad).
//  Tabla append-only: cada accion (otorgado/revocado) es una fila
//  nueva -> historial trazable + revocable. La vigencia = la ultima
//  fila de la persona es 'otorgado' Y su version == la vigente.
// ============================================================
import db from './db.js';

export const CONSENT_VERSION = '2026-07-23';

export function tieneConsentimientoVigente(personaId, tipo = 'general') {
  const fila = db.prepare(
    'SELECT accion, version FROM consentimiento WHERE persona_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1'
  ).get(personaId, tipo);
  return !!fila && fila.accion === 'otorgado' && fila.version === CONSENT_VERSION;
}

export function registrarConsentimiento(personaId, iglesiaId, accion, req) {
  db.prepare(
    `INSERT INTO consentimiento (iglesia_id, persona_id, tipo, version, accion, fecha, ip, user_agent)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(
    iglesiaId, personaId, 'general', CONSENT_VERSION, accion,
    new Date().toISOString(),
    req ? String(req.ip || '') : null,
    req ? String(req.get?.('user-agent') || '') : null
  );
}
```

- [ ] **Step 6: Correr los tests y verlos pasar**

Run: `cd backend && node --test test/consentimiento.test.js`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/db.js backend/src/consentimiento.js backend/test/consentimiento.test.js backend/test/helpers.js
git commit -m "feat(consentimiento): tabla append-only + helpers de vigencia/registro

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Router `/api/consentimiento` + flag en `/api/me`

**Files:**
- Modify: `backend/src/consentimiento.js` (añadir router)
- Modify: `backend/src/server.js` (montar router + flag en `/api/me`)
- Test: `backend/test/consentimiento.test.js` (añadir casos de endpoint)

**Interfaces:**
- Consumes: `CONSENT_VERSION`, `tieneConsentimientoVigente`, `registrarConsentimiento` (Task 1).
- Produces:
  - `GET /api/consentimiento/estado` -> `{ vigente: bool, version: string, fecha: string|null }`
  - `POST /api/consentimiento/aceptar` -> `{ ok: true }`
  - `/api/me` ahora incluye `consentimiento_pendiente: bool` en el objeto raíz.
  - Export `default` del router en `consentimiento.js`.

- [ ] **Step 1: Escribir el test que falla (endpoints)**

Añadir al final de `backend/test/consentimiento.test.js`. Primero, ampliar el `before` para levantar el server (reemplazar el bloque `before` existente por este):

```js
let srv, base, signToken;
before(async () => {
  db = await cargarDb();
  ({ CONSENT_VERSION, tieneConsentimientoVigente, registrarConsentimiento } = await import('../src/consentimiento.js'));
  ({ signToken } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
import { after } from 'node:test';
after(() => new Promise(r => srv.close(r)));

const H = (p) => ({ 'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: SEM.iglesiaId }) });
```

Y añadir los tests:

```js
test('GET /api/consentimiento/estado: pendiente cuando no hay consentimiento', async () => {
  const res = await fetch(base + '/api/consentimiento/estado', { headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.vigente, false);
});

test('POST /api/consentimiento/aceptar: registra otorgado y luego estado=vigente', async () => {
  let res = await fetch(base + '/api/consentimiento/aceptar', { method: 'POST', headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  res = await fetch(base + '/api/consentimiento/estado', { headers: H(SEM.miembro1) });
  const j = await res.json();
  assert.equal(j.vigente, true);
  assert.equal(j.version, CONSENT_VERSION);
});

test('GET /api/me: consentimiento_pendiente refleja el estado', async () => {
  let res = await fetch(base + '/api/me', { headers: H(SEM.miembro1) });
  let j = await res.json();
  assert.equal(j.consentimiento_pendiente, true);
  await fetch(base + '/api/consentimiento/aceptar', { method: 'POST', headers: H(SEM.miembro1) });
  res = await fetch(base + '/api/me', { headers: H(SEM.miembro1) });
  j = await res.json();
  assert.equal(j.consentimiento_pendiente, false);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && node --test test/consentimiento.test.js`
Expected: FALLA (404 en `/api/consentimiento/estado`; `consentimiento_pendiente` indefinido en `/me`).

- [ ] **Step 3: Añadir el router en `consentimiento.js`**

Al final de `backend/src/consentimiento.js`, antes de nada más, añadir imports arriba y el router abajo:

```js
import { Router } from 'express';
import { authMiddleware } from './auth.js';

const r = Router();
r.use(authMiddleware);

r.get('/estado', (req, res) => {
  const fila = db.prepare(
    "SELECT version, fecha FROM consentimiento WHERE persona_id = ? AND tipo = 'general' AND accion = 'otorgado' ORDER BY id DESC LIMIT 1"
  ).get(req.user.persona_id);
  res.json({
    vigente: tieneConsentimientoVigente(req.user.persona_id),
    version: CONSENT_VERSION,
    fecha: fila ? fila.fecha : null
  });
});

r.post('/aceptar', (req, res) => {
  registrarConsentimiento(req.user.persona_id, req.user.iglesia_id, 'otorgado', req);
  res.json({ ok: true });
});

export default r;
```

(El `import db` ya existe al inicio del archivo; añade `Router` y `authMiddleware`.)

- [ ] **Step 4: Montar router + flag en `server.js`**

En `backend/src/server.js`, junto a los otros imports de routers (~línea 42):

```js
import consentimientoRouter, { tieneConsentimientoVigente } from './consentimiento.js';
```

Montar el router junto a los demás `app.use('/api/...')` (~línea 262):

```js
app.use('/api/consentimiento', consentimientoRouter);
```

Y en el handler `GET /api/me` (~línea 204), añadir el flag al objeto de respuesta:

```js
  res.json({
    persona: perfilPublico(persona),
    iglesia,
    roles: getRoles(persona.id),
    modulos: modulosVisibles(persona.id),
    consentimiento_pendiente: !tieneConsentimientoVigente(persona.id)
  });
```

- [ ] **Step 5: Correr los tests y verlos pasar**

Run: `cd backend && node --test test/consentimiento.test.js`
Expected: PASS (7 tests).

- [ ] **Step 6: Correr TODA la suite (no romper nada)**

Run: `cd backend && node --test`
Expected: todos en verde.

- [ ] **Step 7: Commit**

```bash
git add backend/src/consentimiento.js backend/src/server.js backend/test/consentimiento.test.js
git commit -m "feat(consentimiento): endpoints estado/aceptar + flag en /api/me

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Captura de consentimiento en el registro público

**Files:**
- Modify: `backend/src/registro.js`
- Test: `backend/test/registro-consentimiento.test.js`

**Interfaces:**
- Consumes: `registrarConsentimiento` (Task 1).
- Produces: `POST /api/registro` ahora exige `acepto === true` y, al crear la cuenta, inserta una fila `otorgado`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/registro-consentimiento.test.js`:

```js
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, SEM, srv, base;
before(async () => {
  db = await cargarDb();
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));
beforeEach(() => { reiniciar(db); SEM = sembrarMinimo(db); });

const J = { 'Content-Type': 'application/json' };

test('registro SIN acepto -> 400 y no crea persona', async () => {
  const antes = db.prepare('SELECT COUNT(*) AS n FROM persona').get().n;
  const res = await fetch(base + '/api/registro', {
    method: 'POST', headers: J,
    body: JSON.stringify({ codigo: 'TEST', nombre: 'Nuevo', usuario: 'nuevo1', password: 'clave1234' })
  });
  assert.equal(res.status, 400);
  const despues = db.prepare('SELECT COUNT(*) AS n FROM persona').get().n;
  assert.equal(despues, antes);
});

test('registro CON acepto:true -> crea persona y fila consentimiento otorgado', async () => {
  const res = await fetch(base + '/api/registro', {
    method: 'POST', headers: J,
    body: JSON.stringify({ codigo: 'TEST', nombre: 'Nuevo', usuario: 'nuevo2', password: 'clave1234', acepto: true })
  });
  assert.equal(res.status, 200);
  const p = db.prepare("SELECT id FROM persona WHERE usuario = 'nuevo2'").get();
  assert.ok(p);
  const c = db.prepare("SELECT * FROM consentimiento WHERE persona_id = ? AND accion = 'otorgado'").get(p.id);
  assert.ok(c, 'se registro el consentimiento');
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && node --test test/registro-consentimiento.test.js`
Expected: FALLA (el 1er test: hoy el registro crea la persona aunque no venga `acepto`).

- [ ] **Step 3: Implementar en `registro.js`**

En `backend/src/registro.js`: añadir el import (junto a los demás):

```js
import { registrarConsentimiento } from './consentimiento.js';
```

Añadir `acepto` al `registroSchema` (obligatorio, debe ser `true`):

```js
const registroSchema = z.object({
  codigo: z.string().trim().min(1, 'falta el codigo de la iglesia'),
  nombre: z.string().trim().min(1, 'falta el nombre'),
  usuario: z.string().trim().min(1, 'falta el usuario'),
  password: z.string().min(6, 'la contraseña debe tener al menos 6 caracteres'),
  email: z.string().trim().email('correo invalido').optional().or(z.literal('')),
  telefono: z.string().trim().max(50).optional().or(z.literal('')),
  acepto: z.literal(true, { errorMap: () => ({ message: 'debes aceptar los Términos y la Política de Privacidad' }) })
});
```

Tras crear la persona (después de `const persona = db.prepare(...).get(info.lastInsertRowid);`, línea ~56) y antes de firmar el token, registrar el consentimiento:

```js
  registrarConsentimiento(persona.id, iglesia.id, 'otorgado', req);
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `cd backend && node --test test/registro-consentimiento.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/registro.js backend/test/registro-consentimiento.test.js
git commit -m "feat(registro): exigir y registrar el consentimiento al crear cuenta

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: ARCO backend — descargar mis datos + eliminar (anonimizar) con guarda

**Files:**
- Modify: `backend/src/cuenta.js`
- Test: `backend/test/cuenta-arco.test.js`

**Interfaces:**
- Consumes: `registrarConsentimiento` (Task 1); `authMiddleware`, `hashPassword`, `auditar` (ya importados en `cuenta.js`).
- Produces:
  - `GET /api/cuenta/mis-datos` -> `{ perfil, grupos: string[], consentimientos: [...] }`
  - `POST /api/cuenta/eliminar` -> `{ ok: true }` (200) o `{ error }` (409 si guarda activa).

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/cuenta-arco.test.js`:

```js
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let db, SEM, srv, base, signToken;
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

const H = (p) => ({ 'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: SEM.iglesiaId }) });

test('GET /api/cuenta/mis-datos: devuelve mi perfil y mis grupos', async () => {
  const res = await fetch(base + '/api/cuenta/mis-datos', { headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.perfil.usuario, 'miembro1');
  assert.ok(Array.isArray(j.grupos));
  assert.ok(j.grupos.includes('Jovenes'));
  assert.ok(Array.isArray(j.consentimientos));
});

test('POST /api/cuenta/eliminar: anonimiza la persona y escribe revocado', async () => {
  db.prepare("UPDATE persona SET email='m1@test.com', telefono='+56911', foto_url='/uploads/x.jpg' WHERE id = ?").run(SEM.miembro1.id);
  const res = await fetch(base + '/api/cuenta/eliminar', { method: 'POST', headers: H(SEM.miembro1) });
  assert.equal(res.status, 200);
  const p = db.prepare('SELECT * FROM persona WHERE id = ?').get(SEM.miembro1.id);
  assert.equal(p.nombre, 'Usuario eliminado');
  assert.equal(p.email, null);
  assert.equal(p.telefono, null);
  assert.equal(p.foto_url, null);
  assert.equal(p.activo, 0);
  assert.match(p.usuario, /^eliminado_/);
  const c = db.prepare("SELECT * FROM consentimiento WHERE persona_id = ? AND accion = 'revocado'").get(SEM.miembro1.id);
  assert.ok(c, 'se registro la revocacion');
  // la pertenencia historica NO se borra (queda anonimizada)
  const per = db.prepare('SELECT COUNT(*) AS n FROM pertenencia WHERE persona_id = ?').get(SEM.miembro1.id).n;
  assert.equal(per, 1);
});

test('guarda: el super-admin no puede auto-eliminarse -> 409', async () => {
  db.prepare("UPDATE persona SET rol_global = 'super_admin' WHERE id = ?").run(SEM.miembro2.id);
  const res = await fetch(base + '/api/cuenta/eliminar', { method: 'POST', headers: H(SEM.miembro2) });
  assert.equal(res.status, 409);
  const p = db.prepare('SELECT activo FROM persona WHERE id = ?').get(SEM.miembro2.id);
  assert.equal(p.activo, 1);
});

test('guarda: el unico pastor activo no puede auto-eliminarse -> 409', async () => {
  const res = await fetch(base + '/api/cuenta/eliminar', { method: 'POST', headers: H(SEM.pastor) });
  assert.equal(res.status, 409);
});

test('un segundo pastor SI puede eliminarse (no es el unico)', async () => {
  db.prepare('UPDATE persona SET es_pastor = 1 WHERE id = ?').run(SEM.lider.id);
  const res = await fetch(base + '/api/cuenta/eliminar', { method: 'POST', headers: H(SEM.lider) });
  assert.equal(res.status, 200);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && node --test test/cuenta-arco.test.js`
Expected: FALLA (404 en las rutas nuevas).

- [ ] **Step 3: Implementar en `cuenta.js`**

En `backend/src/cuenta.js`: añadir imports arriba:

```js
import crypto from 'node:crypto';   // (ya está importado en el archivo)
import fs from 'node:fs';
import path from 'node:path';
import { registrarConsentimiento } from './consentimiento.js';
```

Antes de `export default r;` (después de la ruta `/password`, ~línea 135), añadir:

```js
// --- ARCO: descargar mis datos (derecho de acceso) ---
r.get('/mis-datos', (req, res) => {
  const p = db.prepare('SELECT usuario, nombre, email, telefono, cumple, foto_url FROM persona WHERE id = ?').get(req.user.persona_id);
  const grupos = db.prepare(
    `SELECT g.nombre FROM grupo g JOIN pertenencia pe ON pe.grupo_id = g.id
      WHERE pe.persona_id = ? ORDER BY g.nombre`
  ).all(req.user.persona_id).map(g => g.nombre);
  const consentimientos = db.prepare(
    'SELECT tipo, version, accion, fecha FROM consentimiento WHERE persona_id = ? ORDER BY id'
  ).all(req.user.persona_id);
  res.json({ perfil: p, grupos, consentimientos });
});

// --- ARCO: retirar consentimiento = eliminar (anonimizar) mi cuenta ---
r.post('/eliminar', (req, res) => {
  const pid = req.user.persona_id, iid = req.user.iglesia_id;
  const yo = db.prepare('SELECT * FROM persona WHERE id = ?').get(pid);
  if (!yo) return res.status(404).json({ error: 'Persona no encontrada' });

  // Guarda: responsables no pueden dejar la iglesia huerfana.
  if (yo.rol_global === 'super_admin')
    return res.status(409).json({ error: 'Eres administrador del sistema; no puedes eliminar tu cuenta desde aquí.' });
  if (yo.es_pastor) {
    const pastores = db.prepare('SELECT COUNT(*) AS n FROM persona WHERE iglesia_id = ? AND es_pastor = 1 AND activo = 1').get(iid).n;
    if (pastores <= 1)
      return res.status(409).json({ error: 'Eres el pastor responsable de la iglesia. Transfiere ese rol a otra persona antes de eliminar tu cuenta, o escribe al correo de contacto legal.' });
  }

  // Borrar el archivo de la foto de perfil (best-effort).
  if (yo.foto_url && String(yo.foto_url).startsWith('/uploads/')) {
    try {
      const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
      fs.unlinkSync(path.join(uploadsDir, path.basename(yo.foto_url)));
    } catch { /* si no existe, no pasa nada */ }
  }

  // Anonimizar en una transaccion.
  const claveMuerta = hashPassword(crypto.randomBytes(24).toString('hex'));
  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE persona SET nombre = 'Usuario eliminado', usuario = ?, email = NULL, telefono = NULL,
         foto_url = NULL, cumple = NULL, mostrar_telefono = 0, mostrar_email = 0,
         activo = 0, password_hash = ? WHERE id = ?`
    ).run('eliminado_' + pid, claveMuerta, pid);
    registrarConsentimiento(pid, iid, 'revocado', req);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'No se pudo completar la eliminación' });
  }
  auditar(iid, pid, 'eliminar_cuenta', 'cuenta');
  res.json({ ok: true });
});
```

Nota: si `crypto` ya estaba importado en `cuenta.js` (lo está), no lo dupliques.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `cd backend && node --test test/cuenta-arco.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Correr TODA la suite**

Run: `cd backend && node --test`
Expected: todos en verde.

- [ ] **Step 6: Commit**

```bash
git add backend/src/cuenta.js backend/test/cuenta-arco.test.js
git commit -m "feat(cuenta): ARCO autoservicio — descargar mis datos + eliminar (anonimizar) con guarda

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Frontend — casilla en el registro + puerta de consentimiento bloqueante

**Files:**
- Modify: `web/app.js` (`abrirRegistro`, `confirmarRegistro`, `cargarApp`, + nuevas funciones)

**Interfaces:**
- Consumes: `GET /api/me` (`consentimiento_pendiente`), `POST /api/consentimiento/aceptar`, `POST /api/registro` (`acepto`).
- Produces: función global `mostrarConsentimiento()` y `aceptarConsentimiento()`.

- [ ] **Step 1: Casilla obligatoria en el modal de registro**

En `web/app.js`, dentro de `abrirRegistro` (~línea 154, justo antes del botón "Crear mi cuenta"), añadir:

```js
      <label class="check" style="margin-top:12px;align-items:flex-start"><input type="checkbox" id="reg-acepto" style="margin-top:3px"/>
        <span>He leído y acepto los <a href="/legal/terminos.html" target="_blank" rel="noopener">Términos</a> y la <a href="/legal/privacidad.html" target="_blank" rel="noopener">Política de Privacidad</a>.</span></label>
```

- [ ] **Step 2: Exigir la casilla y enviar `acepto` en `confirmarRegistro`**

En `confirmarRegistro` (~línea 173), tras la validación de la contraseña y antes de armar `body`, añadir:

```js
  if(!$('reg-acepto').checked){ m.textContent='Debes aceptar los Términos y la Política de Privacidad'; return; }
```

Y añadir `acepto:true` al `body`:

```js
  const body={codigo,nombre,usuario,password,acepto:true};
```

- [ ] **Step 3: Puerta bloqueante en `cargarApp`**

En `cargarApp` (~línea 118), tras la comprobación de `debe_cambiar_pass`, añadir:

```js
    if(ME && ME.consentimiento_pendiente) return mostrarConsentimiento();
```

- [ ] **Step 4: Implementar `mostrarConsentimiento` + `aceptarConsentimiento`**

Añadir cerca de `mostrarCambioObligatorio` (~línea 211) estas funciones (overlay bloqueante, no se cierra sin aceptar):

```js
function mostrarConsentimiento(){
  $('login').classList.add('hidden'); $('app').classList.add('hidden');
  let ov=$('cons-ov');
  if(!ov){ ov=document.createElement('div'); ov.id='cons-ov'; ov.className='hmodal-ov'; document.body.appendChild(ov); }
  ov.innerHTML=`<div class="hmodal" style="max-width:460px" onclick="event.stopPropagation()">
    <div class="hmodal-head"><b style="flex:1;font-size:16px">📜 Antes de continuar</b></div>
    <div style="padding:16px">
      <p class="muted small" style="margin:0 0 12px">Para usar la app necesitamos tu consentimiento para tratar tus datos según nuestros documentos legales.</p>
      <label class="check" style="align-items:flex-start"><input type="checkbox" id="cons-chk" style="margin-top:3px"/>
        <span>He leído y acepto los <a href="/legal/terminos.html" target="_blank" rel="noopener">Términos</a> y la <a href="/legal/privacidad.html" target="_blank" rel="noopener">Política de Privacidad</a>.</span></label>
      <button class="btn" style="width:100%;margin-top:14px" onclick="aceptarConsentimiento()">Acepto y continúo</button>
      <button class="btn ghost small-btn" style="width:100%;margin-top:8px" onclick="salir()">Cerrar sesión</button>
      <p id="cons-msg" class="error" style="margin-top:10px"></p>
    </div></div>`;
  ov.onclick=null; // no se cierra tocando fuera
}
async function aceptarConsentimiento(){
  const m=$('cons-msg'); if(m) m.textContent='';
  if(!$('cons-chk').checked){ if(m) m.textContent='Marca la casilla para continuar'; return; }
  try{
    await api('/consentimiento/aceptar',{method:'POST'});
    if(ME) ME.consentimiento_pendiente=false;
    const ov=$('cons-ov'); if(ov) ov.remove();
    abrirApp();
  }catch(e){ if(m) m.textContent=(e&&e.message)||'No se pudo registrar tu aceptación'; }
}
```

- [ ] **Step 5: Verificación en navegador (Playwright)**

Con el server corriendo (`cd backend && JWT_SECRET=dev node src/server.js`), verificar manualmente o con un script Playwright:
1. Un usuario existente (`maria/1234`, iglesia `MONTESION`) al entrar ve la puerta "📜 Antes de continuar"; no puede navegar sin aceptar; al aceptar entra normal y al recargar ya NO reaparece.
2. El registro nuevo no deja crear cuenta sin marcar la casilla.

Registrar el resultado (captura + que no haya errores de consola).

- [ ] **Step 6: Commit**

```bash
git add web/app.js
git commit -m "feat(web): casilla de consentimiento en registro + puerta bloqueante al entrar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Frontend — sección "Mis datos y privacidad" en Ajustes

**Files:**
- Modify: `web/app.js` (`vistaAjustes` + nuevas funciones)

**Interfaces:**
- Consumes: `GET /api/cuenta/mis-datos`, `POST /api/cuenta/eliminar`.
- Produces: funciones globales `descargarMisDatos()`, `eliminarMiCuenta()`.

- [ ] **Step 1: Añadir la tarjeta al final de `vistaAjustes`**

En `vistaAjustes` (~línea 2952), dentro del template de `$('content').innerHTML`, añadir una tarjeta nueva al final (antes de cerrar el backtick del template):

```js
    <div class="card" style="max-width:560px;margin-top:16px">
      <h2 style="font-size:1.3rem;margin-bottom:4px">🔐 Mis datos y privacidad</h2>
      <p class="muted small" style="margin-bottom:14px">Ejerce tus derechos sobre tus datos personales.</p>
      <button class="btn ghost small-btn" onclick="descargarMisDatos()">⬇️ Descargar mis datos</button>
      <hr style="border:none;border-top:1px solid var(--border);margin:16px 0"/>
      <p class="muted small" style="margin:0 0 8px">Retirar tu consentimiento elimina tu cuenta: se borran tus datos personales (nombre, correo, teléfono, foto, cumpleaños) y no podrás volver a entrar. Esta acción no se puede deshacer.</p>
      <button class="btn danger small-btn" onclick="eliminarMiCuenta()">Retirar consentimiento y eliminar mi cuenta</button>
    </div>`;
```

(Insertar antes del ` \`` de cierre del template; mantener el `;` que ya cierra la asignación.)

- [ ] **Step 2: Implementar `descargarMisDatos` y `eliminarMiCuenta`**

Añadir estas funciones cerca de `vistaAjustes`:

```js
async function descargarMisDatos(){
  try{
    const data=await api('/cuenta/mis-datos');
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='mis-datos.json'; a.click();
    URL.revokeObjectURL(url);
    toast('⬇️ Datos descargados');
  }catch(e){ toast((e&&e.message)||'No se pudo descargar'); }
}
async function eliminarMiCuenta(){
  const conf=prompt('Esto eliminará tu cuenta y anonimizará tus datos. Escribe ELIMINAR para confirmar:');
  if(conf!=='ELIMINAR') return;
  try{
    await api('/cuenta/eliminar',{method:'POST'});
    toast('Tu cuenta fue eliminada');
    setTimeout(()=>salir(),800);
  }catch(e){ toast((e&&e.message)||'No se pudo eliminar la cuenta'); }
}
```

Nota: si no existe una clase `.btn.danger` en `styles.css`, usar `class="btn ghost small-btn"` con `style="color:var(--danger,#c0392b)"`. Verificar en `web/styles.css` si `.danger` existe; si no, aplicar el estilo inline.

- [ ] **Step 3: Verificación en navegador (Playwright)**

Con el server corriendo y sesión de `maria`:
1. Ir a Ajustes → "Mis datos y privacidad" existe; "Descargar mis datos" baja un `.json` con perfil + consentimientos.
2. "Retirar consentimiento y eliminar mi cuenta" → tras escribir ELIMINAR, la cuenta se cierra; re-login con `maria/1234` ya no funciona (queda `eliminado_<id>`, inactiva).
   *(Ojo: esto consume el usuario `maria` de la BD dev; hacerlo al final o resembrar con `node src/seed.js` después.)*

- [ ] **Step 4: Commit**

```bash
git add web/app.js
git commit -m "feat(web): seccion Mis datos y privacidad en Ajustes (descargar/eliminar)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Correo de contacto legal configurable (`LEGAL_CONTACT_EMAIL`)

**Files:**
- Modify: `backend/src/server.js` (endpoint público `GET /api/legal/contacto`)
- Modify: `web/legal/aviso-legal.html`, `web/legal/privacidad.html`, `web/legal/terminos.html`, `web/legal/consentimientos.html`, `web/legal/cookies.html` (span de contacto + fetch)
- Modify: `backend/.env.example`
- Modify: `ESTADO.md`

**Interfaces:**
- Produces: `GET /api/legal/contacto` -> `{ email: string|null }` (público, sin auth).

- [ ] **Step 1: Endpoint público en `server.js`**

Junto a `/api/health` (endpoint público existente), añadir:

```js
app.get('/api/legal/contacto', (_req, res) => {
  res.json({ email: process.env.LEGAL_CONTACT_EMAIL || null });
});
```

- [ ] **Step 2: Inyección en las páginas legales**

En cada `web/legal/*.html`, en la zona de contacto/responsable, añadir un contenedor oculto y un script al final del `<body>`:

```html
<p id="legal-contacto" style="display:none">Contacto para ejercer tus derechos: <a id="legal-contacto-mail" href="#"></a></p>
<script>
  fetch('/api/legal/contacto').then(r=>r.json()).then(d=>{
    if(d && d.email){
      var a=document.getElementById('legal-contacto-mail');
      a.textContent=d.email; a.href='mailto:'+d.email;
      document.getElementById('legal-contacto').style.display='';
    }
  }).catch(function(){});
</script>
```

(Si una página ya tiene un bloque de contacto con placeholder `[CORREO…]`, reemplazar ese texto por este mecanismo.)

- [ ] **Step 3: Documentar la env**

En `backend/.env.example`, añadir:

```
# Correo de contacto legal (derechos ARCO). Opcional: si no se define, las
# paginas legales simplemente no muestran la linea de contacto.
LEGAL_CONTACT_EMAIL=
```

- [ ] **Step 4: Verificación manual**

Con el server corriendo:
- `curl http://localhost:3000/api/legal/contacto` → `{"email":null}` sin la env; con `LEGAL_CONTACT_EMAIL=x@y.com node src/server.js` → `{"email":"x@y.com"}`.
- Abrir `/legal/privacidad.html`: la línea de contacto aparece solo cuando la env está definida.

- [ ] **Step 5: Actualizar `ESTADO.md`**

Añadir una nota en `ESTADO.md` marcando el bloqueante legal como parcialmente cerrado: consentimiento general + ARCO autoservicio **implementados**; pendiente del dueño = definir `LEGAL_CONTACT_EMAIL` y completar los placeholders de `legal/*` con un abogado.

- [ ] **Step 6: Correr TODA la suite (regresión final)**

Run: `cd backend && node --test`
Expected: todos en verde.

- [ ] **Step 7: Commit**

```bash
git add backend/src/server.js web/legal/ backend/.env.example ESTADO.md
git commit -m "feat(legal): correo de contacto ARCO configurable (LEGAL_CONTACT_EMAIL)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (cobertura del spec)

- §2 Consentimiento general only → Tasks 1-5. ✅
- §3 Modelo de datos (tabla append-only, versión, helper) → Task 1. ✅
- §4.1 módulo + endpoints → Tasks 1-2. ✅
- §4.2 captura en registro → Task 3 (backend) + Task 5 (frontend). ✅
- §4.3 puerta para existentes (`/me` flag + pantalla) → Task 2 (flag) + Task 5 (pantalla). ✅
- §4.4 ARCO (acceso/rectificación/cancelación) → Task 4 (backend) + Task 6 (frontend). Rectificación = ya existe (editar perfil), no requiere tarea. ✅
- §4.5 correo configurable → Task 7. ✅
- §5 manejo de errores (400 sin acepto, 409 guarda, rollback) → Tasks 3, 4. ✅
- §6 pruebas (10 casos) → distribuidas en Tasks 1-4. ✅
- §7 archivos afectados → cubiertos. ✅
- §8 acciones del dueño → documentadas en Task 7 Step 5. ✅

Consistencia de tipos: `tieneConsentimientoVigente(personaId, tipo)`, `registrarConsentimiento(personaId, iglesiaId, accion, req)`, `CONSENT_VERSION` — nombres idénticos en todas las tareas. `consentimiento_pendiente` (raíz de `/me`) usado consistentemente en Task 2 y Task 5.
