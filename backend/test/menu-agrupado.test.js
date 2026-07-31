// ============================================================
//  El menu del movil, agrupado por temas.
//
//  En el telefono el menu es un cajon a pantalla completa y el pastor ve 19
//  entradas. Se agrupan bajo encabezados, y SOLO para quien tiene el menu largo:
//  a un feligres (9 entradas) cuatro encabezados le dejarian 13 lineas donde
//  antes tenia 9, o sea le empeorarian el menu para resolver un problema que no
//  tiene.
//
//  Se ejecuta la funcion REAL sacada de web/app.js. La prueba de cobertura es la
//  que de verdad importa: si alguien anade un modulo al NAV y olvida meterlo en
//  un grupo, esa entrada DESAPARECERIA del menu agrupado sin dar ningun error —
//  el pastor dejaria de ver un modulo y nadie se enteraria.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
const fuente = fs.readFileSync(APP_JS, 'utf8');

// Recorta un bloque `const NOMBRE = [ ... ];` de nivel superior balanceando
// corchetes. Si NO lo encuentra, revienta en voz alta en vez de devolver vacio.
function recortarLista(nombre) {
  const i = fuente.indexOf(`const ${nombre} = [`);
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('[', i); j < fuente.length; j++) {
    if (fuente[j] === '[') saldo++;
    else if (fuente[j] === ']') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, `no se pudo cerrar el literal de ${nombre}`);
  return fuente.slice(fuente.indexOf('[', i), fin);
}

const clavesDe = txt => [...txt.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);

// Las claves del NAV son el PRIMER elemento de cada terna ['clave','icono','Etiqueta'].
const CLAVES_NAV = [...recortarLista('NAV').matchAll(/\['([a-z_]+)'/g)].map(m => m[1]);

test('cada clave del NAV pertenece a exactamente un grupo', () => {
  const bloque = recortarLista('GRUPOS_NAV');
  // Dentro de GRUPOS_NAV, los titulos van con comillas tambien; se filtran
  // quedandose solo con lo que existe en el NAV, y luego se comprueba al reves.
  const enGrupos = clavesDe(bloque).filter(c => CLAVES_NAV.includes(c));

  const sinAsignar = CLAVES_NAV.filter(k => !enGrupos.includes(k));
  const duplicadas = enGrupos.filter((k, i) => enGrupos.indexOf(k) !== i);

  assert.deepEqual(sinAsignar, [],
    'estas entradas del NAV no estan en ningun grupo: desapareceran del menu agrupado sin dar error');
  assert.deepEqual(duplicadas, [], 'estas entradas estan en dos grupos a la vez');
  assert.equal(enGrupos.length, CLAVES_NAV.length);
});

// --- la funcion de reparto, ejecutada de verdad -------------------------------
//
// Nota sobre este arnes (distinto del propuesto en el plan): en vez de
// hardcodear el umbral como parametro de new Function, se recorta tambien la
// linea `const NAV_UMBRAL_GRUPOS = ...` de web/app.js y se evalua tal cual junto
// con GRUPOS_NAV y agruparNav. Asi la prueba corre contra el umbral REAL que
// declara el archivo, no contra un numero copiado a mano que podria quedar
// desincronizado si alguien cambia el original.
function cargarAgrupar() {
  const grupos = recortarLista('GRUPOS_NAV');

  const umbral = fuente.match(/const NAV_UMBRAL_GRUPOS\s*=\s*(\d+)\s*;/);
  assert.ok(umbral, 'no se encontro NAV_UMBRAL_GRUPOS en web/app.js');

  const i = fuente.indexOf('function agruparNav(');
  assert.ok(i >= 0, 'no se encontro agruparNav en web/app.js');
  let saldo = 0, fin = -1;
  for (let j = fuente.indexOf('{', i); j < fuente.length; j++) {
    if (fuente[j] === '{') saldo++;
    else if (fuente[j] === '}') { saldo--; if (saldo === 0) { fin = j + 1; break; } }
  }
  assert.ok(fin > 0, 'no se pudo cerrar agruparNav');

  const cuerpo = `
    const GRUPOS_NAV = ${grupos};
    const NAV_UMBRAL_GRUPOS = ${umbral[1]};
    ${fuente.slice(i, fin)}
    return agruparNav;
  `;
  return new Function(cuerpo)();
}

test('por debajo del umbral devuelve UNA sola seccion sin titulo, en el orden recibido', () => {
  const agruparNav = cargarAgrupar();
  const pocas = ['inicio', 'calendario', 'anuncios', 'mensajes', 'directorio',
                 'mi_servicio', 'mi_grupo', 'predica', 'ajustes'];   // 9 = feligres
  const r = agruparNav(pocas);
  assert.equal(r.length, 1, 'un menu corto no se agrupa');
  assert.equal(r[0].titulo, null, 'sin titulo = sin encabezado que pintar');
  assert.deepEqual(r[0].claves, pocas, 'y conserva el orden que traia');
});

test('en el umbral o por encima devuelve los grupos, con titulo', () => {
  const agruparNav = cargarAgrupar();
  const muchas = CLAVES_NAV.slice();   // todas: es el caso del pastor
  const r = agruparNav(muchas);
  assert.ok(r.length > 1, 'un menu largo se agrupa');
  assert.ok(r.every(g => typeof g.titulo === 'string' && g.titulo.length),
    'todo grupo pintado tiene que llevar encabezado');
  // Ninguna entrada se pierde ni se repite al repartir.
  const repartidas = r.flatMap(g => g.claves);
  assert.deepEqual(repartidas.slice().sort(), muchas.slice().sort());
});

test('un grupo sin entradas visibles no se pinta', () => {
  const agruparNav = cargarAgrupar();
  // 12 claves (el umbral exacto) elegidas para que al menos un grupo quede vacio.
  const visibles = CLAVES_NAV.slice(0, 12);
  const r = agruparNav(visibles);
  assert.ok(r.every(g => g.claves.length > 0),
    'un encabezado sin nada debajo es ruido: no debe pintarse');
});
