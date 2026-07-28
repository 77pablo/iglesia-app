// ============================================================
//  Seguridad: rate limiting + validacion de entrada (Fase 6)
//  - Limitadores de peticiones por persona (o por IP si no hay sesion).
//  - Middleware reutilizable validar(schema) con zod: valida
//    req.body/query/params y responde 400 + loguea el rechazo.
//  Todo el logging usa el prefijo [seguridad] y NUNCA vuelca
//  contrasenas, tokens ni datos personales completos.
// ============================================================
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { verificarToken } from './auth.js';

const QUINCE_MIN = 15 * 60 * 1000;

// --- A quien se le cuenta cada peticion ---
// Por IP a secas, toda una congregacion detras del mismo router (el wifi del
// templo, una casa) comparte una unica cuota y se bloquean entre si sin haber
// hecho nada raro. Con sesion iniciada se cuenta por PERSONA; el trafico
// anonimo (login, registro, recuperar clave) se sigue contando por IP, que es
// justo donde el limite protege de un ataque.
//
// El token se VERIFICA, no solo se lee: si bastara con leerlo, cualquiera
// inventaria persona_id distintos y se saltaria el limite por completo.
export function claveLimitador(req) {
  const cabecera = req.headers?.authorization || '';
  if (cabecera.startsWith('Bearer ')) {
    const payload = verificarToken(cabecera.slice(7));
    if (payload?.persona_id) return 'persona:' + payload.persona_id;
  }
  // ipKeyGenerator agrupa IPv6 por prefijo /56: sin eso, cambiar de sufijo
  // (cosa trivial en IPv6) daria cuota infinita.
  return 'ip:' + ipKeyGenerator(req.ip);
}

// Los limitadores se SALTAN solo cuando el arnes de pruebas lo pide
// (DISABLE_RATE_LIMIT=1). En produccion NUNCA se define esa variable, asi que
// siguen activos; y `seguridad.test.js` arranca su server SIN esa variable para
// poder verificar el 429. Esto evita el flaky de tests que hacen >100 requests.
const saltarEnTest = () => process.env.DISABLE_RATE_LIMIT === '1';

// --- Limitador general: aplica a todo /api ---
// Cuenta por persona cuando hay sesion (ver claveLimitador): antes, una iglesia
// entera en el mismo wifi compartia estas 100 peticiones.
export const limiterGeneral = rateLimit({
  windowMs: QUINCE_MIN,
  limit: 100,
  skip: saltarEnTest,
  keyGenerator: claveLimitador,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en unos minutos.' },
  handler: (req, res, next, options) => {
    console.warn(`[seguridad] rate-limit general excedido: clave=${claveLimitador(req)} ruta=${req.method} ${req.originalUrl}`);
    res.status(options.statusCode).json(options.message);
  }
});

// --- Limitador de login: 5 intentos / 15 min (anti fuerza bruta) ---
export const limiterLogin = rateLimit({
  windowMs: QUINCE_MIN,
  limit: 5,
  skip: saltarEnTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de acceso. Espera unos minutos e intentalo de nuevo.' },
  handler: (req, res, next, options) => {
    console.warn(`[seguridad] rate-limit login excedido: ip=${req.ip}`);
    res.status(options.statusCode).json(options.message);
  }
});

// --- Limitador de endpoints sensibles: admin, tesoreria, upload ---
// Tambien por persona: dos administradores de la misma iglesia trabajando a la
// vez no deben gastarse el cupo el uno al otro.
export const limiterSensible = rateLimit({
  windowMs: QUINCE_MIN,
  limit: 10,
  skip: saltarEnTest,
  keyGenerator: claveLimitador,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones a un recurso sensible. Intenta de nuevo en unos minutos.' },
  handler: (req, res, next, options) => {
    console.warn(`[seguridad] rate-limit sensible excedido: clave=${claveLimitador(req)} ruta=${req.method} ${req.originalUrl}`);
    res.status(options.statusCode).json(options.message);
  }
});

// --- Limitador del chat: holgado a proposito ---
// La mensajeria (SSE + envios + pings de "escribiendo"/"leido" + refresco de
// la lista) genera muchas peticiones legitimas que el limite general de
// 100/15min ahogaria. El stream SSE (/stream) se EXIME: es una conexion
// abierta de larga duracion, no un pico de peticiones.
export const limiterChat = rateLimit({
  windowMs: QUINCE_MIN,
  limit: 1000,
  keyGenerator: claveLimitador,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiada actividad de mensajeria. Espera unos segundos.' },
  handler: (req, res, next, options) => {
    console.warn(`[seguridad] rate-limit chat excedido: clave=${claveLimitador(req)} ruta=${req.method} ${req.originalUrl}`);
    res.status(options.statusCode).json(options.message);
  },
  skip: (req) => saltarEnTest() || req.path === '/stream'
});

