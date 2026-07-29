// ============================================================
//  Interpretacion del estado del respaldo: funciones PURAS.
//  No ejecutan litestream ni tocan disco ni red: reciben la salida como
//  texto y devuelven el veredicto. Por eso se pueden probar en Windows,
//  sin contenedor y sin bucket.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearDuracion, interpretarGeneraciones, interpretarSello, combinarEstado, decidirBd,
  esArrancando, estadoPersistencia, _limpiarCache,
  UMBRAL_RETRASO_SEG, UMBRAL_SELLO_SEG, GRACIA_ARRANQUE_SEG
} from '../src/persistencia.js';

// Salida real de `litestream generations` (columnas alineadas con espacios).
const CABECERA = 'name  generation        lag     start                     end';
const salidaCon = (lag, end) =>
  `${CABECERA}\ns3    b16ddcf5c692d391  ${lag}  2026-07-28T09:00:00.000Z  ${end}`;

const AHORA = Date.parse('2026-07-28T15:00:00.000Z');

// Arranques de referencia para el periodo de gracia (bd y uploads comparten la
// misma constante GRACIA_ARRANQUE_SEG). "VIEJO" esta bien fuera de la gracia;
// "RECIEN" esta bien dentro. Los bordes exactos se prueban aparte (arreglo 6).
const ARRANQUE_VIEJO = AHORA - 60 * 60 * 1000;   // el proceso lleva 1 hora arriba
const ARRANQUE_RECIEN = AHORA - 30 * 1000;       // el proceso lleva 30 segundos

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
  const r = interpretarGeneraciones(salidaCon('1.2s', '2026-07-28T14:58:00.000Z'));
  assert.equal(r.estado, 'ok');
  assert.equal(r.motivo, null);
  assert.equal(r.ultimo, '2026-07-28T14:58:00.000Z');
  assert.equal(r.retraso_seg, 1);
});

test('la app inactiva no es una alarma: fecha vieja pero retraso cero -> ok', () => {
  // Nadie escribio en 3 horas. El ultimo dato replicado es viejo, pero no hay
  // nada pendiente de replicar: esto es sano, y medirlo por la fecha mentiria.
  const r = interpretarGeneraciones(salidaCon('0s', '2026-07-28T12:00:00.000Z'));
  assert.equal(r.estado, 'ok');
});

test('retraso por encima del umbral (15 min) -> mal', () => {
  const r = interpretarGeneraciones(salidaCon('22m14s', '2026-07-28T14:37:00.000Z'));
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'retraso_alto');
  assert.equal(r.retraso_seg, 1334);
});

test('retraso exactamente en el umbral (900s) -> ok, todavia no es "alto"', () => {
  const r = interpretarGeneraciones(salidaCon('15m0s', '2026-07-28T14:45:00.000Z'));
  assert.equal(r.retraso_seg, UMBRAL_RETRASO_SEG);
  assert.equal(r.estado, 'ok');
  assert.equal(r.motivo, null);
});

test('retraso un segundo sobre el umbral (901s) -> mal', () => {
  const r = interpretarGeneraciones(salidaCon('15m1s', '2026-07-28T14:45:00.000Z'));
  assert.equal(r.retraso_seg, UMBRAL_RETRASO_SEG + 1);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'retraso_alto');
});

test('sin ninguna generacion -> mal: nunca se replico nada', () => {
  const r = interpretarGeneraciones(CABECERA);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'sin_generaciones');
});

test('salida vacia -> mal', () => {
  assert.equal(interpretarGeneraciones('').estado, 'mal');
});

test('formato irreconocible -> desconocido, NUNCA mal', () => {
  // Si una version futura de litestream cambia las columnas, el fallo seguro es
  // "no pude saberlo" (ambar, sin aviso), no una alarma falsa a medianoche.
  const r = interpretarGeneraciones('vaya cosa mas rara\nsin columnas');
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'formato_no_reconocido');
});

