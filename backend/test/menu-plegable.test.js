// -----------------------------------------------------------------------------
//  El menu del movil: temas plegables y entradas usables con teclado.
//
//  Igual que menu-agrupado.test.js, esto lee el TEXTO FUENTE de web/app.js y de
//  web/styles.css: el proyecto no tiene banco de pruebas de navegador.
// -----------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', '..', 'web', 'app.js');
const CSS = path.join(__dirname, '..', '..', 'web', 'styles.css');
const fuente = fs.readFileSync(APP_JS, 'utf8');
const hoja = fs.readFileSync(CSS, 'utf8');

// El numero del breakpoint, sacado del JS.
function anchoMovilDelJs() {
  const m = fuente.match(/const NAV_MOVIL_MAX\s*=\s*(\d+)\s*;/);
  assert.ok(m, 'no se encontro NAV_MOVIL_MAX en web/app.js');
  return Number(m[1]);
}

test('el @media de la hoja usa el MISMO ancho que NAV_MOVIL_MAX', () => {
  // Si estos dos numeros se separan, el JS pinta una forma del menu y el CSS
  // aplica los estilos de la otra. No da ningun error: simplemente el menu
  // aparece roto, y solo en los anchos que quedan entre los dos numeros.
  // No hay forma de compartir un valor entre JS y CSS en este proyecto (no hay
  // compilador ni preprocesador), asi que esta prueba es la unica red.
  const n = anchoMovilDelJs();
  assert.ok(hoja.includes(`@media (max-width:${n}px){`),
    `web/app.js declara NAV_MOVIL_MAX=${n} pero web/styles.css no tiene ningun ` +
    `@media (max-width:${n}px). Los estilos del movil y la forma que pinta el JS ` +
    'dejarian de coincidir.');
});

test('esMovil consulta el ancho de verdad, no lo adivina', () => {
  // Si alguien lo cambia por `window.innerWidth < X` deja de reaccionar a los
  // cambios de zoom y de orientacion igual que el CSS, y el menu se desincroniza
  // de sus propios estilos.
  const m = fuente.match(/function esMovil\(\)\{[^}]*\}/);
  assert.ok(m, 'no se encontro esMovil() en web/app.js');
  assert.ok(m[0].includes('matchMedia'),
    'esMovil() ya no usa matchMedia: dejaria de coincidir con el @media del CSS');
  assert.ok(m[0].includes('NAV_MOVIL_MAX'),
    'esMovil() no usa NAV_MOVIL_MAX: el numero estaria escrito dos veces');
});
