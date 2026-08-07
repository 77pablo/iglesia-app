// ============================================================
//  El aviso de "tu nombre viejo sigue escrito" (cabo 2), en Mi perfil.
//
//  El backend ya tiene sus pruebas (corregir-nombre-apariciones.test.js): que
//  los conteos salen, que van en cero sin rastros y que estan acotados por
//  iglesia. Lo que no tenia ninguna es el TEXTO que la persona lee, y ahi el
//  aviso decia dos cosas falsas en los dos casos mas probables:
//
//    "...sigue escrito en 0 ficha(s) de niños (...) y 2 prédica(s)"
//    "...sigue escrito en 1 ficha(s) de niños (...) y 0 prédica(s)"
//
//  La guarda era un OR y el texto un AND. El unico caso que se leia bien era
//  el de ambos lados > 0, que es el menos frecuente. La otra mitad de la misma
//  tarea (el aviso del pastor, adminCorregirNombre) ya estaba escrita con el
//  patron correcto: tres ternarios, uno por trozo y otro para la "y".
//
//  Se ejecuta la funcion REAL recortada de web/app.js contra un DOM de mentira,
//  igual que organizacion-pagador-selector.test.js: comprobar que el archivo
//  "contiene tal cadena" pasaria igual con el arreglo mal escrito.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
const fuente = fs.readFileSync(APP_JS, 'utf8');

// Recorta una funcion de nivel superior balanceando llaves (mismo mecanismo
// que usan los otros arneses de frontend).
function recortarFuncionTop(nombre) {
  const i = fuente.indexOf(`async function ${nombre}(`);
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('{', i); j < fuente.length; j++) {
    if (fuente[j] === '{') saldo++;
    else if (fuente[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, `no se pudo cerrar ${nombre}`);
  return fuente.slice(i, fin);
}
const GUARDAR_PERFIL = recortarFuncionTop('guardarPerfilDirectorio');

// `apariciones` es lo que contesta el PATCH /directorio/perfil. Al autoservicio
// le llegan CONTEOS, no fichas: el backend no le manda nombres de ninos a
// nadie que no sea el pastor (eso esta en la spec y tiene su prueba aparte).
function montar(apariciones) {
  const modales = [];
  const toasts = [];
  const campo = (v) => ({ value: v, checked: false });
  const nodos = {
    'dp-nombre': campo('Ana Pérez'),
    'dp-tel': campo(''),
    'dp-email': campo(''),
    'dp-mostrar-tel': campo(''),
    'dp-mostrar-email': campo(''),
    'dp-foto': { files: [] }
  };
  const contexto = {
    $: id => nodos[id] || null,
    fechaSelectValor: () => '',
    conBoton: async (_b, fn) => fn(),
    botonActual: () => null,
    uploadArchivo: async () => '',
    api: async () => (apariciones === undefined ? {} : { apariciones }),
    ME: { persona: { id: 1, nombre: 'Ana' } },
    pintarUsuarioLateral: () => {},
    vistaDirectorio: () => {},
    toast: t => toasts.push(t),
    modalAviso: (texto, titulo) => modales.push({ texto, titulo })
  };
  const claves = Object.keys(contexto);
  const guardar = new Function(...claves, `${GUARDAR_PERFIL}\nreturn guardarPerfilDirectorio;`)(
    ...claves.map(k => contexto[k]));
  return { guardar, modales, toasts };
}

test('solo fichas de niños: el aviso NO nombra las prédicas (ni dice "y 0 prédica(s)")', async () => {
  const { guardar, modales } = montar({ ninos: 1, predicas: 0 });
  await guardar();

  assert.equal(modales.length, 1, 'con rastros hay aviso');
  const t = modales[0].texto;
  assert.match(t, /1 ficha\(s\) de niños/, 'lo que si hay se nombra con su numero');
  assert.doesNotMatch(t, /prédica/i, 'lo que no hay no se nombra');
  assert.doesNotMatch(t, /\b0\b/, 'y no aparece ningun cero: "0 prédica(s)" es ruido que hace dudar del resto');
  assert.doesNotMatch(t, / y \./, 'ni una "y" colgando sin segundo trozo');
});

test('solo prédicas: el aviso NO nombra las fichas de niños (ni dice "0 ficha(s)")', async () => {
  const { guardar, modales } = montar({ ninos: 0, predicas: 2 });
  await guardar();

  assert.equal(modales.length, 1);
  const t = modales[0].texto;
  assert.match(t, /2 prédica\(s\)/);
  assert.doesNotMatch(t, /ficha\(s\)/, 'lo que no hay no se nombra');
  assert.doesNotMatch(t, /\b0\b/);
  assert.doesNotMatch(t, /escrito en y /, 'ni una "y" al principio, sin primer trozo');
});

test('los dos lados: se nombran los dos, unidos por una "y"', async () => {
  const { guardar, modales } = montar({ ninos: 3, predicas: 2 });
  await guardar();

  assert.equal(modales.length, 1);
  assert.match(modales[0].texto, /3 ficha\(s\) de niños.* y 2 prédica\(s\)/);
});

test('sin rastros no hay aviso: el modal no aparece a decir que no pasa nada', async () => {
  const { guardar, modales, toasts } = montar({ ninos: 0, predicas: 0 });
  await guardar();

  assert.equal(modales.length, 0);
  assert.ok(toasts.some(t => /Perfil actualizado/.test(t)), 'el "guardado" de siempre si sale');
});

test('si el backend no manda apariciones (reenviar el mismo nombre), tampoco hay aviso', async () => {
  const { guardar, modales } = montar(undefined);
  await guardar();

  assert.equal(modales.length, 0);
});
