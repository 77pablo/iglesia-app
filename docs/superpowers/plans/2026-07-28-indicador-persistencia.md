# Indicador de persistencia — Plan de implementación

> **Para quien lo ejecute:** usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementarlo tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** que el día en que el respaldo deje de funcionar, alguien se entere ese día — con una tarjeta en el panel del super-admin y un aviso activo, comprobando el respaldo **real** contra R2 y no solo las variables de entorno.

**Arquitectura:** un módulo nuevo `persistencia.js` separa la **interpretación** (funciones puras, probables sin red ni contenedor) de la **obtención** (ejecutar `litestream generations`, leer un sello en disco). A Litestream se le pregunta porque es un proceso vivo con estado; al bucle de `rclone` no se le puede preguntar, así que deja un sello que al envejecer lo delata. El resultado se cachea 5 minutos y se vigila desde `/api/me`, igual que ya se hace con los recordatorios.

**Stack:** Node 24 + Express + `node:sqlite` (ESM), runner nativo `node:test`, frontend vanilla. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-07-28-indicador-persistencia-design.md`

## Restricciones globales

- **Español** en código, comentarios, mensajes de error y textos de interfaz, igual que el resto del repo. Los identificadores de código van **sin tildes** (`interpretarSello`, `retraso_seg`), siguiendo la convención existente.
- **Nunca tumbar la app.** Mismo principio que `push.js`: cualquier fallo del indicador se traga y se registra por consola; jamás se propaga a la petición del usuario.
- **Nunca devolver `stderr` crudo al frontend.** Los motivos son un conjunto cerrado de cadenas cortas: `sin_generaciones`, `retraso_alto`, `formato_no_reconocido`, `comando_fallo`, `tiempo_agotado`, `binario_ausente`, `sello_ausente`, `sello_viejo`, `arrancando`, `error_interno`. La salida de Litestream puede contener el endpoint de R2 y trozos de credenciales.
- **Umbrales, fijados en el spec:** retraso de la BD `15 min`; edad del sello `5 min`; gracia tras arranque `3 min`; caché `5 min`.
- **Cuatro estados**, nunca dos: `ok`, `mal`, `desconocido` (no pude comprobarlo → ámbar, **no** avisa) y `no_aplica` (esta instancia no replica → gris).
- **Sin dependencias nuevas** en `package.json`.
- Ejecutar la suite completa (`cd backend && node --test`) antes de cada commit. Debe quedar en verde; hoy son **248** tests.

---

### Tarea 1: Interpretar la salida de Litestream (funciones puras)

**Archivos:**
- Crear: `backend/src/persistencia.js`
- Crear: `backend/test/persistencia.test.js`

**Interfaces:**
- Consume: nada.
- Produce: `parsearDuracion(txt) -> number|null` (segundos) y `interpretarGeneraciones(salida, ahoraMs) -> {estado, motivo, ultimo, retraso_seg}`, donde `estado` es `'ok'|'mal'|'desconocido'`, `motivo` es `string|null`, `ultimo` es ISO-8601 o `null`, `retraso_seg` es número o `null`.

**Por qué el retraso y no la fecha del último respaldo:** si nadie escribe en la base durante tres horas, la fecha del último dato replicado tiene tres horas de antigüedad y todo está perfectamente bien. Medir la salud por esa fecha daría una alarma falsa cada noche. El `lag` de Litestream es la distancia entre la última escritura y lo replicado: con la app inactiva se queda en cero. La fecha se usa **solo para mostrar** "último respaldo: hace X".

- [ ] **Paso 1: Escribir los tests que fallan**

Crear `backend/test/persistencia.test.js`:

```js
// ============================================================
//  Interpretacion del estado del respaldo: funciones PURAS.
//  No ejecutan litestream ni tocan disco ni red: reciben la salida como
//  texto y devuelven el veredicto. Por eso se pueden probar en Windows,
//  sin contenedor y sin bucket.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearDuracion, interpretarGeneraciones } from '../src/persistencia.js';

// Salida real de `litestream generations` (columnas alineadas con espacios).
const CABECERA = 'name  generation        lag     start                     end';
const salidaCon = (lag, end) =>
  `${CABECERA}\ns3    b16ddcf5c692d391  ${lag}  2026-07-28T09:00:00.000Z  ${end}`;

const AHORA = Date.parse('2026-07-28T15:00:00.000Z');

test('parsearDuracion entiende el formato de duracion de Go', () => {
  assert.equal(parsearDuracion('0s'), 0);
  assert.equal(parsearDuracion('1.5s'), 1.5);
  assert.equal(parsearDuracion('2m30s'), 150);
  assert.equal(parsearDuracion('1h0m0s'), 3600);
  assert.equal(parsearDuracion('500ms'), 0.5);
  assert.equal(parsearDuracion(''), null);
  assert.equal(parsearDuracion('-'), null);
  assert.equal(parsearDuracion(null), null);
});

test('retraso pequeno -> ok, y devuelve la fecha del ultimo dato replicado', () => {
  const r = interpretarGeneraciones(salidaCon('1.2s', '2026-07-28T14:58:00.000Z'), AHORA);
  assert.equal(r.estado, 'ok');
  assert.equal(r.motivo, null);
  assert.equal(r.ultimo, '2026-07-28T14:58:00.000Z');
  assert.equal(r.retraso_seg, 1);
});

test('la app inactiva no es una alarma: fecha vieja pero retraso cero -> ok', () => {
  // Nadie escribio en 3 horas. El ultimo dato replicado es viejo, pero no hay
  // nada pendiente de replicar: esto es sano, y medirlo por la fecha mentiria.
  const r = interpretarGeneraciones(salidaCon('0s', '2026-07-28T12:00:00.000Z'), AHORA);
  assert.equal(r.estado, 'ok');
});

