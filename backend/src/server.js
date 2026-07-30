// ============================================================
//  Servidor (API REST)  -  Fase 1A
//  Endpoints base: salud, login en 3 pasos, perfil + modulos.
// ============================================================
import './env.js';   // carga backend/.env antes que nada (db, push leen process.env)
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { fileURLToPath, pathToFileURL } from 'node:url';
import db from './db.js';
import { fechaLocal } from './fechas.js';
import { login, authMiddleware, getRoles, modulosVisibles, perfilPublico, auditar, hashPassword } from './auth.js';
import { limiterGeneral, limiterLogin, limiterSensible, limiterChat, validar } from './seguridad.js';
import eventosRouter from './eventos.js';
import anunciosRouter from './anuncios.js';
import notificacionesRouter from './notificaciones.js';
import asignacionesRouter from './asignaciones.js';
import asistenciaRouter from './asistencia.js';
import panelRouter from './panel.js';
import reportesRouter from './reportes.js';
import musicaRouter from './musica.js';
import cuidadoRouter from './cuidado.js';
import tesoreriaRouter from './tesoreria.js';
import ninosRouter from './ninos.js';
import facialRouter from './facial.js';
import sermonesRouter from './sermones.js';
import devocionalRouter from './devocional.js';
import recordatoriosRouter, { generarRecordatoriosThrottled } from './recordatorios.js';
import grupoRouter from './grupo.js';
import predicaRouter from './predica.js';
import obispoRouter from './obispo.js';
import pushRouter from './push.js';
import cuentaRouter from './cuenta.js';
import adminRouter from './admin.js';
import mensajesRouter from './mensajes.js';
import directorioRouter, { generarCumpleanosHoyThrottled } from './directorio.js';
import { vigilarPersistenciaThrottled } from './persistencia.js';
import publicoRouter from './publico.js';
import registroRouter from './registro.js';
import superadminRouter from './superadmin.js';
import organizacionRouter from './organizacion.js';
import consentimientoRouter, { tieneConsentimientoVigente } from './consentimiento.js';

// --- Red de seguridad global: un rechazo/excepcion no atrapada NO debe tumbar
// el proceso (que serviria a TODAS las iglesias). Express 4 no captura los
// rechazos de promesas dentro de handlers async por si solo, asi que esto es
// la ultima linea de defensa si algun handler async se escapara sin try/catch.
process.on('unhandledRejection', (err) => { console.error('[unhandledRejection]', err); });
process.on('uncaughtException', (err) => { console.error('[uncaughtException]', err); });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Render (y la mayoría de PaaS) sirve la app detrás de un proxy inverso. Sin
// esto, req.ip sería la IP del proxy para TODOS los usuarios y el rate-limit se
// aplicaría de forma colectiva. Confiamos en 1 salto de proxy para leer la IP
// real del cliente desde X-Forwarded-For.
app.set('trust proxy', 1);
// CORS: en produccion limitar a los origenes permitidos via CORS_ORIGIN
// (lista separada por comas). Si no se define, se permite cualquier origen (dev).
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : true;
app.use(cors({ origin: corsOrigin }));

// --- Cabeceras de seguridad (helmet) ---
// El frontend es una SPA/PWA clasica: usa un <script> inline en index.html,
// atributos onclick/onkeydown inline (generados tambien desde app.js) y
// estilos style="" inline, ademas de Google Fonts por <link>. Una CSP por
// defecto (sin 'unsafe-inline') rompe el login y toda la interaccion, asi
// que se define una CSP explicita que permite justo eso, sin abrirla a
// terceros. connect-src 'self' cubre fetch()/EventSource hacia /api y
// /uploads (mismo origen); no se usan CDNs externos para JS.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  },
  // HSTS solo tiene efecto sobre HTTPS (el navegador lo ignora sobre HTTP en dev).
  strictTransportSecurity: { maxAge: 15552000, includeSubDomains: true }
}));

// --- Compresion gzip de las respuestas (JSON de la API + estaticos del SPA) ---
// Reduce el tamano transferido en conexiones moviles/lentas, sin cambiar el
// contenido devuelto (transparente para el cliente: fetch/XHR descomprimen
// solos). EXCEPCION: /api/mensajes queda fuera porque ahi se sirve el chat
// en tiempo real por SSE (text/event-stream, ver sse.js y mensajes.js); si
// se comprime, la respuesta se bufferea para armar el gzip y los eventos
// dejan de llegar al instante, rompiendo el tiempo real del chat.
app.use(compression({
  filter: (req, res) =>
    req.originalUrl.startsWith('/api/mensajes') ? false : compression.filter(req, res)
}));

