# Eliminar iglesia (super-admin) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un botón en el panel de super-admin que elimina por completo una iglesia (todos sus datos en las 45 tablas + sus archivos subidos), de forma transaccional e irreversible.

**Architecture:** Un módulo backend nuevo (`eliminarIglesia.js`) hace el borrado dinámico: apaga las claves foráneas, borra en una transacción todas las filas con `iglesia_id`, limpia los huérfanos que quedan (tablas hijas) usando `PRAGMA foreign_key_check` en bucle, verifica que no quede ninguna referencia rota, y hace COMMIT. Solo si el borrado de datos tiene éxito, borra los archivos del disco (mejor esfuerzo; `rclone` los propaga a R2). El router `superadmin.js` expone `DELETE /iglesias/:id` con el gate de super-admin y auditoría a nivel sistema. El frontend agrega un botón rojo con doble confirmación.

**Tech Stack:** Node.js ESM, Express, `node:sqlite` (DatabaseSync, síncrono), frontend vanilla JS. Tests con `node:test`.

## Global Constraints

- `node:sqlite` es síncrono: nada de async en las consultas.
- `PRAGMA foreign_keys` es no-op dentro de una transacción: apagarlo ANTES de `BEGIN`, reactivarlo DESPUÉS del `COMMIT`/`ROLLBACK` (en `finally`).
- El borrado es todo-o-nada: cualquier fallo del borrado de datos → `ROLLBACK`, la iglesia queda intacta, no se toca ningún archivo.
- Solo `rol_global='super_admin'` puede eliminar (el router `superadmin.js` ya aplica ese gate a todas sus rutas).
- La auditoría del borrado se registra con `iglesia_id = NULL` (para que sobreviva al borrado de la iglesia).
- Solo se borran archivos cuyas rutas empiezan por `/uploads/` (nunca `/assets/...` ni enlaces externos).
- Verificado en scratchpad: `db.prepare('PRAGMA foreign_key_check').all()` y `PRAGMA table_info(x)` funcionan con node:sqlite y el borrado dinámico deja intactas las otras iglesias.

---

### Task 1: Módulo de borrado de datos (`borrarDatosIglesia`)

**Files:**
- Create: `backend/src/eliminarIglesia.js`
- Test: `backend/test/eliminar-iglesia.test.js`

**Interfaces:**
- Produces: `borrarDatosIglesia(iglesiaId: number): void` — borra transaccionalmente TODOS los datos de la iglesia en todas las tablas. Lanza `Error` si algo falla (deja la iglesia intacta). No borra archivos.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/eliminar-iglesia.test.js`:

```js
// ============================================================
//  Eliminar iglesia: borrado en cascada, transaccional y aislado.
// ============================================================
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';

let db, borrarDatosIglesia;

before(async () => {
  db = await cargarDb();
  ({ borrarDatosIglesia } = await import('../src/eliminarIglesia.js'));
});

// Siembra una iglesia con datos cruzados en varias tablas y devuelve sus ids.
function sembrarIglesiaRica(db, nombre, codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run(nombre, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const pas = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,1,1)")
    .run(iglesiaId, 'pastor_' + codigo, 'Pastor', 'x');
  const pastorId = Number(pas.lastInsertRowid);
  const mie = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)")
    .run(iglesiaId, 'm_' + codigo, 'Miembro', 'x');
  const miembroId = Number(mie.lastInsertRowid);
  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  const grupoId = Number(g.lastInsertRowid);
  db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)').run(miembroId, grupoId, 'miembro');
  const ev = db.prepare("INSERT INTO evento (iglesia_id, titulo, fecha, grupo_id) VALUES (?, 'Culto', '2026-07-30', ?)").run(iglesiaId, grupoId);
  const eventoId = Number(ev.lastInsertRowid);
  db.prepare('INSERT INTO asistencia (evento_id, persona_id) VALUES (?,?)').run(eventoId, miembroId);
  db.prepare("INSERT INTO movimiento (iglesia_id, tipo, monto, descripcion) VALUES (?, 'ingreso', 100, 'Ofrenda')").run(iglesiaId);
  const cv = db.prepare("INSERT INTO conversacion (iglesia_id, tipo, creado_por) VALUES (?, 'directo', ?)").run(iglesiaId, pastorId);
  const convId = Number(cv.lastInsertRowid);
  db.prepare('INSERT INTO conversacion_miembro (conversacion_id, persona_id) VALUES (?,?)').run(convId, pastorId);
  db.prepare('INSERT INTO mensaje (conversacion_id, persona_id, texto) VALUES (?,?,?)').run(convId, pastorId, 'hola');
  return { iglesiaId, pastorId, miembroId, grupoId, eventoId, convId };
}