test('retraso por encima del umbral (15 min) -> mal', () => {
  const r = interpretarGeneraciones(salidaCon('22m14s', '2026-07-28T14:37:00.000Z'), AHORA);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'retraso_alto');
  assert.equal(r.retraso_seg, 1334);
});

test('sin ninguna generacion -> mal: nunca se replico nada', () => {
  const r = interpretarGeneraciones(CABECERA, AHORA);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'sin_generaciones');
});

test('salida vacia -> mal', () => {
  assert.equal(interpretarGeneraciones('', AHORA).estado, 'mal');
});

test('formato irreconocible -> desconocido, NUNCA mal', () => {
  // Si una version futura de litestream cambia las columnas, el fallo seguro es
  // "no pude saberlo" (ambar, sin aviso), no una alarma falsa a medianoche.
  const r = interpretarGeneraciones('vaya cosa mas rara\nsin columnas', AHORA);
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'formato_no_reconocido');
});

test('con varias generaciones se toma la mas reciente', () => {
  const salida = `${CABECERA}
s3    aaaaaaaaaaaaaaaa  9m0s   2026-07-20T09:00:00.000Z  2026-07-20T10:00:00.000Z
s3    bbbbbbbbbbbbbbbb  2s     2026-07-28T09:00:00.000Z  2026-07-28T14:59:00.000Z`;
  const r = interpretarGeneraciones(salida, AHORA);
  assert.equal(r.estado, 'ok');
  assert.equal(r.ultimo, '2026-07-28T14:59:00.000Z');
});

test('ningun motivo expone credenciales ni rutas del servidor', () => {
  const sucia = 'error: AccessDenied endpoint=https://abc123.r2.cloudflarestorage.com key=AKIAsecreta';
  const r = interpretarGeneraciones(sucia, AHORA);
  assert.equal(r.estado, 'desconocido');
  assert.ok(!/cloudflarestorage|AKIA|key=/.test(JSON.stringify(r)),
    'el resultado no puede arrastrar la salida cruda de litestream');
});
```

- [ ] **Paso 2: Correr los tests y ver que fallan**

Ejecutar: `cd backend && node --test test/persistencia.test.js`
Esperado: FALLA con `Cannot find module ... persistencia.js`.

- [ ] **Paso 3: Escribir la implementación mínima**

Crear `backend/src/persistencia.js`:

```js
// ============================================================
//  Estado del respaldo externo (persistencia).
//
//  Que la base de datos se este respaldando o no vivia en una sola linea del
//  log de arranque del contenedor, que nadie lee. Este modulo lo saca a la luz.
//
//  La INTERPRETACION (este bloque) es pura: recibe texto y devuelve veredicto.
//  La OBTENCION (mas abajo, tarea 3) ejecuta litestream y lee disco. Estan
//  separadas para poder probar la logica sin contenedor, sin red y sin bucket.
// ============================================================

// Umbrales del spec (docs/superpowers/specs/2026-07-28-indicador-persistencia-design.md).
export const UMBRAL_RETRASO_SEG = 15 * 60;   // el retraso normal se mide en segundos

// Duracion en formato Go ("1.5s", "2m30s", "1h0m0s", "500ms"), que es como la
// imprime litestream. Devuelve segundos, o null si no se reconoce.
export function parsearDuracion(txt) {
  const s = String(txt ?? '').trim();
  if (!s) return null;
  const factor = { ms: 0.001, s: 1, m: 60, h: 3600 };
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;   // 'ms' primero: si no, "500ms" leeria "500m"
  let total = 0, hubo = false, m;
  while ((m = re.exec(s)) !== null) { total += parseFloat(m[1]) * factor[m[2]]; hubo = true; }
  return hubo ? total : null;
}

// Interpreta la salida de `litestream generations`.
// La cabecera se lee por NOMBRE de columna, no por posicion: si una version
// futura reordena o renombra columnas, el resultado es 'desconocido' (ambar, sin
// aviso) en vez de una alarma falsa. Ante la duda, callar, no gritar.
export function interpretarGeneraciones(salida, ahoraMs = Date.now()) {
  const nada = { estado: 'mal', motivo: 'sin_generaciones', ultimo: null, retraso_seg: null };
  const raro = { estado: 'desconocido', motivo: 'formato_no_reconocido', ultimo: null, retraso_seg: null };

  const lineas = String(salida ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lineas.length === 0) return nada;

  const cab = lineas[0].toLowerCase().split(/\s+/);
  const iLag = cab.indexOf('lag');
  const iEnd = cab.indexOf('end');
  if (iLag === -1 || iEnd === -1) return raro;
  if (lineas.length === 1) return nada;   // cabecera sola: nunca se replico

  let mejor = null;
  for (const fila of lineas.slice(1)) {
    const col = fila.split(/\s+/);
    const t = Date.parse(col[iEnd]);
    if (!Number.isFinite(t)) continue;
    if (!mejor || t > mejor.t) mejor = { t, lag: col[iLag] };
  }
  if (!mejor) return raro;

  const retraso = parsearDuracion(mejor.lag);
  const ultimo = new Date(mejor.t).toISOString();
  if (retraso === null) return { ...raro, ultimo };

  const alto = retraso > UMBRAL_RETRASO_SEG;
  return {
    estado: alto ? 'mal' : 'ok',
    motivo: alto ? 'retraso_alto' : null,
    ultimo,
    retraso_seg: Math.round(retraso)
  };
}
```

- [ ] **Paso 4: Correr los tests y ver que pasan**

Ejecutar: `cd backend && node --test test/persistencia.test.js`
Esperado: PASA, `pass 9 / fail 0`.

- [ ] **Paso 5: Commit**

```bash
git add backend/src/persistencia.js backend/test/persistencia.test.js
git commit -m "feat(persistencia): interpretar la salida de litestream"
```

---

### Tarea 2: Interpretar el sello de uploads (función pura)

**Archivos:**
- Modificar: `backend/src/persistencia.js`
- Modificar: `backend/test/persistencia.test.js`

**Interfaces:**
- Consume: nada de tareas anteriores.
- Produce: `interpretarSello(contenido, ahoraMs, arranqueMs) -> {estado, motivo, ultimo}`, con `estado` en `'ok'|'mal'|'desconocido'`.

**El caso que no se puede olvidar:** en el plan free el contenedor se detiene al dormirse y el disco es efímero. Al despertar **no hay sello** hasta que el bucle de `rclone` complete su primera vuelta (30 s). Una comprobación en ese hueco vería "nunca se ha respaldado" y avisaría por nada. Por eso los primeros 3 minutos de vida del proceso, la ausencia de sello es *desconocido*, no *mal*.

- [ ] **Paso 1: Añadir los tests que fallan**

Añadir al final de `backend/test/persistencia.test.js` (y ampliar el `import` de arriba a `import { parsearDuracion, interpretarGeneraciones, interpretarSello } from '../src/persistencia.js';`):

```js
// --- Sello de uploads --------------------------------------------------
// El bucle de rclone reescribe el sello tras CADA sincronizacion correcta.
// Si el bucle muere, muere en silencio: el sello envejeciendo es lo unico
// que lo delata.
const ARRANQUE_VIEJO = AHORA - 60 * 60 * 1000;   // el proceso lleva 1 hora arriba
const ARRANQUE_RECIEN = AHORA - 30 * 1000;       // el proceso lleva 30 segundos

