# 📌 ESTADO DEL PROYECTO — App de Iglesia
*Última actualización: 26 de junio de 2026*

Documento para **retomar el desarrollo más tarde**. Resume qué está hecho, cómo arrancar todo y qué quedó pendiente.

---

## 🆕 FASE 4 (26 jun 2026): 4 funcionalidades nuevas — IMPLEMENTADAS Y PROBADAS

Todo respeta el aislamiento multi-iglesia (`iglesia_id`) y los permisos por grupo.
**Nota:** la BD usa `node:sqlite` (`DatabaseSync`), no `better-sqlite3`. Las tablas nuevas se crean con `CREATE TABLE IF NOT EXISTS` y las columnas añadidas a `anuncio` con un `ALTER TABLE` guardado (idempotente) en `db.js`.

### 1) 🔔 Notificaciones segmentadas (`notificaciones.js`, `anuncios.js`)
Un aviso/anuncio puede dirigirse a un **segmento**: `{tipo:'todos'}` | `{tipo:'grupo', grupo_id}` | `{tipo:'rol', rol}`. El backend expande el segmento a las personas correctas vía `pertenencia` e inserta una notificación a cada una.
- Helpers exportados en `notificaciones.js`: `personasDeSegmento()`, `notificarSegmento()`, `etiquetaSegmento()`.
- `anuncios.js`: `POST /api/anuncios` ahora acepta `segmento` (retrocompatible: sin `segmento` = toda la iglesia). Se guarda el segmento usado en las columnas nuevas `anuncio.segmento/grupo_id/rol`. `notificarIglesia()` sigue existiendo (usa internamente el segmento "todos").
- Endpoints nuevos: `GET /api/notificaciones/segmentos` (grupos + roles para los selectores) y `POST /api/notificaciones/segmentada` (enviar aviso sin crear anuncio; solo líder/pastor).
- Frontend: selector "Dirigir a (segmento)" en el formulario de Anuncios (`web/app.js`).
- **PROBADO:** anuncio a grupo Jóvenes → 3 avisados (miembros del grupo); raquel (no es de Jóvenes) NO lo recibe. Aviso por rol `tesorero` → solo raquel. Feligrés sin permiso → 403.

### 2) 📖 Modo offline (PWA) + Biblia/Devocional (`devocional.js`, `web/sw.js`, `web/manifest.json`)
- PWA básica: `web/manifest.json` + `web/icon.svg` + `web/sw.js` (cachea el *shell*: index/app.js/styles.css/manifest/icon; navegaciones network-first con fallback al shell; **no** cachea `/api` ni `/uploads`). Registrado en `index.html`.
- Módulo "Biblia / Devocional" en el NAV (visible para todos). Permite **leer** y **descargar** un devocional para leerlo **offline** (se guarda en `localStorage`, clave `devo_offline`).
- **Versión de caché AUTOMÁTICA (26 jun):** `/sw.js` se sirve dinámicamente desde `server.js` y su `CACHE` se calcula con la fecha de modificación más reciente del shell (`app.js`/`styles.css`/`index.html`…), con `Cache-Control: no-cache`. ⚠️ **Ya NO hay que subir la versión a mano** al cambiar el frontend; cambia sola.
- Backend `devocional.js`: CRUD por iglesia. `GET/POST/PATCH/DELETE /api/devocional`. Crear/editar/borrar solo líder/pastor (o autor).
- **PROBADO:** CRUD de devocional OK; feligrés no puede crear (403); archivos PWA servidos (manifest 200, sw.js 200, icon.svg 200).

### 3) 📝 Toma de notas inteligente (`sermones.js`)
- Tablas `sermon` (bosquejo: título, predicador, fecha, texto_base, bosquejo, `puntos` en JSON, `evento_id` opcional) y `nota_personal` (privada por persona).
- Endpoints: `GET /api/sermones`, `GET /api/sermones/:id` (bosquejo + MIS notas), `POST/PATCH/DELETE /api/sermones/:id` (publicar/editar bosquejo: líder/pastor o autor), `POST /api/sermones/:id/notas` (capturar punto u escribir nota propia), `PATCH/DELETE /api/sermones/notas/:notaId`, y `GET /api/sermones/notas/mias` (todas mis notas para exportar).
- Frontend: vista "Notas del sermón" — ver bosquejo, botón **📌 Capturar** por cada punto, escribir nota/comentario propio, y **⬇️ Exportar mis notas** (descarga `.txt`).
- **PROBADO:** pastor crea bosquejo; feligrés no puede (403); maría captura un punto + escribe nota propia y ve SUS 2 notas; **abel NO ve las notas de maría** (aislamiento por persona ✅); export devuelve solo las del usuario.