app.use(express.json({ limit: '12mb' }));   // imagenes faciales en base64 pueden ser grandes

// --- Rate limiting general para toda la API (100 req/persona cada 15 min) ---
// EXCEPCIONES, las dos por la misma razon de fondo: hay trafico legitimo que
// supera ese tope, y limitarlo no protege de nada, solo rompe la aplicacion.
//
//  - /api/mensajes: el chat tiene su propio limitador mas holgado (limiterChat);
//    si no, su trafico normal (SSE + envios + "escribiendo"/"leido") lo agotaria.
//
//  - /api/health: es la ruta que Render consulta para decidir si el servicio
//    esta sano (healthCheckPath en render.yaml), y la pide cada pocos segundos.
//    Con el limitador encima, al pasar de 100 en la ventana empieza a responder
//    429, Render declara el servicio enfermo y lo REINICIA. Y el reinicio pone
//    el contador (que vive en memoria) a cero, asi que el ciclo se repite solo:
//    un bucle de reinicios que se alimenta a si mismo mientras la app contesta
//    200 a todo lo demas. En el plan free, donde /data es efimero, cada reinicio
//    ademas se lleva por delante lo que Litestream no haya replicado todavia.
//    Una ruta de salud no se limita nunca.
const SIN_LIMITE_GENERAL = ['/api/mensajes', '/api/health'];
app.use('/api', (req, res, next) =>
  SIN_LIMITE_GENERAL.some(p => req.originalUrl.startsWith(p))
    ? next()
    : limiterGeneral(req, res, next));

const webDir = path.join(__dirname, '..', '..', 'web');

// --- Service worker con versión de caché AUTOMÁTICA ---
// Servimos /sw.js dinámicamente: la versión del caché = fecha de modificación
// más reciente de los archivos del shell. Así, al cambiar app.js/styles.css/
// index.html, la versión cambia sola y el SW vuelve a cachear lo nuevo (sin
// tener que subir el número a mano). Debe ir ANTES del estático para ganar.
app.get('/sw.js', (req, res) => {
  const shell = ['sw.js', 'app.js', 'styles.css', 'index.html', 'manifest.json', 'icon.svg'];
  let ultima = 0;
  for (const f of shell) {
    try { const m = fs.statSync(path.join(webDir, f)).mtimeMs; if (m > ultima) ultima = m; } catch {}
  }
  const version = 'build-' + Math.floor(ultima);
  let sw = fs.readFileSync(path.join(webDir, 'sw.js'), 'utf8');
  sw = sw.replace(/const CACHE = '[^']*';/, `const CACHE = 'iglesia-shell-${version}';`);
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');  // el navegador siempre revalida el SW
  res.send(sw);
});

// Sirve la pagina web (frontend) desde la carpeta /web
app.use(express.static(webDir));

// --- Subida de archivos (material, comprobantes...) ---
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// Solo se permiten tipos de archivo seguros (documentos / imagenes), nunca
// ejecutables. La comprobacion es en TRES capas, porque la extension sola no
// prueba nada (renombrar un .exe a .png es trivial):
//   1) EXTENSION en lista blanca (el nombre que manda el cliente).
//   2) MIME declarado coherente con esa extension (tampoco es de fiar por si
//      solo — tambien lo elige el cliente — pero obliga a mentir dos veces).
//   3) MAGIC BYTES del archivo ya escrito en disco, para los formatos con
//      firma reconocible. Esta es la unica capa que mira el CONTENIDO real.
const EXT_PERMITIDAS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.txt'];

// Extension -> MIME(s) que un cliente puede declarar legitimamente.
const MIME_POR_EXT = {
  '.pdf':  ['application/pdf'],
  '.png':  ['image/png'],
  '.jpg':  ['image/jpeg', 'image/pjpeg'],
  '.jpeg': ['image/jpeg', 'image/pjpeg'],
  '.gif':  ['image/gif'],
  '.txt':  ['text/plain'],
  '.doc':  ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.ppt':  ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation']
};

