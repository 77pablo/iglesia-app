// ============================================================
//  El himnario: 522 alabanzas, y que TODAS se puedan abrir.
//
//  El fichero venia con cuatro fallos, y el ultimo se llevaba por delante a los
//  otros tres:
//
//   1. 72 alabanzas quedaban PEGADAS dentro de la anterior, porque su titulo no
//      lleva el tono entre parentesis y el extractor las tomaba por letra. En la
//      app no existian: buscar "Dias de Elias" o "Si mi pueblo" no daba nada.
//   2. La alineacion del acorde sobre la silaba se habia perdido en los 450.
//   3. Un himno arrastraba numeros de pagina sueltos en medio de la letra.
//   4. El himnario tiene DOS secciones y la numeracion se reinicia en la
//      segunda: el 45 existe dos veces. La app seleccionaba con
//      find(h => h.n === n), que devuelve SIEMPRE el primero, asi que tocar
//      cualquier corito abria el himno tradicional del mismo numero. Media
//      coleccion era inalcanzable. Ahora cada alabanza lleva un `id` estable.
//
//  Se comprueba aqui, y no a ojo, porque el fichero se regenera desde un PDF:
//  cualquier regeneracion futura tiene que volver a pasar por esta puerta.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(__dirname, '..', '..', 'web');
const himnos = JSON.parse(fs.readFileSync(path.join(WEB, 'assets', 'himnario.json'), 'utf8'));
const appJs = fs.readFileSync(path.join(WEB, 'app.js'), 'utf8');

// Saca funciones reales de web/app.js y las ejecuta aqui: comprobar que el
// fichero "contiene tal cadena" pasaria igual con el arreglo mal escrito.
//
// Se recorta contando llaves y no con una expresion regular: varias de estas
// declaraciones caben en una sola linea y terminan en "}", asi que un patron
// perezoso hasta "^}" se tragaba las tres siguientes y las declaraba dos veces.
const lineas = appJs.split('\n');
function recortar(nombre) {
  const i = lineas.findIndex(l => new RegExp(`^(?:const|function|let) ${nombre}\\b`).test(l));
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, trozo = [];
  for (let j = i; j < lineas.length; j++) {
    const l = lineas[j];
    trozo.push(l);
    // Las llaves dentro de una cadena o de una expresion regular no cuentan;
    // en estas lineas concretas no las hay, y el saldo cierra donde debe.
    for (const ch of l) { if (ch === '{') saldo++; else if (ch === '}') saldo--; }
    if (saldo <= 0 && (l.trimEnd().endsWith(';') || l.trimEnd().endsWith('}'))) break;
  }
  return trozo.join('\n');
}
function extraer(nombres) {
  const src = nombres.map(recortar).join('\n');
  return new Function(`${src}\nreturn {${nombres.join(',')}};`)();
}
const M = extraer(['_SOLF', '_ENG', '_ES2I', '_EN2I', '_RAIZ', '_transRaiz', '_transAcorde',
                   '_ACORDE', '_esAcorde', '_esLineaAcordes']);

test('hay bastante mas de 450 alabanzas: las que estaban escondidas volvieron', () => {
  assert.ok(himnos.length >= 520, `solo hay ${himnos.length}; se esperaban 522`);
});

test('cada alabanza tiene id unico, numero, titulo y contenido', () => {
  const ids = new Set();
  for (const h of himnos) {
    assert.ok(h.id, `sin id: ${JSON.stringify(h).slice(0, 80)}`);
    assert.ok(!ids.has(h.id), `id repetido: ${h.id}`);
    ids.add(h.id);
    assert.ok(Number.isInteger(h.n) && h.n > 0, `numero invalido en ${h.id}`);
    assert.ok((h.titulo || '').trim(), `sin titulo: ${h.id}`);
    // Ocho alabanzas del final del himnario vienen SOLO con el titulo, sin letra
    // ni acordes: asi estan en el documento original. Se conservan porque
    // existen y hay que poder buscarlas, pero van marcadas para que el visor
    // explique el hueco en vez de mostrar un panel en blanco.
    assert.ok((h.contenido || '').trim() || h.sin_letra === true,
      `sin contenido y sin marcar: ${h.id} ${h.titulo}`);
    assert.ok(h.seccion === 1 || h.seccion === 2, `seccion rara en ${h.id}`);
  }
});

