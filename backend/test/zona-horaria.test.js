// ============================================================
//  La zona horaria del contenedor tiene que estar declarada.
//
//  fechaLocal() (src/fechas.js) calcula el dia con getFullYear/getMonth/
//  getDate, que dependen de la zona horaria DEL PROCESO. Un contenedor
//  node:24-slim corre en UTC salvo que se le diga otra cosa, asi que en
//  produccion fechaLocal() devolvia el dia UTC y los tres arreglos de fecha
//  del proyecto eran inertes justo donde importaban:
//
//    - publico.js       los eventos de HOY desaparecian del portal a las 20:00
//    - persistencia.js  la clave del aviso diario se gastaba dos veces por noche
//    - directorio.js    el saludo de cumpleanos salia el dia antes a las 20:00
//    - recordatorios.js el "manana tienes X" llegaba dos dias antes
//    - reportes.js      los ingresos del ultimo dia del mes caian en el siguiente
//
//  Lo unico que hacia pasar la suite es que los tests de fecha se fijan TZ a
//  mano (persistencia-fecha.test.js, publico-fecha.test.js): eran los unicos
//  sitios del proyecto donde el codigo corria en la zona correcta.
//
//  Esto se comprueba leyendo los archivos de despliegue porque ninguna prueba
//  de Node puede ver la configuracion del contenedor, igual que se hace con las
//  reglas @media print y con las etiquetas de PERS_MOTIVO.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..', '..');
const ZONA = 'America/Santiago';

const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

test('el Dockerfile declara la zona horaria de Chile', () => {
  const dockerfile = leer('Dockerfile');
  assert.match(
    dockerfile,
    new RegExp(`^ENV\\s+TZ=${ZONA}\\s*$`, 'm'),
    `El Dockerfile no declara ENV TZ=${ZONA}. Sin eso el contenedor corre en UTC ` +
    'y fechaLocal() devuelve el dia equivocado durante las ultimas 4 horas de cada dia en Chile.'
  );
});

test('render.yaml declara la misma zona horaria', () => {
  const render = leer('render.yaml');
  // El Blueprint es lo unico que se lee al desplegar; si la zona solo estuviera
  // en el Dockerfile, cambiarla ahi obligaria a reconstruir la imagen. Estando en
  // los dos, el valor efectivo es visible desde el panel de Render.
  assert.match(
    render,
    /-\s*key:\s*TZ\s*\n\s*value:\s*America\/Santiago\s*$/m,
    `render.yaml no declara la variable TZ con valor ${ZONA}.`
  );
});

test('fechaLocal responde a la zona horaria del proceso (por eso hay que fijarla)', async () => {
  // Demuestra el mecanismo del fallo: el mismo instante da dos dias distintos
  // segun TZ. Es lo que convierte "declarar TZ" en un arreglo y no en un adorno.
  const { fechaLocal } = await import('../src/fechas.js');
  // 30 de julio de 2026, 01:00 UTC = 29 de julio, 21:00 en Chile.
  const instante = new Date('2026-07-30T01:00:00Z');

  const tzOriginal = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const enUtc = fechaLocal(new Date(instante));
    process.env.TZ = ZONA;
    const enChile = fechaLocal(new Date(instante));

    assert.equal(enUtc, '2026-07-30', 'en UTC ese instante ya es dia 30');
    assert.equal(enChile, '2026-07-29', 'en Chile ese instante sigue siendo dia 29');
    assert.notEqual(enUtc, enChile, 'si estos coincidieran, el test no probaria nada');
  } finally {
    if (tzOriginal === undefined) delete process.env.TZ;
    else process.env.TZ = tzOriginal;
  }
});
