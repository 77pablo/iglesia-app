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

// ============================================================
//  Parte A: el rol 'predicador' se activaba/apagaba con el DIA UTC.
//
//  rol_temporal.desde/.hasta son fechas de calendario que elige el pastor
//  ('YYYY-MM-DD', sin hora). Compararlas contra date('now') SIN 'localtime'
//  usa el dia UTC: en Chile (UTC-4) el rol se activaba la noche anterior y se
//  apagaba unas 4 horas antes de lo que decia la pantalla.
//
//  El problema de probar esto con datos reales: una prueba que inserte un
//  rol_temporal y pregunte "¿esta vigente ahora?" solo distingue el codigo
//  bueno del malo durante esas ~4 horas al dia en que el dia UTC y el dia de
//  Chile no coinciden. El resto del dia pasa en verde con el fallo puesto:
//  da una seguridad que no tiene.
//
//  Salida: SQLite no permite "congelar" el reloj de date('now') (a diferencia
//  de Date en JS, que otros tests de este proyecto si mockean con
//  t.mock.timers -- ver persistencia-fecha.test.js). Asi que en vez de dejar
//  que la consulta real use 'now', se EXTRAE el texto de la consulta tal cual
//  vive hoy en auth.js/predica.js (si alguien cambia la consulta, esta prueba
//  se entera) y se sustituye 'now' por un instante de calendario FIJO antes de
//  ejecutarla contra una base de datos real. El resultado es una prueba de
//  COMPORTAMIENTO (ejecuta SQL de verdad) que a la vez es DETERMINISTA (no
//  depende en absoluto de a que hora del dia corra la suite).
// ============================================================
test('auth.js: la consulta de esPredicador compara contra el dia LOCAL, no el UTC', () => {
  const src = leer('backend/src/auth.js');
  const m = src.match(/SELECT 1 FROM rol_temporal WHERE persona_id = \? AND rol = 'predicador' AND date\(([^)]*)\) BETWEEN desde AND hasta/);
  assert.ok(m, 'no se encontro la consulta de esPredicador en auth.js (¿cambio de forma?)');
  assert.equal(m[1], "'now','localtime'",
    "esPredicador tiene que usar date('now','localtime'): sin 'localtime' compara la fecha de calendario contra el dia UTC.");
});

test('predica.js: la etiqueta "vigente" compara contra el dia LOCAL, no el UTC', () => {
  const src = leer('backend/src/predica.js');
  const m = src.match(/\(date\(([^)]*)\) BETWEEN rt\.desde AND rt\.hasta\) AS vigente/);
  assert.ok(m, 'no se encontro la consulta de /predicadores en predica.js (¿cambio de forma?)');
  assert.equal(m[1], "'now','localtime'",
    "\"vigente\" tiene que usar date('now','localtime'): sin 'localtime' compara la fecha de calendario contra el dia UTC.");
});

test('Parte A, comportamiento: el rol de predicador se activa y se apaga segun el dia de Chile (instantes FIJOS, no "now")', async () => {
  const { cargarDb } = await import('./helpers.js');
  const db = await cargarDb();

  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('TZ Test','TZTEST')").run();
  const iglesiaId = Number(ig.lastInsertRowid);
  const pRow = db.prepare(
    'INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, activo) VALUES (?,?,?,?,1)'
  ).run(iglesiaId, 'predicador_tz', 'Predicador TZ', 'x');
  const personaId = Number(pRow.lastInsertRowid);

  // El pastor le da el rol del 5 al 7 de julio de 2026 (fechas de calendario,
  // el mismo ejemplo del informe: se activaba la noche del 4 y se apagaba la
  // noche del 6, unas 4 horas antes de lo debido).
  db.prepare(
    "INSERT INTO rol_temporal (iglesia_id, persona_id, rol, desde, hasta) VALUES (?,?,'predicador','2026-07-05','2026-07-07')"
  ).run(iglesiaId, personaId);

  const authQuery = leer('backend/src/auth.js').match(/"SELECT 1 FROM rol_temporal[^"]*"/)[0].slice(1, -1);
  const predicaQuery = leer('backend/src/predica.js').match(/`SELECT rt\.id[\s\S]*?ORDER BY rt\.hasta DESC`/)[0].slice(1, -1);
  assert.ok(authQuery.includes("date('now'") && authQuery.includes('BETWEEN desde AND hasta'), 'no se pudo extraer la consulta de esPredicador');
  assert.ok(predicaQuery.includes("date('now'") && predicaQuery.includes('AS vigente'), 'no se pudo extraer la consulta de /predicadores');

  // Sustituye 'now' por un instante fijo (formato que SQLite acepta igual que
  // el 'now' real) y ejecuta las dos consultas reales contra la BD de prueba.
  const vigentePor = (instanteUTC) => {
    const auth = authQuery.replace("'now'", `'${instanteUTC}'`);
    const predica = predicaQuery.replace("'now'", `'${instanteUTC}'`);
    const porAuth = !!db.prepare(auth).get(personaId);
    const fila = db.prepare(predica).all(iglesiaId).find(x => x.persona_id === personaId);
    return { auth: porAuth, predica: !!(fila && fila.vigente) };
  };

  // 2026-07-05 01:00 UTC = 2026-07-04 21:00 en Chile: en Chile TODAVIA es el
  // dia 4, el rol no deberia estar activo aun. Con el fallo, aqui ya daria
  // vigente=true (se activaba 4h antes de tiempo).
  let r = vigentePor('2026-07-05 01:00:00');
  assert.equal(r.auth, false, 'esPredicador: la noche del 4 en Chile el rol aun NO deberia estar activo');
  assert.equal(r.predica, false, '"vigente": igual, la noche del 4 en Chile');

  // 2026-07-06 12:00 UTC = 2026-07-06 08:00 en Chile: de lleno en el rango, en
  // ambas zonas. Sirve de control (con o sin el fallo da vigente=true).
  r = vigentePor('2026-07-06 12:00:00');
  assert.equal(r.auth, true, 'esPredicador: pleno dia 6, el rol tiene que estar activo');
  assert.equal(r.predica, true, '"vigente": igual, pleno dia 6');

  // 2026-07-08 01:00 UTC = 2026-07-07 21:00 en Chile: en Chile TODAVIA es el
  // dia 7 (el ultimo del rol). Con el fallo, aqui ya daria vigente=false (se
  // apagaba 4h antes de tiempo).
  r = vigentePor('2026-07-08 01:00:00');
  assert.equal(r.auth, true, 'esPredicador: la noche del 7 en Chile el rol TODAVIA deberia estar activo');
  assert.equal(r.predica, true, '"vigente": igual, la noche del 7 en Chile');

  // 2026-07-08 05:00 UTC = 2026-07-08 01:00 en Chile: ya paso el dia 7 en
  // Chile, el rol tiene que estar apagado en ambas zonas.
  r = vigentePor('2026-07-08 05:00:00');
  assert.equal(r.auth, false, 'esPredicador: pasada la medianoche del 8 en Chile, el rol tiene que estar apagado');
  assert.equal(r.predica, false, '"vigente": igual, pasada la medianoche del 8 en Chile');
});