test('la 2a seccion esta completa y correlativa (si no, la particion esta mal)', () => {
  // Es la prueba de fondo del extractor: si un titulo se hubiera quedado pegado
  // dentro del anterior, aqui aparece un hueco; si se hubiera partido de mas,
  // un repetido. Por eso vale mas que contar alabanzas.
  const ns = himnos.filter(h => h.seccion === 2).map(h => h.n).sort((a, b) => a - b);
  assert.deepEqual(ns, ns.map((_, i) => i + 1), 'la 2a seccion deberia ir del 1 al ' + ns.length);
});

test('las alabanzas que antes estaban escondidas ahora se encuentran', () => {
  const buscar = t => himnos.filter(h => h.titulo.toLowerCase().includes(t.toLowerCase()));
  for (const t of ['Dias de Elias', 'Si mi pueblo', 'Gracias por la cruz', 'Padre', 'Restaura'])
    assert.ok(buscar(t).length, `"${t}" sigue sin aparecer en el himnario`);
});

test('nadie arrastra numeros de pagina sueltos en medio de la letra', () => {
  const folio = /^\s*\d{1,3}(\s+\d{1,3})*\s*$/;
  const sucios = himnos.filter(h => h.contenido.split('\n').some(l => folio.test(l)));
  assert.deepEqual(sucios.map(h => h.id), [], 'quedan lineas de folio suelto');
});

test('el indice alfabetico del final no se coló dentro de ninguna alabanza', () => {
  // Las ultimas paginas del PDF son el indice ("A quien ire.........163"). Sin
  // cortarlo, sus ~350 renglones se pegaban enteros a la ultima alabanza: 12.000
  // caracteres de indice presentados como si fueran la letra de "Gracia sin par".
  const renglonIndice = /\.{4,}\s*\d{1,3}\s*$/;
  const sucios = himnos.filter(h => h.contenido.split('\n').some(l => renglonIndice.test(l)));
  assert.deepEqual(sucios.map(h => h.id), [], 'hay alabanzas con renglones del indice dentro');
  const largo = Math.max(...himnos.map(h => h.contenido.length));
  assert.ok(largo < 6000, `hay una alabanza de ${largo} caracteres: seguro arrastra algo que no es suyo`);
});

test('la mayoria conserva el acorde alineado sobre su silaba', () => {
  // Con el fichero viejo esto daba 0 de 450: los espacios se habian colapsado y
  // el acorde ya no decia en que silaba entra, que es justo para lo que sirve.
  const alineados = himnos.filter(h => /\S {4,}\S/.test(h.contenido)).length;
  assert.ok(alineados > himnos.length * 0.8,
    `solo ${alineados} de ${himnos.length} conservan la alineacion`);
});

