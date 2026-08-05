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
  `"widget" style="cursor:pointer" onclick="navTo('calendario')"`,
  `onclick="navTo('mi_servicio')"`,
  `onclick="verNotificaciones()"`,
  `"mini-item" style="cursor:pointer" onclick="navTo('calendario')"`,
  `onclick="navTo('anuncios')"`,
  `onclick="verDia('`,
  `onclick="abrirNotif('`,
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
];

// Cada <div ...onclick= / <span ...onclick= con lo que le sigue en su linea.
function tagsClicables() {
  return fuente.match(/<(?:div|span)[^\r\n>]*onclick=[^\r\n]*/g) || [];
}

test('ningun <div>/<span> clicable fuera de la deuda declarada', () => {
  const usados = new Set();
  for (const tag of tagsClicables()) {
    if (tag.includes('stopPropagation')) continue;   // se cuentan aparte abajo
    const p = PENDIENTES.find(p => tag.includes(p));
    assert.ok(p,
      'Control clicable nuevo como <div>/<span>:\n  ' + tag.slice(0, 120) +
      '\nUsa <button type="button" class="btn-plano ..."> — Tab, Enter y el ' +
      'lector de pantalla vienen gratis. No agregues entradas a PENDIENTES.');
    usados.add(p);
  }
  for (const p of PENDIENTES) {
    assert.ok(usados.has(p),
      `La entrada ya se convirtio (o cambio de forma): quitala de PENDIENTES -> ${p}`);
  }
});

test('los onclick de stopPropagation son exactamente los 6 de los modales', () => {
  // No son controles: solo evitan que el clic dentro del modal lo cierre.
  // Si agregas un modal nuevo con esta tecnica, sube el numero A PROPOSITO.
  const n = tagsClicables().filter(t => t.includes('stopPropagation')).length;
  assert.equal(n, 6,
    `hay ${n} onclick de stopPropagation y se esperaban 6 — si es un modal ` +
    'nuevo legitimo, actualiza este numero; si no, algo se colo');
});

test('.btn-plano existe y tiene foco visible', () => {
  assert.ok(/\.btn-plano\s*\{[^}]*appearance\s*:\s*none/.test(hoja),
    'web/styles.css no tiene .btn-plano con appearance:none — los botones ' +
    'convertidos se verian con el estilo nativo del navegador');
  assert.ok(/\.btn-plano:focus-visible\s*\{[^}]*outline/.test(hoja),
    '.btn-plano:focus-visible sin outline: quien navega con Tab no ve donde esta');
});