// "No se lo que es". Este MIME no lo elige el navegador sino el SISTEMA de quien
// sube: en Windows sale del registro, en Android del proveedor de archivos. Si la
// extension no esta registrada ahi, llega esto — y rechazarlo dejaba sin subir su
// comprobante a gente con un archivo perfectamente valido, con un mensaje que no
// explica nada. Se admite para cualquier extension de la lista blanca porque no
// es lo que sostiene la seguridad: en los formatos con firma manda la firma, y en
// los demas el MIME lo controla el cliente igual que la extension, asi que
// exigirlo no detiene a nadie que mienta a proposito.
const MIME_DESCONOCIDO = 'application/octet-stream';

// Firmas (magic bytes) de los formatos que SI se pueden verificar de verdad.
// Lo que NO esta aqui (.txt, .doc, .docx, .ppt, .pptx) queda cubierto solo por
// extension + MIME, y es a proposito: .txt no tiene firma ninguna, y .doc/.ppt
// (OLE2) y .docx/.pptx (un ZIP) comparten su cabecera con muchisimos otros
// formatos, asi que comprobarla daria una sensacion de seguridad falsa sin
// distinguir un documento de Office de cualquier otro contenedor. No se
// inventan verificaciones que no prueban nada.
const FIRMAS = {
  '.pdf':  [[0x25, 0x50, 0x44, 0x46, 0x2d]],                          // '%PDF-'
  '.png':  [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  '.jpg':  [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.gif':  [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61],                     // 'GIF87a'
            [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]]                     // 'GIF89a'
};

// ¿El contenido real del archivo empieza por la firma de su extension?
// Si la extension no tiene firma conocida, no se puede afirmar nada: se acepta.
function contenidoCoincideConExtension(rutaArchivo, ext) {
  const firmas = FIRMAS[ext];
  if (!firmas) return true;
  const maxLargo = Math.max(...firmas.map(f => f.length));
  const buf = Buffer.alloc(maxLargo);
  let leidos = 0;
  const fd = fs.openSync(rutaArchivo, 'r');
  try { leidos = fs.readSync(fd, buf, 0, maxLargo, 0); } finally { fs.closeSync(fd); }
  return firmas.some(f => leidos >= f.length && f.every((b, i) => buf[i] === b));
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 },   // 10 MB maximo
  fileFilter: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    if (!EXT_PERMITIDAS.includes(ext)) return cb(new Error('Tipo de archivo no permitido'));
    // El MIME que declara el cliente tiene que cuadrar con la extension (o venir
    // como "no se lo que es", que es honesto y no debe costarle la subida).
    const mime = String(file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (mime !== MIME_DESCONOCIDO && !(MIME_POR_EXT[ext] || []).includes(mime))
      return cb(new Error('El tipo declarado del archivo no coincide con su extensión'));
    cb(null, true);
  }
});
// Sirve adjuntos forzando descarga (evita ejecutar/renderizar contenido en el navegador).
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => res.setHeader('Content-Disposition', 'attachment')
}));
// Endpoint sensible: 10 req/IP cada 15 min (subida de archivos).
app.post('/api/upload', authMiddleware, limiterSensible, (req, res) => {
  upload.single('archivo')(req, res, (err) => {
    if (err) {
      // Mensajes propios y de multer: ninguno incluye rutas del servidor.
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el máximo de 10 MB'
        : (err.message || 'No se pudo subir el archivo');
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
    const ext = (path.extname(req.file.originalname) || '').toLowerCase();

    // Tercera capa: los magic bytes del archivo YA ESCRITO. multer con `dest`
    // guarda primero y pregunta despues, asi que si el contenido no cuadra hay
    // que borrar el temporal a mano — si no, el ejecutable disfrazado se queda
    // en la carpeta de subidas aunque el cliente reciba un 400.
    let coincide;
    try {
      coincide = contenidoCoincideConExtension(req.file.path, ext);
    } catch (e) {
      console.error('[upload] no se pudo leer el archivo subido:', e.message);
      coincide = false;
    }
    if (!coincide) {
      try { fs.unlinkSync(req.file.path); } catch { /* si ya no esta, mejor */ }
      console.warn(`[seguridad] subida rechazada: el contenido no corresponde a ${ext} (persona=${req.user.persona_id})`);
      return res.status(400).json({ error: 'El contenido del archivo no corresponde a su extensión' });
    }

    const nuevo = req.file.filename + ext;
    fs.renameSync(req.file.path, path.join(uploadsDir, nuevo));
    res.json({ ok: true, url: '/uploads/' + nuevo, nombre: req.file.originalname });
  });
});

// --- Salud (1A.1: comprobar que el backend responde) ---
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mensaje: 'Backend de la iglesia funcionando', hora: new Date().toISOString() });
});

