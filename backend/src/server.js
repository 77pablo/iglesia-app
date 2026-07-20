// ============================================================
//  Servidor (API REST)  -  Fase 1A
//  Endpoints base: salud, login en 3 pasos, perfil + modulos.
// ============================================================
import './env.js';   // carga backend/.env antes que nada (db, push leen process.env)
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { fileURLToPath, pathToFileURL } from 'node:url';
import db from './db.js';
import { login, authMiddleware, getRoles, modulosVisibles, perfilPublico, auditar } from './auth.js';
import eventosRouter from './eventos.js';
import anunciosRouter from './anuncios.js';
import notificacionesRouter from './notificaciones.js';
import asignacionesRouter from './asignaciones.js';
import asistenciaRouter from './asistencia.js';
import panelRouter from './panel.js';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// CORS: en produccion limitar a los origenes permitidos via CORS_ORIGIN
// (lista separada por comas). Si no se define, se permite cualquier origen (dev).
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : true;
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '12mb' }));   // imagenes faciales en base64 pueden ser grandes

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
app.post('/api/upload', authMiddleware, (req, res) => {
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

// --- Rate limiting simple en memoria para /api/login (anti fuerza bruta) ---
const LOGIN_VENTANA_MS = 15 * 60 * 1000;   // 15 minutos
const LOGIN_MAX_INTENTOS = 10;             // intentos por IP en la ventana
const intentosLogin = new Map();           // ip -> { count, reset }
function limitarLogin(ip) {
  const ahora = Date.now();
  const reg = intentosLogin.get(ip);
  if (!reg || ahora > reg.reset) {
    intentosLogin.set(ip, { count: 1, reset: ahora + LOGIN_VENTANA_MS });
    return true;
  }
  reg.count += 1;
  return reg.count <= LOGIN_MAX_INTENTOS;
}

// --- LOGIN EN 3 PASOS (1A.3) ---
// body: { iglesia, usuario, password }
app.post('/api/login', (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'desconocida';
  if (!limitarLogin(ip))
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' });
  const { iglesia, usuario, password } = req.body || {};
  if (!iglesia || !usuario || !password)
    return res.status(400).json({ error: 'Faltan datos: iglesia, usuario y password' });
  try {
    const r = login(iglesia, usuario, password);
    auditar(r.persona.iglesia_id, r.persona.id, 'login', 'acceso');
    res.json(r);
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

// --- PERFIL + ROLES + MODULOS VISIBLES (1A.4) ---
app.get('/api/me', authMiddleware, (req, res) => {
  const persona = db.prepare('SELECT * FROM persona WHERE id = ?').get(req.user.persona_id);
  if (!persona) return res.status(404).json({ error: 'Persona no encontrada' });
  // Genera recordatorios pendientes de la iglesia al iniciar sesion (no duplica).
  try { generarRecordatoriosThrottled(persona.iglesia_id); } catch (e) { console.error('[recordatorios]', e.message); }
  const iglesia = db.prepare('SELECT nombre, codigo_unico FROM iglesia WHERE id = ?').get(persona.iglesia_id);
  res.json({
    persona: perfilPublico(persona),
    iglesia,
    roles: getRoles(persona.id),
    modulos: modulosVisibles(persona.id)   // lo que la app le muestra
  });
});

// --- Registro de token push (1A.5) ---
app.post('/api/dispositivo', authMiddleware, (req, res) => {
  const { token, plataforma } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Falta el token push' });
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
// --- Fase 2.3: Musicos ---
app.use('/api/musica', musicaRouter);
// --- Fase 2.5: Cuidado Pastoral ---
app.use('/api/cuidado', cuidadoRouter);
// --- Fase 3: Tesoreria ---
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
app.use('/api/predica', predicaRouter);
app.use('/api/obispo', obispoRouter);
app.use('/api/push', pushRouter);
app.use('/api/cuenta', cuentaRouter);
app.use('/api/admin', adminRouter);
app.use('/api/mensajes', mensajesRouter);

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

const PORT = process.env.PORT || 3000;
const ejecutadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ejecutadoDirecto) {
  app.listen(PORT, () => console.log(`[server] API escuchando en el puerto ${PORT}`));
}

export { app };