// Cuenta cuántas filas hay en TODA tabla con iglesia_id para una iglesia dada.
function filasDirectas(db, iglesiaId) {
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  let total = 0;
  for (const t of tablas) {
    if (t === 'iglesia') continue;
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    if (cols.includes('iglesia_id')) total += db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE iglesia_id = ?`).get(iglesiaId).n;
  }
  return total;
}

test('borra TODOS los datos de la iglesia y deja las demás intactas', () => {
  db.exec('PRAGMA foreign_keys = ON');
  const A = sembrarIglesiaRica(db, 'Iglesia A', 'AAA');
  const B = sembrarIglesiaRica(db, 'Iglesia B', 'BBB');

  const bAntes = filasDirectas(db, B.iglesiaId);
  const bMsgAntes = db.prepare('SELECT COUNT(*) n FROM mensaje WHERE conversacion_id = ?').get(B.convId).n;

  borrarDatosIglesia(A.iglesiaId);

  // A: nada queda
  assert.equal(db.prepare('SELECT COUNT(*) n FROM iglesia WHERE id = ?').get(A.iglesiaId).n, 0);
  assert.equal(filasDirectas(db, A.iglesiaId), 0, 'quedaron filas con iglesia_id de A');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pertenencia WHERE persona_id = ?').get(A.miembroId).n, 0, 'pertenencia huérfana de A');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM asistencia WHERE evento_id = ?').get(A.eventoId).n, 0, 'asistencia huérfana de A');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM mensaje WHERE conversacion_id = ?').get(A.convId).n, 0, 'mensaje huérfano de A');

  // Sin referencias rotas en toda la BD
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0, 'quedaron referencias huérfanas');

  // B: intacta
  assert.equal(filasDirectas(db, B.iglesiaId), bAntes, 'se tocó la iglesia B');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM mensaje WHERE conversacion_id = ?').get(B.convId).n, bMsgAntes);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && node --test test/eliminar-iglesia.test.js`
Expected: FAIL — `Cannot find module '../src/eliminarIglesia.js'`.

- [ ] **Step 3: Implementar el módulo (mínimo para este test)**

Crear `backend/src/eliminarIglesia.js`:

```js
// ============================================================
//  Eliminar iglesia por completo (uso del super-admin).
//  Borrado dinámico y transaccional: no depende de enumerar a mano
//  las 45 tablas. Apaga las FK, borra todo lo de la iglesia, limpia
//  los huérfanos con PRAGMA foreign_key_check y verifica antes de COMMIT.
// ============================================================
import db from './db.js';

// Borra TODOS los datos de una iglesia en una transacción (todo-o-nada).
// Lanza Error si algo falla; en ese caso la iglesia queda intacta.
export function borrarDatosIglesia(iglesiaId) {
  const tablas = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(r => r.name);

  db.exec('PRAGMA foreign_keys = OFF');   // no-op dentro de txn: va ANTES del BEGIN
  try {
    db.exec('BEGIN');

    // 1) Todas las tablas con columna iglesia_id.
    for (const t of tablas) {
      if (t === 'iglesia') continue;
      const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
      if (cols.includes('iglesia_id')) db.prepare(`DELETE FROM ${t} WHERE iglesia_id = ?`).run(iglesiaId);
    }

    // 2) Limpieza de huérfanos: al borrar los padres (persona, evento, grupo,
    //    conversación...), sus hijos quedan colgando. foreign_key_check los
    //    lista; se borran por rowid y se repite hasta que no quede ninguno.
    let guard = 0;
    for (;;) {
      const huerfanos = db.prepare('PRAGMA foreign_key_check').all();
      if (!huerfanos.length) break;
      if (++guard > 100) throw new Error('la limpieza de huérfanos no converge');
      for (const h of huerfanos) db.prepare(`DELETE FROM "${h.table}" WHERE rowid = ?`).run(h.rowid);
    }

    // 3) La iglesia misma.
    db.prepare('DELETE FROM iglesia WHERE id = ?').run(iglesiaId);

    // 4) Verificación final: no debe quedar ninguna referencia rota.
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('quedaron referencias huérfanas tras el borrado');

    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignora */ }
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && node --test test/eliminar-iglesia.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/eliminarIglesia.js backend/test/eliminar-iglesia.test.js
git commit -m "feat(superadmin): borrado en cascada transaccional de una iglesia"
```

---

### Task 2: Recolección y borrado de archivos + wrapper `eliminarIglesiaCompleta`

**Files:**
- Modify: `backend/src/eliminarIglesia.js`
- Test: `backend/test/eliminar-iglesia.test.js`

**Interfaces:**
- Consumes: `borrarDatosIglesia(iglesiaId)` (Task 1).
- Produces:
  - `recolectarArchivos(iglesiaId: number): string[]` — rutas `/uploads/...` de la iglesia.
  - `eliminarIglesiaCompleta(iglesiaId: number): { nombre, codigo, archivosBorrados } | null` — null si la iglesia no existe; si existe: recolecta archivos, borra datos (puede lanzar), luego borra archivos (mejor esfuerzo) y devuelve el resumen.

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `backend/test/eliminar-iglesia.test.js`:

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('recolectarArchivos: solo /uploads/ de la iglesia', async () => {
  const { recolectarArchivos } = await import('../src/eliminarIglesia.js');
  db.exec('PRAGMA foreign_keys = ON');
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Con Fotos','FOTOS')").run();
  const iglesiaId = Number(ig.lastInsertRowid);
  // foto subida (cuenta) + asset del sistema (NO cuenta) + externo (NO cuenta)
  db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo, foto_url) VALUES (?,?,?,?,1,?)")
    .run(iglesiaId, 'con_foto', 'Con Foto', 'x', '/uploads/foto1.jpg');
  db.prepare("INSERT INTO material_musica (iglesia_id, titulo, archivo_url) VALUES (?, 'Himno', '/assets/himnario-nuevo.pdf')").run(iglesiaId);
  db.prepare("INSERT INTO material_musica (iglesia_id, titulo, archivo_url) VALUES (?, 'Partitura', '/uploads/part.pdf')").run(iglesiaId);

  const urls = recolectarArchivos(iglesiaId).sort();
  assert.deepEqual(urls, ['/uploads/foto1.jpg', '/uploads/part.pdf']);
});

test('eliminarIglesiaCompleta: borra datos y archivos; null si no existe', async () => {
  const { eliminarIglesiaCompleta } = await import('../src/eliminarIglesia.js');
  // UPLOADS_DIR temporal con dos archivos reales
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
  process.env.UPLOADS_DIR = dir;
  fs.writeFileSync(path.join(dir, 'foto1.jpg'), 'x');
  fs.writeFileSync(path.join(dir, 'part.pdf'), 'x');

  db.exec('PRAGMA foreign_keys = ON');
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Borrar','BORRAR')").run();
  const iglesiaId = Number(ig.lastInsertRowid);
  db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo, foto_url) VALUES (?,?,?,?,1,?)")
    .run(iglesiaId, 'x', 'X', 'x', '/uploads/foto1.jpg');
  db.prepare("INSERT INTO material_musica (iglesia_id, titulo, archivo_url) VALUES (?, 'P', '/uploads/part.pdf')").run(iglesiaId);

  const res = eliminarIglesiaCompleta(iglesiaId);
  assert.equal(res.nombre, 'Borrar');
  assert.equal(res.codigo, 'BORRAR');
  assert.equal(res.archivosBorrados, 2);
  assert.equal(fs.existsSync(path.join(dir, 'foto1.jpg')), false);
  assert.equal(fs.existsSync(path.join(dir, 'part.pdf')), false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM iglesia WHERE id = ?').get(iglesiaId).n, 0);

  assert.equal(eliminarIglesiaCompleta(999999), null);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && node --test test/eliminar-iglesia.test.js`
Expected: FAIL — `recolectarArchivos is not a function` / `eliminarIglesiaCompleta is not a function`.

- [ ] **Step 3: Implementar recolección + borrado de archivos + wrapper**

Añadir a `backend/src/eliminarIglesia.js` (arriba, tras el import de db):

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Mismo default que server.js (backend/uploads) si no hay UPLOADS_DIR.
function uploadsDir() { return process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'); }

// Columnas que guardan archivos SUBIDOS (/uploads/...) y cómo acotarlas a la iglesia.
const COLUMNAS_ARCHIVO = [
  { tabla: 'persona',         col: 'foto_url',       scope: 'iglesia_id = ?' },
  { tabla: 'material_musica', col: 'archivo_url',    scope: 'iglesia_id = ?' },
  { tabla: 'movimiento',      col: 'comprobante_url',scope: 'iglesia_id = ?' },
  { tabla: 'leccion',         col: 'material_url',   scope: 'iglesia_id = ?' },
  { tabla: 'mensaje',         col: 'adjunto_url',    scope: 'conversacion_id IN (SELECT id FROM conversacion WHERE iglesia_id = ?)' },
  { tabla: 'predica_recurso', col: 'url',            scope: 'predica_id IN (SELECT id FROM predica WHERE iglesia_id = ?)' },
];

// Rutas /uploads/... de una iglesia, de todas las columnas de archivo.
export function recolectarArchivos(iglesiaId) {
  const urls = [];
  for (const { tabla, col, scope } of COLUMNAS_ARCHIVO) {
    const filas = db.prepare(
      `SELECT ${col} AS u FROM ${tabla} WHERE (${scope}) AND ${col} LIKE '/uploads/%'`
    ).all(iglesiaId);
    for (const f of filas) if (f.u) urls.push(f.u);
  }
  return urls;
}

// Borra los archivos del disco (mejor esfuerzo). rclone propaga las bajas a R2.
function borrarArchivos(urls) {
  const base = uploadsDir();
  let borrados = 0;
  for (const u of urls) {
    try { fs.unlinkSync(path.join(base, path.basename(u))); borrados++; }
    catch { /* ya no existe u otro error: mejor esfuerzo */ }
  }
  return borrados;
}

// Elimina una iglesia por completo: datos + archivos. null si no existe.
export function eliminarIglesiaCompleta(iglesiaId) {
  const ig = db.prepare('SELECT id, nombre, codigo_unico FROM iglesia WHERE id = ?').get(iglesiaId);
  if (!ig) return null;
  const archivos = recolectarArchivos(iglesiaId);   // recolecta ANTES de borrar
  borrarDatosIglesia(iglesiaId);                     // lanza si falla → no se tocan archivos
  const archivosBorrados = borrarArchivos(archivos); // solo si el borrado de datos tuvo éxito
  return { nombre: ig.nombre, codigo: ig.codigo_unico, archivosBorrados };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && node --test test/eliminar-iglesia.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/eliminarIglesia.js backend/test/eliminar-iglesia.test.js
git commit -m "feat(superadmin): recolecta y borra archivos de la iglesia eliminada"
```

---

### Task 3: Endpoint `DELETE /iglesias/:id` + conteo de eventos en el listado

**Files:**
- Modify: `backend/src/superadmin.js`
- Test: `backend/test/eliminar-iglesia.test.js`

**Interfaces:**
- Consumes: `eliminarIglesiaCompleta(iglesiaId)` (Task 2), `auditar(iglesiaId, personaId, accion, entidad, detalle)` (auth.js).
- Produces: `DELETE /api/superadmin/iglesias/:id` → `{ ok:true, eliminada:{nombre,codigo}, archivos_borrados }`; 404 si no existe; 403 si no es super-admin. `GET /api/superadmin/iglesias` ahora incluye `eventos` (nº de eventos) por iglesia.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/test/eliminar-iglesia.test.js` (arranca el server HTTP real, patrón de `auth-activo.test.js`):

```js
test('endpoint DELETE: gate, 404, borrado y auditoría a nivel sistema', async () => {
  const { signToken } = await import('../src/auth.js');
  const { app } = await import('../src/server.js');
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    db.exec('PRAGMA foreign_keys = ON');
    // super-admin
    const sa = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (NULL,'sa_del','SA','x','super_admin',1)").run();
    const saTok = signToken({ id: Number(sa.lastInsertRowid), iglesia_id: null });
    // iglesia con un pastor (feligrés normal, para probar el gate 403)
    const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Del','DEL')").run();
    const iglesiaId = Number(ig.lastInsertRowid);
    const pas = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,1,1)").run(iglesiaId, 'p', 'P', 'x');
    const pastorTok = signToken({ id: Number(pas.lastInsertRowid), iglesia_id: iglesiaId });

    // 403: un pastor no puede
    let res = await fetch(base + '/api/superadmin/iglesias/' + iglesiaId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + pastorTok } });
    assert.equal(res.status, 403);

    // 404: iglesia inexistente
    res = await fetch(base + '/api/superadmin/iglesias/999999', { method: 'DELETE', headers: { Authorization: 'Bearer ' + saTok } });
    assert.equal(res.status, 404);

    // 200: super-admin elimina
    res = await fetch(base + '/api/superadmin/iglesias/' + iglesiaId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + saTok } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.eliminada.codigo, 'DEL');

    // La iglesia ya no existe
    assert.equal(db.prepare('SELECT COUNT(*) n FROM iglesia WHERE id = ?').get(iglesiaId).n, 0);
    // Auditoría a nivel sistema (iglesia_id = NULL) sobrevive
    const log = db.prepare("SELECT * FROM auditoria WHERE accion = 'superadmin_eliminar_iglesia' AND iglesia_id IS NULL ORDER BY id DESC LIMIT 1").get();
    assert.ok(log, 'no se registró la auditoría del borrado');
  } finally {
    await new Promise(r => srv.close(r));
  }
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && node --test test/eliminar-iglesia.test.js`
Expected: FAIL — con el token de super-admin, el `DELETE` recibe **404** porque la ruta aún no existe (ningún handler DELETE), así que falla el `assert.equal(res.status, 200)`. (Los asserts previos de 403 y 404 sí pasan: el 403 lo da el gate del router para el pastor, y el 404 coincide por casualidad con "ruta inexistente" — por eso el test no queda verde hasta implementar la ruta real.)

- [ ] **Step 3: Implementar la ruta y el conteo**

En `backend/src/superadmin.js`, añadir el import (junto a los otros de arriba):

```js
import { eliminarIglesiaCompleta } from './eliminarIglesia.js';
```

En el `GET /iglesias`, añadir el conteo de eventos al SELECT (dentro del bloque de subconsultas, tras `miembros`):

```js
        (SELECT COUNT(*) FROM evento e WHERE e.iglesia_id = i.id) AS eventos,
