// ============================================================
//  Eliminar iglesia por completo (uso del super-admin).
//  Borrado dinámico y transaccional: no depende de enumerar a mano
//  las 45 tablas. Apaga las FK, borra todo lo de la iglesia, limpia
//  los huérfanos con PRAGMA foreign_key_check y verifica antes de COMMIT.
// ============================================================
import db from './db.js';

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