### 4) ⏰ Recordatorios automáticos (`recordatorios.js`)
- Genera notificaciones de recordatorio para **asignaciones** ("tu servicio es mañana / en 3 días", ventanas = 1 y 3 días) y **eventos** de tus grupos ("mañana tienes X", 1 día antes).
- **Sin duplicar:** tabla de control `recordatorio_enviado (clave, persona_id UNIQUE)`; se inserta con `INSERT OR IGNORE` antes de crear la notificación.
- Se dispara automáticamente al cargar `GET /api/me`, y manualmente con `POST /api/recordatorios/generar`. Aparecen en la campana existente (tipo `recordatorio`).
- **PROBADO:** con un evento de prueba para mañana + asignación → generó 4 recordatorios; segunda corrida = 0 (dedupe ✅); maría recibió su recordatorio de servicio y el del evento. (Evento de prueba y rastros eliminados tras la prueba.)

**Archivos tocados (Fase 4):** `backend/src/db.js`, `server.js`, `notificaciones.js`, `anuncios.js`, `seed.js` (nuevos: `sermones.js`, `devocional.js`, `recordatorios.js`); `web/app.js`, `web/index.html` (nuevos: `web/manifest.json`, `web/sw.js`, `web/icon.svg`).

### Pendiente / stretch de Fase 4
- **Push real (Web Push/VAPID/service worker push):** NO implementado. Se priorizó la segmentación (como pedía la tarea). El `sw.js` cachea el shell pero no escucha eventos `push`. Para hacerlo: generar llaves VAPID (`npx web-push generate-vapid-keys`), guardar la suscripción del navegador en `dispositivo_push`, y enviar con la librería `web-push` desde `notificarSegmento`.
- Offline bíblico: por ahora se guarda **devocional/notas** en `localStorage`; no hay una fuente bíblica integrada (no existe en el proyecto). La estructura (`devocional` + descarga local) ya queda lista para llenar.
- Editar nota en la UI: el backend soporta `PATCH` de nota, pero la vista solo permite crear/borrar (no editar inline).
- Cron real para recordatorios: hoy se disparan al consultar (`/me`) o con el endpoint; no hay un scheduler en segundo plano.

---

## 🆕 FASE 4.5 (26 jun 2026): Equipo/ensayo de música + material compartido — PROBADO

### 🎸 Equipo y ensayo por evento (`musica.js`, tablas `equipo_musica` y `ensayo`)
- El **líder de música** arma el equipo por evento (persona + instrumento), agenda el **ensayo** (fecha/hora/lugar) y puede **avisar al equipo**. El pastor/otros **solo observan** (`puedeEditar:false`).
- Endpoints: `GET /api/musica/plan/:eventoId` (equipo + ensayo + instrumentos sugeridos), `POST /api/musica/plan/:eventoId/equipo` (agrega + notifica a la persona), `DELETE /api/musica/plan/equipo/:id`, `POST /api/musica/plan/:eventoId/ensayo` (upsert), `POST /api/musica/plan/:eventoId/avisar` (notifica a todo el equipo con datos del ensayo).
- Al asignar a alguien se le crea una notificación "🎵 Te toca tocar"; "Avisar" manda un recordatorio con el ensayo.
- `eventos.js`: el borrado de evento ahora limpia `equipo_musica` y `ensayo` (FK ON).
- Frontend: en **Música**, bajo el Orden del servicio, tarjeta "🎸 Equipo y ensayo" ligada al evento seleccionado.
- **PROBADO:** Joaquín asigna Abel(Guitarra)+María(Voz), agenda ensayo, avisa (2 notificados con info del ensayo); pastor → 403 al editar, ve en solo lectura.

### 📎 Material / partituras compartidas (`musica.js`, tabla `material_musica`)
- **Cualquier integrante del ministerio de música (rol `musico` o `lider_musica`)** sube archivos (PDF, Word, foto…) reusando `/api/upload`; **todo el ministerio los ve/descarga**. Helper `esDelMinisterioMusica()` en `auth.js`.
- Endpoints: `GET /api/musica/material` (ver, toda la iglesia; devuelve `creado_por`), `POST /api/musica/material` (cualquier músico), `DELETE /api/musica/material/:id` (**su autor o el líder**).
- Frontend: tarjeta "📎 Material / Partituras" en Música, con botón "+ Material" (cualquier músico) y borrar visible para el autor o el líder.
- **Himnario siempre disponible:** `web/assets/himnario-nuevo.pdf` (empaquetado, servido estático) + registro en `material_musica` (también en `seed.js`, `creado_por=null`). El material en `/assets/` es **permanente: no se puede borrar** (DELETE → 403; en la UI sale con chip "📌 Fijo" y sin botón de borrar).
- **PROBADO:** músico (Lucas) sube OK, feligresa → 403, himnario servido (HTTP 200, application/pdf) y visible para todos.