```

Añadir la ruta nueva (tras el `reset-pastor`, antes de `export default r`):

```js
// --- Elimina una iglesia POR COMPLETO (datos + archivos). Irreversible. ---
r.delete('/iglesias/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id de iglesia no válido' });

  const iglesia = db.prepare('SELECT id, nombre, codigo_unico FROM iglesia WHERE id = ?').get(id);
  if (!iglesia) return res.status(404).json({ error: 'Iglesia no encontrada' });

  try {
    const r2 = eliminarIglesiaCompleta(id);
    // Auditoría a nivel sistema (iglesia_id = NULL): sobrevive al borrado.
    auditar(null, req.user.persona_id, 'superadmin_eliminar_iglesia', 'superadmin', `${iglesia.nombre} (${iglesia.codigo_unico})`);
    res.json({ ok: true, eliminada: { nombre: iglesia.nombre, codigo: iglesia.codigo_unico }, archivos_borrados: r2.archivosBorrados });
  } catch (e) {
    console.error('[superadmin] eliminar iglesia falló:', e.message);
    res.status(500).json({ error: 'No se pudo eliminar la iglesia (no se borró nada)' });
  }
});
```

- [ ] **Step 4: Correr toda la suite y verificar que pasa**

Run: `cd backend && node --test`
Expected: PASS — todos los tests (los previos + los nuevos de eliminar-iglesia).

- [ ] **Step 5: Commit**

```bash
git add backend/src/superadmin.js backend/test/eliminar-iglesia.test.js
git commit -m "feat(superadmin): endpoint DELETE /iglesias/:id + conteo de eventos"
```

---

### Task 4: Botón "Eliminar" con doble confirmación en el panel

**Files:**
- Modify: `web/app.js` (función `modalConfirm`, `saCargarLista`; nueva `saEliminarIglesia`)

**Interfaces:**
- Consumes: `DELETE /api/superadmin/iglesias/:id` (Task 3), `SA_IGLESIAS` (cache del panel), `modalConfirm`, `api`, `toast`, `saCargarLista`, `escHtml`.
- Produces: botón "🗑️ Eliminar" por iglesia; `saEliminarIglesia(id)`.

- [ ] **Step 1: Extender `modalConfirm` para permitir etiqueta y estilo de peligro**

En `web/app.js`, reemplazar la función `modalConfirm` (compatibilidad total: las llamadas actuales de 2 argumentos siguen igual):

```js
// Modal de confirmación genérico. opts: { okLabel, danger }.
function modalConfirm(msg, onYes, opts){
  opts = opts || {};
  const okLabel = opts.okLabel || 'Sí, continuar';
  const okClase = opts.danger ? 'btn danger' : 'btn';
  const root=$('modal-root');
  root.innerHTML=`<div class="modal-bg"><div class="modal"><h3>Confirmar</h3>
    <p class="muted" style="margin:8px 0 16px">${msg}</p>
    <div class="row"><button class="btn ghost" onclick="cerrarModal()">Cancelar</button>
    <button class="${okClase}" id="cf-ok">${okLabel}</button></div></div></div>`;
  root.classList.add('show');
  $('cf-ok').onclick=()=>{ cerrarModal(); onYes(); };
}
```

- [ ] **Step 2: Añadir el estilo del botón de peligro**

En `web/styles.css`, tras la regla `.btn.ghost:active` (bloque de botones, cerca de la línea 67), añadir:

```css
.btn.danger{background:var(--red);box-shadow:0 1px 2px rgba(220,38,38,.2);}
.btn.danger:hover{background:var(--red-tx);box-shadow:0 6px 20px rgba(220,38,38,.28);}
```

- [ ] **Step 3: Añadir el botón "Eliminar" en la fila de acciones de cada iglesia**

En `web/app.js`, dentro de `saCargarLista`, en la fila de botones de acción (la que tiene Editar / Desactivar / Resetear), añadir al final un botón rojo:

```js
          <button class="btn ghost small-btn" onclick="saResetPastor(${ig.id})">🔑 Resetear contraseña del pastor</button>
          <button class="btn ghost small-btn" style="color:var(--red)" onclick="saEliminarIglesia(${ig.id})">🗑️ Eliminar</button>