test('sello fresco -> ok', () => {
  const r = interpretarSello('2026-07-28T14:59:30Z', AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'ok');
  assert.equal(r.motivo, null);
  assert.equal(r.ultimo, '2026-07-28T14:59:30.000Z');
});

test('sello viejo (mas de 5 min) con el proceso ya asentado -> mal', () => {
  const r = interpretarSello('2026-07-28T14:40:00Z', AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'sello_viejo');
});

test('sin sello con el proceso ya asentado -> mal', () => {
  const r = interpretarSello('', AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'sello_ausente');
});

test('sin sello DENTRO del periodo de gracia -> desconocido, no mal', () => {
  // Al despertar del sueno del plan free, /data viene vacio y el bucle aun no
  // ha dado su primera vuelta. Avisar aqui seria avisar por nada, y una alarma
  // que suena por nada se aprende a ignorar.
  const r = interpretarSello('', AHORA, ARRANQUE_RECIEN);
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'arrancando');
});

test('sello viejo dentro del periodo de gracia -> desconocido', () => {
  const r = interpretarSello('2026-07-28T10:00:00Z', AHORA, ARRANQUE_RECIEN);
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'arrancando');
});

test('sello con contenido ilegible -> desconocido', () => {
  const r = interpretarSello('no soy una fecha', AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'formato_no_reconocido');
});
```

- [ ] **Paso 2: Correr y ver que fallan**

Ejecutar: `cd backend && node --test test/persistencia.test.js`
Esperado: FALLA con `interpretarSello is not a function`.

- [ ] **Paso 3: Implementar**

Añadir a `backend/src/persistencia.js`, debajo de `UMBRAL_RETRASO_SEG`:

```js
export const UMBRAL_SELLO_SEG = 5 * 60;      // el bucle de rclone corre cada 30 s
export const GRACIA_ARRANQUE_SEG = 3 * 60;   // margen para la primera vuelta del bucle

// Momento en que arranco este proceso. Sirve para el periodo de gracia: al
// despertar del sueno del plan free, /data viene vacio y el sello aun no existe.
export const ARRANQUE_MS = Date.now();
```

Y al final del archivo:

```js
// Interpreta el sello que deja el bucle de rclone tras cada sincronizacion.
// Dentro del periodo de gracia, la falta de sello no es un fallo: es que el
// bucle todavia no ha dado su primera vuelta.
export function interpretarSello(contenido, ahoraMs = Date.now(), arranqueMs = ARRANQUE_MS) {
  const enGracia = (ahoraMs - arranqueMs) / 1000 < GRACIA_ARRANQUE_SEG;
  const txt = String(contenido ?? '').trim();

  if (!txt) {
    return enGracia
      ? { estado: 'desconocido', motivo: 'arrancando', ultimo: null }
      : { estado: 'mal', motivo: 'sello_ausente', ultimo: null };
  }

  const t = Date.parse(txt);
  if (!Number.isFinite(t)) return { estado: 'desconocido', motivo: 'formato_no_reconocido', ultimo: null };

  const ultimo = new Date(t).toISOString();
  if ((ahoraMs - t) / 1000 > UMBRAL_SELLO_SEG) {
    return enGracia
      ? { estado: 'desconocido', motivo: 'arrancando', ultimo }
      : { estado: 'mal', motivo: 'sello_viejo', ultimo };
  }
  return { estado: 'ok', motivo: null, ultimo };
}
```

- [ ] **Paso 4: Correr y ver que pasan**

Ejecutar: `cd backend && node --test test/persistencia.test.js`
Esperado: PASA, `pass 15 / fail 0`.

- [ ] **Paso 5: Commit**

```bash
git add backend/src/persistencia.js backend/test/persistencia.test.js
git commit -m "feat(persistencia): interpretar el sello de uploads, con periodo de gracia"
```

---

### Tarea 3: Obtener el estado real (ejecutar Litestream, leer el sello, cachear)

**Archivos:**
- Modificar: `backend/src/persistencia.js`
- Modificar: `backend/test/persistencia.test.js`

**Interfaces:**
- Consume: `interpretarGeneraciones`, `interpretarSello` (tareas 1 y 2).
- Produce: `estadoPersistencia() -> Promise<{modo, ok, bd, uploads}>` donde `modo` es `'litestream'|'sin-replica'`, `ok` es `boolean|null`, y `bd`/`uploads` son los objetos de las tareas 1 y 2. También `_limpiarCache()` para los tests.

- [ ] **Paso 1: Añadir los tests que fallan**

Ampliar el `import` a `import { parsearDuracion, interpretarGeneraciones, interpretarSello, estadoPersistencia, _limpiarCache } from '../src/persistencia.js';` y añadir al final:

```js
// --- Obtencion del estado real -----------------------------------------
test('sin variables de R2 el modo es "sin-replica" y todo es no_aplica', async () => {
  const previas = { b: process.env.R2_BUCKET, k: process.env.LITESTREAM_ACCESS_KEY_ID, e: process.env.R2_ENDPOINT };
  delete process.env.R2_BUCKET; delete process.env.LITESTREAM_ACCESS_KEY_ID; delete process.env.R2_ENDPOINT;
  _limpiarCache();
  try {
    const r = await estadoPersistencia();
    assert.equal(r.modo, 'sin-replica');
    assert.equal(r.bd.estado, 'no_aplica');
    assert.equal(r.uploads.estado, 'no_aplica');
    assert.equal(r.ok, null, 'sin replica no es ni bien ni mal: no aplica');
  } finally {
    if (previas.b) process.env.R2_BUCKET = previas.b;
    if (previas.k) process.env.LITESTREAM_ACCESS_KEY_ID = previas.k;
    if (previas.e) process.env.R2_ENDPOINT = previas.e;
    _limpiarCache();
  }
});