// --- Correo de contacto legal (derechos ARCO), configurable por env ---
app.get('/api/legal/contacto', (_req, res) => {
  res.json({ email: process.env.LEGAL_CONTACT_EMAIL || null });
});

// --- LOGIN EN 3 PASOS (1A.3) ---
// body: { iglesia, usuario, password }
// Rate limit: 5 intentos/IP cada 15 min (limiterLogin, express-rate-limit).
// Validacion: zod exige los 3 campos como texto no vacio.
const loginSchema = z.object({
  // Vacío = login de super-admin (en lanzamiento real puede no existir aún
  // ninguna iglesia). Los feligreses/pastores sí deben indicar su iglesia.
  iglesia: z.string().trim().optional().default(''),
  usuario: z.string().trim().min(1, 'falta el usuario'),
  password: z.string().min(1, 'falta la contraseña')
});
app.post('/api/login', limiterLogin, validar(loginSchema), (req, res) => {
  const { iglesia, usuario, password } = req.body;
  try {
    const r = login(iglesia, usuario, password);
    auditar(r.persona.iglesia_id, r.persona.id, 'login', 'acceso');
    res.json(r);
  } catch (e) {
    // No se loguea el password ni el intento completo: solo iglesia+usuario (identificadores, no secretos).
    console.warn(`[seguridad] login fallido: iglesia="${iglesia}" usuario="${usuario}" ip=${req.ip}`);
    res.status(401).json({ error: e.message });
  }
});

// --- REGISTRO PUBLICO DE FELIGRES (Onboarding) --- SIN authMiddleware: el
// codigo de la iglesia es el candado (ver registro.js para el detalle).
app.use('/api/registro', registroRouter);

// --- PERFIL + ROLES + MODULOS VISIBLES (1A.4) ---
app.get('/api/me', authMiddleware, (req, res) => {
  const persona = db.prepare('SELECT * FROM persona WHERE id = ?').get(req.user.persona_id);
  if (!persona) return res.status(404).json({ error: 'Persona no encontrada' });
  // Genera recordatorios pendientes de la iglesia al iniciar sesion (no duplica).
  try { generarRecordatoriosThrottled(persona.iglesia_id); } catch (e) { console.error('[recordatorios]', e.message); }
  try { generarCumpleanosHoyThrottled(persona.iglesia_id); } catch (e) { console.error('[cumple]', e.message); }
  // Comprueba el respaldo externo (cacheado): cualquier trafico en la app sirve
  // de disparo, porque en el plan free no hay cron y el super-admin puede pasar
  // semanas sin entrar -- que es justo cuando conviene enterarse.
  try { vigilarPersistenciaThrottled(); } catch (e) { console.error('[persistencia]', e.message); }
  const iglesia = db.prepare('SELECT nombre, codigo_unico FROM iglesia WHERE id = ?').get(persona.iglesia_id);
  res.json({
    persona: perfilPublico(persona),
    iglesia,
    roles: getRoles(persona.id),
    modulos: modulosVisibles(persona.id),   // lo que la app le muestra
    // El super-admin (dueño del sistema, iglesia_id=NULL) no es feligrés de
    // ninguna iglesia, así que NO pasa por el consentimiento general. Además,
    // la tabla consentimiento exige iglesia_id NOT NULL: registrar su
    // consentimiento fallaría y lo dejaría atascado en la puerta legal.
    consentimiento_pendiente: persona.rol_global === 'super_admin'
      ? false
      : !tieneConsentimientoVigente(persona.id)
  });
});

// --- Registro de token push (1A.5) ---
const dispositivoSchema = z.object({
  token: z.string().trim().min(1, 'falta el token push'),
  plataforma: z.string().trim().max(50).optional()
});
app.post('/api/dispositivo', authMiddleware, validar(dispositivoSchema), (req, res) => {
  const { token, plataforma } = req.body;
  db.prepare('INSERT INTO dispositivo_push (persona_id, token, plataforma) VALUES (?,?,?)')
    .run(req.user.persona_id, token, plataforma || 'desconocida');
  res.json({ ok: true });
});

