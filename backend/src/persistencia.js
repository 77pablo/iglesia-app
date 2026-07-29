// ============================================================
//  Estado del respaldo externo (persistencia).
//
//  Que la base de datos se este respaldando o no vivia en una sola linea del
//  log de arranque del contenedor, que nadie lee. Este modulo lo saca a la luz.
//
//  La INTERPRETACION (este bloque) es pura: recibe texto y devuelve veredicto.
//  La OBTENCION (mas abajo, tarea 3) ejecuta litestream y lee disco. Estan
//  separadas para poder probar la logica sin contenedor, sin red y sin bucket.
// ============================================================

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import db from './db.js';
import { fechaLocal } from './fechas.js';

// Umbrales del spec (docs/superpowers/specs/2026-07-28-indicador-persistencia-design.md).
export const UMBRAL_RETRASO_SEG = 15 * 60;   // el retraso normal se mide en segundos

export const UMBRAL_SELLO_SEG = 5 * 60;      // el bucle de rclone corre cada 30 s
export const GRACIA_ARRANQUE_SEG = 3 * 60;   // margen para la primera vuelta del bucle

// Momento en que arranco este proceso. Sirve para el periodo de gracia: al
// despertar del sueno del plan free, /data viene vacio y el sello aun no existe.
export const ARRANQUE_MS = Date.now();

// Duracion en formato Go ("1.5s", "2m30s", "1h0m0s", "500ms"), que es como la
// imprime litestream. Devuelve segundos, o null si no se reconoce.
export function parsearDuracion(txt) {
  const s = String(txt ?? '').trim();
  if (!s) return null;
  const factor = { ms: 0.001, s: 1, m: 60, h: 3600 };
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;   // 'ms' primero: si no, "500ms" leeria "500m"
  let total = 0, hubo = false, m;
  while ((m = re.exec(s)) !== null) { total += parseFloat(m[1]) * factor[m[2]]; hubo = true; }
  return hubo ? total : null;
}

// Interpreta la salida de `litestream generations`.
// La cabecera se lee por NOMBRE de columna, no por posicion: si una version
// futura reordena o renombra columnas, el resultado es 'desconocido' (ambar, sin
// aviso) en vez de una alarma falsa. Ante la duda, callar, no gritar.
export function interpretarGeneraciones(salida) {
  const nada = { estado: 'mal', motivo: 'sin_generaciones', ultimo: null, retraso_seg: null };
  const raro = { estado: 'desconocido', motivo: 'formato_no_reconocido', ultimo: null, retraso_seg: null };

  const lineas = String(salida ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lineas.length === 0) return nada;

  const cab = lineas[0].toLowerCase().split(/\s+/);
  const iLag = cab.indexOf('lag');
  const iEnd = cab.indexOf('end');
  if (iLag === -1 || iEnd === -1) return raro;
  if (lineas.length === 1) return nada;   // cabecera sola: nunca se replico

  let mejor = null;
  for (const fila of lineas.slice(1)) {
    const col = fila.split(/\s+/);
    const t = Date.parse(col[iEnd]);
    if (!Number.isFinite(t)) continue;
    if (!mejor || t > mejor.t) mejor = { t, lag: col[iLag] };
  }
  if (!mejor) return raro;

  const retraso = parsearDuracion(mejor.lag);
  const ultimo = new Date(mejor.t).toISOString();
  if (retraso === null) return { ...raro, ultimo };

  const alto = retraso > UMBRAL_RETRASO_SEG;
  return {
    estado: alto ? 'mal' : 'ok',
    motivo: alto ? 'retraso_alto' : null,
    ultimo,
    retraso_seg: Math.round(retraso)
  };
}

// Interpreta el sello que deja el bucle de rclone tras cada sincronizacion.
// Dentro del periodo de gracia, la falta de sello no es un fallo: es que el
// bucle todavia no ha dado su primera vuelta.
export function interpretarSello(contenido, ahoraMs = Date.now(), arranqueMs = ARRANQUE_MS) {
  const enGracia = (ahoraMs - arranqueMs) / 1000 < GRACIA_ARRANQUE_SEG;
  const txt = String(contenido ?? '').trim();

  if (!txt) {
    return enGracia
      ? { estado: 'desconocido', motivo: 'arrancando', ultimo: null }
      : { estado: 'mal', motivo: 'sello_ausente', ultimo: null };
  }

  const t = Date.parse(txt);
  if (!Number.isFinite(t)) return { estado: 'desconocido', motivo: 'formato_no_reconocido', ultimo: null };

  const ultimo = new Date(t).toISOString();
  const diff = (ahoraMs - t) / 1000;   // positivo: el sello es viejo. negativo: el sello es futuro.

  // Un sello con fecha futura da diff negativo, que nunca supera el umbral de
  // "viejo" en la comparacion de abajo: sin este chequeo, un reloj adelantado
  // (o un sello corrupto) dejaria los uploads en verde para siempre aunque el
  // bucle de rclone lleve semanas muerto. Callarse justo ahi es el fallo que
  // este modulo existe para evitar, asi que se trata como formato irreconocible
  // (ambar), no como salud. No se distingue por periodo de gracia: una fecha
  // imposible lo es tanto si el proceso acaba de arrancar como si no.
  if (-diff > UMBRAL_SELLO_SEG) {
    return { estado: 'desconocido', motivo: 'formato_no_reconocido', ultimo };
  }

  if (diff > UMBRAL_SELLO_SEG) {
    return enGracia
      ? { estado: 'desconocido', motivo: 'arrancando', ultimo }
      : { estado: 'mal', motivo: 'sello_viejo', ultimo };
  }
  return { estado: 'ok', motivo: null, ultimo };
}