test('con varias generaciones se toma la mas reciente', () => {
  const salida = `${CABECERA}
s3    aaaaaaaaaaaaaaaa  9m0s   2026-07-20T09:00:00.000Z  2026-07-20T10:00:00.000Z
s3    bbbbbbbbbbbbbbbb  2s     2026-07-28T09:00:00.000Z  2026-07-28T14:59:00.000Z`;
  const r = interpretarGeneraciones(salida);
  assert.equal(r.estado, 'ok');
  assert.equal(r.ultimo, '2026-07-28T14:59:00.000Z');
});

test('ningun motivo expone credenciales ni rutas del servidor', () => {
  const sucia = 'error: AccessDenied endpoint=https://abc123.r2.cloudflarestorage.com key=AKIAsecreta';
  const r = interpretarGeneraciones(sucia);
  assert.equal(r.estado, 'desconocido');
  assert.ok(!/cloudflarestorage|AKIA|key=/.test(JSON.stringify(r)),
    'el resultado no puede arrastrar la salida cruda de litestream');
});

// --- Sello de uploads --------------------------------------------------
// El bucle de rclone reescribe el sello tras CADA sincronizacion correcta.
// Si el bucle muere, muere en silencio: el sello envejeciendo es lo unico
// que lo delata.
test('sello fresco -> ok', () => {
  const r = interpretarSello('2026-07-28T14:59:30Z', AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'ok');
  assert.equal(r.motivo, null);
  assert.equal(r.ultimo, '2026-07-28T14:59:30.000Z');
});

test('sello viejo (mas de 5 min) con el proceso ya asentado -> mal', () => {
  const r = interpretarSello('2026-07-28T14:40:00Z', AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'sello_viejo');
});

test('sello con edad exactamente en el umbral (300s) -> ok, todavia no es "viejo"', () => {
  // AHORA - 300s = 14:55:00.000Z
  const r = interpretarSello('2026-07-28T14:55:00.000Z', AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'ok');
  assert.equal(r.motivo, null);
});

test('sello con edad un segundo sobre el umbral (301s) -> mal', () => {
  // AHORA - 301s = 14:54:59.000Z
  const r = interpretarSello('2026-07-28T14:54:59.000Z', AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'sello_viejo');
});

test('sin sello con el proceso ya asentado -> mal', () => {
  const r = interpretarSello('', AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'sello_ausente');
});

test('sin sello DENTRO del periodo de gracia -> desconocido, no mal', () => {
  // Al despertar del sueno del plan free, /data viene vacio y el bucle aun no
  // ha dado su primera vuelta. Avisar aqui seria avisar por nada, y una alarma
  // que suena por nada se aprende a ignorar.
  const r = interpretarSello('', AHORA, ARRANQUE_RECIEN);
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'arrancando');
});

test('sello viejo dentro del periodo de gracia -> desconocido', () => {
  const r = interpretarSello('2026-07-28T10:00:00Z', AHORA, ARRANQUE_RECIEN);
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'arrancando');
});

test('gracia: arranque exactamente en el limite (180s de vida) -> ya NO protege, mal', () => {
  const arranqueEnLimite = AHORA - GRACIA_ARRANQUE_SEG * 1000;
  const r = interpretarSello('', AHORA, arranqueEnLimite);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'sello_ausente');
});

test('gracia: arranque un segundo antes del limite (179s de vida) -> todavia protege', () => {
  const arranqueDentro = AHORA - (GRACIA_ARRANQUE_SEG - 1) * 1000;
  const r = interpretarSello('', AHORA, arranqueDentro);
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'arrancando');
});

test('sello con contenido ilegible -> desconocido', () => {
  const r = interpretarSello('no soy una fecha', AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'formato_no_reconocido');
});

test('sello con fecha futura mas alla del umbral -> desconocido, NUNCA ok para siempre', () => {
  // Un reloj adelantado (o un sello corrupto) da una fecha futura. Sin este
  // chequeo, (ahoraMs - t)/1000 es negativo y nunca supera el umbral de
  // "viejo": el indicador quedaria en verde aunque el bucle de rclone lleve
  // semanas muerto. Es callarse justo cuando hay que avisar.
  const futuro = new Date(AHORA + 20 * 60 * 1000).toISOString();   // 20 min en el futuro
  const r = interpretarSello(futuro, AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'formato_no_reconocido');
});

