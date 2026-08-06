# Editar clases y lecciones de ED — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La encargada de Escuela Dominical puede corregir y borrar clases (solo vacías) y lecciones, con auditoría; y crear deja rastro por fin.

**Architecture:** Cuatro rutas nuevas en `ninos.js` siguiendo los patrones ya presentes en el archivo (whitelist del PATCH de niños, transacción del DELETE de niños, `claseDeIglesia`) más la regla nueva de Tesorería (solo se audita lo que cambió). Frontend: paneles en sitio y `modalConfirm` con textos escapados. Spec: `docs/superpowers/specs/2026-08-05-editar-clases-lecciones-design.md`.

**Tech Stack:** Node 24, Express, zod 4, frontend vanilla, arnés in-process (`app.listen(0)` + `signToken` + `sembrarMinimo`).

## Global Constraints

- Rama: `feat/editar-clases-lecciones` (Task 1 la crea desde `main`).
- Suite en verde entre tareas: `cd backend && npm test`.
- Solo se audita lo que cambió de verdad; SET desde lista blanca; acotado por iglesia en la misma consulta (404); DELETE de clase en transacción.
- El permiso de escritura es `soloEncargado` (ya existe); pastor y obispo observan.
- Frontend: `escHtml()` en todo texto de persona (también dentro de `modalConfirm` — trampa documentada de la Fase 13); controles clicables `<button>`; los barridos deben pasar sin excepciones nuevas.
- El rol para los tests: `sembrarMinimo` + `UPDATE pertenencia SET rol='lider_ed'` (verificar el nombre exacto del rol con `grep -n "esLiderEdEstricto" backend/src/auth.js` antes de asumir).
- Commits: minúsculas, sin tildes, `tipo(ámbito): qué -- por qué`, con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Backend — clases (PATCH + DELETE solo-vacía + auditar crear)

**Files:**
- Create: `backend/test/clases-lecciones.test.js`
- Modify: `backend/src/ninos.js` (tras `POST /clases`, línea ~41; y `auditar` en el POST)

**Interfaces:**
- Produces: `PATCH /api/ninos/clases/:id` (`{nombre?, edad?}`, al menos uno; 200/400/403/404; audita `editar_clase` solo si cambió, detalle `campo: antes -> despues`). `DELETE /api/ninos/clases/:id` (409 con conteo si tiene niños; si no: borra asistencia vieja + lecciones + clase en transacción; audita `eliminar_clase`). `POST /clases` audita `crear_clase`.

- [ ] **Step 1: Rama + tests que fallan**

```bash
cd "C:/Users/pdani/Documents/App-Iglesia/app" && git checkout -b feat/editar-clases-lecciones
```

Crear `backend/test/clases-lecciones.test.js`:

```js
// -----------------------------------------------------------------------------
//  Clases y lecciones de Escuela Dominical: corregir y borrar (spec
//  2026-08-05-editar-clases-lecciones).
//
//  La regla dura: una clase con ninos NO se borra (409) — borrar fichas de
//  menores en bloque es demasiado facil de hacer por error. Y la regla nueva
//  de la casa: solo se audita lo que cambio de verdad.
// -----------------------------------------------------------------------------
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb, reiniciar, sembrarMinimo } from './helpers.js';

let dbDirecta, srv, base, signToken, SEM, encargada;

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
  for (const t of ['asistencia_nino', 'leccion', 'nino', 'clase_ed', 'auditoria'])
    dbDirecta.exec('DELETE FROM ' + t);
  SEM = sembrarMinimo(dbDirecta);
  // miembro1 asciende a encargada de ED (soloEncargado exige el rol en una
  // pertenencia — mismo truco que campanias.test.js con el tesorero).
  dbDirecta.prepare("UPDATE pertenencia SET rol = 'lider_ed' WHERE persona_id = ? AND grupo_id = ?")
    .run(SEM.miembro1.id, SEM.grupoId);
  encargada = SEM.miembro1;
});

const H = (p, iglesiaId = SEM.iglesiaId) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: p.id, iglesia_id: iglesiaId })
});
const llamar = (metodo, ruta, cuerpo, quien = encargada) =>
  fetch(base + ruta, { method: metodo, headers: H(quien), body: cuerpo && JSON.stringify(cuerpo) });

const crearClase = (campos = {}) => Number(dbDirecta.prepare(
  'INSERT INTO clase_ed (iglesia_id, nombre, edad) VALUES (?,?,?)'
).run(campos.iglesia_id ?? SEM.iglesiaId, campos.nombre ?? 'Primarios', campos.edad ?? '6-8 años').lastInsertRowid);

const claseDe = (id) => dbDirecta.prepare('SELECT * FROM clase_ed WHERE id = ?').get(id);
const apuntes = (accion) => dbDirecta.prepare(
  'SELECT * FROM auditoria WHERE accion = ? ORDER BY id').all(accion);

test('corregir el nombre de una clase: cambia y deja UN apunte antes -> despues', async () => {
  const id = crearClase({ nombre: 'Primarios' });
  const res = await llamar('PATCH', `/api/ninos/clases/${id}`, { nombre: 'Intermedios' });
  assert.equal(res.status, 200);
  assert.equal(claseDe(id).nombre, 'Intermedios');
  const a = apuntes('editar_clase');
  assert.equal(a.length, 1);
  assert.ok(a[0].detalle.includes('Primarios') && a[0].detalle.includes('Intermedios'));
});

test('PATCH con los mismos valores: 200 y cero apuntes', async () => {
  const id = crearClase({ nombre: 'Primarios', edad: '6-8 años' });
  const res = await llamar('PATCH', `/api/ninos/clases/${id}`, { nombre: 'Primarios', edad: '6-8 años' });
  assert.equal(res.status, 200);
  assert.equal(apuntes('editar_clase').length, 0);
});

test('el pastor no edita: 403; una clase ajena: 404', async () => {
  const id = crearClase();
  assert.equal((await llamar('PATCH', `/api/ninos/clases/${id}`, { nombre: 'X' }, SEM.pastor)).status, 403);
  const otra = Number(dbDirecta.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra','OTRA')").run().lastInsertRowid);
  const ajena = crearClase({ iglesia_id: otra });
  assert.equal((await llamar('PATCH', `/api/ninos/clases/${ajena}`, { nombre: 'X' })).status, 404);
  assert.equal(claseDe(ajena).nombre, 'Primarios');
});

test('borrar una clase CON ninos: 409, nada cambia, el mensaje trae el conteo', async () => {
  const id = crearClase();
  dbDirecta.prepare('INSERT INTO nino (iglesia_id, clase_id, nombre) VALUES (?,?,?)')
    .run(SEM.iglesiaId, id, 'Sofi');
  const res = await llamar('DELETE', `/api/ninos/clases/${id}`);
  assert.equal(res.status, 409);
  const { error } = await res.json();
  assert.ok(error.includes('1'), `el mensaje no dice cuantos ninos: ${error}`);
  assert.ok(claseDe(id), 'la clase se borro igual');
  assert.equal(apuntes('eliminar_clase').length, 0);
});

test('borrar una clase VACIA se lleva lecciones y asistencia vieja, en transaccion', async () => {
  const id = crearClase();
  dbDirecta.prepare('INSERT INTO leccion (iglesia_id, clase_id, titulo) VALUES (?,?,?)')
    .run(SEM.iglesiaId, id, 'El arca');
  // Asistencia huerfana: el nino se borro (Fase 13) pero su fila vieja de
  // asistencia guardaba el clase_id — sin limpiarla, el DELETE de la clase
  // reventaria por FK.
  dbDirecta.exec('PRAGMA foreign_keys=OFF');
  dbDirecta.prepare('INSERT INTO asistencia_nino (clase_id, nino_id, fecha) VALUES (?, 99999, ?)')
    .run(id, '2026-07-01');
  dbDirecta.exec('PRAGMA foreign_keys=ON');
  const res = await llamar('DELETE', `/api/ninos/clases/${id}`);
  assert.equal(res.status, 200);
  assert.equal(claseDe(id), undefined);
  assert.equal(dbDirecta.prepare('SELECT COUNT(*) AS n FROM leccion WHERE clase_id = ?').get(id).n, 0);
  assert.equal(dbDirecta.prepare('SELECT COUNT(*) AS n FROM asistencia_nino WHERE clase_id = ?').get(id).n, 0);
  const a = apuntes('eliminar_clase');
  assert.equal(a.length, 1);
  assert.ok(a[0].detalle.includes('Primarios'));
});

test('crear una clase deja apunte (el hueco del 30-jul se cierra)', async () => {
  const res = await llamar('POST', '/api/ninos/clases', { nombre: 'Cuna' });
  assert.equal(res.status, 200);
  assert.equal(apuntes('crear_clase').length, 1);
});
```