// ============================================================
//  OBTENCION: aqui si se ejecuta un binario y se toca el disco.
// ============================================================

const CACHE_MS = 5 * 60 * 1000;
// El resultado 'arrancando' se cachea mucho menos: la gracia dura 3 min, menos
// que el cache normal de 5. Si la primera consulta cae dentro de la gracia, un
// cache de 5 min congelaria "arrancando" hasta 2 min despues de que la gracia
// termine, retrasando la deteccion de un fallo real. 30 s evita ese retraso sin
// volver a recalcular en cada peticion.
const CACHE_ARRANCANDO_MS = 30 * 1000;
let cache = null;
// Comprobacion EN CURSO. La cache guarda el resultado, pero mientras se calcula
// no hay resultado que guardar: con la cache fria, /api/me (via
// vigilarPersistenciaThrottled) y el panel del super-admin entran casi a la vez
// y ambos lanzaban `litestream generations`. Aqui el segundo se engancha al
// vuelo del primero en vez de abrir el suyo.
let vuelo = null;
export function _limpiarCache() { cache = null; vuelo = null; }   // solo para pruebas

// Cierto si el resultado todavia esta en el periodo de gracia (bd o uploads con
// motivo 'arrancando'): ese resultado se cachea con TTL corto (ver arriba).
// Pura y exportada para poder probarla sin pasar por estadoPersistencia().
export function esArrancando(valor) {
  return valor.bd.motivo === 'arrancando' || valor.uploads.motivo === 'arrancando';
}

// Decide el estado de la BD a partir del resultado de pedirGeneraciones().
// Pura (para las mismas entradas, incluidos ahoraMs/arranqueMs, siempre da la
// misma salida) y exportada: solo mira la FORMA de r (si tiene 'motivo' o
// 'salida'), no ejecuta nada. Se discrimina por la PRESENCIA de motivo (asi
// resuelve el fallo pedirGeneraciones), no por la verdad de r.salida como
// cadena: un comando exitoso puede imprimir una salida vacia, y eso
// interpretarGeneraciones ya sabe leerlo (-> mal/sin_generaciones). Mirar
// "if (r.salida)" tomaria ese caso legitimo como fallo y devolveria
// motivo:undefined, fuera del conjunto cerrado de motivos.
export function decidirBd(r, ahoraMs = Date.now(), arranqueMs = ARRANQUE_MS) {
  if (r.motivo === undefined) {
    const g = interpretarGeneraciones(r.salida);
    // Periodo de gracia, igual que en interpretarSello: en el primer despliegue
    // contra un bucket vacio, `litestream generations` solo imprime la cabecera
    // hasta la primera replicacion, y eso es sin_generaciones/mal -> aviso
    // falso. Ese aviso falso tiene un dano extra: consume la clave del dia (ver
    // avisarSiMal), asi que un fallo real ese mismo dia ya no notificaria. Vive
    // aqui y no en interpretarGeneraciones (que se mantiene pura, sin reloj)
    // porque el dato del arranque (ARRANQUE_MS) es de esta capa, no de la
    // interpretacion del texto. Solo protege 'sin_generaciones': un
    // 'retraso_alto' durante la gracia significa que SI hay generaciones y van
    // atrasadas, eso es real y no se perdona.
    if (g.motivo === 'sin_generaciones' && (ahoraMs - arranqueMs) / 1000 < GRACIA_ARRANQUE_SEG) {
      return { estado: 'desconocido', motivo: 'arrancando', ultimo: null, retraso_seg: null };
    }
    return g;
  }
  return {
    // Sin binario no es un fallo del respaldo: es que esta instancia no es el
    // contenedor (desarrollo local). Un comando que FALLA (mal copiada la
    // clave, bucket mal escrito) si es "mal": hay configuracion, el binario
    // existe, y aun asi no funciona. Lo unico que de verdad es "no pude
    // saberlo" es que el comando se cuelgue sin responder (tiempo_agotado).
    estado: r.motivo === 'binario_ausente' ? 'no_aplica'
      : r.motivo === 'comando_fallo' ? 'mal'
      : 'desconocido',
    motivo: r.motivo, ultimo: null, retraso_seg: null
  };
}

