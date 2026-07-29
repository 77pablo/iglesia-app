// ============================================================
//  La fecha de "hoy" del portal publico, fijada a una zona horaria.
//
//  El portal muestra los eventos "de hoy en adelante". Calcular ese "hoy" con
//  toISOString() da la fecha en UTC, y Chile va cuatro horas por detras: a las
//  20:00 hora local ya es el dia siguiente en UTC, asi que los eventos de HOY
//  desaparecian del portal cuatro horas antes de tiempo -- justo la franja en
//  la que alguien mira el sitio para saber si esta noche hay culto.
//
//  TZ se fija ANTES de importar nada que use fechas: cada archivo de test corre
//  en su propio proceso, asi que esto no afecta al resto de la suite. Sin esto,
//  el test solo demostraria el fallo en maquinas que no esten en UTC.
// ============================================================
process.env.TZ = 'America/Santiago';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaLocal } from '../src/publico.js';

test('fechaLocal da el dia del calendario LOCAL, no el de UTC', () => {
  // 28 de julio, 22:32 en Santiago. En UTC ya es el 29.
  const nocheEnChile = new Date(2026, 6, 28, 22, 32, 0);
  assert.equal(nocheEnChile.toISOString().slice(0, 10), '2026-07-29',
    'comprobacion del propio test: a esa hora UTC ya va un dia por delante');
  assert.equal(fechaLocal(nocheEnChile), '2026-07-28',
    'para quien mira el sitio a las 22:32 en Chile, hoy sigue siendo el 28');
});

test('fechaLocal rellena mes y dia con cero a la izquierda', () => {
  assert.equal(fechaLocal(new Date(2026, 0, 5, 12, 0, 0)), '2026-01-05');
});

test('fechaLocal no se corre en el primer minuto del dia', () => {
  // 00:01 local del 1 de agosto: en UTC son las 04:01 del mismo dia, asi que
  // aqui las dos coinciden. Sirve de control: el arreglo no desplaza la fecha
  // en el sentido contrario.
  assert.equal(fechaLocal(new Date(2026, 7, 1, 0, 1, 0)), '2026-08-01');
});
