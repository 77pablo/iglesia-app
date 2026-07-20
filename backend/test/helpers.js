// Utilidades de prueba: BD temporal aislada + siembra minima determinista.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Efecto de import: fija una BD temporal unica y el secreto JWT ANTES de que se
// cargue db.js/auth.js (que se importan dinamicamente en los tests, despues de esto).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iglesia-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.JWT_SECRET = 'test-secret';

// Carga db.js (cacheado tras la 1a vez): devuelve el singleton apuntando a la BD temporal.
export async function cargarDb() {
  const mod = await import('../src/db.js');
  return mod.default;
}

// Limpia todas las tablas usadas por los tests (para reusar la misma BD entre tests).
export function reiniciar(db) {
  db.exec('PRAGMA foreign_keys=OFF');
  for (const t of ['mensaje', 'conversacion_miembro', 'conversacion', 'pertenencia', 'grupo', 'persona', 'iglesia'])
    db.exec('DELETE FROM ' + t);
  db.exec('PRAGMA foreign_keys=ON');
}

// Inserta una iglesia con pastor, un grupo (Jovenes) con lider + 2 miembros, y un feligres ajeno.
export function sembrarMinimo(db) {
  const ig = db.prepare("INSERT INTO iglesia (nombre, codigo_unico) VALUES ('Test','TEST')").run();
  const iglesiaId = Number(ig.lastInsertRowid);
  const hash = 'x'; // no se usa: los tests firman el token directo
  const insP = db.prepare(
    "INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, es_pastor, activo) VALUES (?,?,?,?,?,1)"
  );
  const persona = (usuario, nombre, esPastor = 0) => {
    const r = insP.run(iglesiaId, usuario, nombre, hash, esPastor);
    return { id: Number(r.lastInsertRowid), usuario, nombre };
  };
  const pastor = persona('pastor', 'Pastor', 1);
  const lider = persona('lider', 'Lider');
  const miembro1 = persona('miembro1', 'Miembro Uno');
  const miembro2 = persona('miembro2', 'Miembro Dos');
  const ajeno = persona('ajeno', 'Feligres Ajeno');

  const g = db.prepare("INSERT INTO grupo (iglesia_id, nombre, color) VALUES (?, 'Jovenes', '#2f7')").run(iglesiaId);
  const grupoId = Number(g.lastInsertRowid);
  const insPe = db.prepare('INSERT INTO pertenencia (persona_id, grupo_id, rol) VALUES (?,?,?)');
  insPe.run(lider.id, grupoId, 'admin');
  insPe.run(miembro1.id, grupoId, 'miembro');
  insPe.run(miembro2.id, grupoId, 'miembro');

  return { iglesiaId, pastor, lider, miembro1, miembro2, ajeno, grupoId };
}