- [ ] **Step 2: Correr — debe FALLAR** (`cd backend && node --test test/clases-lecciones.test.js`: PATCH/DELETE → 404 de Express, crear sin apunte)

- [ ] **Step 3: Implementar** en `ninos.js`:

En `POST /clases` (línea ~37-41), tras el INSERT:

```js
  const info = db.prepare('INSERT INTO clase_ed (iglesia_id, nombre, edad) VALUES (?,?,?)').run(req.user.iglesia_id, nombre, edad || null);
  // El 30-jul quedo anotado que nada de este modulo dejaba rastro al crear.
  auditar(req.user.iglesia_id, req.user.persona_id, 'crear_clase', 'ninos', nombre,
    { tabla: 'clase_ed', id: info.lastInsertRowid });
```

Después, las dos rutas nuevas:

```js
// Corregir una clase. Solo se audita lo que cambio de verdad (la regla que
// estreno tesoreria.js hoy mismo): reenviar lo igual no ensucia el rastro.
const editarClaseSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre').optional(),
  edad: z.string().trim().max(60, 'edad demasiado larga').optional()
}).refine(b => b.nombre !== undefined || b.edad !== undefined,
  { message: 'no viene ningun campo que cambiar' });
r.patch('/clases/:id', soloEncargado, validar(editarClaseSchema), (req, res) => {
  const c = db.prepare('SELECT id, nombre, edad FROM clase_ed WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, req.user.iglesia_id);
  if (!c) return res.status(404).json({ error: 'Clase no encontrada' });
  const norm = v => (v === '' ? null : v);
  const sets = [], vals = [], cambios = [];
  const pedir = (col, nuevo, viejo) => {
    if (nuevo === undefined) return;
    const n = norm(nuevo);
    if (n === (viejo ?? null)) return;
    sets.push(`${col} = ?`); vals.push(n);
    cambios.push(`${col}: ${viejo ?? '(vacio)'} -> ${n ?? '(vacio)'}`);
  };
  pedir('nombre', req.body.nombre, c.nombre);
  pedir('edad', req.body.edad, c.edad);
  if (!sets.length) return res.json({ ok: true, sinCambios: true });
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE clase_ed SET ${sets.join(', ')} WHERE id = ? AND iglesia_id = ?`)
      .run(...vals, c.id, req.user.iglesia_id);
    auditar(req.user.iglesia_id, req.user.persona_id, 'editar_clase', 'ninos', cambios.join(' · '),
      { tabla: 'clase_ed', id: c.id });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.json({ ok: true });
});