// --- Modulo A: Calendario + Eventos ---
app.use('/api/eventos', eventosRouter);
// --- Organizacion de eventos: hoja de cosas a llevar + gastos (solo lideres) ---
app.use('/api/organizacion', organizacionRouter);
// --- Modulo B: Anuncios + Notificaciones ---
app.use('/api/anuncios', anunciosRouter);
app.use('/api/notificaciones', notificacionesRouter);
// --- Modulo C: Servicio + Mi Servicio ---
app.use('/api/asignaciones', asignacionesRouter);
// --- Modulo D: Asistencia simple ---
app.use('/api/asistencia', asistenciaRouter);
// --- Fase 2.2: Panel del pastor ---
app.use('/api/panel', panelRouter);
// --- Reportes y estadisticas del pastor (tendencias + export CSV) ---
app.use('/api/reportes', reportesRouter);
// --- Fase 2.3: Musicos ---
app.use('/api/musica', musicaRouter);
// --- Fase 2.5: Cuidado Pastoral ---
app.use('/api/cuidado', cuidadoRouter);
// --- Fase 3: Tesoreria ---
// NOTA (trade-off documentado en INFORME-SEGURIDAD.md): el limite sensible
// de 10 req/15min NO se aplica a todo el router porque la vista de
// Tesoreria dispara 4 GET en paralelo al abrirla (resumen, movimientos,
// campanias, transparencia) y agotaria la cuota con solo 2-3 visitas,
// rompiendo la app. Se aplica el limite sensible SOLO a las rutas que
// escriben dinero (POST/PATCH), dentro de tesoreria.js; las lecturas
// quedan cubiertas por el limitador general (100 req/15min).
app.use('/api/tesoreria', tesoreriaRouter);
// --- Fase 3: Ninos / Escuela Dominical ---
app.use('/api/ninos', ninosRouter);
// --- Fase 3: Reconocimiento Facial ---
app.use('/api/facial', facialRouter);
// --- Fase 4.3: Sermones + Notas inteligentes ---
app.use('/api/sermones', sermonesRouter);
// --- Fase 4.2: Biblia / Devocional (offline) ---
app.use('/api/devocional', devocionalRouter);
// --- Fase 4.4: Recordatorios automaticos ---
app.use('/api/recordatorios', recordatoriosRouter);
app.use('/api/grupo', grupoRouter);
// --- Directorio de miembros + cumpleaños ---
app.use('/api/directorio', directorioRouter);
app.use('/api/predica', predicaRouter);
app.use('/api/obispo', obispoRouter);
// Onboarding (Fase de acceso): el super-admin crea iglesias + pastores.
// Endpoint sensible: 10 req/IP cada 15 min (gate estricto rol_global='super_admin' dentro del router).
app.use('/api/superadmin', limiterSensible, superadminRouter);
app.use('/api/push', pushRouter);
app.use('/api/cuenta', cuentaRouter);
app.use('/api/consentimiento', consentimientoRouter);
// Endpoint sensible: 10 req/IP cada 15 min (crear/editar usuarios y roles).
app.use('/api/admin', limiterSensible, adminRouter);
// Chat: limitador propio holgado (limiterChat), fuera del limite general.
app.use('/api/mensajes', limiterChat, mensajesRouter);
// --- Portal publico (Fase 7): pagina SIN login por iglesia (/publico.html?ig=CODIGO).
// El router mezcla rutas publicas (sin authMiddleware) con /info (autenticado,
// solo pastor); ver backend/src/publico.js para el detalle de aislamiento.
app.use('/api/publico', publicoRouter);

// Lista de personas de la iglesia (para asignar servicios)
app.get('/api/personas', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT id, nombre FROM persona WHERE iglesia_id = ? AND activo = 1 ORDER BY nombre')
    .all(req.user.iglesia_id));
});

// --- 404 para rutas /api desconocidas ---
app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

// --- Manejador global de errores: nunca devolver stack traces HTML al cliente ---
// (captura cualquier excepcion no atrapada en los routers y responde JSON limpio)
app.use((err, req, res, next) => {
  console.error('[error]', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: 'Ocurrió un error en el servidor' });
});

// Auto-seed opcional (demo): si la BD está vacía y SEED_ON_EMPTY=1, carga datos de prueba.
if (process.env.SEED_ON_EMPTY === '1') {
  try {
    const vacia = db.prepare('SELECT COUNT(*) AS n FROM iglesia').get().n === 0;
    if (vacia) { console.log('[seed] BD vacía → sembrando datos de demo…'); await import('./seed.js'); }
  } catch (e) { console.error('[seed] no se pudo auto-sembrar:', e.message); }
}

