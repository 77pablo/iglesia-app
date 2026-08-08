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

// Un nombre es TEXTO LITERAL, y aqui viaja dentro de un LIKE. Nadie prohibe
// llamarse "%" (perfilSchema solo exige 1..120 caracteres), y sin escapar ese
// nombre casaria TODAS las fichas y predicas de la iglesia: el aviso diria
// "tu nombre sigue escrito en 40 sitios" a quien no esta escrito en ninguno.
// Se escapan los dos comodines (% y _) y la propia barra de escape — sin esta
// ultima, "Rosa\Diaz" se buscaria como "RosaDiaz", que no es lo mismo.
// Cada consulta declara ESCAPE '\' o la barra no significaria nada.
function comoTextoLiteral(s) {
  return s.replace(/[\\%_]/g, '\\$&');
}

export function aparicionesDeNombre(nombreViejo, iglesiaId) {
  const nombre = String(nombreViejo || '').trim();
  if (!nombre) return { ninos: [], predicas: 0 };
  const like = '%' + comoTextoLiteral(nombre) + '%';
  const ninos = db.prepare(
    "SELECT id, nombre FROM nino WHERE iglesia_id = ? AND autorizados LIKE ? ESCAPE '\\'"
  ).all(iglesiaId, like);
  const predicas = db.prepare(
    `SELECT (SELECT COUNT(*) FROM predica WHERE iglesia_id = ? AND predicador LIKE ? ESCAPE '\\')
          + (SELECT COUNT(*) FROM sermon  WHERE iglesia_id = ? AND predicador LIKE ? ESCAPE '\\') AS n`
  ).get(iglesiaId, like, iglesiaId, like).n;
  return { ninos, predicas };
}

// La MISMA busqueda, contada. Existe aparte porque las dos respuestas del
// aviso son distintas a proposito y la diferencia es de privacidad (spec):
// quien se corrige el nombre a si mismo recibe CUANTOS sitios, nunca cuales
// —un LIKE con un nombre comun casa fichas de ninos ajenas—, y el pastor
// recibe la lista, que ya puede ver en la app.
//
// La clave se llama `ninos_n`, distinta de la `ninos` del detalle, y eso es
// deliberado: mientras las dos formas compartieron nombre, un lector del
// frontend podia leer la equivocada y el aviso DESAPARECIA en silencio
// (`[{…}] > 0` es false). Envolverlo aqui, en vez de dejar el `.length` en el
// llamador, es lo que impide que un descuido de una linea (`= ap` en vez de
// `= ap.ninos.length`) mande las fichas al autoservicio.
export function conteoDeApariciones(nombreViejo, iglesiaId) {
  const ap = aparicionesDeNombre(nombreViejo, iglesiaId);
  return { ninos_n: ap.ninos.length, predicas: ap.predicas };
}