// Borrar una clase: SOLO vacia (decision del dueno, 5-ago). Con ninos, 409 —
// borrar fichas de menores en bloque es demasiado facil de hacer por error;
// cada borrado de nino ya existe, se confirma y se audita uno a uno.
// Vacia: se lleva sus lecciones y las filas VIEJAS de asistencia (huerfanas
// de ninos movidos o borrados; ese historial ya no lo muestra ninguna
// pantalla — mismo razonamiento que el borrado de ninos de la Fase 13).
// Los archivos de las lecciones quedan huerfanos en /uploads: asumido.
r.delete('/clases/:id', soloEncargado, (req, res) => {
  const c = db.prepare('SELECT id, nombre FROM clase_ed WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, req.user.iglesia_id);
  if (!c) return res.status(404).json({ error: 'Clase no encontrada' });
  const ninos = db.prepare('SELECT COUNT(*) AS n FROM nino WHERE clase_id = ?').get(c.id).n;
  if (ninos > 0)
    return res.status(409).json({ error: `La clase tiene ${ninos} niño(s): mueve o borra sus fichas primero.` });
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM asistencia_nino WHERE clase_id = ?').run(c.id);
    const lecciones = db.prepare('DELETE FROM leccion WHERE clase_id = ?').run(c.id).changes;
    db.prepare('DELETE FROM clase_ed WHERE id = ?').run(c.id);
    auditar(req.user.iglesia_id, req.user.persona_id, 'eliminar_clase', 'ninos',
      `${c.nombre} (${lecciones} leccion(es))`, { tabla: 'clase_ed', id: c.id });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: 'No se pudo borrar la clase' }); }
  res.json({ ok: true });
});
```

- [ ] **Step 4: Verde + suite completa** (`node --test test/clases-lecciones.test.js && npm test`)

- [ ] **Step 5: Commit**

```bash
git add backend/test/clases-lecciones.test.js backend/src/ninos.js
git commit -m "feat(ninos): corregir y borrar clases -- solo vacias, con rastro, y crear por fin audita

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Backend — lecciones (PATCH + DELETE + auditar crear de lección y niño)

**Files:**
- Modify: `backend/src/ninos.js` (tras `POST /material`; `auditar` en `POST /material` y `POST /ninos`)
- Modify: `backend/test/clases-lecciones.test.js` (tests al final)

**Interfaces:**
- Consumes: patrón de la Task 1. Produces: `PATCH /api/ninos/material/:id` (`{titulo?, fecha?, versiculo?}`, `material_url` NO — se ignora en silencio y un test lo fija), `DELETE /api/ninos/material/:id`; `POST /material` audita `crear_leccion`, `POST /ninos` audita `inscribir_nino`.

- [ ] **Step 1: Tests que fallan** — añadir al final del archivo de test:

```js
const crearLeccion = (claseId, campos = {}) => Number(dbDirecta.prepare(
  'INSERT INTO leccion (iglesia_id, clase_id, titulo, fecha, versiculo, material_url) VALUES (?,?,?,?,?,?)'
).run(campos.iglesia_id ?? SEM.iglesiaId, claseId, campos.titulo ?? 'El arca',
      campos.fecha ?? null, campos.versiculo ?? null, campos.material_url ?? null).lastInsertRowid);

test('corregir una leccion: solo cambios auditados, y material_url se ignora', async () => {
  const cl = crearClase();
  const id = crearLeccion(cl, { titulo: 'El arka', material_url: '/uploads/leccion.pdf' });
  const res = await llamar('PATCH', `/api/ninos/material/${id}`,
    { titulo: 'El arca', material_url: '/uploads/otro.pdf' });
  assert.equal(res.status, 200);
  const l = dbDirecta.prepare('SELECT * FROM leccion WHERE id = ?').get(id);
  assert.equal(l.titulo, 'El arca');
  assert.equal(l.material_url, '/uploads/leccion.pdf',
    'el documento NO se cambia por PATCH: se borra la leccion y se sube de nuevo');
  const a = apuntes('editar_leccion');
  assert.equal(a.length, 1);
  assert.ok(a[0].detalle.includes('El arka') && a[0].detalle.includes('El arca'));
});

test('PATCH de leccion con lo mismo: cero apuntes; ajena: 404', async () => {
  const cl = crearClase();
  const id = crearLeccion(cl, { titulo: 'El arca' });
  assert.equal((await llamar('PATCH', `/api/ninos/material/${id}`, { titulo: 'El arca' })).status, 200);
  assert.equal(apuntes('editar_leccion').length, 0);
  const otra = Number(dbDirecta.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra3','OTRA3')").run().lastInsertRowid);
  const clAjena = crearClase({ iglesia_id: otra });
  const ajena = crearLeccion(clAjena, { iglesia_id: otra });
  assert.equal((await llamar('PATCH', `/api/ninos/material/${ajena}`, { titulo: 'X' })).status, 404);
});

test('borrar una leccion: propia 200 con apunte, ajena 404', async () => {
  const cl = crearClase();
  const id = crearLeccion(cl, { titulo: 'El arca' });
  const res = await llamar('DELETE', `/api/ninos/material/${id}`);
  assert.equal(res.status, 200);
  assert.equal(dbDirecta.prepare('SELECT COUNT(*) AS n FROM leccion WHERE id = ?').get(id).n, 0);
  const a = apuntes('eliminar_leccion');
  assert.equal(a.length, 1);
  assert.ok(a[0].detalle.includes('El arca'));
  const otra = Number(dbDirecta.prepare(
    "INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Otra4','OTRA4')").run().lastInsertRowid);
  const clAjena = crearClase({ iglesia_id: otra });
  const ajena = crearLeccion(clAjena, { iglesia_id: otra });
  assert.equal((await llamar('DELETE', `/api/ninos/material/${ajena}`)).status, 404);
});

test('inscribir un nino y subir una leccion dejan apunte', async () => {
  const cl = crearClase();
  await llamar('POST', '/api/ninos/ninos', { clase_id: cl, nombre: 'Sofi' });
  await llamar('POST', '/api/ninos/material', { clase_id: cl, titulo: 'El arca' });
  assert.equal(apuntes('inscribir_nino').length, 1);
  assert.equal(apuntes('crear_leccion').length, 1);
});
```

- [ ] **Step 2: FALLAR** → **Step 3: Implementar**:

En `POST /ninos` (tras el INSERT, línea ~65): `auditar(req.user.iglesia_id, req.user.persona_id, 'inscribir_nino', 'ninos', nombre);`
En `POST /material` (tras el INSERT): `auditar(req.user.iglesia_id, req.user.persona_id, 'crear_leccion', 'ninos', titulo);`

Rutas nuevas tras `POST /material`:

```js
// Corregir una leccion: titulo, fecha, versiculo. El documento NO se cambia
// por esta via (un archivo equivocado se arregla borrando la leccion y
// subiendola de nuevo): material_url no esta en el esquema y validar() lo
// descarta en silencio — un test lo fija.
const editarLeccionSchema = z.object({
  titulo: z.string().trim().min(1, 'falta el titulo').optional(),
  fecha: z.string().trim().optional(),
  versiculo: z.string().trim().optional()
}).refine(b => b.titulo !== undefined || b.fecha !== undefined || b.versiculo !== undefined,
  { message: 'no viene ningun campo que cambiar' });
r.patch('/material/:id', soloEncargado, validar(editarLeccionSchema), (req, res) => {
  // leccion.iglesia_id existe: el acotado va directo, sin pasar por la clase.
  const l = db.prepare('SELECT id, titulo, fecha, versiculo FROM leccion WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, req.user.iglesia_id);
  if (!l) return res.status(404).json({ error: 'Lección no encontrada' });
  const norm = v => (v === '' ? null : v);
  const sets = [], vals = [], cambios = [];
  const pedir = (col, nuevo, viejo) => {
    if (nuevo === undefined) return;
    const n = norm(nuevo);
    if (n === (viejo ?? null)) return;
    sets.push(`${col} = ?`); vals.push(n);
    cambios.push(`${col}: ${viejo ?? '(vacio)'} -> ${n ?? '(vacio)'}`);
  };
  pedir('titulo', req.body.titulo, l.titulo);
  pedir('fecha', req.body.fecha, l.fecha);
  pedir('versiculo', req.body.versiculo, l.versiculo);
  if (!sets.length) return res.json({ ok: true, sinCambios: true });
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE leccion SET ${sets.join(', ')} WHERE id = ? AND iglesia_id = ?`)
      .run(...vals, l.id, req.user.iglesia_id);
    auditar(req.user.iglesia_id, req.user.persona_id, 'editar_leccion', 'ninos', cambios.join(' · '),
      { tabla: 'leccion', id: l.id });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.json({ ok: true });
});

