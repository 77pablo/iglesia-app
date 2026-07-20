// ============================================================
//  Base de datos (SQLite) + esquema del nucleo  -  Fase 1A.2
//  Cada tabla del nucleo del plan, con su iglesia_id.
// ============================================================
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Ruta de la BD: configurable por env (DB_PATH) para disco persistente en producción.
const DB_FILE = process.env.DB_PATH || path.join(__dirname, '..', 'iglesia.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);

db.exec('PRAGMA foreign_keys = ON;');
// WAL: REQUERIDO para que Litestream pueda replicar la BD a R2 (Litestream
// monitorea el -wal). Ademas mejora la concurrencia lectura/escritura.
// busy_timeout evita "database is locked" bajo carga concurrente.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
-- IGLESIA: cada congregacion es un espacio aislado (multi-iglesia)
CREATE TABLE IF NOT EXISTS iglesia (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  codigo_unico  TEXT NOT NULL UNIQUE,
  creada_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- PERSONA: la cuenta de cada miembro
--  rol_global: NULL | 'super_admin' | 'obispo'  (jerarquia por encima del pastor)
--  es_pastor: 1 si es el pastor de su iglesia
CREATE TABLE IF NOT EXISTS persona (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id    INTEGER REFERENCES iglesia(id),
  usuario       TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  telefono      TEXT,
  email         TEXT,
  cumple        TEXT,
  rol_global    TEXT,
  es_pastor     INTEGER NOT NULL DEFAULT 0,
  activo        INTEGER NOT NULL DEFAULT 1,
  creada_en     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (iglesia_id, usuario)
);

-- GRUPO: cuerpo / ministerio (Jovenes, Musica, Dorcas...)
CREATE TABLE IF NOT EXISTS grupo (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  nombre      TEXT NOT NULL,
  tipo        TEXT,
  color       TEXT
);

-- PERTENENCIA: Persona + Grupo + Rol (la pieza clave de permisos)
--  rol: 'admin' | 'miembro' | 'musico' | 'lider_musica' | 'lider_ed' | 'tesorero'
CREATE TABLE IF NOT EXISTS pertenencia (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  grupo_id    INTEGER NOT NULL REFERENCES grupo(id),
  rol         TEXT NOT NULL DEFAULT 'miembro',
  UNIQUE (persona_id, grupo_id, rol)
);

-- EVENTO: algo con fecha y estado
--  estado: 'pendiente' | 'aprobado' | 'rechazado'
CREATE TABLE IF NOT EXISTS evento (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  grupo_id    INTEGER REFERENCES grupo(id),
  titulo      TEXT NOT NULL,
  fecha       TEXT NOT NULL,
  hora_inicio TEXT,
  hora_fin    TEXT,
  lugar       TEXT,
  descripcion TEXT,
  estado      TEXT NOT NULL DEFAULT 'pendiente',
  creado_por  INTEGER REFERENCES persona(id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ANUNCIO: informacion sin fecha
CREATE TABLE IF NOT EXISTS anuncio (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  titulo      TEXT NOT NULL,
  texto       TEXT,
  urgente     INTEGER NOT NULL DEFAULT 0,
  creado_por  INTEGER REFERENCES persona(id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ASIGNACION: quien hace un servicio en un evento
--  tipo: 'predicar' | 'ofrenda' | 'devocional' | 'aseo' | 'musica'
--  estado: 'pendiente' | 'aceptado' | 'rechazado' | 'cumplido'
CREATE TABLE IF NOT EXISTS asignacion (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id   INTEGER NOT NULL REFERENCES evento(id),
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  tipo        TEXT NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'pendiente',
  motivo      TEXT
);

-- ASISTENCIA: quien fue a un evento  (metodo: 'lista' | 'qr' | 'facial')
CREATE TABLE IF NOT EXISTS asistencia (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id   INTEGER NOT NULL REFERENCES evento(id),
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  metodo      TEXT NOT NULL DEFAULT 'lista',
  fecha       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (evento_id, persona_id)
);

-- FECHA NO DISPONIBLE: cuando una persona NO puede servir
CREATE TABLE IF NOT EXISTS fecha_no_disp (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  desde       TEXT NOT NULL,
  hasta       TEXT NOT NULL,
  motivo      TEXT,
  repetir     TEXT
);

-- RECURSO: espacio/equipo reservable (salon, canon...)
CREATE TABLE IF NOT EXISTS recurso (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  nombre      TEXT NOT NULL
);

-- DISPOSITIVO PUSH: token del telefono para notificaciones (legacy)
CREATE TABLE IF NOT EXISTS dispositivo_push (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  token       TEXT NOT NULL,
  plataforma  TEXT
);

-- SUSCRIPCION WEB PUSH (VAPID): el navegador del usuario para push real.
-- endpoint es unico (un mismo navegador = una suscripcion); si caduca, se borra.
CREATE TABLE IF NOT EXISTS push_sub (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- HISTORIAL de aprobaciones/rechazos de fechas por el pastor. Fase 5.2
CREATE TABLE IF NOT EXISTS aprobacion_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id    INTEGER NOT NULL REFERENCES iglesia(id),
  evento_titulo TEXT,
  fecha_evento  TEXT,
  grupo         TEXT,
  accion        TEXT NOT NULL,           -- 'aprobado' | 'rechazado'
  motivo        TEXT,
  actor_id      INTEGER REFERENCES persona(id),
  actor_nombre  TEXT,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CODIGO DE RECUPERACION de contrasena (6 digitos, expira). Fase 5.
CREATE TABLE IF NOT EXISTS reset_codigo (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  codigo      TEXT NOT NULL,
  expira      TEXT NOT NULL,
  usado       INTEGER NOT NULL DEFAULT 0,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- NOTIFICACION: un aviso a una persona
CREATE TABLE IF NOT EXISTS notificacion (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  tipo        TEXT,
  titulo      TEXT NOT NULL,
  texto       TEXT,
  leida       INTEGER NOT NULL DEFAULT 0,
  fecha       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AUDITORIA: quien cambio/accedio que (transparencia, incluido el obispo)
CREATE TABLE IF NOT EXISTS auditoria (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER,
  actor_id    INTEGER,
  accion      TEXT NOT NULL,
  modulo      TEXT,
  detalle     TEXT,
  fecha       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CANCIONERO (Fase 2: Musicos)
CREATE TABLE IF NOT EXISTS cancion (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id INTEGER NOT NULL REFERENCES iglesia(id),
  titulo     TEXT NOT NULL,
  autor      TEXT,
  tono       TEXT,
  letra      TEXT,
  enlace     TEXT
);

-- ORDEN DEL SERVICIO (setlist de un evento)
CREATE TABLE IF NOT EXISTS setlist_item (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id  INTEGER NOT NULL REFERENCES evento(id),
  cancion_id INTEGER NOT NULL REFERENCES cancion(id),
  orden      INTEGER,
  tono_dia   TEXT,
  nota       TEXT
);

-- CUIDADO PASTORAL (Fase 2.5) - solo el pastor
CREATE TABLE IF NOT EXISTS caso_cuidado (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id INTEGER NOT NULL REFERENCES iglesia(id),
  persona_id INTEGER NOT NULL REFERENCES persona(id),
  motivo     TEXT,
  estado     TEXT NOT NULL DEFAULT 'abierto',
  creado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS contacto_cuidado (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id INTEGER NOT NULL REFERENCES caso_cuidado(id),
  tipo    TEXT,
  nota    TEXT,
  fecha   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- TESORERIA (Fase 3) - contabilidad + transparencia
CREATE TABLE IF NOT EXISTS movimiento (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  tipo        TEXT NOT NULL,            -- ingreso | gasto
  categoria   TEXT,
  monto       REAL NOT NULL,
  descripcion TEXT,
  fecha       TEXT NOT NULL DEFAULT (date('now')),
  creado_por  INTEGER REFERENCES persona(id)
);
CREATE TABLE IF NOT EXISTS campania (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id INTEGER NOT NULL REFERENCES iglesia(id),
  nombre     TEXT NOT NULL,
  meta       REAL,
  recaudado  REAL NOT NULL DEFAULT 0
);

-- NIÑOS / ESCUELA DOMINICAL (Fase 3)
CREATE TABLE IF NOT EXISTS clase_ed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id INTEGER NOT NULL REFERENCES iglesia(id),
  nombre TEXT NOT NULL, edad TEXT
);
CREATE TABLE IF NOT EXISTS nino (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id INTEGER NOT NULL REFERENCES iglesia(id),
  clase_id INTEGER REFERENCES clase_ed(id),
  nombre TEXT NOT NULL, edad INTEGER, familia TEXT, alergias TEXT, autorizados TEXT
);
CREATE TABLE IF NOT EXISTS leccion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id INTEGER NOT NULL REFERENCES iglesia(id),
  clase_id INTEGER REFERENCES clase_ed(id),
  fecha TEXT, titulo TEXT NOT NULL, versiculo TEXT, material_url TEXT
);
CREATE TABLE IF NOT EXISTS asistencia_nino (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clase_id INTEGER REFERENCES clase_ed(id),
  nino_id INTEGER REFERENCES nino(id),
  fecha TEXT, retiro_por TEXT
);

-- BIOMETRIA FACIAL (Fase 3) - embedding L2 (512 floats) por persona
CREATE TABLE IF NOT EXISTS biometria_persona (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id INTEGER NOT NULL REFERENCES iglesia(id),
  persona_id INTEGER NOT NULL REFERENCES persona(id),
  embedding  TEXT NOT NULL,
  modelo     TEXT,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
--  FASE 4: Nuevas funcionalidades
-- ============================================================

-- SERMON (Fase 4.3): bosquejo del predicador, por iglesia.
--  Puede asociarse a un evento (opcional) o quedar solo con fecha.
--  puntos: JSON con un arreglo de strings (cada punto del bosquejo).
CREATE TABLE IF NOT EXISTS sermon (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  evento_id   INTEGER REFERENCES evento(id),
  titulo      TEXT NOT NULL,
  predicador  TEXT,
  fecha       TEXT,
  texto_base  TEXT,                 -- versiculo / pasaje base
  bosquejo    TEXT,                 -- cuerpo libre del bosquejo
  puntos      TEXT,                 -- JSON: ["Punto 1", "Punto 2", ...]
  creado_por  INTEGER REFERENCES persona(id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- NOTA PERSONAL (Fase 4.3): notas privadas de cada persona sobre un sermon.
--  origen: 'captura' (frase capturada del bosquejo) | 'propia' (escrita por la persona)
CREATE TABLE IF NOT EXISTS nota_personal (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  sermon_id   INTEGER REFERENCES sermon(id),
  texto       TEXT NOT NULL,
  comentario  TEXT,
  origen      TEXT NOT NULL DEFAULT 'propia',
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- DEVOCIONAL (Fase 4.2): contenido (devocional / texto biblico) para leer y
--  descargar offline. Por iglesia; el frontend lo guarda en IndexedDB.
CREATE TABLE IF NOT EXISTS devocional (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  titulo      TEXT NOT NULL,
  fecha       TEXT,
  texto_base  TEXT,                 -- versiculo de referencia
  contenido   TEXT,                 -- cuerpo del devocional
  creado_por  INTEGER REFERENCES persona(id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- RECORDATORIO ENVIADO (Fase 4.4): marca de control para NO duplicar
--  recordatorios automaticos. clave = identificador unico del recordatorio
--  (p.ej. "evento:12:persona:5:dia-1"). Se inserta al generar la notificacion.
CREATE TABLE IF NOT EXISTS recordatorio_enviado (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  clave       TEXT NOT NULL,
  fecha       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (clave, persona_id)
);

-- EQUIPO DE MUSICA (Fase 4.5): quien toca que en un evento.
--  El lider de musica arma el equipo; el pastor/otros solo observan.
CREATE TABLE IF NOT EXISTS equipo_musica (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  evento_id   INTEGER NOT NULL REFERENCES evento(id),
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  instrumento TEXT,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (evento_id, persona_id, instrumento)
);

-- ENSAYO (Fase 4.5): un ensayo por evento (fecha/hora/lugar).
CREATE TABLE IF NOT EXISTS ensayo (
  evento_id   INTEGER PRIMARY KEY REFERENCES evento(id),
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  fecha       TEXT,
  hora        TEXT,
  lugar       TEXT,
  nota        TEXT
);

-- ROL TEMPORAL (Fase 4.8): rol con vigencia (ej. 'predicador') que el pastor
--  asigna a una persona entre dos fechas.
CREATE TABLE IF NOT EXISTS rol_temporal (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  rol         TEXT NOT NULL,
  desde       TEXT NOT NULL,
  hasta       TEXT NOT NULL,
  creado_por  INTEGER REFERENCES persona(id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- PREDICA (Fase 4.8): historial de prédicas. Todos ven; pastor y predicador editan.
CREATE TABLE IF NOT EXISTS predica (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  titulo      TEXT NOT NULL,
  fecha       TEXT,
  predicador  TEXT,
  notas       TEXT,
  creado_por  INTEGER REFERENCES persona(id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);
-- RECURSO DE PREDICA: links, archivos o libros adjuntos a una prédica.
CREATE TABLE IF NOT EXISTS predica_recurso (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  predica_id  INTEGER NOT NULL REFERENCES predica(id),
  tipo        TEXT NOT NULL DEFAULT 'link',   -- link | archivo | libro
  titulo      TEXT NOT NULL,
  url         TEXT,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- RECURSO DE GRUPO (Fase 4.7): links/archivos que el lider comparte con su grupo.
--  tipo: 'link' | 'archivo'
CREATE TABLE IF NOT EXISTS recurso_grupo (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  grupo_id    INTEGER NOT NULL REFERENCES grupo(id),
  tipo        TEXT NOT NULL DEFAULT 'link',
  titulo      TEXT NOT NULL,
  url         TEXT NOT NULL,
  creado_por  INTEGER REFERENCES persona(id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AVISO DE GRUPO (Fase 4.7): avisos/recordatorios del lider para su grupo.
--  tipo: 'aviso' | 'recordatorio'
CREATE TABLE IF NOT EXISTS aviso_grupo (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  grupo_id    INTEGER NOT NULL REFERENCES grupo(id),
  tipo        TEXT NOT NULL DEFAULT 'aviso',
  titulo      TEXT NOT NULL,
  texto       TEXT,
  fecha       TEXT,
  creado_por  INTEGER REFERENCES persona(id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- TAREA DE GRUPO (Fase 4.8): tarea que el líder asigna a un miembro.
--  estado: 'pendiente' | 'hecho'
CREATE TABLE IF NOT EXISTS tarea_grupo (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  grupo_id    INTEGER NOT NULL REFERENCES grupo(id),
  persona_id  INTEGER NOT NULL REFERENCES persona(id),
  titulo      TEXT NOT NULL,
  detalle     TEXT,
  estado      TEXT NOT NULL DEFAULT 'pendiente',
  creado_por  INTEGER REFERENCES persona(id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- MATERIAL DE MUSICA (Fase 4.5): partituras/notas/acordes que el lider
--  comparte (PDF, Word, foto...). Visible para todo el ministerio de musica.
CREATE TABLE IF NOT EXISTS material_musica (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  titulo      TEXT NOT NULL,
  archivo_url TEXT NOT NULL,
  creado_por  INTEGER REFERENCES persona(id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- MENSAJERIA (Fase 6): chat 1:1 / por grupo / a medida
CREATE TABLE IF NOT EXISTS conversacion (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  tipo        TEXT NOT NULL,                 -- 'directo' | 'grupo' | 'custom'
  grupo_id    INTEGER REFERENCES grupo(id),  -- solo tipo 'grupo'
  titulo      TEXT,                          -- solo tipo 'custom'
  creado_por  INTEGER REFERENCES persona(id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS conversacion_miembro (
  conversacion_id         INTEGER NOT NULL REFERENCES conversacion(id) ON DELETE CASCADE,
  persona_id              INTEGER NOT NULL REFERENCES persona(id),
  rol                     TEXT NOT NULL DEFAULT 'miembro',  -- 'admin' | 'miembro'
  ultimo_leido_mensaje_id INTEGER,
  silenciado              INTEGER NOT NULL DEFAULT 0,
  UNIQUE(conversacion_id, persona_id)
);
CREATE TABLE IF NOT EXISTS mensaje (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversacion_id INTEGER NOT NULL REFERENCES conversacion(id) ON DELETE CASCADE,
  persona_id      INTEGER NOT NULL REFERENCES persona(id),
  texto           TEXT NOT NULL DEFAULT '',
  adjunto_url     TEXT,
  adjunto_tipo    TEXT,
  borrado         INTEGER NOT NULL DEFAULT 0,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- PORTAL PUBLICO (sin login): info editable por el pastor (horarios, direccion,
--  telefono, descripcion) mostrada en /publico.html?ig=CODIGO. Una fila por iglesia.
CREATE TABLE IF NOT EXISTS iglesia_info (
  iglesia_id  INTEGER NOT NULL UNIQUE REFERENCES iglesia(id),
  horarios    TEXT,
  direccion   TEXT,
  telefono    TEXT,
  descripcion TEXT
);

-- CONTACTO PUBLICO (Portal): mensajes de visitantes desde el formulario
--  "planifica tu visita", sin necesidad de cuenta. Genera notificacion al pastor.
CREATE TABLE IF NOT EXISTS contacto_publico (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id  INTEGER NOT NULL REFERENCES iglesia(id),
  nombre      TEXT NOT NULL,
  mensaje     TEXT,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// --- Migracion aditiva: columnas nuevas en tablas existentes ---
// SQLite no soporta "ADD COLUMN IF NOT EXISTS"; comprobamos primero.
function columnaExiste(tabla, col) {
  return db.prepare(`PRAGMA table_info(${tabla})`).all().some(c => c.name === col);
}
function agregarColumna(tabla, col, def) {
  if (!columnaExiste(tabla, col)) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${def};`);
}
// ANUNCIO: a que segmento se dirigio (para notificaciones segmentadas)
//  segmento: 'todos' | 'grupo' | 'rol'   ·  grupo_id / rol: detalle del segmento
agregarColumna('anuncio', 'segmento', 'TEXT');
agregarColumna('anuncio', 'grupo_id', 'INTEGER');
agregarColumna('anuncio', 'rol', 'TEXT');
// MOVIMIENTO: comprobante (voucher) en foto/archivo, para transparencia total
agregarColumna('movimiento', 'comprobante_url', 'TEXT');
// GRUPO: carpeta de Google Drive vinculada por el líder (compartir archivos/fotos)
agregarColumna('grupo', 'drive_url', 'TEXT');
// PERSONA: Directorio de miembros + cumpleaños — foto y toggles de privacidad
//  (default 0 = OCULTO: telefono/email solo se ven si la propia persona los activa).
agregarColumna('persona', 'foto_url', 'TEXT');
agregarColumna('persona', 'mostrar_telefono', 'INTEGER NOT NULL DEFAULT 0');
agregarColumna('persona', 'mostrar_email', 'INTEGER NOT NULL DEFAULT 0');
// PERSONA: obliga a cambiar la contrasena en el primer ingreso (cuentas creadas
// con contrasena temporal: por el super-admin al crear el pastor, o por el
// pastor al crear un usuario). Se limpia al cambiar la contrasena con exito.
agregarColumna('persona', 'debe_cambiar_pass', 'INTEGER NOT NULL DEFAULT 0');
// IGLESIA: desactivar/reactivar (reversible, NUNCA se borra). Si activa=0,
// nadie de esa iglesia puede iniciar sesion (ver auth.js login()).
agregarColumna('iglesia', 'activa', 'INTEGER NOT NULL DEFAULT 1');

// --- Índices: aceleran los filtros más usados (por iglesia, persona, evento, grupo) ---
// Sin esto, cada consulta hace un escaneo completo; se nota al crecer los datos.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_evento_iglesia       ON evento(iglesia_id);
  CREATE INDEX IF NOT EXISTS idx_evento_grupo         ON evento(grupo_id);
  CREATE INDEX IF NOT EXISTS idx_pertenencia_grupo    ON pertenencia(grupo_id);
  CREATE INDEX IF NOT EXISTS idx_pertenencia_persona  ON pertenencia(persona_id);
  CREATE INDEX IF NOT EXISTS idx_asignacion_evento    ON asignacion(evento_id);
  CREATE INDEX IF NOT EXISTS idx_asignacion_persona   ON asignacion(persona_id);
  CREATE INDEX IF NOT EXISTS idx_asistencia_evento    ON asistencia(evento_id);
  CREATE INDEX IF NOT EXISTS idx_asistencia_persona   ON asistencia(persona_id);
  CREATE INDEX IF NOT EXISTS idx_notificacion_persona ON notificacion(persona_id, leida);
  CREATE INDEX IF NOT EXISTS idx_setlist_evento       ON setlist_item(evento_id);
  CREATE INDEX IF NOT EXISTS idx_equipo_evento        ON equipo_musica(evento_id);
  CREATE INDEX IF NOT EXISTS idx_equipo_persona       ON equipo_musica(persona_id);
  CREATE INDEX IF NOT EXISTS idx_cancion_iglesia      ON cancion(iglesia_id);
  CREATE INDEX IF NOT EXISTS idx_material_iglesia     ON material_musica(iglesia_id);
  CREATE INDEX IF NOT EXISTS idx_movimiento_iglesia   ON movimiento(iglesia_id);
  CREATE INDEX IF NOT EXISTS idx_caso_iglesia         ON caso_cuidado(iglesia_id);
  CREATE INDEX IF NOT EXISTS idx_contacto_caso        ON contacto_cuidado(caso_id);
  CREATE INDEX IF NOT EXISTS idx_sermon_iglesia       ON sermon(iglesia_id);
  CREATE INDEX IF NOT EXISTS idx_predica_iglesia      ON predica(iglesia_id);
  CREATE INDEX IF NOT EXISTS idx_auditoria_iglesia    ON auditoria(iglesia_id);
  CREATE INDEX IF NOT EXISTS idx_avisogrupo_grupo     ON aviso_grupo(grupo_id);
  CREATE INDEX IF NOT EXISTS idx_recursogrupo_grupo   ON recurso_grupo(grupo_id);
  CREATE INDEX IF NOT EXISTS idx_tareagrupo_persona   ON tarea_grupo(persona_id);
  CREATE INDEX IF NOT EXISTS idx_pushsub_persona      ON push_sub(persona_id);
  CREATE INDEX IF NOT EXISTS idx_conv_iglesia       ON conversacion(iglesia_id);
  CREATE INDEX IF NOT EXISTS idx_convmiembro_persona ON conversacion_miembro(persona_id);
  CREATE INDEX IF NOT EXISTS idx_mensaje_conv        ON mensaje(conversacion_id, id);
  -- persona(iglesia_id): la tabla mas consultada por iglesia sin filtro por id
  -- (login, listas de miembros en admin/obispo/panel/mensajes/notificaciones,
  -- /api/personas). Antes escaneaba TODA la tabla persona en cada llamada.
  CREATE INDEX IF NOT EXISTS idx_persona_iglesia     ON persona(iglesia_id);
  -- grupo(iglesia_id): se filtra por iglesia en casi cada pantalla que arma
  -- un selector de grupos (panel, admin, eventos, notificaciones, obispo).
  CREATE INDEX IF NOT EXISTS idx_grupo_iglesia       ON grupo(iglesia_id);
  -- anuncio(iglesia_id): listado principal de anuncios, ordenado y filtrado
  -- por iglesia en cada carga de la pantalla de Anuncios.
  CREATE INDEX IF NOT EXISTS idx_anuncio_iglesia     ON anuncio(iglesia_id);
  -- devocional(iglesia_id): listado de devocionales por iglesia (pantalla
  -- de lectura/descarga offline).
  CREATE INDEX IF NOT EXISTS idx_devocional_iglesia  ON devocional(iglesia_id);
  -- recordatorio_enviado: NO necesita indice nuevo -- su UNIQUE(clave,
  -- persona_id) ya crea un indice implicito que cubre el unico acceso
  -- (INSERT OR IGNORE de dedupe en recordatorios.js); no se hacen SELECT
  -- adicionales por iglesia_id o persona_id solos.
  -- contacto_publico(iglesia_id): el pastor revisa los mensajes de su iglesia.
  CREATE INDEX IF NOT EXISTS idx_contactopublico_iglesia ON contacto_publico(iglesia_id);
`);

// --- Auto-reparación: el himnario (material permanente) SIEMPRE disponible ---
// Si en alguna iglesia falta el registro del himnario, se reinserta al arrancar.
// Así nunca se "pierde" aunque se borre por accidente o tras un reseed.
try {
  const iglesias = db.prepare('SELECT id FROM iglesia').all();
  const existe = db.prepare("SELECT 1 FROM material_musica WHERE iglesia_id = ? AND archivo_url = '/assets/himnario-nuevo.pdf'");
  const ins = db.prepare("INSERT INTO material_musica (iglesia_id, titulo, archivo_url, creado_por) VALUES (?, 'Himnario Nuevo (respaldo)', '/assets/himnario-nuevo.pdf', NULL)");
  let reparados = 0;
  for (const ig of iglesias) if (!existe.get(ig.id)) { ins.run(ig.id); reparados++; }
  if (reparados) console.log(`[db] Himnario re-asegurado en ${reparados} iglesia(s)`);
} catch (e) { /* tabla aún no disponible en BD muy antigua: se ignora */ }

console.log('[db] Esquema listo (SQLite: iglesia.db)');

export default db;