// --- Validacion de entrada con zod ---
// Uso: r.post('/algo', validar(esquema), (req, res) => {...})
// fuente: 'body' (por defecto), 'query' o 'params'.
// En fallo: responde 400 con mensaje claro y loguea SOLO la ruta y los
// campos invalidos (nunca el valor recibido, que podria traer datos
// personales o contrasenas).
export function validar(schema, fuente = 'body') {
  return (req, res, next) => {
    const resultado = schema.safeParse(req[fuente]);
    if (!resultado.success) {
      const campos = [...new Set(resultado.error.issues.map(i => i.path.join('.') || '(raiz)'))];
      console.warn(`[seguridad] entrada rechazada: ${req.method} ${req.originalUrl} - campos invalidos: ${campos.join(', ') || '(desconocido)'}`);
      return res.status(400).json({ error: 'Datos invalidos: revisa ' + (campos.join(', ') || 'el formulario') });
    }
    req[fuente] = resultado.data;
    next();
  };
}

// ============================================================
//  URLs que llegan del cliente
//  Hay DOS clases de campo-URL en la app y NO se validan igual:
//
//   1) RUTA SUBIDA — el campo guarda un archivo subido a ESTA app por
//      /api/upload (adjunto_url del chat, comprobante_url de tesoreria,
//      foto_url del perfil, material de musica/ninos, recursos "archivo").
//      Antes se aceptaba cualquier host: bastaba un POST/PATCH a mano para
//      dejar el "comprobante" o la foto de perfil apuntando a un servidor
//      ajeno (que registra quien la abre, o sirve otra cosa distinta a la
//      que la iglesia cree tener guardada). Ahora solo se admite una ruta
//      interna /uploads/<archivo>.
//
//   2) ENLACE EXTERNO — el campo existe justo para apuntar fuera: los
//      recursos de grupo y de predica tipo 'link' (YouTube, Drive; funcion
//      documentada en ESTADO.md 4.7), la carpeta de Drive del grupo y el
//      enlace de una cancion. Exigirles /uploads/ romperia la funcion, asi
//      que lo que se exige es el ESQUEMA: solo http/https. Eso cierra
//      javascript:, data:, file: y vbscript:, que es por donde se cuela un
//      XSS al pinchar el enlace desde la lista de recursos.
// ============================================================

export const MSG_RUTA_SUBIDA = 'debe ser un archivo subido a la app (/uploads/...)';
export const MSG_ENLACE_EXTERNO = 'pega un enlace que empiece por http:// o https://';

const PREFIJO_SUBIDA = '/uploads/';
// Cualquier "algo:" al principio. Se usa para el unico campo de texto libre
// que ademas puede traer un enlace (la referencia de un recurso tipo 'libro').
const ESQUEMA_PELIGROSO = /^\s*(javascript|data|vbscript|file|blob)\s*:/i;

// ¿Es una ruta a un archivo subido a esta app?
// Se exige el prefijo /uploads/, que haya nombre de archivo, y que no haya
// forma de trepar fuera de la carpeta (ni con '..' literal ni percent-encoded,
// ni con la barra invertida de Windows).
export function esRutaSubida(v) {
  const s = String(v ?? '').trim();
  if (!s.startsWith(PREFIJO_SUBIDA)) return false;
  if (s.length === PREFIJO_SUBIDA.length) return false;   // '/uploads/' a secas no apunta a nada
  if (s.includes('\\')) return false;
  let decodificada = s;
  try { decodificada = decodeURIComponent(s); } catch { return false; }   // %ZZ y demas: fuera
  return !decodificada.includes('..') && !decodificada.includes('\\');
}

// ¿Es un enlace externo aceptable? Solo http/https, y con host de verdad.
export function esEnlaceExterno(v) {
  const s = String(v ?? '').trim();
  let u;
  try { u = new URL(s); } catch { return false; }
  return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
}

export function tieneEsquemaPeligroso(v) {
  return ESQUEMA_PELIGROSO.test(String(v ?? ''));
}

// --- Piezas zod reutilizables ---
// Ambas admiten '' porque los formularios del frontend mandan la cadena vacia
// cuando no se adjunto nada (ver web/app.js: comprobante_url, material_url…).

export const zRutaSubidaOpcional = (max = 1000) => z.string().trim().max(max)
  .refine(v => v === '' || esRutaSubida(v), MSG_RUTA_SUBIDA);

export const zEnlaceExternoOpcional = (max = 1000) => z.string().trim().max(max)
  .refine(v => v === '' || esEnlaceExterno(v), MSG_ENLACE_EXTERNO);

// Comprueba la url de un recurso mixto (grupo/predica), donde el campo `tipo`
// decide de que clase es. Devuelve el mensaje de error, o null si esta bien.
//  - 'archivo' -> salio de /api/upload: ruta interna obligatoria.
//  - 'libro'   -> es una REFERENCIA de texto libre ("Comentario de Juan"),
//                 no una URL: solo se le cierra el esquema peligroso.
//  - 'link'    -> enlace externo a proposito: http/https.
export function motivoUrlRecursoInvalida(tipo, url) {
  const s = String(url ?? '').trim();
  if (s === '') return null;                       // recurso sin enlace: lo permite el esquema
  if (tipo === 'archivo') return esRutaSubida(s) ? null : MSG_RUTA_SUBIDA;
  if (tipo === 'libro') return tieneEsquemaPeligroso(s) ? MSG_ENLACE_EXTERNO : null;
  return esEnlaceExterno(s) ? null : MSG_ENLACE_EXTERNO;
}