### 📅 Estado de aprobación visible en el calendario (26 jun)
- El backend ya creaba los eventos de líder como `pendiente` (solo pastor → `aprobado`). Ahora el **calendario muestra el estado**: ⏳ *Pendiente de aprobación* / 🔴 *Rechazada* / ✅ *Aprobado*.
- Al crear, el aviso aclara: *"📨 Enviado · pendiente de aprobación del pastor"* (líder) o *"✅ Evento creado y aprobado"* (pastor).
- **PROBADO:** Joaquín (líder) → evento `pendiente`; pastor → `aprobado`.

---

## 🆕 FASE 4.6 (26 jun 2026): Calendario funcional + Himnario con transpositor

### 📅 Calendario en vista de mes (`web/app.js`, CSS en `styles.css`)
- Cuadrícula mensual (LUN→DOM) con eventos en su día (hora + título), **color por grupo** (`eventos.js` ahora envía `grupo_color`), leyenda de grupos, hoy resaltado.
- Navegación **‹ ›** entre meses + botón **Hoy**.
- **Toda la congregación ve el calendario**: el feligrés ahora ve TODOS los eventos aprobados de su iglesia (antes solo los de sus grupos).
- **Tocar un día** lo selecciona y muestra su detalle abajo. **Solo líderes/pastor** ven el botón **"📩 Pedir esta fecha"** (o "Crear evento" el pastor).
- **Pedir fecha**: abre el formulario (nombre, grupo, fecha como listas **día/mes/año**, hora inicio/fin, lugar) prellenado con el día tocado; al enviar, va al pastor como **pendiente** (nota "se enviará al pastor"). 

### 🎵 Himnario con buscador + transpositor (estilo cifraclub)
- Los 450 himnos del PDF se extrajeron a `web/assets/himnario.json` (bundled; precacheado por el SW → **online y offline**).
- En **Música → Material**, tocar **"Himnario Nuevo (respaldo)"** abre un **modal**: buscador de alabanzas + lista + visor con acordes resaltados y botones **− / + tono** (transposición en notación DO–SI e inglés) y "Original". El PDF sigue descargable.
- Transpositor client-side en `app.js` (detecta líneas de acordes; no toca la letra). El himnario es **material permanente** (no se puede borrar) y el servidor lo **auto-repara** en cada arranque (`db.js`).

### ✍️ Cancionero
- Buscador funcional + caché offline. `POST/PATCH /api/musica/canciones` aceptan `letra` (acordes) para futuras canciones propias.

---

## 🆕 FASE 4.7 (26 jun 2026): Módulo "Mi Grupo" (centro del líder de cuerpo)

Genérico para cualquier líder de cuerpo (rol `admin`); para **Abel** muestra **Jóvenes**. Backend `grupo.js` (`/api/grupo`), tablas `recurso_grupo` y `aviso_grupo`. Menú: **🧑‍🤝‍🧑 Mi Grupo** (visible para cualquiera que pertenezca a un grupo).
- **Recursos**: el líder sube **links** (YouTube, Drive…) y **archivos** (reusa `/api/upload`); todo el grupo los ve.
- **Avisos y recordatorios**: el líder publica en el board (tipo aviso/recordatorio, con fecha opcional) → **notifica a todos los miembros**.
- **Avisar directo**: a **un miembro** o **a todos** (mensaje rápido → notificación).
- **Miembros**: el líder **agrega** (de los que aún no están) y **quita** (solo quita el rol `miembro`, nunca a un líder); al agregar, avisa a la persona.
- **Permisos**: ver = miembros del grupo (y el pastor observa); editar/gestionar = **solo el líder** del grupo. Verificado: Abel gestiona; María (miembro) → 403; los 3 miembros reciben los avisos.

---

## 🆕 FASE 4.8 (26 jun 2026): Predica, calendario, Grupo de Alabanza, Mi Servicio