test('con variables de R2 pero sin el binario, la BD es no_aplica y no revienta', async () => {
  const previas = { b: process.env.R2_BUCKET, k: process.env.LITESTREAM_ACCESS_KEY_ID, e: process.env.R2_ENDPOINT };
  process.env.R2_BUCKET = 'bucket-de-prueba';
  process.env.LITESTREAM_ACCESS_KEY_ID = 'clave-de-prueba';
  process.env.R2_ENDPOINT = 'https://ejemplo.invalido';
  _limpiarCache();
  try {
    // En Windows/desarrollo no existe el binario: el modulo debe decirlo, no caerse.
    const r = await estadoPersistencia();
    assert.ok(['no_aplica', 'desconocido'].includes(r.bd.estado));
    assert.ok(!/cloudflarestorage|clave-de-prueba/.test(JSON.stringify(r)),
      'el estado no puede arrastrar credenciales');
  } finally {
    if (previas.b) process.env.R2_BUCKET = previas.b; else delete process.env.R2_BUCKET;
    if (previas.k) process.env.LITESTREAM_ACCESS_KEY_ID = previas.k; else delete process.env.LITESTREAM_ACCESS_KEY_ID;
    if (previas.e) process.env.R2_ENDPOINT = previas.e; else delete process.env.R2_ENDPOINT;
    _limpiarCache();
  }
});
```

- [ ] **Paso 2: Correr y ver que fallan**

Ejecutar: `cd backend && node --test test/persistencia.test.js`
Esperado: FALLA con `estadoPersistencia is not a function`.

- [ ] **Paso 3: Implementar**

Añadir al principio de `backend/src/persistencia.js` (bajo la cabecera de comentario):

```js
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
```

Y al final del archivo:

```js
// ============================================================
//  OBTENCION: aqui si se ejecuta un binario y se toca el disco.
// ============================================================

const CACHE_MS = 5 * 60 * 1000;
let cache = null;
export function _limpiarCache() { cache = null; }   // solo para pruebas

// Las mismas tres variables que mira docker-entrypoint.sh para decidir si
// arranca con replicacion. Si no estan, esta instancia no replica y punto.
function hayReplica() {
  return !!(process.env.R2_BUCKET && process.env.LITESTREAM_ACCESS_KEY_ID && process.env.R2_ENDPOINT);
}

function rutaSello() {
  if (process.env.RESPALDO_SELLO) return process.env.RESPALDO_SELLO;
  const uploads = process.env.UPLOADS_DIR || '/data/uploads';
  return path.join(path.dirname(uploads), '.respaldo-uploads');
}

// Ejecuta `litestream generations`. NUNCA propaga stderr: se clasifica el fallo
// en un motivo corto y se descarta el texto, que puede traer endpoint y llaves.
function pedirGeneraciones() {
  return new Promise(resolve => {
    execFile(
      'litestream',
      ['generations', '-config', '/etc/litestream.yml', process.env.DB_PATH || ''],
      { timeout: 3000, windowsHide: true },
      (err, stdout) => {
        if (!err) return resolve({ salida: stdout });
        if (err.code === 'ENOENT') return resolve({ motivo: 'binario_ausente' });
        if (err.killed) return resolve({ motivo: 'tiempo_agotado' });
        resolve({ motivo: 'comando_fallo' });
      }
    );
  });
}

async function calcular() {
  if (!hayReplica()) {
    const nada = { estado: 'no_aplica', motivo: null, ultimo: null };
    return { modo: 'sin-replica', ok: null, bd: { ...nada, retraso_seg: null }, uploads: { ...nada } };
  }

  const r = await pedirGeneraciones();
  const bd = r.salida
    ? interpretarGeneraciones(r.salida)
    : {
        // Sin binario no es un fallo del respaldo: es que esta instancia no es
        // el contenedor (desarrollo local). Lo demas si es "no pude saberlo".
        estado: r.motivo === 'binario_ausente' ? 'no_aplica' : 'desconocido',
        motivo: r.motivo, ultimo: null, retraso_seg: null
      };

  let contenido = '';
  try { contenido = fs.readFileSync(rutaSello(), 'utf8'); } catch { contenido = ''; }
  const uploads = bd.estado === 'no_aplica' && r.motivo === 'binario_ausente'
    ? { estado: 'no_aplica', motivo: null, ultimo: null }
    : interpretarSello(contenido);

  const ok = bd.estado === 'ok' && uploads.estado === 'ok';
  return { modo: 'litestream', ok, bd, uploads };
}