// --- Combinar bd y uploads en el ok final -------------------------------
// combinarEstado es pura: no ejecuta litestream ni toca disco, asi que se
// prueban aqui todas las combinaciones sin depender del binario.
const OK = { estado: 'ok', motivo: null, ultimo: null };
const MAL = { estado: 'mal', motivo: 'sello_viejo', ultimo: null };
const DESCONOCIDO = { estado: 'desconocido', motivo: 'arrancando', ultimo: null };
const NO_APLICA = { estado: 'no_aplica', motivo: null, ultimo: null };

test('combinarEstado: los dos ok -> true', () => {
  assert.equal(combinarEstado(OK, OK), true);
});

test('combinarEstado: uno mal y el otro ok -> false', () => {
  assert.equal(combinarEstado(MAL, OK), false);
  assert.equal(combinarEstado(OK, MAL), false);
});

test('combinarEstado: uno desconocido y el otro ok -> null (no se pudo comprobar, no es "mal")', () => {
  assert.equal(combinarEstado(DESCONOCIDO, OK), null);
  assert.equal(combinarEstado(OK, DESCONOCIDO), null);
});

test('combinarEstado: los dos desconocido -> null', () => {
  assert.equal(combinarEstado(DESCONOCIDO, DESCONOCIDO), null);
});

test('combinarEstado: mal y desconocido a la vez -> false, el mal manda', () => {
  assert.equal(combinarEstado(MAL, DESCONOCIDO), false);
  assert.equal(combinarEstado(DESCONOCIDO, MAL), false);
});

test('combinarEstado: no_aplica no es ni ok ni mal -> null salvo que haya un mal', () => {
  assert.equal(combinarEstado(NO_APLICA, NO_APLICA), null);
  assert.equal(combinarEstado(NO_APLICA, OK), null);
  assert.equal(combinarEstado(MAL, NO_APLICA), false);
  assert.equal(combinarEstado(NO_APLICA, MAL), false);
});

// --- Decidir el estado de la BD a partir de pedirGeneraciones() ---------
// decidirBd es pura: solo mira la FORMA de r (si trae 'motivo' o 'salida') y,
// para 'sin_generaciones', el periodo de gracia (ahoraMs/arranqueMs), asi que
// se construye r a mano, sin ejecutar litestream ni el binario. Los casos que
// no dependen del periodo de gracia pasan ARRANQUE_VIEJO explicito para no
// depender de cuando corra el test (ver GRACIA_ARRANQUE_SEG).
test('decidirBd: salida normal con una generacion sana -> el veredicto de interpretarGeneraciones', () => {
  const r = decidirBd({ salida: salidaCon('1.2s', '2026-07-28T14:58:00.000Z') }, AHORA, ARRANQUE_VIEJO);
  const esperado = interpretarGeneraciones(salidaCon('1.2s', '2026-07-28T14:58:00.000Z'));
  assert.equal(r.estado, esperado.estado);
  assert.equal(r.motivo, esperado.motivo);
});

test('decidirBd: salida vacia (comando exitoso), FUERA de la gracia -> mal/sin_generaciones, NO la rama de fallo', () => {
  // Este es el caso que motivo el arreglo original: '' es falsy, pero r.motivo
  // sigue siendo undefined (el comando SI tuvo exito), asi que debe llegar a
  // interpretarGeneraciones y no colarse por la rama de r.motivo definido.
  const r = decidirBd({ salida: '' }, AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'sin_generaciones');
});

test('decidirBd: motivo binario_ausente -> no_aplica (no hay Litestream en esta maquina)', () => {
  const r = decidirBd({ motivo: 'binario_ausente' }, AHORA, ARRANQUE_VIEJO);
  assert.equal(r.estado, 'no_aplica');
  assert.equal(r.motivo, 'binario_ausente');
});

