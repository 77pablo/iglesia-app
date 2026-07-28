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

// Umbrales del spec (docs/superpowers/specs/2026-07-28-indicador-persistencia-design.md).
export const UMBRAL_RETRASO_SEG = 15 * 60;   // el retraso normal se mide en segundos

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
