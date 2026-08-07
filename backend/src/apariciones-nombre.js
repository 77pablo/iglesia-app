// ============================================================
//  Donde sigue escrito un nombre despues de corregirlo. La correccion de
//  nombre (directorio.js, admin.js) sincroniza la unica copia denormalizada
//  que hay (aprobacion_log.actor_nombre), pero hay TEXTOS LIBRES que pueden
//  nombrar a la persona y que la app no debe reescribir sola: la lista de
//  quien puede retirar a un nino (se mira en la puerta de la sala) y el
//  predicador de una predica o sermon (se ve en el portal). Esta funcion
//  BUSCA y el llamador AVISA; nadie toca esos textos.
//
//  Limite asumido (spec): es un LIKE por texto. "la sra. Juanita" no se
//  encuentra (falso negativo) y un tocayo genera un aviso de mas (falso
//  positivo aceptable: el aviso pide revisar, no afirma). LIKE de SQLite no
//  distingue mayusculas solo en ASCII: "PEREZ" casa, "PÉREZ" no.
// ============================================================
import db from './db.js';

export function aparicionesDeNombre(nombreViejo, iglesiaId) {
  const nombre = String(nombreViejo || '').trim();
  if (!nombre) return { ninos: [], predicas: 0 };
  const like = '%' + nombre + '%';
  const ninos = db.prepare(
    'SELECT id, nombre FROM nino WHERE iglesia_id = ? AND autorizados LIKE ?'
  ).all(iglesiaId, like);
  const predicas = db.prepare(
    `SELECT (SELECT COUNT(*) FROM predica WHERE iglesia_id = ? AND predicador LIKE ?)
          + (SELECT COUNT(*) FROM sermon  WHERE iglesia_id = ? AND predicador LIKE ?) AS n`
  ).get(iglesiaId, like, iglesiaId, like).n;
  return { ninos, predicas };
}