// Borrar una leccion. El archivo subido queda huerfano en /uploads: asumido,
// como en el resto de la app.
r.delete('/material/:id', soloEncargado, (req, res) => {
  const l = db.prepare('SELECT id, titulo FROM leccion WHERE id = ? AND iglesia_id = ?')
    .get(req.params.id, req.user.iglesia_id);
  if (!l) return res.status(404).json({ error: 'Lección no encontrada' });
  db.prepare('DELETE FROM leccion WHERE id = ? AND iglesia_id = ?').run(l.id, req.user.iglesia_id);
  auditar(req.user.iglesia_id, req.user.persona_id, 'eliminar_leccion', 'ninos', l.titulo,
    { tabla: 'leccion', id: l.id });
  res.json({ ok: true });
});
```

⚠️ Nota sobre el `pedir` duplicado entre las dos rutas nuevas y las de la Task 1: son cuatro copias de un helper de 7 líneas. Si al implementar se ve limpio extraer UN `soloCambios()` local al archivo (arriba, junto a `claseDeIglesia`), hacerlo y decirlo en el reporte; si obliga a contorsiones, dejar las copias — DRY no paga contorsiones.

- [ ] **Step 4: Verde + suite completa** → **Step 5: Commit**

```bash
git add backend/test/clases-lecciones.test.js backend/src/ninos.js
git commit -m "feat(ninos): corregir y borrar lecciones, y todo el modulo deja rastro al crear

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — botones, paneles y confirmaciones

**Files:**
- Modify: `web/app.js` — `cargarClases` (~2833), `vistaClase` (~2852), `cargarMaterial` (~2864), funciones nuevas

**Interfaces:**
- Consumes: las 4 rutas nuevas. Produces: `window._clasesEd` (caché de `cargarClases`), `window._materialEd` (caché de `cargarMaterial`), `formEditarClase()`, `guardarEdicionClase()`, `borrarClase()`, `formEditarLeccion(id)`, `guardarEdicionLeccion(id)`, `borrarLeccion(id)`.

- [ ] **Step 1: Implementar** (leer el código actual primero; los números de línea pueden haber corrido):

1. `cargarClases`: tras `const cl=await api('/ninos/clases');` añadir `window._clasesEd=cl;`.
2. `vistaClase(id,nombre)`: la cabecera gana, junto al `<h2>`, para la encargada (`esLiderEdUI()`): botón `✏️` (`onclick="formEditarClase()"`) y `🗑️` (`onclick="borrarClase()"`), más un `<div id="form-editar-clase"></div>` bajo la cabecera.
3. Funciones nuevas (junto a `formClase`):