- **Calendario**: un evento **aprobado solo lo edita/elimina el pastor** (`eventos.js puedeGestionar`); pendiente/rechazado lo gestiona el encargado o el creador. Reflejado en la UI.
- **Música → "Grupo de Alabanza"**: renombrado el módulo en el menú.
- **Predica** (`predica.js`, tablas `predica`, `predica_recurso`, `rol_temporal`): fusión de Biblia/Devocional + Notas del sermón. **Todos ven** el historial de prédicas; **pastor y predicador editan**. Cada prédica tiene nombre, fecha, predicador, notas y **recursos (links, archivos, libros)**. Nuevo rol **Predicador** con **vigencia (desde–hasta)** que el **pastor asigna** a un feligrés (helper `esPredicador` = pastor o rol vigente hoy). Se quitaron Biblia/Devocional y Notas del sermón del menú.
- **Mi Servicio = bandeja unificada**: muestra **Servicios** (aceptar/no puedo), **Me toca tocar** (equipo de alabanza, `GET /api/musica/mis-asignaciones`, "Ver detalles" → Grupo de Alabanza) y **Tareas de grupo** (`tarea_grupo`; el líder asigna tareas a un miembro en "Mi Grupo", "Ver detalles" → Mi Grupo, botón "Hecho").
- **Probado**: pastor asigna predicador→ maria edita; feligrés→403; líder no edita evento aprobado (403) y el pastor sí; Mi Servicio de María agrega servicio + música + tarea. ✅

---

## 🆕 FASE 4.9 (26 jun 2026): Panel del Obispo (multi-iglesia)

- El **obispo / super-admin** ve **TODAS las iglesias** (excepción al aislamiento por iglesia). Backend `obispo.js` (`/api/obispo`), helper `esObispo` (rol_global obispo/super-admin).
- `GET /api/obispo/resumen`: tarjetas de cada iglesia (pastor, miembros, grupos, eventos, asistencia promedio, saldo). `GET /api/obispo/iglesia/:id`: detalle **solo lectura** (stats, grupos, líderes, eventos, tesorería).
- Frontend: menú **👑 Panel del Obispo** (visible solo para obispo/super-admin) → lista de iglesias → detalle.
- **Seed**: usuario **`obispo`** (en MONTESION, contraseña 1234) + 2ª iglesia **Getsemaní** (`GETSEMANI`) con pastor, líderes, evento, asistencia y tesorería de demo.
- **Probado**: el obispo ve las 2 iglesias y el detalle de cada una; un feligrés → 403.

---

## ▶️ Cómo arrancar todo (2 servicios)

**1. Backend Node (web + API):**
```
cd C:\Users\pdani\Documents\App-Iglesia\app\backend
node src/server.js
```
→ Abre la app en **http://localhost:3000**

**2. Servicio facial Python (solo para reconocimiento facial):**
```
& "C:\Users\pdani\AppData\Local\Programs\Python\Python312\python.exe" "C:\Users\pdani\Documents\App-Iglesia\app\facial\service.py"
```
→ Corre en el puerto 5001.

**Recargar datos de prueba** (si hace falta resetear): `node src/seed.js` (en la carpeta backend).

---

## 👤 Usuarios de prueba (iglesia: `MONTESION`, contraseña: `1234`)
- `pastor` — Pastor (ve TODO, pero solo observa lo de cada grupo)
- `abel` — Líder de Jóvenes
- `joaquin` — Líder de Música + miembro de Jóvenes
- `lucas` — Músico del ministerio de Música (puede compartir material/notas)
- `maria` — Feligresa
- `raquel` — Tesorera
- `marta` — Maestra de Escuela Dominical

---

## ✅ Lo que está CONSTRUIDO y funcionando

### Núcleo + módulos (todos con su backend + web)
- 🔐 Login en 3 pasos + multi-iglesia + roles/jerarquía
- 📅 Calendario + eventos (crear, **editar, eliminar**) + aprobación del pastor
- 📢 Anuncios (crear, **editar, eliminar**) + 🔔 notificaciones (con paginación)
- 🤝 Servicio / Mi Servicio (asignar, aceptar/no puedo con motivo)
- ✅ Asistencia: **dos listas (Asistieron / No asistieron)** + conteo + grupo de cada persona
- 📊 Panel del pastor (estadísticas, tendencia, ausentes)
- 🎵 Música (cancionero con **eliminar** + orden del servicio)
- ❤️ Cuidado pastoral (casos, historial)
- 💰 Tesorería (ingresos/gastos, campañas, transparencia)
- 👶 Niños / Escuela Dominical (clases, material con **subida de archivos**, niños, asistencia)
- 📷 **Reconocimiento facial** (Python InsightFace + Node + páginas `/inscribir.html` y `/kiosko.html`) — PROBADO: inscribir + reconocer con confianza 1.0