// ============================================================
//  Parte B: tres pantallas mostraban el dia UTC (el dia siguiente, por la
//  tarde/noche en Chile) en vez del dia en que la persona realmente actuo.
//
//  contacto_cuidado.fecha, aprobacion_log.creado_en y mensaje.creado_en se
//  guardan con datetime('now') (instantes UTC). Cortar el texto con
//  .slice(0,10) se quedaba con el dia UTC. El arreglo usa fechaDeUTC(), el
//  ayudante que ya existia y ya se aplicaba bien en otros dos sitios del mismo
//  archivo (web/app.js:2259 y :4465): se amplio su uso a los tres sitios que
//  faltaban en vez de escribir la conversion de nuevo.
// ============================================================
test('web/app.js: fechaDeUTC() convierte el instante UTC guardado al dia de Chile', () => {
  const src = leer('web/app.js');
  const mesesM = src.match(/const MESES = \[[^\]]*\];/);
  const fnM = src.match(/function fechaDeUTC\(s\)\{[\s\S]*?\n\}/);
  assert.ok(mesesM, 'no se encontro la constante MESES en web/app.js');
  assert.ok(fnM, 'no se encontro function fechaDeUTC en web/app.js');
  // eslint-disable-next-line no-new-func
  const fechaDeUTC = new Function(`${mesesM[0]}\n${fnM[0]}\nreturn fechaDeUTC;`)();

  // 21:00 del lunes 27 de julio en Chile = 01:00 UTC del martes 28: no puede
  // aparecer fechado el martes.
  assert.equal(fechaDeUTC('2026-07-28 01:00:00'), '27 Jul 2026',
    'un registro guardado a las 21:00 en Chile no puede mostrarse fechado al dia siguiente');
  // Control: a mediodia UTC y Chile ya coinciden en el mismo dia.
  assert.equal(fechaDeUTC('2026-07-28 15:00:00'), '28 Jul 2026');
});

test('web/app.js: las tres pantallas de la Parte B usan fechaDeUTC en vez de recortar el texto UTC', () => {
  const src = leer('web/app.js');
  assert.ok(src.includes('<span class="muted small">${escHtml(fechaDeUTC(x.fecha))}</span>'),
    'el historial de cuidado pastoral tiene que mostrar la fecha en hora de Chile (fechaDeUTC), no el dia UTC recortado');
  assert.ok(src.includes('${escHtml(fechaDeUTC(x.creado_en))}</span></div>`).join(\'\')}</div></div>`;'),
    'el historial de aprobaciones tiene que mostrar la fecha en hora de Chile (fechaDeUTC), no el dia UTC recortado');
  assert.ok(src.includes("m.creado_en?' · '+escHtml(fechaDeUTC(m.creado_en)):''"),
    'la fecha del adjunto de material tiene que mostrarse en hora de Chile (fechaDeUTC), no el dia UTC recortado');
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
