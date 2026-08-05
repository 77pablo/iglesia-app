// -----------------------------------------------------------------------------
//  Botones de verdad fuera del menu (spec 2026-08-05-botones-reales).
//
//  Barrido de fuente: todo control clicable debe ser un <button>, no un
//  <div onclick=...>. PENDIENTES es la deuda que las tareas del plan van
//  vaciando; cuando este vacia, este archivo es el candado que impide que
//  vuelvan. Regla de la casa: \r? antes de cada \n en los regex (CRLF).
// -----------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'app.js'), 'utf8');
const hoja = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'styles.css'), 'utf8');

// Deuda de conversion. Cada entrada es un trozo LITERAL de la etiqueta que
// TODAVIA es <div>/<span> clicable. Las tareas del plan las quitan al
// convertir; no agregues entradas: un control nuevo nace <button>.
const PENDIENTES = [
  `onclick="hojaAsistencia(`,
  `onclick="togglePresente(`,
  `onclick="abrirVisorCancion(`,
  `onclick="abrirVisorSetlist(`,
  `onclick="quitarIntegrante(`,
  `onclick="himnarioSel(`,
  `onclick="verCaso(`,
  `onclick="vistaClase(`,
  `onclick="verPredica(`,
  `onclick="verIglesiaObispo(`,
  `onclick="obAsistencia(`,
  `onclick="obTesoreria(`,
  `onclick="obPredica(`,
  `onclick="Org.abrir(`,
  `onclick="abrirHimnario()`,
];

// Excepciones con motivo escrito: clicables que NO se convierten a proposito.
const EXCEPCIONES = [
  // El chip de evento del calendario vive DENTRO de la celda del dia, que ya
  // es un <button> (anidar botones esta prohibido y el navegador los desanida
  // rompiendo el layout). Su contenido completo se alcanza con teclado:
  // celda -> panel del dia, que pinta titulo, hora, lugar y estado con
  // botones reales. El chip queda como atajo de raton.
  `onclick="event.stopPropagation();abrirEvento(`,
];

// Cualquier etiqueta clicable que NO sea <button> ni <a>, aunque ocupe varias
// lineas del fuente. El match llega hasta la comilla que cierra el onclick.
function tagsClicables() {
  return fuente.match(/<(?!button\b|a\b|\/)[a-z][a-z0-9]*\b[^>]*onclick="[^"]*"/gi) || [];
}
const esGuardaPura = t => /onclick="event\.stopPropagation\(\)"$/.test(t);

test('ningun clicable fuera de <button>/<a>, salvo deuda y excepciones declaradas', () => {
  const usados = new Set(), excUsadas = new Set();
  for (const tag of tagsClicables()) {
    if (esGuardaPura(tag)) continue;   // guardas de modal, contadas aparte abajo
    const exc = EXCEPCIONES.find(e => tag.includes(e));
    if (exc) { excUsadas.add(exc); continue; }
    const p = PENDIENTES.find(p => tag.includes(p));
    assert.ok(p,
      'Control clicable nuevo fuera de <button>/<a>:\n  ' + tag.replace(/\s+/g, ' ').slice(0, 120) +
      '\nUsa <button type="button" class="btn-plano ..."> — Tab, Enter y el ' +
      'lector de pantalla vienen gratis. No agregues entradas a PENDIENTES.');
    usados.add(p);
  }
  for (const p of PENDIENTES) {
    assert.ok(usados.has(p),
      `La entrada ya se convirtio (o cambio de forma): quitala de PENDIENTES -> ${p}`);
  }
  for (const e of EXCEPCIONES) {
    assert.ok(excUsadas.has(e),
      `La excepcion ya no existe en el fuente: quitala (y su motivo) -> ${e}`);
  }
});

test('las guardas puras de stopPropagation son exactamente las 6 de los modales', () => {
  // No son controles: solo evitan que el clic dentro del modal lo cierre.
  // Si agregas un modal nuevo con esta tecnica, sube el numero A PROPOSITO.
  const n = tagsClicables().filter(esGuardaPura).length;
  assert.equal(n, 6,
    `hay ${n} guardas puras de stopPropagation y se esperaban 6 — si es un ` +
    'modal nuevo legitimo, actualiza este numero; si no, algo se colo');
});

test('.btn-plano existe y tiene foco visible', () => {
  assert.ok(/\.btn-plano\s*\{[^}]*appearance\s*:\s*none/.test(hoja),
    'web/styles.css no tiene .btn-plano con appearance:none — los botones ' +
    'convertidos se verian con el estilo nativo del navegador');
  assert.ok(/\.btn-plano:focus-visible\s*\{[^}]*outline/.test(hoja),
    '.btn-plano:focus-visible sin outline: quien navega con Tab no ve donde esta');
});
