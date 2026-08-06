// ============================================================
//  XSS almacenado en cuatro sitios que llegaban sin escapar al HTML:
//
//   1. filaMov(): categoria de un movimiento (pantalla del tesorero).
//   2. obTesoreria(): la MISMA categoria, pero en el panel del OBISPO, que ve
//      todas las iglesias. Un tesorero de cualquier iglesia guarda una
//      categoria con <script> y le ejecuta codigo al obispo al abrir su panel
//      -- salta el aislamiento entre iglesias, que es la garantia de fondo de
//      toda la app.
//   3. cargarClases(): la edad de una clase de Escuela Dominical (pantalla
//      del pastor).
//   4. cargarPlan(): la hora del ensayo, dentro de un atributo value="...",
//      donde basta una comilla doble para salirse del atributo.
//
//  escHtml() (web/app.js) existe y se usa en el resto del archivo; estos
//  cuatro sitios se saltaron el escapado. Los sitios 1 y 2 ademas pasan por
//  cap(), que SOLO pone en mayuscula la primera letra y no escapa nada: hay
//  que escapar el RESULTADO de cap(), no la variable suelta.
//
//  Igual que xss-atributos.test.js: se EXTRAEN las funciones reales de
//  web/app.js y se EJECUTAN aqui (con sus dependencias -api, $, modalDetalle,
//  etc.- sustituidas por dobles minimos), en vez de comprobar que el archivo
//  "ya no contiene tal cadena". Buscar cualquier otro sitio parecido en TODO
//  el archivo es la prueba general de otra tarea; esta se ciñe a estos cuatro.
// ============================================================
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarDb, reiniciar } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
const fuente = fs.readFileSync(APP_JS, 'utf8');

const ATAQUE = '<script>alert(1)</script>';
const ATAQUE_ATRIBUTO = '10:00"><script>alert(1)</script>';

// Saca `function nombre(...){...}` o `async function nombre(...){...}`
// buscando la primera linea que empieza en columna 0 con `}` tras la firma
// (las llaves internas del cuerpo van indentadas, asi que no confunden al
// patron). Mismo truco que usa xss-atributos.test.js.
function fuenteDe(nombre) {
  const re = new RegExp(`^(?:async )?function ${nombre}\\([\\s\\S]*?^}`, 'm');
  const m = fuente.match(re);
  assert.ok(m, `no se encontro la funcion ${nombre}() en web/app.js`);
  return m[0];
}

// Compila una funcion "plana" (sin estado compartido que leer despues):
// filaMov, pura y sincrona.
function extraer(nombre, dependencias = '') {
  return new Function(`${dependencias}\n${fuenteDe(nombre)}\nreturn ${nombre};`)();
}

// Compila una funcion async junto con dobles de sus dependencias, y expone
// tambien el `_estado` que esos dobles capturan (el contenedor DOM falso, o
// el html que se le paso a modalDetalle) para poder verificarlo despues del
// await.
function compilarConEstado(nombre, dependencias) {
  return new Function(`${dependencias}\n${fuenteDe(nombre)}\nreturn { fn: ${nombre}, estado: () => _estado };`)();
}

const escHtmlSrc = fuenteDe('escHtml');
const capSrc = fuenteDe('cap');
const moneySrc = fuenteDe('money');
const safeUrlSrc = fuenteDe('safeUrl');
const escJsAttrSrc = `${escHtmlSrc}\n${fuenteDe('escJsAttr')}`;

// ---------------------------------------------------------------
// Sitio 1 (web/app.js:2459) — filaMov(): pantalla del tesorero.
// ---------------------------------------------------------------
test('filaMov(): una categoria con <script> llega escapada (cap() no escapa nada)', () => {
  const filaMov = extraer('filaMov', `${escHtmlSrc}\n${capSrc}\n${moneySrc}\n${safeUrlSrc}\nfunction esTesoreroUI(){ return false; }`);
  const html = filaMov({ tipo: 'gasto', categoria: ATAQUE, monto: 100, fecha: '2026-07-01' });
  assert.ok(!html.includes('<script>'), `la categoria llega sin escapar al tesorero: ${html}`);
  assert.ok(html.includes('&lt;script&gt;'), 'la categoria capitalizada deberia aparecer escapada');
});

// ---------------------------------------------------------------
// Sitio 2 (web/app.js:3092) — obTesoreria(): panel del OBISPO.
// ---------------------------------------------------------------
test('obTesoreria(): una categoria con <script> llega escapada en el panel del obispo (salta el aislamiento entre iglesias si no)', async () => {
  const dependencias = `
    ${escHtmlSrc}
    ${capSrc}
    ${moneySrc}
    ${safeUrlSrc}
    let _estado = null;
    let _obMes = '2026-07';
    const _qmes = () => '';
    function modalDetalle(titulo, html) { _estado = html; }
    function toast() {}
    function api() {
      return Promise.resolve([
        { tipo: 'gasto', categoria: ${JSON.stringify(ATAQUE)}, monto: 100, fecha: '2026-07-01', descripcion: '', comprobante_url: null }
      ]);
    }
  `;
  const { fn, estado } = compilarConEstado('obTesoreria', dependencias);
  await fn(1);
  const html = estado();
  assert.ok(html, 'obTesoreria no llamo a modalDetalle con ningun html');
  assert.ok(!html.includes('<script>'), `la categoria llega sin escapar al obispo: ${html}`);
  assert.ok(html.includes('&lt;script&gt;'), 'la categoria capitalizada deberia aparecer escapada');
});

