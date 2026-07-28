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
export function interpretarGeneraciones(salida, ahoraMs = Date.now()) {
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
  if ((ahoraMs - t) / 1000 > UMBRAL_SELLO_SEG) {
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
let cache = null;
export function _limpiarCache() { cache = null; }   // solo para pruebas

// Las mismas tres variables que mira docker-entrypoint.sh para decidir si
// arranca con replicacion. Si no estan, esta instancia no replica y punto.
function hayReplica() {
  return !!(process.env.R2_BUCKET && process.env.LITESTREAM_ACCESS_KEY_ID && process.env.R2_ENDPOINT);
}

function rutaSello() {
  if (process.env.RESPALDO_SELLO) return process.env.RESPALDO_SELLO;
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
    const nada = { estado: 'no_aplica', motivo: null, ultimo: null };
    return { modo: 'sin-replica', ok: null, bd: { ...nada, retraso_seg: null }, uploads: { ...nada } };
  }

  const r = await pedirGeneraciones();
  const bd = r.salida
    ? interpretarGeneraciones(r.salida)
    : {
        // Sin binario no es un fallo del respaldo: es que esta instancia no es
        // el contenedor (desarrollo local). Lo demas si es "no pude saberlo".
        estado: r.motivo === 'binario_ausente' ? 'no_aplica' : 'desconocido',
        motivo: r.motivo, ultimo: null, retraso_seg: null
      };

  let contenido = '';
  try { contenido = fs.readFileSync(rutaSello(), 'utf8'); } catch { contenido = ''; }
  const uploads = bd.estado === 'no_aplica' && r.motivo === 'binario_ausente'
    ? { estado: 'no_aplica', motivo: null, ultimo: null }
    : interpretarSello(contenido);

  const ok = bd.estado === 'ok' && uploads.estado === 'ok';
  return { modo: 'litestream', ok, bd, uploads };
}

// Estado del respaldo, cacheado 5 minutos: abrir el panel varias veces no debe
// llamar a R2 varias veces. Nunca lanza: si algo revienta, devuelve 'desconocido'.
export async function estadoPersistencia() {
  if (cache && Date.now() - cache.ts < CACHE_MS) return cache.valor;
  let valor;
  try {
    valor = await calcular();
  } catch (e) {
    console.error('[persistencia]', e.message);
    const gris = { estado: 'desconocido', motivo: 'error_interno', ultimo: null };
    valor = { modo: 'desconocido', ok: null, bd: { ...gris, retraso_seg: null }, uploads: { ...gris } };
  }
  cache = { ts: Date.now(), valor };
  return valor;
}
