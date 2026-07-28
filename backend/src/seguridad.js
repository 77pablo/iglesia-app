// ============================================================
//  Seguridad: rate limiting + validacion de entrada (Fase 6)
//  - Limitadores de peticiones por persona (o por IP si no hay sesion).
//  - Middleware reutilizable validar(schema) con zod: valida
//    req.body/query/params y responde 400 + loguea el rechazo.
//  Todo el logging usa el prefijo [seguridad] y NUNCA vuelca
//  contrasenas, tokens ni datos personales completos.
// ============================================================
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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
