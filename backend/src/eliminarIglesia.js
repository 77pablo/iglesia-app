// ============================================================
//  Eliminar iglesia por completo (uso del super-admin).
//  Borrado dinámico y transaccional: no depende de enumerar a mano
//  las 45 tablas. Apaga las FK, borra todo lo de la iglesia, limpia
//  los huérfanos con PRAGMA foreign_key_check y verifica antes de COMMIT.
// ============================================================
import db from './db.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Mismo default que server.js (backend/uploads) si no hay UPLOADS_DIR.
function uploadsDir() { return process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'); }

// Columnas que guardan archivos SUBIDOS (/uploads/...) y cómo acotarlas a la iglesia.
const COLUMNAS_ARCHIVO = [
  { tabla: 'persona',         col: 'foto_url',       scope: 'iglesia_id = ?' },
  { tabla: 'material_musica', col: 'archivo_url',    scope: 'iglesia_id = ?' },
  { tabla: 'movimiento',      col: 'comprobante_url',scope: 'iglesia_id = ?' },
  { tabla: 'leccion',         col: 'material_url',   scope: 'iglesia_id = ?' },
  { tabla: 'mensaje',         col: 'adjunto_url',    scope: 'conversacion_id IN (SELECT id FROM conversacion WHERE iglesia_id = ?)' },
  { tabla: 'predica_recurso', col: 'url',            scope: 'predica_id IN (SELECT id FROM predica WHERE iglesia_id = ?)' },
];

// Rutas /uploads/... de una iglesia, de todas las columnas de archivo.
export function recolectarArchivos(iglesiaId) {
  const urls = [];
  for (const { tabla, col, scope } of COLUMNAS_ARCHIVO) {
    const filas = db.prepare(
      `SELECT ${col} AS u FROM ${tabla} WHERE (${scope}) AND ${col} LIKE '/uploads/%'`
    ).all(iglesiaId);
    for (const f of filas) if (f.u) urls.push(f.u);
  }
  return urls;
}

// Borra los archivos del disco (mejor esfuerzo). rclone propaga las bajas a R2.
function borrarArchivos(urls) {
  const base = uploadsDir();
  let borrados = 0;
  for (const u of urls) {
    try { fs.unlinkSync(path.join(base, path.basename(u))); borrados++; }
    catch { /* ya no existe u otro error: mejor esfuerzo */ }
  }
  return borrados;
}

// Elimina una iglesia por completo: datos + archivos. null si no existe.
export function eliminarIglesiaCompleta(iglesiaId) {
  const ig = db.prepare('SELECT id, nombre, codigo_unico FROM iglesia WHERE id = ?').get(iglesiaId);
  if (!ig) return null;
  const archivos = recolectarArchivos(iglesiaId);   // recolecta ANTES de borrar
  borrarDatosIglesia(iglesiaId);                     // lanza si falla → no se tocan archivos
  const archivosBorrados = borrarArchivos(archivos); // solo si el borrado de datos tuvo éxito
  return { nombre: ig.nombre, codigo: ig.codigo_unico, archivosBorrados };
}

// Borra TODOS los datos de una iglesia en una transacción (todo-o-nada).
// Lanza Error si algo falla; en ese caso la iglesia queda intacta.
export function borrarDatosIglesia(iglesiaId) {
  const tablas = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(r => r.name);

  db.exec('PRAGMA foreign_keys = OFF');   // no-op dentro de txn: va ANTES del BEGIN
  try {
    db.exec('BEGIN');

    // 1) Todas las tablas con columna iglesia_id.
    for (const t of tablas) {
      if (t === 'iglesia') continue;
      const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
      if (cols.includes('iglesia_id')) db.prepare(`DELETE FROM ${t} WHERE iglesia_id = ?`).run(iglesiaId);
    }

    // 2) Limpieza de huérfanos: al borrar los padres (persona, evento, grupo,
    //    conversación...), sus hijos quedan colgando. foreign_key_check los
    //    lista; se borran por rowid y se repite hasta que no quede ninguno.
    let guard = 0;
    for (;;) {
      const huerfanos = db.prepare('PRAGMA foreign_key_check').all();
      if (!huerfanos.length) break;
      if (++guard > 100) throw new Error('la limpieza de huérfanos no converge');
      for (const h of huerfanos) db.prepare(`DELETE FROM "${h.table}" WHERE rowid = ?`).run(h.rowid);
    }

    // 3) La iglesia misma.
    db.prepare('DELETE FROM iglesia WHERE id = ?').run(iglesiaId);

    // 4) Verificación final: no debe quedar ninguna referencia rota.
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('quedaron referencias huérfanas tras el borrado');

    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignora */ }
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