test('decidirBd: motivo tiempo_agotado -> desconocido, conservando el motivo (no pude saberlo)', () => {
  const t = decidirBd({ motivo: 'tiempo_agotado' }, AHORA, ARRANQUE_VIEJO);
  assert.equal(t.estado, 'desconocido');
  assert.equal(t.motivo, 'tiempo_agotado');
});

test('decidirBd: motivo comando_fallo -> mal, no desconocido (el comando SI respondio, con error)', () => {
  // Una clave mal copiada o un bucket mal escrito hacen salir al comando con
  // error: eso es "algo esta roto de verdad", no "no pude saberlo". Lo que es
  // 'desconocido' es que el comando se cuelgue (tiempo_agotado), no que falle.
  const c = decidirBd({ motivo: 'comando_fallo' }, AHORA, ARRANQUE_VIEJO);
  assert.equal(c.estado, 'mal');
  assert.equal(c.motivo, 'comando_fallo');
});

test('decidirBd: sin_generaciones DENTRO del periodo de gracia -> desconocido/arrancando, no alarma falsa', () => {
  // Primer despliegue contra un bucket vacio: `litestream generations` solo
  // imprime la cabecera hasta la primera replicacion. Avisar aqui seria
  // avisar por nada, y ademas consumiria la clave del aviso del dia.
  const r = decidirBd({ salida: CABECERA }, AHORA, ARRANQUE_RECIEN);
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'arrancando');
});

test('decidirBd: retraso_alto DURANTE la gracia sigue siendo mal (si hay generaciones, van atrasadas de verdad)', () => {
  // La gracia solo perdona 'sin_generaciones'. Si YA hay generaciones y el
  // retraso es alto, eso es un fallo real independientemente de cuanto lleve
  // vivo el proceso.
  const r = decidirBd({ salida: salidaCon('22m14s', '2026-07-28T14:37:00.000Z') }, AHORA, ARRANQUE_RECIEN);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'retraso_alto');
});

test('decidirBd: gracia exactamente en el limite (180s de vida) -> ya NO protege, mal', () => {
  const arranqueEnLimite = AHORA - GRACIA_ARRANQUE_SEG * 1000;
  const r = decidirBd({ salida: CABECERA }, AHORA, arranqueEnLimite);
  assert.equal(r.estado, 'mal');
  assert.equal(r.motivo, 'sin_generaciones');
});

test('decidirBd: gracia un segundo antes del limite (179s de vida) -> todavia protege', () => {
  const arranqueDentro = AHORA - (GRACIA_ARRANQUE_SEG - 1) * 1000;
  const r = decidirBd({ salida: CABECERA }, AHORA, arranqueDentro);
  assert.equal(r.estado, 'desconocido');
  assert.equal(r.motivo, 'arrancando');
});

test('decidirBd: por ningun camino sale motivo undefined', () => {
  // El conjunto de motivos es cerrado (ver comentario junto a la constante de
  // motivos del spec) y 'undefined' no pertenece a el: si alguna rama lo
  // produjera, se rompe el contrato de "modo/motivo" que consume el resto del
  // modulo y el frontend.
  const MOTIVOS_CERRADOS = new Set([
    'sin_generaciones', 'retraso_alto', 'formato_no_reconocido', 'comando_fallo',
    'tiempo_agotado', 'binario_ausente', 'sello_ausente', 'sello_viejo',
    'arrancando', 'error_interno', 'sin_configurar'
  ]);
  const casos = [
    { r: { salida: salidaCon('1.2s', '2026-07-28T14:58:00.000Z') } },   // ok, motivo null
    { r: { salida: '' }, arranqueMs: ARRANQUE_VIEJO },
    { r: { salida: 'vaya cosa mas rara\nsin columnas' } },
    { r: { motivo: 'binario_ausente' } },
    { r: { motivo: 'tiempo_agotado' } },
    { r: { motivo: 'comando_fallo' } }
  ];
  for (const { r, arranqueMs = ARRANQUE_RECIEN } of casos) {
    const bd = decidirBd(r, AHORA, arranqueMs);
    assert.notEqual(bd.motivo, undefined, `decidirBd(${JSON.stringify(r)}) no debe dar motivo undefined`);
    assert.ok(bd.motivo === null || MOTIVOS_CERRADOS.has(bd.motivo),
      `motivo '${bd.motivo}' no pertenece al conjunto cerrado`);
  }
});

