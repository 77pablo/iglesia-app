// ============================================================
//  XSS almacenado en atributos: colores y argumentos de onclick.
//
//  Tres agujeros del mismo tipo, todos con datos que escribe una persona de la
//  iglesia y que ejecuta OTRA al abrir una pantalla normal:
//
//   1. El TONO de una cancion (lo pone el lider de musica) entraba en un
//      onclick filtrando solo la comilla simple. La comilla doble cerraba el
//      atributo. Victima: cualquiera que abra Grupo de Alabanza, incluido el
//      pastor -> escalada lider de musica -> pastor.
//   2. El COLOR de un grupo entraba crudo en un atributo style. La API lo
//      aceptaba como texto libre aunque la UI use <input type="color">.
//      Victima: toda la iglesia, en el calendario.
//   3. El NOMBRE de una clase de Escuela Dominical y el de una persona
//      entraban en un onclick filtrando ' " y \ pero NO el &: el parser de HTML
//      decodifica las entidades del atributo ANTES de compilar el JS, asi que
//      un nombre guardado como &#39;+alert(1)+&#39; llegaba como comillas.
//
//  La CSP de helmet no protege de nada de esto: scriptSrc lleva 'unsafe-inline'.
//
//  Las funciones se extraen de web/app.js y se EJECUTAN aqui, en vez de
//  comprobar que el archivo "ya no contiene tal cadena": un test de presencia
//  pasaria igual si el arreglo estuviera mal escrito.
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarDb } from './helpers.js';
import { signToken } from '../src/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
const fuente = fs.readFileSync(APP_JS, 'utf8');

// Saca una funcion por su nombre desde web/app.js y la devuelve viva.
function extraer(nombre, dependencias = '') {
  const re = new RegExp(`^function ${nombre}\\([\\s\\S]*?^}`, 'm');
  const m = fuente.match(re);
  assert.ok(m, `no se encontro la funcion ${nombre}() en web/app.js`);
  return new Function(`${dependencias}\n${m[0]}\nreturn ${nombre};`)();
}

const escHtmlSrc = fuente.match(/^function escHtml\(.*$/m)[0];
const escHtml = extraer('escHtml');
const escJsAttr = extraer('escJsAttr', escHtmlSrc);
const safeColor = extraer('safeColor');

// Simula lo que hace el navegador con un atributo: decodifica las entidades.
// Es el paso que se olvidaba el filtro viejo y por el que colaba el &#39;.
function decodificarAtributo(s) {
  return s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

test('escJsAttr: la comilla doble no puede cerrar el atributo', () => {
  const ataque = 'G" onmouseover="alert(1)';
  const atributo = `onclick="abrirVisorSetlist(1,${escJsAttr(ataque)})"`;
  // Tras las comillas de apertura solo puede haber UNA comilla doble sin escapar:
  // la de cierre del atributo, al final.
  const cuerpo = atributo.slice('onclick="'.length, -1);
  assert.ok(!cuerpo.includes('"'), `el valor rompe el atributo: ${atributo}`);
});

test('escJsAttr: las entidades HTML no se convierten en comillas al decodificar', () => {
  const ataque = "&#39;+alert(1)+&#39;";
  const decodificado = decodificarAtributo(escJsAttr(ataque));
  // Lo que ve el motor de JS tiene que ser UN literal de cadena, no una
  // concatenacion con una llamada en medio.
  assert.equal(JSON.parse(decodificado), ataque, 'el texto tiene que llegar intacto y como dato');
  assert.ok(!/\+\s*alert/.test(JSON.parse(decodificado) === ataque ? '' : decodificado));
});

test('escJsAttr: un texto normal sigue llegando entero', () => {
  // Control positivo: el arreglo no puede consistir en vaciar el valor.
  assert.equal(JSON.parse(decodificarAtributo(escJsAttr('RE'))), 'RE');
  assert.equal(JSON.parse(decodificarAtributo(escJsAttr("Clase de Niños 3-5 años"))), 'Clase de Niños 3-5 años');
  assert.equal(JSON.parse(decodificarAtributo(escJsAttr("O'Higgins"))), "O'Higgins", 'un apellido con apostrofo no se rompe');
  assert.equal(JSON.parse(decodificarAtributo(escJsAttr(null))), '');
});

test('safeColor: solo pasan los colores con forma de color', () => {
  assert.equal(safeColor('#2563EB'), '#2563EB');
  assert.equal(safeColor('#2f7'), '#2f7');
  assert.equal(safeColor('var(--primary)'), 'var(--primary)');
  // El ataque real: cerrar el style y colar un manejador.
  assert.equal(safeColor('red" onmouseover="alert(1)'), 'var(--primary)');
  assert.equal(safeColor('expression(alert(1))'), 'var(--primary)');
  assert.equal(safeColor(''), 'var(--primary)');
  assert.equal(safeColor(null), 'var(--primary)');
  assert.equal(safeColor(null, '#2563EB'), '#2563EB', 'respeta el color por defecto que se le pida');
});

test('en web/app.js ya no queda ningun filtro de comillas hecho a mano en un onclick', () => {
  // Ese patron es el que fallaba de las dos maneras. Si vuelve a aparecer, es
  // que alguien copio una linea vieja.
  const sospechosos = fuente.match(/onclick="[^"]*\$\{\([^)]*\)\.replace\(\/\[?['"\\]/g) || [];
  assert.deepEqual(sospechosos, [], 'usa escJsAttr() en vez de filtrar comillas a mano');
});

// --- Segundo candado: el backend tampoco acepta un color que no sea color ---
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

function sembrarPastor(codigo) {
  const ig = db.prepare('INSERT INTO iglesia (nombre, codigo_unico) VALUES (?,?)').run('Ig ' + codigo, codigo);
  const iglesiaId = Number(ig.lastInsertRowid);
  const p = db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,1,1)")
    .run(iglesiaId, 'pastor_' + codigo, 'Pastor', 'x');
  return { iglesiaId, pastorId: Number(p.lastInsertRowid) };
}

const crearGrupo = (b, S, color) => fetch(b + '/api/admin/grupos', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + signToken({ id: S.pastorId, iglesia_id: S.iglesiaId }),
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ nombre: 'Jovenes', color })
});

test('la API rechaza un color que no es hexadecimal', async () => {
  const b = await servidor();
  const S = sembrarPastor('COL1');
  const res = await crearGrupo(b, S, 'red" onmouseover="alert(1)');
  assert.equal(res.status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM grupo WHERE iglesia_id = ?').get(S.iglesiaId).n, 0);
});

test('la API sigue aceptando el color que manda <input type="color">', async () => {
  const b = await servidor();
  const S = sembrarPastor('COL2');
  const res = await crearGrupo(b, S, '#2563eb');
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT color FROM grupo WHERE iglesia_id = ?').get(S.iglesiaId).color, '#2563eb');
});