test('web/app.js selecciona por id y no por numero', () => {
  // El fallo que hacia inalcanzable media coleccion. Si alguien vuelve a poner
  // find(h => h.n === ...) en himnarioSel, el himnario se rompe en silencio:
  // no da error, simplemente abre otra alabanza.
  const m = appJs.match(/function himnarioSel\([\s\S]*?^}/m);
  assert.ok(m, 'no se encontro himnarioSel()');
  assert.match(m[0], /find\(\s*h\s*=>\s*h\.id\s*===/, 'himnarioSel debe buscar por h.id');
  assert.doesNotMatch(m[0], /h\.n\s*===/, 'himnarioSel NO puede buscar por h.n');
});

test('la lista del himnario no se corta y deja alabanzas fuera', () => {
  const m = appJs.match(/function himnarioBuscar\([\s\S]*?^}/m);
  assert.ok(m, 'no se encontro himnarioBuscar()');
  assert.doesNotMatch(m[0], /\.slice\(0\s*,\s*\d+\)/,
    'la lista no puede recortarse: con 522 alabanzas las ultimas no se verian nunca');
});

// --- las cuatro anotaciones a lapiz del dueno ---
const porId = id => {
  const h = himnos.find(x => x.id === id);
  assert.ok(h, `no existe la alabanza ${id}`);
  return h;
};

test('anotacion 1: la vuelta de "Ven Oh Todopoderoso"', () => {
  const h = porId('1-1');
  assert.match(h.contenido, /^Vuelta \(anotada a mano\):\nMI {2}LA {2}SI {2}DO#m {2}SI {2}MI$/m);
});

test('anotacion 2: los dos finales de "Santo Santo Santo"', () => {
  const h = porId('1-98');
  assert.match(h.contenido, /Final \(anotado a mano\):\nSOL {2}RE/);
  assert.match(h.contenido, /Final del himno \(anotado a mano\):\nSOL {2}LA {2}RE$/);
});

test('anotacion 3: "Has hallado en Cristo" pasa de LA a MI', () => {
  const h = porId('1-228');
  assert.equal(h.tono, 'MI');
  assert.match(h.contenido, /Ante Tu tribunal de luz" \(anotado a mano\):\nLA {2}MI/);
});

test('anotacion 4: "Quiero cantar una linda cancion" reescrito a DO', () => {
  const h = porId('2-45');
  assert.equal(h.tono, 'DO');
  // La sustitucion pedida: MI->DO, DO#m->LA, FA#m->FA, SI->SOL. Ninguno de los
  // acordes viejos puede sobrevivir en las lineas de acordes.
  const lineasAcordes = h.contenido.split('\n').filter(l => M._esLineaAcordes(l));
  assert.ok(lineasAcordes.length >= 5, 'deberian quedar varias lineas de acordes');
  for (const l of lineasAcordes) {
    assert.doesNotMatch(l, /\bDO#m\b/, 'quedo un DO#m sin cambiar: ' + l);
    assert.doesNotMatch(l, /\bFA#m\b/, 'quedo un FA#m sin cambiar: ' + l);
    assert.doesNotMatch(l, /\bMI\b/,   'quedo un MI sin cambiar: ' + l);
    assert.doesNotMatch(l, /\bSI\b/,   'quedo un SI sin cambiar: ' + l);
  }
  assert.match(h.contenido, /\bDO\b/);
  assert.match(h.contenido, /\bSOL\b/);
});

test('las lineas anotadas a mano SI se transponen con el resto', () => {
  // Si el transpositor no las reconociera como linea de acordes, subir el tono
  // dejaria la anotacion en el tono viejo: peor que no tenerla, porque el musico
  // se fia de ella. Por eso se escriben como acordes sueltos, sin guiones ni
  // prosa: _esLineaAcordes() exige que el 60% de las palabras sean acordes.
  for (const [id, linea] of [['1-1', 'MI  LA  SI  DO#m  SI  MI'],
                             ['1-98', 'SOL  RE'],
                             ['1-98', 'SOL  LA  RE'],
                             ['1-228', 'LA  MI']]) {
    assert.ok(porId(id).contenido.includes(linea), `falta la linea "${linea}" en ${id}`);
    assert.ok(M._esLineaAcordes(linea), `el transpositor NO reconoce "${linea}" como acordes`);
  }
  // Y que de verdad se muevan: MI subido 2 semitonos es FA#.
  assert.equal(M._transAcorde('MI', 2), 'FA#');
  assert.equal(M._transAcorde('DO#m', 2), 'RE#m');
});

test('el transpositor sigue reconociendo los acordes del himnario regenerado', () => {
  // La regeneracion cambio el espaciado de TODAS las lineas. Si eso hubiera roto
  // la deteccion, el himnario entero dejaria de transponerse sin dar un solo
  // error: se veria igual y los botones -/+ no harian nada.
  const conAcordes = himnos.filter(h => h.contenido.split('\n').some(l => M._esLineaAcordes(l)));
  assert.ok(conAcordes.length > himnos.length * 0.75,
    `solo ${conAcordes.length} de ${himnos.length} tienen lineas de acordes reconocibles`);
});