// Combina bd y uploads en el 'ok' final. Pura y exportada para poder probarla
// sin ejecutar nada. 'mal' manda: si un bloque esta roto, el indicador entero se
// declara roto sin importar el otro. 'null' es "no se pudo comprobar" (algun
// bloque 'desconocido' o 'no_aplica' y ninguno 'mal'), y eso NO es lo mismo que
// estar roto: mezclar ambos bajo 'false' confundiria un fallo real con los 3
// minutos de gracia tras arrancar.
export function combinarEstado(bd, uploads) {
  if (bd.estado === 'mal' || uploads.estado === 'mal') return false;
  if (bd.estado === 'ok' && uploads.estado === 'ok') return true;
  return null;
}

// Las mismas tres variables que mira docker-entrypoint.sh para decidir si
// arranca con replicacion. Si no estan, esta instancia no replica y punto.
function hayReplica() {
  return !!(process.env.R2_BUCKET && process.env.LITESTREAM_ACCESS_KEY_ID && process.env.R2_ENDPOINT);
}

function rutaSello() {
  const uploads = process.env.UPLOADS_DIR || '/data/uploads';
  return path.join(path.dirname(uploads), '.respaldo-uploads');
}

// Ejecuta `litestream generations`. NUNCA propaga stderr: se clasifica el fallo
// en un motivo corto y se descarta el texto, que puede traer endpoint y llaves.
function pedirGeneraciones() {
  return new Promise(resolve => {
    execFile(
      'litestream',
      ['generations', '-config', '/etc/litestream.yml', process.env.DB_PATH || ''],
      { timeout: 3000, windowsHide: true },
      (err, stdout) => {
        if (!err) return resolve({ salida: stdout });
        if (err.code === 'ENOENT') return resolve({ motivo: 'binario_ausente' });
        if (err.killed) return resolve({ motivo: 'tiempo_agotado' });
        resolve({ motivo: 'comando_fallo' });
      }
    );
  });
}

async function calcular() {
  if (!hayReplica()) {
    // Fuera de produccion (portatil de desarrollo), no tener R2 configurado es
    // lo normal: gris, sin aviso. En produccion (Dockerfile fija NODE_ENV) es
    // justo el escenario que este modulo existe para delatar: sin esas
    // variables el contenedor no replica nada, y el proximo reinicio borra los
    // datos. Eso es 'mal', no un gris silencioso.
    if (process.env.NODE_ENV === 'production') {
      const mal = { estado: 'mal', motivo: 'sin_configurar', ultimo: null };
      const bd = { ...mal, retraso_seg: null };
      const uploads = { ...mal };
      return { modo: 'sin-replica', ok: combinarEstado(bd, uploads), bd, uploads };
    }
    const nada = { estado: 'no_aplica', motivo: null, ultimo: null };
    return { modo: 'sin-replica', ok: null, bd: { ...nada, retraso_seg: null }, uploads: { ...nada } };
  }

  const r = await pedirGeneraciones();
  // La decision en si (que forma tiene 'r') vive en decidirBd, pura y
  // exportada; aqui solo se invoca con el resultado real de ejecutar el binario.
  const bd = decidirBd(r);

  let contenido = '';
  try { contenido = fs.readFileSync(rutaSello(), 'utf8'); } catch { contenido = ''; }
  // interpretarGeneraciones nunca devuelve 'no_aplica': ese estado solo llega
  // por la rama de arriba cuando r.motivo === 'binario_ausente'. Por eso
  // bd.estado === 'no_aplica' ya implica esa segunda condicion.
  const uploads = bd.estado === 'no_aplica'
    ? { estado: 'no_aplica', motivo: null, ultimo: null }
    : interpretarSello(contenido);

  return { modo: 'litestream', ok: combinarEstado(bd, uploads), bd, uploads };
}