// --- Si el resultado cachea 30s (arrancando) o 5 min (normal) -----------
// esArrancando es pura: mira si bd o uploads tienen motivo 'arrancando'.
test('esArrancando: motivo arrancando en bd -> true', () => {
  assert.equal(esArrancando({ bd: DESCONOCIDO, uploads: OK }), true);
});

test('esArrancando: motivo arrancando en uploads -> true', () => {
  assert.equal(esArrancando({ bd: OK, uploads: DESCONOCIDO }), true);
});

test('esArrancando: arrancando en ambos -> true', () => {
  assert.equal(esArrancando({ bd: DESCONOCIDO, uploads: DESCONOCIDO }), true);
});

test('esArrancando: en ninguno -> false', () => {
  assert.equal(esArrancando({ bd: OK, uploads: OK }), false);
  assert.equal(esArrancando({ bd: MAL, uploads: OK }), false);
});

// --- Obtencion del estado real -----------------------------------------
test('sin variables de R2, FUERA de produccion, el modo es "sin-replica" y todo es no_aplica', async () => {
  const previas = {
    b: process.env.R2_BUCKET, k: process.env.LITESTREAM_ACCESS_KEY_ID, e: process.env.R2_ENDPOINT,
    n: process.env.NODE_ENV
  };
  delete process.env.R2_BUCKET; delete process.env.LITESTREAM_ACCESS_KEY_ID; delete process.env.R2_ENDPOINT;
  delete process.env.NODE_ENV;   // en desarrollo no hay produccion: esto debe quedar gris, no mal
  _limpiarCache();
  try {
    const r = await estadoPersistencia();
    assert.equal(r.modo, 'sin-replica');
    assert.equal(r.bd.estado, 'no_aplica');
    assert.equal(r.uploads.estado, 'no_aplica');
    assert.equal(r.ok, null, 'sin replica no es ni bien ni mal: no aplica');
  } finally {
    if (previas.b) process.env.R2_BUCKET = previas.b;
    if (previas.k) process.env.LITESTREAM_ACCESS_KEY_ID = previas.k;
    if (previas.e) process.env.R2_ENDPOINT = previas.e;
    if (previas.n === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previas.n;
    _limpiarCache();
  }
});

test('sin variables de R2, EN produccion, el respaldo es "mal": un reinicio ahora borra los datos', async () => {
  // En produccion (el Dockerfile fija NODE_ENV=production) no tener R2
  // configurado no es "esta instancia no replica" (gris): es el escenario
  // exacto que este modulo existe para delatar, porque el proximo reinicio
  // del contenedor borra los datos.
  const previas = {
    b: process.env.R2_BUCKET, k: process.env.LITESTREAM_ACCESS_KEY_ID, e: process.env.R2_ENDPOINT,
    n: process.env.NODE_ENV
  };
  delete process.env.R2_BUCKET; delete process.env.LITESTREAM_ACCESS_KEY_ID; delete process.env.R2_ENDPOINT;
  process.env.NODE_ENV = 'production';
  _limpiarCache();
  try {
    const r = await estadoPersistencia();
    assert.equal(r.modo, 'sin-replica');
    assert.equal(r.bd.estado, 'mal');
    assert.equal(r.bd.motivo, 'sin_configurar');
    assert.equal(r.uploads.estado, 'mal');
    assert.equal(r.uploads.motivo, 'sin_configurar');
    assert.equal(r.ok, false);
  } finally {
    if (previas.b) process.env.R2_BUCKET = previas.b;
    if (previas.k) process.env.LITESTREAM_ACCESS_KEY_ID = previas.k;
    if (previas.e) process.env.R2_ENDPOINT = previas.e;
    if (previas.n === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previas.n;
    _limpiarCache();
  }
});

test('con variables de R2 pero sin el binario, la BD es no_aplica y no revienta', async () => {
  const previas = { b: process.env.R2_BUCKET, k: process.env.LITESTREAM_ACCESS_KEY_ID, e: process.env.R2_ENDPOINT };
  process.env.R2_BUCKET = 'bucket-de-prueba';
  process.env.LITESTREAM_ACCESS_KEY_ID = 'clave-de-prueba';
  process.env.R2_ENDPOINT = 'https://ejemplo.invalido';
  _limpiarCache();
  try {
    // En Windows/desarrollo no existe el binario: el modulo debe decirlo, no caerse.
    const r = await estadoPersistencia();
    assert.ok(['no_aplica', 'desconocido'].includes(r.bd.estado));
    assert.ok(!/cloudflarestorage|clave-de-prueba/.test(JSON.stringify(r)),
      'el estado no puede arrastrar credenciales');
  } finally {
    if (previas.b) process.env.R2_BUCKET = previas.b; else delete process.env.R2_BUCKET;
    if (previas.k) process.env.LITESTREAM_ACCESS_KEY_ID = previas.k; else delete process.env.LITESTREAM_ACCESS_KEY_ID;
    if (previas.e) process.env.R2_ENDPOINT = previas.e; else delete process.env.R2_ENDPOINT;
    _limpiarCache();
  }
});

// --- Una sola comprobacion en vuelo (single-flight) ---------------------
// La cache guarda el RESULTADO, pero mientras se calcula no hay nada guardado:
// con la cache fria, /api/me (vigilarPersistenciaThrottled) y el panel del
// super-admin entran casi a la vez y ambos lanzaban el binario. Se comprueba por
// IDENTIDAD del objeto devuelto: si de verdad hubo una sola comprobacion, los
// dos que esperaban reciben el MISMO objeto; si hubo dos, cada calcular() fabrica
// el suyo.
function conR2(fn) {
  return async () => {
    const previas = { b: process.env.R2_BUCKET, k: process.env.LITESTREAM_ACCESS_KEY_ID, e: process.env.R2_ENDPOINT };
    process.env.R2_BUCKET = 'bucket-de-prueba';
    process.env.LITESTREAM_ACCESS_KEY_ID = 'clave-de-prueba';
    process.env.R2_ENDPOINT = 'https://ejemplo.invalido';
    _limpiarCache();
    try { await fn(); } finally {
      if (previas.b) process.env.R2_BUCKET = previas.b; else delete process.env.R2_BUCKET;
      if (previas.k) process.env.LITESTREAM_ACCESS_KEY_ID = previas.k; else delete process.env.LITESTREAM_ACCESS_KEY_ID;
      if (previas.e) process.env.R2_ENDPOINT = previas.e; else delete process.env.R2_ENDPOINT;
      _limpiarCache();
    }
  };
}

test('con la cache fria, dos consultas a la vez comparten UNA sola comprobacion', conR2(async () => {
  const [a, b] = await Promise.all([estadoPersistencia(), estadoPersistencia()]);
  assert.equal(a, b, 'las dos deben recibir el mismo objeto: solo se ejecuto litestream una vez');
}));

test('tras el vuelo, la cache sigue sirviendo el mismo resultado', conR2(async () => {
  const a = await estadoPersistencia();
  const b = await estadoPersistencia();
  assert.equal(a, b, 'la segunda consulta debe salir de la cache, no de un vuelo pegado');
}));

test('un vuelo no se queda pegado: _limpiarCache lo suelta y la siguiente consulta recalcula', conR2(async () => {
  const enVuelo = estadoPersistencia();   // arranca el vuelo, no se espera todavia
  _limpiarCache();                        // debe soltar cache Y vuelo
  const nueva = estadoPersistencia();     // no puede engancharse al vuelo soltado
  const [a, b] = await Promise.all([enVuelo, nueva]);
  assert.notEqual(a, b, 'tras _limpiarCache la siguiente consulta arranca una comprobacion nueva');
}));