```js
// Corregir la clase abierta. Prellenado de la cache que acaba de pintar la
// lista (window._clasesEd) — no de una cache de otra pantalla.
function formEditarClase(){
  const z=$('form-editar-clase'); if(!z) return;
  if(z.innerHTML){ z.innerHTML=''; return; }
  const c=(window._clasesEd||[]).find(x=>x.id===_claseActual); if(!c) return;
  z.innerHTML=`<div class="card" style="margin:12px 0">
    <label for="ec-nombre">Nombre</label><input id="ec-nombre" value="${escHtml(c.nombre||'')}"/>
    <label for="ec-edad">Edades</label><input id="ec-edad" value="${escHtml(c.edad||'')}"/>
    <button class="btn small-btn" style="margin-top:10px" onclick="guardarEdicionClase()">Guardar</button></div>`;
}
async function guardarEdicionClase(){
  const nombre=$('ec-nombre').value.trim();
  if(!nombre) return toast('Pon el nombre');
  await conBoton(botonActual(), async()=>{
    try{
      await api('/ninos/clases/'+_claseActual,{method:'PATCH',body:JSON.stringify({nombre,edad:$('ec-edad').value.trim()})});
      toast('Clase corregida'); vistaClase(_claseActual,nombre);
    }catch(e){ toast(e.message); }
  },'Guardando…');
}
// Borrar la clase abierta. El backend rechaza con 409 si tiene ninos — ese
// mensaje (trae el conteo) se muestra tal cual.
function borrarClase(){
  const c=(window._clasesEd||[]).find(x=>x.id===_claseActual);
  // El nombre lo escribe una persona: escHtml SIEMPRE dentro de modalConfirm
  // (la trampa que el plan de la Fase 13 metio y la review cazo).
  modalConfirm(`¿Borrar la clase <b>${escHtml(c?c.nombre:'')}</b>? Se borran también sus lecciones. No se puede deshacer.`, async()=>{
    try{
      await api('/ninos/clases/'+_claseActual,{method:'DELETE'});
      toast('Clase borrada'); vistaNinos();
    }catch(e){ toast(e.message); }
  });
}
```

4. `cargarMaterial`: guardar `window._materialEd=m;` y cada fila gana (solo `esLiderEdUI()`, comprobar cómo obtiene `editar` esa función — hoy no lo consulta; añadir `const editar=esLiderEdUI();` local):

```js
${editar?`<div class="row" style="margin-top:6px;width:auto;gap:8px">
  <button class="btn ghost small-btn" aria-label="Corregir la lección ${escHtml(x.titulo)}" onclick="formEditarLeccion(${Number(x.id)})">Editar</button>
  <button class="btn ghost small-btn" aria-label="Borrar la lección ${escHtml(x.titulo)}" onclick="borrarLeccion(${Number(x.id)})">🗑️</button></div>
<div id="form-leccion-${Number(x.id)}"></div>`:''}
```

5. Panel y acciones de lección (junto a `formMaterial`; el formulario manda sus tres campos como hace `guardarNino` — convención del módulo; el backend audita solo lo que cambió):

```js
function formEditarLeccion(id){
  const z=$('form-leccion-'+id); if(!z) return;
  if(z.innerHTML){ z.innerHTML=''; return; }
  const x=(window._materialEd||[]).find(l=>l.id===id); if(!x) return;
  z.innerHTML=`<div class="form-panel">
    <input id="el-titulo-${id}" value="${escHtml(x.titulo||'')}"/>
    <div class="row" style="margin-top:10px;align-items:center">${fechaSelectHTML('el'+id, x.fecha||'', {opcional:true})}<input id="el-vers-${id}" value="${escHtml(x.versiculo||'')}" placeholder="Versículo"/></div>
    <button class="btn small-btn" style="margin-top:10px" onclick="guardarEdicionLeccion(${Number(id)})">Guardar</button></div>`;
}
async function guardarEdicionLeccion(id){
  const titulo=$('el-titulo-'+id).value.trim();
  if(!titulo) return toast('Pon un título');
  await conBoton(botonActual(), async()=>{
    try{
      await api('/ninos/material/'+id,{method:'PATCH',body:JSON.stringify({titulo,fecha:fechaSelectValor('el'+id),versiculo:$('el-vers-'+id).value.trim()})});
      toast('Lección corregida'); cargarMaterial();
    }catch(e){ toast(e.message); }
  },'Guardando…');
}
function borrarLeccion(id){
  const x=(window._materialEd||[]).find(l=>l.id===id);
  modalConfirm(`¿Borrar la lección <b>${escHtml(x?x.titulo:'')}</b>? No se puede deshacer.`, async()=>{
    try{ await api('/ninos/material/'+id,{method:'DELETE'}); toast('Lección borrada'); cargarMaterial(); }
    catch(e){ toast(e.message); }
  });
}
```