// Estado del respaldo, cacheado 5 minutos (30s si el resultado es 'arrancando',
// ver CACHE_ARRANCANDO_MS): abrir el panel varias veces no debe llamar a R2
// varias veces. Nunca lanza: si algo revienta, devuelve 'desconocido'.
// modo: 'litestream' (hay R2 configurado y se pudo o no leer el estado real) |
//       'sin-replica' (esta instancia no replica, ver hayReplica) |
//       'desconocido' (fallo interno inesperado calculando el estado, rama catch).
export async function estadoPersistencia() {
  if (cache && Date.now() - cache.ts < cache.ttlMs) return cache.valor;
  if (vuelo) return vuelo;   // ya hay una comprobacion en marcha: esperar esa
  // El .finally suelta el vuelo pase lo que pase. Sin el, un fallo inesperado
  // dejaria la promesa pegada y TODAS las consultas futuras recibirian ese
  // mismo fallo para siempre. La comparacion `vuelo === p` evita que un vuelo
  // ya soltado por _limpiarCache anule al que arranco despues de el.
  const p = calcularYGuardar().finally(() => { if (vuelo === p) vuelo = null; });
  vuelo = p;
  return p;
}

// Calcula el estado y lo deja en la cache. Nunca lanza: si algo revienta, el
// veredicto es 'desconocido' (no pude comprobarlo), que no es lo mismo que mal.
async function calcularYGuardar() {
  let valor;
  try {
    valor = await calcular();
  } catch (e) {
    console.error('[persistencia]', e.message);
    const gris = { estado: 'desconocido', motivo: 'error_interno', ultimo: null };
    valor = { modo: 'desconocido', ok: null, bd: { ...gris, retraso_seg: null }, uploads: { ...gris } };
  }
  const ttlMs = esArrancando(valor) ? CACHE_ARRANCANDO_MS : CACHE_MS;
  cache = { ts: Date.now(), valor, ttlMs };
  return valor;
}

// ============================================================
//  AVISO: cuando el respaldo esta MAL, notificar al super-admin.
// ============================================================

// Avisa al super-admin cuando el respaldo esta MAL. Solo 'mal': 'desconocido'
// es "no pude comprobarlo" y avisar por un corte de red de tres segundos es el
// ruido que hace que las alarmas se aprendan a ignorar.
// Devuelve cuantas notificaciones creo (0 si ya se aviso hoy).
//
// "Hoy" es el dia del calendario LOCAL (fechaLocal), no el de UTC. Con
// toISOString() el dia cambiaba a las 20:00 de Chile, asi que un corte que
// empieza a las 19:00 y sigue a las 21:00 gastaba DOS claves en la misma noche
// -> dos avisos por lo mismo. Ese aviso no lo lee un servidor: lo lee una
// persona, en su dia.
export function avisarSiMal(estado, hoy = fechaLocal()) {
  if (!estado) return 0;
  if (estado.bd.estado !== 'mal' && estado.uploads.estado !== 'mal') return 0;

  // Primero se mira A QUIEN avisar, y solo si hay alguien se consume la clave
  // del dia. Al reves (consumir la clave antes de mirar admins) es justo el
  // defecto que se arregla aqui: si hoy no hay ningun super-admin activo, la
  // clave se gastaria sin crear ningun aviso, y si mas tarde ese mismo dia se
  // reactiva un super-admin, nunca se enteraria de que el respaldo esta caido.
  const admins = db.prepare("SELECT id FROM persona WHERE rol_global = 'super_admin' AND activo = 1").all();
  if (admins.length === 0) return 0;   // nadie a quien avisar: el dia sigue disponible

  const ins = db.prepare('INSERT OR IGNORE INTO aviso_sistema (clave) VALUES (?)')
    .run('persistencia:mal:' + hoy);
  if (ins.changes === 0) return 0;   // ya se aviso hoy

  const partes = [];
  if (estado.bd.estado === 'mal') partes.push('la base de datos');
  if (estado.uploads.estado === 'mal') partes.push('los archivos subidos');
  const texto = `No se está respaldando ${partes.join(' ni ')}. `
    + 'Si el servicio se reinicia ahora, esos datos se pierden. '
    + 'Revisa las variables R2_* y LITESTREAM_* en Render.';

  const st = db.prepare("INSERT INTO notificacion (persona_id, tipo, titulo, texto) VALUES (?, 'sistema', ?, ?)");
  for (const a of admins) st.run(a.id, '⚠️ El respaldo no está funcionando', texto);
  return admins.length;
}

// Dispara la comprobacion y olvida. Mismo patron que generarRecordatoriosThrottled:
// se llama desde /api/me, asi que cualquier trafico en la app comprueba el respaldo.
let ultimaVigilancia = 0;
export function vigilarPersistenciaThrottled() {
  if (Date.now() - ultimaVigilancia < CACHE_MS) return;
  ultimaVigilancia = Date.now();
  estadoPersistencia()
    .then(e => { try { avisarSiMal(e); } catch (err) { console.error('[persistencia]', err.message); } })
    .catch(err => console.error('[persistencia]', err.message));
}