### Calidad
- Diseño profesional (sidebar, dashboard, toasts, modales, iconos SVG)
- 8 bugs del QA corregidos (validaciones, aislamiento entre iglesias, JWT, multer, rate-limit, CORS, manejo de errores global)

---

## ✅ VERIFICADO (26 jun 2026)

**Regla de permisos: "el pastor ve todo pero NO edita lo de cada grupo; solo el encargado (líder) edita".** — **PROBADO Y FUNCIONANDO.**

Cambios aplicados y verificados vía API:
- `auth.js`: helper `esEncargadoGrupo()` (líder del grupo, sin atajo de pastor).
- `asistencia.js`: la hoja devuelve `puedeEditar`; guardar asistencia solo lo permite el **encargado** del grupo.
- `eventos.js`: editar/eliminar evento solo por el **encargado** del grupo o quien lo creó (no el pastor).
- `web/app.js`: hoja de asistencia en **solo lectura** si no eres el encargado; botones editar/borrar de eventos solo para encargado/creador.

Resultado de la prueba (evento de Jóvenes):
1. Abel (líder Jóvenes): `puedeEditar:true`, guarda OK, edita evento OK. ✅
2. Pastor: `puedeEditar:false` (solo ve), guardar → 403, editar → 403. ✅
3. María (feligresa): `puedeEditar:false`, guardar → 403. ✅

### Coherencia total: "pastor solo observa" extendido a más módulos — **PROBADO (26 jun)**
- `auth.js`: helpers estrictos `esLiderMusicaEstricto`, `esLiderEdEstricto`, `esTesoreroEstricto` (sin atajo de pastor).
- `musica.js`: agregar/borrar canción y editar setlist → solo el **líder de música** (pastor 403).
- `ninos.js`: crear clases/niños/material y tomar asistencia → solo el **encargado de Escuela Dominical** (pastor ve, no edita).
- `tesoreria.js`: registrar movimientos/campañas → solo el **tesorero**; el pastor LEE resumen/transparencia.
- `cuidado.js`: se mantiene **solo-pastor** a propósito (es su dominio, no un grupo).
- `web/app.js`: botones de edición ocultos para el pastor en esos módulos + avisos "👁️ Solo lectura".
- Prueba: pastor → 403 en música/niños/tesorería; encargados → OK; pastor LEE resumen → OK. ✅

### Exportar asistencia (CSV) + filtrar por grupo — **PROBADO (26 jun)**
- `panel.js`: `GET /api/panel?grupo_id=` filtra miembros/reuniones/ausentes por grupo; `GET /api/panel/export.csv?grupo_id=` descarga CSV (con BOM para Excel: Fecha, Evento, Grupo, Persona, Asistió).
- `web/app.js` (panel): selector de grupo + botón "📥 Exportar CSV".
- Prueba: panel filtrado por Jóvenes (6→3 miembros, ausentes calculados); CSV con cabeceras y filas Sí/No correctas. ✅

---

## 🗂️ Estructura del código
```
app/
├── backend/        Node.js + Express + SQLite (API + sirve la web)
│   ├── src/        server.js, auth.js, db.js, seed.js, y un archivo por módulo
│   ├── uploads/    archivos subidos (material, etc.)
│   └── iglesia.db  base de datos SQLite
├── web/            frontend (index.html, app.js, styles.css) + inscribir/kiosko (facial)
└── facial/         service.py (servicio Python de reconocimiento facial)
```

## 📄 Documentos de diseño (en la carpeta padre `App-Iglesia/`)
- `Concepto-App-Iglesia.md` — especificación completa
- `Informe-Completo.md`, `Mapa-Construccion.md`, `Plan-Detallado-Fases.md`, `Guia-Construccion-Detallada.md`

---

## 💡 Ideas / mejoras pendientes (del backlog)
- ✅ ~~Extender "pastor solo observa" a más módulos (coherencia total)~~ — hecho (26 jun)
- ✅ ~~Exportar asistencia / reportes~~ — hecho como CSV (26 jun)
- ✅ ~~Filtrar asistencia por grupo~~ — hecho (26 jun)
- Subir comprobante en Tesorería (reusar subida de archivos)
- (En curso, otro agente) Notificaciones push segmentadas · Modo offline Biblia/Notas · Notas inteligentes del sermón · Recordatorios automáticos