// Estado del respaldo, cacheado 5 minutos: abrir el panel varias veces no debe
// llamar a R2 varias veces. Nunca lanza: si algo revienta, devuelve 'desconocido'.
export async function estadoPersistencia() {
  if (cache && Date.now() - cache.ts < CACHE_MS) return cache.valor;
  let valor;
  try {
    valor = await calcular();
  } catch (e) {
    console.error('[persistencia]', e.message);
    const gris = { estado: 'desconocido', motivo: 'error_interno', ultimo: null };
    valor = { modo: 'desconocido', ok: null, bd: { ...gris, retraso_seg: null }, uploads: { ...gris } };
  }
  cache = { ts: Date.now(), valor };
  return valor;
}
```

- [ ] **Paso 4: Correr la suite completa**

Ejecutar: `cd backend && node --test`
Esperado: `pass 265 / fail 0` (248 previos + 17 nuevos).

- [ ] **Paso 5: Commit**

```bash
git add backend/src/persistencia.js backend/test/persistencia.test.js
git commit -m "feat(persistencia): obtener el estado real, con cache y sin filtrar credenciales"
```

---

### Tarea 4: La tabla `aviso_sistema` y el aviso al super-admin

**Archivos:**
- Modificar: `backend/src/db.js` (bloque de `CREATE TABLE`, junto a `recordatorio_enviado`)
- Modificar: `backend/src/persistencia.js`
- Crear: `backend/test/persistencia.aviso.test.js`

**Interfaces:**
- Consume: `estadoPersistencia()` (tarea 3).
- Produce: `avisarSiMal(estado, hoy) -> number` (cuántas notificaciones creó) y `vigilarPersistenciaThrottled() -> void` (dispara y olvida).

**Por qué una tabla nueva y no `recordatorio_enviado`:** esa tabla tiene `iglesia_id INTEGER NOT NULL REFERENCES iglesia(id)` y el super-admin es cuenta de sistema con `iglesia_id = NULL`. El `INSERT` fallaría por restricción, dentro del propio camino del aviso. Aflojar ese `NOT NULL` por un caso ajeno debilitaría una garantía que hoy es correcta.

- [ ] **Paso 1: Escribir los tests que fallan**

Crear `backend/test/persistencia.aviso.test.js`:

```js
// ============================================================
//  El aviso: se crea UNA vez al dia aunque el estado siga mal.
//  El registro de "ya avise" vive en la misma BD cuya perdida se intenta
//  prevenir, asi que si la BD es efimera se pierde en cada reinicio. Por eso
//  la clave es por DIA: en el peor caso, un aviso al dia, no uno por reinicio.
// ============================================================
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';
import { avisarSiMal } from '../src/persistencia.js';

let db, superId;
before(async () => {
  db = await cargarDb();
  const r = db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (NULL,'super','Super','x','super_admin',1)"
  ).run();
  superId = Number(r.lastInsertRowid);
});

const MAL = { modo: 'litestream', ok: false,
  bd: { estado: 'mal', motivo: 'retraso_alto', ultimo: null, retraso_seg: 1800 },
  uploads: { estado: 'ok', motivo: null, ultimo: null } };
const BIEN = { modo: 'litestream', ok: true,
  bd: { estado: 'ok', motivo: null, ultimo: null, retraso_seg: 1 },
  uploads: { estado: 'ok', motivo: null, ultimo: null } };
const GRIS = { modo: 'litestream', ok: false,
  bd: { estado: 'desconocido', motivo: 'tiempo_agotado', ultimo: null, retraso_seg: null },
  uploads: { estado: 'ok', motivo: null, ultimo: null } };

const avisos = () => db.prepare("SELECT COUNT(*) n FROM notificacion WHERE persona_id = ? AND tipo = 'sistema'").get(superId).n;

test('el estado malo crea el aviso al super-admin', () => {
  const antes = avisos();
  assert.equal(avisarSiMal(MAL, '2026-08-01'), 1);
  assert.equal(avisos(), antes + 1);
});

test('el mismo dia no vuelve a avisar aunque siga mal', () => {
  const antes = avisos();
  assert.equal(avisarSiMal(MAL, '2026-08-01'), 0);
  assert.equal(avisos(), antes, 'un aviso por dia, no uno por comprobacion');
});

test('caer, recuperarse y volver a caer el mismo dia tampoco duplica', () => {
  avisarSiMal(BIEN, '2026-08-01');
  const antes = avisos();
  assert.equal(avisarSiMal(MAL, '2026-08-01'), 0);
  assert.equal(avisos(), antes);
});

test('al dia siguiente si vuelve a avisar', () => {
  const antes = avisos();
  assert.equal(avisarSiMal(MAL, '2026-08-02'), 1);
  assert.equal(avisos(), antes + 1);
});

test('el estado bueno no avisa', () => {
  const antes = avisos();
  assert.equal(avisarSiMal(BIEN, '2026-08-03'), 0);
  assert.equal(avisos(), antes);
});

