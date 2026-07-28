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