⚠️ `fechaSelectHTML`/`fechaSelectValor`: comprobar su firma real (prefijo + valor inicial + opciones) contra `formMaterial` (línea ~2878) y `fechaSelectHTML('nd1','')` del historial del proyecto; ajustar la llamada a la firma real. ⚠️ `modalConfirm` acepta HTML: comprobar cómo lo llaman las 29 llamadas existentes (hay una con comentario sobre esta misma trampa).

- [ ] **Step 2: Smoke a nivel API con curl** (server local con seed: `marta`/1234 es la maestra ED según la memoria del proyecto — verificar en `seed.js`): PATCH clase, DELETE clase con niños (409), DELETE lección. Anotar qué se probó y qué queda para el click-through de Pablo.

- [ ] **Step 3: Suite completa** (`cd backend && npm test`) — los barridos patrullan los botones y atributos nuevos.

- [ ] **Step 4: Commit**

```bash
git add web/app.js
git commit -m "feat(ninos): editar y borrar clases y lecciones desde la pantalla -- confirmaciones con nombre escapado

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: ESTADO.md al día

**Files:**
- Modify: `ESTADO.md`

- [ ] **Step 1:** Leer la voz del documento (primeras ~150 líneas). Sección nueva tras la última del 5-ago: `## 🆕 5 DE AGOSTO DE 2026 · NOCHE (2) — 👶 las clases y las lecciones ya se corrigen y se borran`, contando: la decisión del dueño (solo clases vacías, y por qué); qué se lleva el borrado (lecciones + asistencia vieja) y el archivo huérfano asumido; que el documento de una lección NO se cambia por PATCH (borrar y resubir); el cierre del hueco de auditoría del 30-jul (crear clase/niño/lección ahora auditan); la verificación manual pendiente de Pablo (como `marta`: editar clase, intentar borrar una con niños y leer el 409, borrar una lección). Tachar quirúrgicamente: el pendiente "Siguen sin poder editarse ni borrarse las clases ni las lecciones" de la Fase 13 (~línea 299) y su gemelo en el punto 4 de "POR DÓNDE RETOMAR · 30 jul tarde" (~línea 803), con `~~...~~` + **(desfasado/resuelto el 5-ago: ...)**. La línea de "Nada del módulo de niños se audita" en "Huecos verificados" del 30-jul también cae. Cabecera actualizada al estado real. Suite: número real medido.

- [ ] **Step 2:** `cd backend && npm test` → **Step 3: Commit**

```bash
git add ESTADO.md
git commit -m "docs(estado): clases y lecciones corregibles -- y el modulo de ninos por fin deja rastro

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura de la spec:** clases → Task 1 · lecciones + auditar creación → Task 2 · frontend → Task 3 · docs → Task 4. Los 8 puntos de test de la spec quedan repartidos en Tasks 1-2.
- **Consistencia:** acciones de auditoría idénticas entre tareas (`editar_clase`/`eliminar_clase`/`crear_clase`/`editar_leccion`/`eliminar_leccion`/`crear_leccion`/`inscribir_nino`); `window._clasesEd`/`_materialEd` definidos y usados solo en Task 3.
- **Esquemas verificados** contra `db.js:281-303` (clase_ed, nino, leccion, asistencia_nino — leccion.iglesia_id existe; asistencia_nino.clase_id referencia clase_ed, de ahí la limpieza en el DELETE).
- **Números de línea** válidos sobre `main` al escribir; localizar por texto citado si corrieron.
