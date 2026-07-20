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
import directorioRouter, { generarCumpleanosHoy } from './directorio.js';
import publicoRouter from './publico.js';
import registroRouter from './registro.js';
import superadminRouter from './superadmin.js';

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

// --- Rate limiting general para toda la API (100 req/IP cada 15 min) ---
// EXCEPCION: /api/mensajes queda fuera del limite general porque el chat
// tiene su propio limitador mas holgado (limiterChat); si no, el trafico
// legitimo del chat (SSE + envios + "escribiendo"/"leido") lo agotaria.
app.use('/api', (req, res, next) =>
  req.originalUrl.startsWith('/api/mensajes') ? next() : limiterGeneral(req, res, next));

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

// Solo se permiten tipos de archivo seguros (documentos / imagenes), nunca ejecutables.
const EXT_PERMITIDAS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.txt'];
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 },   // 10 MB maximo
  fileFilter: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    if (EXT_PERMITIDAS.includes(ext)) return cb(null, true);
    cb(new Error('Tipo de archivo no permitido'));
  }
});
// Sirve adjuntos forzando descarga (evita ejecutar/renderizar contenido en el navegador).
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => res.setHeader('Content-Disposition', 'attachment')
}));
// Endpoint sensible: 10 req/IP cada 15 min (subida de archivos).
app.post('/api/upload', authMiddleware, limiterSensible, (req, res) => {
  upload.single('archivo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'No se pudo subir el archivo' });
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
    const ext = (path.extname(req.file.originalname) || '').toLowerCase();
    const nuevo = req.file.filename + ext;
    fs.renameSync(req.file.path, path.join(uploadsDir, nuevo));
    res.json({ ok: true, url: '/uploads/' + nuevo, nombre: req.file.originalname });
  });
});

// --- Salud (1A.1: comprobar que el backend responde) ---
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mensaje: 'Backend de la iglesia funcionando', hora: new Date().toISOString() });
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
  try { generarCumpleanosHoy(persona.iglesia_id); } catch (e) { console.error('[cumple]', e.message); }
  const iglesia = db.prepare('SELECT nombre, codigo_unico FROM iglesia WHERE id = ?').get(persona.iglesia_id);
  res.json({
    persona: perfilPublico(persona),
    iglesia,
    roles: getRoles(persona.id),
    modulos: modulosVisibles(persona.id)   // lo que la app le muestra
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
      const ig = db.prepare('SELECT id FROM iglesia ORDER BY id LIMIT 1').get();
      if (ig) {
        const yaUsuario = db.prepare("SELECT id FROM persona WHERE iglesia_id = ? AND usuario = 'superadmin'").get(ig.id);
        if (yaUsuario) {
          db.prepare("UPDATE persona SET rol_global = 'super_admin', activo = 1, password_hash = ? WHERE id = ?").run(hashPassword(envPass), yaUsuario.id);
        } else {
          db.prepare("INSERT INTO persona (iglesia_id, usuario, nombre, password_hash, rol_global, es_pastor, activo) VALUES (?, 'superadmin', 'Super Admin', ?, 'super_admin', 0, 1)")
            .run(ig.id, hashPassword(envPass));
        }
        console.log('[startup] super_admin asegurado (usuario: superadmin) con SUPERADMIN_PASSWORD.');
      } else {
        console.warn('[startup] No hay ninguna iglesia todavía: no se pudo crear el super_admin. Se creará cuando exista al menos una iglesia.');
      }
    } else {
      console.warn('[startup] No se creó super_admin: define SUPERADMIN_PASSWORD (contraseña secreta del dueño) para habilitarlo.');
    }
  }
} catch (e) { console.error('[startup] no se pudo asegurar super_admin:', e.message); }

const PORT = process.env.PORT || 3000;
const ejecutadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ejecutadoDirecto) {
  app.listen(PORT, () => console.log(`[server] API escuchando en el puerto ${PORT}`));
}

export { app };