test('"no pude comprobarlo" NO avisa: un corte de red no es perdida de datos', () => {
  const antes = avisos();
  assert.equal(avisarSiMal(GRIS, '2026-08-04'), 0);
  assert.equal(avisos(), antes);
});
```

- [ ] **Paso 2: Correr y ver que fallan**

Ejecutar: `cd backend && node --test test/persistencia.aviso.test.js`
Esperado: FALLA con `avisarSiMal is not a function`.

- [ ] **Paso 3: Crear la tabla**

En `backend/src/db.js`, justo **después** del bloque `CREATE TABLE IF NOT EXISTS recordatorio_enviado (...);`, añadir:

```sql
-- AVISOS DE SISTEMA: dedupe de avisos que NO pertenecen a ninguna iglesia ni a
-- ninguna persona (hoy: "el respaldo no esta funcionando", que se manda al
-- super-admin, cuenta de sistema con iglesia_id NULL). No se reutiliza
-- recordatorio_enviado porque su iglesia_id es NOT NULL y aqui no hay iglesia.
CREATE TABLE IF NOT EXISTS aviso_sistema (
  clave  TEXT PRIMARY KEY,
  fecha  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Paso 4: Implementar el aviso**

Añadir a `backend/src/persistencia.js` — el `import db from './db.js';` va arriba con los demás imports:

```js
// Avisa al super-admin cuando el respaldo esta MAL. Solo 'mal': 'desconocido'
// es "no pude comprobarlo" y avisar por un corte de red de tres segundos es el
// ruido que hace que las alarmas se aprendan a ignorar.
// Devuelve cuantas notificaciones creo (0 si ya se aviso hoy).
export function avisarSiMal(estado, hoy = new Date().toISOString().slice(0, 10)) {
  if (!estado) return 0;
  if (estado.bd.estado !== 'mal' && estado.uploads.estado !== 'mal') return 0;

  const ins = db.prepare('INSERT OR IGNORE INTO aviso_sistema (clave) VALUES (?)')
    .run('persistencia:mal:' + hoy);
  if (ins.changes === 0) return 0;   // ya se aviso hoy

  const partes = [];
  if (estado.bd.estado === 'mal') partes.push('la base de datos');
  if (estado.uploads.estado === 'mal') partes.push('los archivos subidos');
  const texto = `No se está respaldando ${partes.join(' ni ')}. `
    + 'Si el servicio se reinicia ahora, esos datos se pierden. '
    + 'Revisa las variables R2_* y LITESTREAM_* en Render.';

  const admins = db.prepare("SELECT id FROM persona WHERE rol_global = 'super_admin' AND activo = 1").all();
  const st = db.prepare("INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?, 'sistema', ?, ?)");
  for (const a of admins) st.run(a.id, '⚠️ El respaldo no está funcionando', texto);
  return admins.length;
}

// Dispara la comprobacion y olvida. Mismo patron que generarRecordatoriosThrottled:
// se llama desde /api/me, asi que cualquier trafico en la app comprueba el respaldo.
let ultimaVigilancia = 0;
export function vigilarPersistenciaThrottled() {
  if (Date.now() - ultimaVigilancia < CACHE_MS) return;
  ultimaVigilancia = Date.now();
  estadoPersistencia()
    .then(e => { try { avisarSiMal(e); } catch (err) { console.error('[persistencia]', err.message); } })
    .catch(err => console.error('[persistencia]', err.message));
}
```

- [ ] **Paso 5: Correr la suite completa**

Ejecutar: `cd backend && node --test`
Esperado: `pass 271 / fail 0`.

- [ ] **Paso 6: Commit**

```bash
git add backend/src/db.js backend/src/persistencia.js backend/test/persistencia.aviso.test.js
git commit -m "feat(persistencia): avisar al super-admin, una vez al dia"
```

---

### Tarea 5: El endpoint y el disparo desde `/api/me`

**Archivos:**
- Modificar: `backend/src/superadmin.js`
- Modificar: `backend/src/server.js:301-305`
- Crear: `backend/test/persistencia.api.test.js`

**Interfaces:**
- Consume: `estadoPersistencia()`, `vigilarPersistenciaThrottled()` (tareas 3 y 4).
- Produce: `GET /api/superadmin/persistencia`.

- [ ] **Paso 1: Escribir los tests que fallan**

Crear `backend/test/persistencia.api.test.js`:

```js
// ============================================================
//  El endpoint del estado del respaldo: solo el super-admin, y sin filtrar
//  nunca las credenciales de R2 en el motivo que se muestra.
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDb } from './helpers.js';
import { signToken } from '../src/auth.js';

let db, base, srv, superId, pastorId, iglesiaId;

before(async () => {
  db = await cargarDb();
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Ig PERS','PERS')").run();
  iglesiaId = Number(ig.lastInsertRowid);
  superId = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, activo) VALUES (NULL,'super_api','Super','x','super_admin',1)"
  ).run().lastInsertRowid);
  pastorId = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,'pastor_api','Pastor','x',1,1)"
  ).run(iglesiaId).lastInsertRowid);

  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv && new Promise(r => srv.close(r)));

const pedir = (personaId, iglesia) => fetch(base + '/api/superadmin/persistencia', {
  headers: { Authorization: 'Bearer ' + signToken({ id: personaId, iglesia_id: iglesia ?? null }) }
});

test('el pastor NO puede ver el estado del respaldo (403)', async () => {
  const r = await pedir(pastorId, iglesiaId);
  assert.equal(r.status, 403);
});

test('el super-admin lo ve, con los dos bloques', async () => {
  const r = await pedir(superId, null);
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.ok(['litestream', 'sin-replica', 'desconocido'].includes(b.modo));
  assert.ok(['ok', 'mal', 'desconocido', 'no_aplica'].includes(b.bd.estado));
  assert.ok(['ok', 'mal', 'desconocido', 'no_aplica'].includes(b.uploads.estado));
});

test('la respuesta no filtra credenciales ni rutas del servidor', async () => {
  const r = await pedir(superId, null);
  const texto = await r.text();
  assert.ok(!/cloudflarestorage|LITESTREAM_SECRET|AKIA/.test(texto),
    'el estado no puede arrastrar credenciales de R2');
  assert.ok(!/[A-Za-z]:\\\\|\/etc\/litestream/.test(texto),
    'el estado no puede filtrar rutas del servidor');
});
```

- [ ] **Paso 2: Correr y ver que fallan**

Ejecutar: `cd backend && node --test test/persistencia.api.test.js`
Esperado: FALLA — el segundo test da 404 porque la ruta no existe.

- [ ] **Paso 3: Añadir el endpoint**

En `backend/src/superadmin.js`, añadir al `import` de arriba:

```js
import { estadoPersistencia } from './persistencia.js';
```

Y **antes** de `export default r;` (o al final de las rutas):

```js
// --- Estado del respaldo externo (Litestream + rclone) ---
// El gate de super_admin ya lo aplica el r.use() de arriba.
r.get('/persistencia', async (req, res) => {
  res.json(await estadoPersistencia());   // estadoPersistencia() nunca lanza
});
```

- [ ] **Paso 4: Disparar la vigilancia desde `/api/me`**

En `backend/src/server.js`, ampliar el import existente de recordatorios con uno nuevo debajo:

```js
import { vigilarPersistenciaThrottled } from './persistencia.js';
```

Y en el handler de `GET /api/me`, justo debajo de la línea 305 (`generarRecordatoriosThrottled`), añadir:

```js
  // Comprueba el respaldo externo (cacheado): cualquier trafico en la app sirve
  // de disparo, porque en el plan free no hay cron y el super-admin puede pasar
  // semanas sin entrar -- que es justo cuando conviene enterarse.
  try { vigilarPersistenciaThrottled(); } catch (e) { console.error('[persistencia]', e.message); }
```

- [ ] **Paso 5: Correr la suite completa**

Ejecutar: `cd backend && node --test`
Esperado: `pass 274 / fail 0`.

- [ ] **Paso 6: Commit**

```bash
git add backend/src/superadmin.js backend/src/server.js backend/test/persistencia.api.test.js
git commit -m "feat(persistencia): endpoint del estado y vigilancia desde /api/me"
```

---

### Tarea 6: El sello en `docker-entrypoint.sh`

**Archivos:**
- Modificar: `docker-entrypoint.sh:45-52`

**Interfaces:**
- Consume: nada.
- Produce: el archivo `$(dirname $UPLOADS_DIR)/.respaldo-uploads` con la fecha ISO-8601 UTC de la última sincronización correcta — la misma ruta que calcula `rutaSello()` en la tarea 3.

**Esta tarea no tiene tests automáticos** y es a propósito: es shell dentro del contenedor y `node --test` no la alcanza. Se verifica al desplegar (tarea 7, último paso).

- [ ] **Paso 1: Reemplazar el bloque del bucle**

En `docker-entrypoint.sh`, sustituir estas líneas (45-52):

```sh
  echo "[rclone] iniciando respaldo periodico de $UPLOADS_DIR -> R2:$R2_BUCKET/uploads (cada 30s, en background)..."
  (
    while true; do
      sleep 30
      rclone sync "$UPLOADS_DIR" "R2:$R2_BUCKET/uploads" \
        || echo "[rclone] fallo el respaldo periodico de uploads (revisa conexion/credenciales R2)"
    done
  ) &
```

por:

```sh
  # Sello de "ultimo respaldo correcto". El backend lo lee para saber si este
  # bucle sigue vivo: si muere, muere en SILENCIO (el arranque si fue correcto,
  # asi que no queda ninguna linea de log que lo delate) y lo unico que lo
  # denuncia es este archivo envejeciendo. Ver persistencia.js.
  SELLO_UPLOADS="$(dirname "$UPLOADS_DIR")/.respaldo-uploads"

  echo "[rclone] iniciando respaldo periodico de $UPLOADS_DIR -> R2:$R2_BUCKET/uploads (cada 30s, en background)..."
  (
    while true; do
      sleep 30
      if rclone sync "$UPLOADS_DIR" "R2:$R2_BUCKET/uploads"; then
        date -u +%Y-%m-%dT%H:%M:%SZ > "$SELLO_UPLOADS"
      else
        echo "[rclone] fallo el respaldo periodico de uploads (revisa conexion/credenciales R2)"
      fi
    done
  ) &
```

- [ ] **Paso 2: Comprobar que el script sigue siendo válido**

Ejecutar: `sh -n docker-entrypoint.sh` (en Git Bash)
Esperado: sin salida (sintaxis correcta). Si `sh` no está disponible, revisar a ojo que el `if/then/else/fi` esté cerrado.

- [ ] **Paso 3: Commit**

```bash
git add docker-entrypoint.sh
git commit -m "feat(persistencia): el bucle de rclone deja sello tras cada respaldo correcto"
```

---

### Tarea 7: La tarjeta en el panel, la campana del super-admin y la documentación

**Archivos:**
- Modificar: `web/app.js` (`vistaSuperadmin()`, ~línea 2782)
- Modificar: `ESTADO.md`

**Interfaces:**
- Consume: `GET /api/superadmin/persistencia` (tarea 5).
- Produce: nada que consuman otras tareas.

- [ ] **Paso 1: Añadir la tarjeta**

En `web/app.js`, dentro de `vistaSuperadmin()`, insertar este bloque **antes** de la tarjeta "🛡️ Crear iglesia" (para que el estado del respaldo sea lo primero que se ve), añadiendo al `innerHTML`:

```js
    <div class="card" style="max-width:640px;margin-bottom:20px">
      <h2 style="font-size:1.3rem;margin-bottom:4px">💾 Respaldo</h2>
      <p class="muted small" style="margin-bottom:14px">Si esto no está en verde, un reinicio del servicio borra los datos.</p>
      <div id="sa-persistencia" class="muted small">Comprobando…</div>
    </div>
```

Y al final de `vistaSuperadmin()`, después de que se pinte el contenido, llamar a `saCargarPersistencia()`.

- [ ] **Paso 2: Escribir la función que la rellena**

Añadir junto a las demás funciones `sa*` de `web/app.js`:

```js
// Pinta el estado del respaldo. Cuatro estados, no dos: "no pude comprobarlo"
// (ambar) no es lo mismo que "esta mal" (rojo), y "esta instancia no replica"
// (gris) es lo normal en desarrollo, no una alarma.
const PERS_PINTA={ok:['✅','--green-tx','Respaldando'],mal:['⛔','--red-tx','SIN RESPALDO'],
  desconocido:['⚠️','--muted','No se pudo comprobar'],no_aplica:['—','--muted','Esta instancia no replica']};
const PERS_MOTIVO={sin_generaciones:'nunca se ha replicado nada',retraso_alto:'el respaldo va muy atrasado',
  formato_no_reconocido:'respuesta inesperada de Litestream',comando_fallo:'Litestream devolvió un error',
  tiempo_agotado:'Litestream no respondió a tiempo',binario_ausente:'no hay Litestream en esta máquina',
  sello_ausente:'el respaldo de archivos no ha corrido nunca',sello_viejo:'el respaldo de archivos está detenido',
  arrancando:'el servicio acaba de arrancar',error_interno:'error al comprobar'};

function _persFila(etiqueta,b){
  const [ico,varColor,texto]=PERS_PINTA[b.estado]||PERS_PINTA.desconocido;
  const motivo=b.motivo?` · ${escHtml(PERS_MOTIVO[b.motivo]||b.motivo)}`:'';
  const cuando=b.ultimo?` · último: ${new Date(b.ultimo).toLocaleString('es-CL')}`:'';
  return `<div class="row" style="justify-content:space-between;gap:10px;margin:6px 0">
    <span>${escHtml(etiqueta)}</span>
    <span style="color:var(${varColor});text-align:right">${ico} ${escHtml(texto)}<span class="muted small">${motivo}${cuando}</span></span>
  </div>`;
}

async function saCargarPersistencia(){
  const c=$('sa-persistencia'); if(!c) return;
  try{
    const e=await api('/superadmin/persistencia');
    c.innerHTML=_persFila('Base de datos',e.bd)+_persFila('Archivos subidos',e.uploads);
  }catch(err){ c.textContent='No se pudo consultar el estado del respaldo.'; }
}
```

- [ ] **Paso 3: Cablear la campana del super-admin**

El super-admin solo tiene el módulo `inicio` y aterriza en su panel, así que la campana —que se rellena desde la carga del dashboard— nunca se actualiza para él. Sin esto, el aviso de la tarea 4 se escribiría en una bandeja que nadie abre, que es exactamente el problema que este trabajo resuelve.

Al final de `saCargarPersistencia()`, añadir la carga de notificaciones que el dashboard hace para los demás:

```js
  // El super-admin no pasa por el dashboard, que es quien normalmente rellena
  // la campana: aqui se hace explicito, si no su aviso no se veria nunca.
  // GET /api/notificaciones devuelve { items, noLeidas, hayMas, offset }
  // (notificaciones.js:79-92) y setCampana(n) espera el numero (app.js:309).
  try{ const n=await api('/notificaciones'); setCampana(n.noLeidas); }catch{}
```

- [ ] **Paso 4: Verificar en el navegador**

Levantar la app con una BD temporal sembrada y entrar como super-admin (receta en `docs/AUDITORIA-UX-2026-07-28.md`: puerto 3061, **no** el 3000; `DISABLE_RATE_LIMIT=1`; la puerta de consentimiento tras el login). Comprobar que la tarjeta aparece y dice **"Esta instancia no replica"** en gris (es lo correcto en local: no hay R2 ni binario), y que **no** se pinta ninguna alarma roja.

- [ ] **Paso 5: Documentar en `ESTADO.md`**

En la sección "⏳ Pendientes para uso real (no demo)", en el punto 1 (Litestream), añadir al final:

```markdown
   Desde el 28 jul el panel del super-admin muestra el estado real del respaldo (tarjeta 💾 Respaldo) y avisa una vez al día si deja de funcionar, así que este fallo ya no es silencioso. **Ojo:** el indicador dice la verdad sobre lo que hay; no sustituye a poner las variables.
```

- [ ] **Paso 6: Correr la suite completa y commitear**

Ejecutar: `cd backend && node --test`
Esperado: `pass 274 / fail 0`.

```bash
git add web/app.js ESTADO.md
git commit -m "feat(persistencia): tarjeta de respaldo en el panel del super-admin"
```

---

## Verificación final, ya desplegado

Estos dos puntos **no los cubre ningún test** y hay que hacerlos a mano cuando las variables estén puestas en Render:

1. **Que la tarjeta pase a verde** con una fecha real de último respaldo. Si se queda en ámbar con `formato_no_reconocido`, la salida de `litestream generations` de esa versión no tiene las columnas `lag`/`end` esperadas: hay que ajustar `interpretarGeneraciones` a la salida real (que se ve con `litestream generations -config /etc/litestream.yml $DB_PATH` desde la shell del contenedor). El diseño ya prevé este caso: degrada a ámbar sin avisar, nunca a una alarma falsa.
2. **Que el sello se cree**: la fila "Archivos subidos" debe pasar a verde dentro del primer minuto tras el arranque.
