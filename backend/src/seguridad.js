// ============================================================
//  Seguridad: rate limiting + validacion de entrada (Fase 6)
//  - Limitadores de peticiones por IP (express-rate-limit).
//  - Middleware reutilizable validar(schema) con zod: valida
//    req.body/query/params y responde 400 + loguea el rechazo.
//  Todo el logging usa el prefijo [seguridad] y NUNCA vuelca
//  contrasenas, tokens ni datos personales completos.
// ============================================================
import rateLimit from 'express-rate-limit';

const QUINCE_MIN = 15 * 60 * 1000;

// --- Limitador general: aplica a todo /api ---
export const limiterGeneral = rateLimit({
  windowMs: QUINCE_MIN,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones desde esta IP. Intenta de nuevo en unos minutos.' },
  handler: (req, res, next, options) => {
    console.warn(`[seguridad] rate-limit general excedido: ip=${req.ip} ruta=${req.method} ${req.originalUrl}`);
    res.status(options.statusCode).json(options.message);
  }
});

// --- Limitador de login: 5 intentos / 15 min (anti fuerza bruta) ---
export const limiterLogin = rateLimit({
  windowMs: QUINCE_MIN,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de acceso. Espera unos minutos e intentalo de nuevo.' },
  handler: (req, res, next, options) => {
    console.warn(`[seguridad] rate-limit login excedido: ip=${req.ip}`);
    res.status(options.statusCode).json(options.message);
  }
});

// --- Limitador de endpoints sensibles: admin, tesoreria, upload ---
export const limiterSensible = rateLimit({
  windowMs: QUINCE_MIN,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones a un recurso sensible. Intenta de nuevo en unos minutos.' },
  handler: (req, res, next, options) => {
    console.warn(`[seguridad] rate-limit sensible excedido: ip=${req.ip} ruta=${req.method} ${req.originalUrl}`);
    res.status(options.statusCode).json(options.message);
  }
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
