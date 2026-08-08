// ============================================================
//  Que la app le hable a la gente en su idioma, no en el de la base de datos.
//
//   1. El cargo que sale bajo el nombre de la persona en TODAS las pantallas
//      venia de cap(rol.replace('_',' ')): la maestra de Escuela Dominical leia
//      "Lider ed", el lider de musica "Lider musica" y el de jovenes "Admin".
//      rolLabel(), que lo traduce bien, ya existia y no se usaba ahi.
//   2. Tesoreria sin datos dejaba DOS regiones literalmente en blanco (bajo
//      "Movimientos" y bajo "Transparencia"). Era el unico modulo de la app con
//      zonas que se quedaban vacias sin decir nada: la tesorera veia tres ceros
//      y dos huecos, y no sabia si la app estaba rota o le faltaba hacer algo.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'app.js'), 'utf8');
const lineas = fuente.split('\n');

// ⚠️ La parada es una heuristica y falla de dos maneras. Quedarse CORTO es
// ruidoso: el trozo sale a medias y revienta como SyntaxError dentro del
// new Function() de mas abajo, se ve. DESBORDARSE no revienta nada: si la
// declaracion no acaba en ';' ni en '}' -- una coma al final, o un comentario
// detras de la llave -- el bucle llega al final del fichero y esto devuelve
// desde la declaracion hasta el final de app.js. Las comprobaciones de abajo
// pasarian a buscar su cadena en medio archivo y dejarian de cubrir lo que
// cubrian, en verde. Por eso el assert del final: el segundo caso tambien
// tiene que hacer ruido.
function recortar(nombre) {
  const i = lineas.findIndex(l => new RegExp(`^(?:async function|function|const|let) ${nombre}\\b`).test(l));
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, trozo = [], cerro = false;
  for (let j = i; j < lineas.length; j++) {
    const l = lineas[j];
    trozo.push(l);
    for (const ch of l) { if (ch === '{') saldo++; else if (ch === '}') saldo--; }
    if (saldo <= 0 && (l.trimEnd().endsWith(';') || l.trimEnd().endsWith('}'))) { cerro = true; break; }
  }
  assert.ok(cerro, `el recorte de ${nombre} llego al final de web/app.js sin cerrar: la parada (saldo a cero en una linea que acaba en ';' o en '}') no disparo nunca, asi que esto devolveria desde la declaracion hasta el final del fichero y las comprobaciones de abajo buscarian su cadena en medio app.js sin enterarse de nada. Mira como termina ${nombre} en web/app.js -- si acaba en ',' o lleva un comentario detras de la '}', lo que hay que arreglar es el corte, no la prueba`);
  return trozo.join('\n');
}
const rolLabel = new Function(
  `${recortar('cap')}\n${recortar('ROL_INFO')}\n${recortar('rolLabel')}\nreturn rolLabel;`
)();

test('cada cargo se llama como se llama en la iglesia', () => {
  assert.equal(rolLabel('lider_ed'), 'Líder Esc. Dominical');
  assert.equal(rolLabel('lider_musica'), 'Líder de música');
  assert.equal(rolLabel('admin'), 'Líder de cuerpo');
  assert.equal(rolLabel('tesorero'), 'Tesorero');
  assert.equal(rolLabel('musico'), 'Músico');
  assert.equal(rolLabel('miembro'), 'Miembro');
});

test('ningun cargo llega a la pantalla con guion bajo', () => {
  // Incluye los roles que aun no estan en ROL_INFO: el respaldo tiene que
  // maquillarlos, no soltar la clave cruda bajo el nombre de una persona.
  for (const r of ['lider_ed', 'lider_musica', 'admin', 'tesorero', 'rol_inventado', ''])
    assert.doesNotMatch(rolLabel(r), /_/, `"${r}" sale con guion bajo`);
  assert.equal(rolLabel('rol_inventado'), 'Rol inventado');
  assert.equal(rolLabel(''), '');
  assert.equal(rolLabel(null), '');
});

test('ya no queda ningun sitio pintando el rol con cap(...replace)', () => {
  const sospechosos = lineas
    .map((l, i) => [i + 1, l])
    // Se saltan los comentarios: el que explica este mismo arreglo cita el
    // patron viejo, y sin esto el test se acusaba a si mismo.
    .filter(([, l]) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .filter(([, l]) => /cap\(\s*\(?[\w.]*rol[\w.]*\|?\|?[^)]*\)?\.replace\(\s*['"]_['"]/.test(l));
  assert.deepEqual(sospechosos, [], 'usa rolLabel() en vez de maquillar la clave a mano');
});

test('la leyenda de roles no le ensena la clave interna al pastor', () => {
  // Decia: "Líder Esc. Dominical (lider_ed)". El pastor lee esa leyenda para
  // decidir que rol le da a quien; la clave no le aporta nada.
  const i = lineas.findIndex(l => l.includes('const leyenda=Object.entries(ROL_INFO)'));
  assert.ok(i >= 0, 'no se encontro la leyenda de roles');
  const bloque = lineas.slice(i, i + 5).join('\n');
  assert.doesNotMatch(bloque, /\(\$\{k\}\)/, 'la leyenda no debe imprimir la clave del rol');
});

test('Tesoreria sin datos explica que hacer en vez de dejar el hueco en blanco', () => {
  const i = lineas.findIndex(l => l.includes('async function vistaTesoreria'));
  assert.ok(i >= 0, 'no se encontro vistaTesoreria()');
  const vista = lineas.slice(i, i + 60).join('\n');

  // Las tres regiones que pueden venir vacias tienen que estar guardadas por su
  // propio length: sin eso, un .map() sobre un array vacio pinta cadena vacia.
  assert.match(vista, /movs\.length\s*\n?\s*\?/, '"Movimientos" necesita su estado vacio');
  assert.match(vista, /trans\.porCategoria\.length/, '"Transparencia" necesita su estado vacio');
  // Tras la Task 5 el guardado ya no mira camps.length a secas: distingue
  // activas de cerradas, y el hueco vacio solo se pinta cuando NO HAY
  // campanias activas (una iglesia con solo campanias cerradas si tiene
  // contenido que mostrar, en la seccion "Cerradas").
  assert.match(vista, /camps\.filter\(c=>!c\.cerrada_en\)\.length/, '"Campañas" ya lo tenia, no se puede perder');

  for (const texto of ['Todavía no hay movimientos', 'aquí se verá en qué se fue el dinero', 'Todavía no hay campañas'])
    assert.ok(vista.includes(texto), `falta el texto "${texto}"`);

  // Y el consejo de que tocar solo se le da a quien PUEDE tocarlo: al pastor y
  // al obispo, que entran en solo lectura, decirles "Toca + Ingreso" seria
  // mandarles a un boton que no existe en su pantalla.
  const consejo = vista.indexOf('Toca «+ Ingreso»');
  assert.ok(consejo > 0, 'falta el consejo para la tesorera');
  const desde = vista.lastIndexOf('esTesoreroUI()', consejo);
  assert.ok(desde > 0 && consejo - desde < 120, 'el consejo debe ir condicionado a esTesoreroUI()');
});