```

- [ ] **Step 4: Implementar `saEliminarIglesia` con doble confirmación**

En `web/app.js`, tras `saResetPastor`, añadir:

```js
// ---------- Eliminar iglesia por completo (doble confirmación) ----------
function saEliminarIglesia(id){
  const ig=SA_IGLESIAS.find(i=>i.id===id); if(!ig) return;
  const miembros=ig.miembros||0, eventos=ig.eventos||0;
  modalConfirm(
    `Vas a eliminar <b>${escHtml(ig.nombre)}</b>: <b>${miembros}</b> miembro(s), <b>${eventos}</b> evento(s), y toda su tesorería, mensajes, niños y archivos subidos.<br><br><b>Esto NO se puede deshacer.</b>`,
    ()=>{
      modalConfirm(
        `¿De verdad quieres eliminar <b>${escHtml(ig.nombre)}</b>? Esta acción es <b>definitiva</b>.`,
        async()=>{
          try{
            const r=await api('/superadmin/iglesias/'+id,{method:'DELETE'});
            toast('🗑️ Iglesia eliminada'+((r&&r.archivos_borrados)?` (${r.archivos_borrados} archivo(s))`:''));
            saCargarLista();
          }catch(e){ toast((e&&e.message)||'No se pudo eliminar'); }
        },
        { okLabel:'Sí, eliminar definitivamente', danger:true }
      );
    },
    { okLabel:'Sí, eliminar', danger:true }
  );
}
```

- [ ] **Step 5: Verificar en el navegador (Playwright) y commit**

Verificación manual/automatizada: entrar como super-admin, crear una iglesia de prueba, pulsar "Eliminar", pasar las dos confirmaciones y comprobar que desaparece de la lista y que otra iglesia sigue intacta. (Reusar el patrón de `scratchpad/test-login-admin.py` para el login de super-admin.)

```bash
git add web/app.js web/styles.css
git commit -m "feat(superadmin): boton Eliminar iglesia con doble confirmacion"
```

---

## Notas de cierre (no son tareas)

- Al terminar las 4 tareas: correr la suite completa (`cd backend && node --test`, debe seguir verde) y una pasada visual del panel de super-admin en el navegador (claro y oscuro).
- Fusionar `feat/eliminar-iglesia` a `main`; Pablo hace push con GitHub Desktop (push a `main` = redeploy en Render). Ver [[app-iglesia-deploy]].