// Asegurar el super-admin en CADA arranque (idempotente), SIN credenciales fijas.
// La contraseña se toma SIEMPRE de SUPERADMIN_PASSWORD (secreta, definida por el
// dueño en Render). Nunca se usa un valor hardcodeado como "1234".
//  - Si ya existe un super_admin y hay SUPERADMIN_PASSWORD: se ROTA su clave
//    (rota la antigua "1234" a la fuerte del dueño; idempotente).
//  - Si ya existe pero NO hay SUPERADMIN_PASSWORD: se deja como está (advierte).
//  - Si NO existe y hay SUPERADMIN_PASSWORD: se crea con esa clave.
//  - Si NO existe y NO hay SUPERADMIN_PASSWORD: NO se crea ninguna cuenta (advierte).
try {
  const envPass = process.env.SUPERADMIN_PASSWORD;
  const existente = db.prepare("SELECT id FROM persona WHERE rol_global = 'super_admin' AND activo = 1 ORDER BY id LIMIT 1").get();
  if (existente) {
    if (envPass) {
      db.prepare('UPDATE persona SET password_hash = ? WHERE id = ?').run(hashPassword(envPass), existente.id);
      console.log('[startup] super_admin: contraseña rotada desde SUPERADMIN_PASSWORD.');
    } else {
      console.warn('[startup] super_admin existe pero SUPERADMIN_PASSWORD no está definida: conserva su contraseña anterior. Define SUPERADMIN_PASSWORD para rotarla.');
    }
  } else {
    if (envPass) {
      // El super-admin es una cuenta de SISTEMA: no pertenece a ninguna iglesia
      // (iglesia_id = NULL). Por eso se puede crear aunque no exista todavía
      // ninguna iglesia — justo el escenario del lanzamiento real, donde el
      // super-admin entra (sin iglesia) para crear la primera. persona.iglesia_id
      // es nullable en el esquema (db.js) y el login por usuario no filtra por
      // iglesia, así que esto es seguro.
      const yaUsuario = db.prepare("SELECT id FROM persona WHERE iglesia_id IS NULL AND usuario = 'superadmin'").get();
      if (yaUsuario) {
        db.prepare("UPDATE persona SET rol_global = 'super_admin', activo = 1, password_hash = ? WHERE id = ?").run(hashPassword(envPass), yaUsuario.id);
      } else {
        db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, es_pastor, activo) VALUES (NULL, 'superadmin', 'Super Admin', ?, 'super_admin', 0, 1)")
          .run(hashPassword(envPass));
      }
      console.log('[startup] super_admin de sistema asegurado (usuario: superadmin) con SUPERADMIN_PASSWORD.');
    } else {
      console.warn('[startup] No se creó super_admin: define SUPERADMIN_PASSWORD (contraseña secreta del dueño) para habilitarlo.');
    }
  }
} catch (e) { console.error('[startup] no se pudo asegurar super_admin:', e.message); }

// Zona horaria: se anuncia al arrancar porque de ella depende TODA fecha del
// calendario de la gente (fechaLocal, los 'localtime' de SQL, diasHasta). Si el
// proceso corre en UTC, esas fechas se van un día durante las últimas 4 horas de
// cada día en Chile, y el fallo es invisible: la app responde 200 a todo y solo
// se nota en que el portal público esconde el culto de esta noche. Ese fue el
// estado real de producción hasta el 30 jul 2026. Se registra siempre, y se
// avisa fuerte solo en producción, que es donde el contenedor la trae en UTC.
const zonaHoraria = Intl.DateTimeFormat().resolvedOptions().timeZone || '(desconocida)';
console.log(`[startup] zona horaria: ${zonaHoraria} · hoy aquí es ${fechaLocal()}`);
if (process.env.NODE_ENV === 'production' && !process.env.TZ) {
  console.warn('[startup] TZ no está definida: el contenedor corre en UTC y las fechas del calendario se irán un día cada noche. Define TZ=America/Santiago.');
}

const PORT = process.env.PORT || 3000;
const ejecutadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ejecutadoDirecto) {
  app.listen(PORT, () => console.log(`[server] API escuchando en el puerto ${PORT}`));
}

export { app };