// ---------------------------------------------------------------
// Sitio 3 (web/app.js:2523) — cargarClases(): pantalla del pastor.
// ---------------------------------------------------------------
test('cargarClases(): una edad con <script> llega escapada al pintar la lista de clases', async () => {
  const dependencias = `
    ${escJsAttrSrc}
    const window = {};
    let _estado = { className: '', innerHTML: '' };
    function $(id) { return _estado; }
    function api() {
      return Promise.resolve([{ id: 1, nombre: 'Primarios', edad: ${JSON.stringify(ATAQUE)}, ninos: 3 }]);
    }
  `;
  const { fn, estado } = compilarConEstado('cargarClases', dependencias);
  await fn();
  const html = estado().innerHTML;
  assert.ok(!html.includes('<script>'), `la edad llega sin escapar: ${html}`);
  assert.ok(html.includes('&lt;script&gt;'), 'la edad deberia aparecer escapada');
});

// ---------------------------------------------------------------
// Sitio 4 (web/app.js:1863) — cargarPlan(): dentro de value="...".
// ---------------------------------------------------------------
test('cargarPlan(): una hora con comilla doble no rompe el atributo value="..."', async () => {
  const dependencias = `
    ${escHtmlSrc}
    const window = {};
    let _estado = { className: '', innerHTML: '' };
    function $(id) { return _estado; }
    function fechaSelectHTML() { return ''; }
    async function _personas() { return []; }
    function api() {
      return Promise.resolve({
        puedeEditar: true,
        ensayo: { fecha: '', hora: ${JSON.stringify(ATAQUE_ATRIBUTO)}, lugar: '' },
        equipo: [],
        instrumentos: []
      });
    }
  `;
  const { fn, estado } = compilarConEstado('cargarPlan', dependencias);
  await fn(1);
  const html = estado().innerHTML;
  assert.ok(html && !html.includes('<p class="error">No se pudo cargar el plan.</p>'),
    `cargarPlan cayo al catch (dependencias mal simuladas): ${html}`);
  assert.ok(!html.includes('"><script>'), `la hora se sale del atributo value="...": ${html}`);
  assert.ok(!html.includes('<script>'), `la hora llega sin escapar: ${html}`);
  assert.ok(html.includes('&quot;&gt;&lt;script&gt;'), 'la hora deberia aparecer escapada dentro del atributo');
});

// ================================================================
// Segundo candado (backend): musica.js — la hora del ensayo ahora exige
// formato HH:MM, igual que horaSchema en eventos.js/organizacion.js.
// categoria (tesoreria.js) y edad (ninos.js) siguen siendo texto libre a
// proposito -- ahi el arreglo es solo el escapado del frontend, de arriba.
// ================================================================
let db, srv, base, signToken;

before(async () => {
  db = await cargarDb();
  ({ signToken } = await import('../src/auth.js'));
  const { app } = await import('../src/server.js');
  srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise(r => srv.close(r)));
beforeEach(() => reiniciar(db));

function sembrarLiderMusica() {
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Test','TEST')").run();
  const iglesiaId = Number(ig.lastInsertRowid);
  const lider = Number(db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)"
  ).run(iglesiaId, 'lidermus', 'Lider Musica', 'x').lastInsertRowid);
  const g = Number(db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Musica', '#2f7')").run(iglesiaId).lastInsertRowid);
  db.prepare("INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?, 'lider_musica')").run(lider, g);
  const eventoId = Number(db.prepare(
    "INSERT INTO evento (iglesia_id, titulo, fecha, estado) VALUES (?,?,?,'aprobado')"
  ).run(iglesiaId, 'Culto', '2026-08-09').lastInsertRowid);
  return { iglesiaId, lider, eventoId };
}

const headers = (S) => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + signToken({ id: S.lider, iglesia_id: S.iglesiaId })
});

test('POST /api/musica/plan/:eventoId/ensayo: una hora sin formato HH:MM -> 400, y no se guarda', async () => {
  const S = sembrarLiderMusica();
  const res = await fetch(base + '/api/musica/plan/' + S.eventoId + '/ensayo', {
    method: 'POST', headers: headers(S),
    body: JSON.stringify({ fecha: '2026-08-09', hora: ATAQUE_ATRIBUTO, lugar: 'Salon' })
  });
  assert.equal(res.status, 400);
  const fila = db.prepare('SELECT hora FROM ensayo WHERE evento_id = ?').get(S.eventoId);
  assert.equal(fila, undefined, 'no debe crearse el ensayo con una hora invalida');
});

test('POST /api/musica/plan/:eventoId/ensayo: una hora HH:MM valida se sigue aceptando', async () => {
  const S = sembrarLiderMusica();
  const res = await fetch(base + '/api/musica/plan/' + S.eventoId + '/ensayo', {
    method: 'POST', headers: headers(S),
    body: JSON.stringify({ fecha: '2026-08-09', hora: '19:30', lugar: 'Salon' })
  });
  assert.equal(res.status, 200);
  const fila = db.prepare('SELECT hora FROM ensayo WHERE evento_id = ?').get(S.eventoId);
  assert.equal(fila.hora, '19:30');
});

test('POST /api/musica/plan/:eventoId/ensayo: sin hora (vacia) se sigue aceptando', async () => {
  const S = sembrarLiderMusica();
  const res = await fetch(base + '/api/musica/plan/' + S.eventoId + '/ensayo', {
    method: 'POST', headers: headers(S),
    body: JSON.stringify({ fecha: '2026-08-09', hora: '', lugar: 'Salon' })
  });
  assert.equal(res.status, 200, 'una hora vacia (ensayo sin hora agendada aun) debe seguir aceptandose');
});
