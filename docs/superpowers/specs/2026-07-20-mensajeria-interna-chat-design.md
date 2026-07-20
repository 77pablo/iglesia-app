# Diseño — Mensajería interna (chat)

*Fecha: 2026-07-20 · App de Iglesia*

Chat dentro de la app para coordinar entre pastor, líderes y miembros, en vez de solo
notificaciones de una vía. Reusa la infraestructura existente (SQLite `node:sqlite`,
`/api/upload`, Web Push, roles/permisos, PWA/service worker).

## 1. Alcance

**Incluye**
- Conversaciones **1:1 (directo)**.
- Canal **por grupo** (Jóvenes, Música, Escuela Dominical…), atado a un grupo existente.
- Grupo **a medida** (participantes elegidos a mano; ej. "Comisión de aniversario").
- **Adjuntos** (fotos/archivos), reusando `/api/upload`.
- **Confirmación de leído** + contador de **no leídos** por conversación.
- Indicador **"escribiendo…"**.
- **Moderación del pastor** en conversaciones de grupo/custom (no en 1:1).
- Entrega en **tiempo real por SSE** (Server-Sent Events) + **push** cuando el destinatario está offline.

**No incluye (YAGNI, se puede añadir después)**
- Editar mensaje enviado.
- Reacciones / emoji.
- Responder en hilo (replies anidadas).
- Notas de voz.
- Búsqueda dentro del chat.
- Reenviar mensajes.
- Silenciar conversación (la columna `silenciado` se crea reservada, pero la UI no la expone en esta fase).

## 2. Modelo de datos

SQLite con `node:sqlite` (`DatabaseSync`). Tablas nuevas creadas con `CREATE TABLE IF NOT EXISTS`
en `db.js` (mismo patrón que el resto). Toda consulta filtra por `iglesia_id` (aislamiento multi-iglesia).

### `conversacion`
| columna | tipo | notas |
|---|---|---|
| `id` | INTEGER PK | |
| `iglesia_id` | INTEGER | aislamiento |
| `tipo` | TEXT | `'directo'` \| `'grupo'` \| `'custom'` |
| `grupo_id` | INTEGER NULL | solo si `tipo='grupo'` |
| `titulo` | TEXT NULL | solo si `tipo='custom'` |
| `creado_por` | INTEGER | persona_id |
| `creado_en` | TEXT | ISO |

### `conversacion_miembro`
| columna | tipo | notas |
|---|---|---|
| `conversacion_id` | INTEGER | |
| `persona_id` | INTEGER | |
| `rol` | TEXT | `'admin'` \| `'miembro'` |
| `ultimo_leido_mensaje_id` | INTEGER NULL | base de leído/no-leídos |
| `silenciado` | INTEGER | 0/1, reservado (sin UI esta fase) |
- `UNIQUE(conversacion_id, persona_id)`

### `mensaje`
| columna | tipo | notas |
|---|---|---|
| `id` | INTEGER PK | |
| `conversacion_id` | INTEGER | |
| `persona_id` | INTEGER | autor |
| `texto` | TEXT | puede ir vacío si hay adjunto |
| `adjunto_url` | TEXT NULL | url devuelta por `/api/upload` |
| `adjunto_tipo` | TEXT NULL | mime o categoría (imagen/archivo) |
| `borrado` | INTEGER | 0/1 (soft delete de moderación) |
| `creado_en` | TEXT | ISO |

**Leído / no leídos:** se derivan de `conversacion_miembro.ultimo_leido_mensaje_id`
(un valor por miembro, no una fila por mensaje×persona).
- No leídos de una conversación = nº de mensajes con `id > ultimo_leido_mensaje_id` (de otros autores, no borrados).
- Doble-check en 1:1 = `ultimo_leido_mensaje_id` del **otro** miembro ≥ `id` del mensaje.

Borrado de grupo/evento no aplica cascada aquí salvo el canal de grupo: si un grupo se elimina,
su conversación `tipo='grupo'` queda huérfana pero inofensiva; se puede limpiar como mejora futura
(no bloquea esta fase). Los mensajes se borran en cascada de su conversación (FK ON).

## 3. Backend — módulo `mensajes.js` (`/api/mensajes`)

Montado en `server.js` junto al resto de routers. Todas las rutas requieren auth (JWT existente),
excepto que `GET /stream` valida el JWT por query param (ver §5).

| método | ruta | qué hace |
|---|---|---|
| GET | `/conversaciones` | Mis conversaciones: último mensaje (preview), nº no leídos, nombre/foto del otro (1:1) o título/grupo. **Auto-provisiona** el canal de cada grupo al que pertenezco y sincroniza sus miembros (lazy, sin migración). |
| GET | `/conversacion/:id?antes=<mensaje_id>&limite=30` | Mensajes paginados (más nuevos primero; `antes` carga anteriores al hacer scroll). Valida que soy miembro (o pastor moderando). |
| POST | `/directo` `{persona_id}` | Obtener-o-crear conversación 1:1 con esa persona. Valida `puedeIniciarChatCon`. Devuelve la conversación. |
| POST | `/custom` `{titulo, participantes:[persona_id]}` | Crea grupo a medida; creador = `rol='admin'`; agrega participantes válidos de la misma iglesia. |
| POST | `/conversacion/:id` `{texto, adjunto_url?, adjunto_tipo?}` | Enviar mensaje. Valida membresía + permiso de escritura. Inserta → emite SSE `mensaje` a miembros conectados → **push** a miembros offline. Rechaza mensaje sin texto **y** sin adjunto. |
| POST | `/conversacion/:id/escribiendo` | Reemite SSE `escribiendo` a los otros miembros. No toca BD. Throttle en cliente (~cada 3 s). |
| POST | `/conversacion/:id/leido` `{mensaje_id}` | Actualiza `ultimo_leido_mensaje_id` (solo hacia adelante) → emite SSE `leido`. |
| GET | `/contactos` | Personas con las que **puedo iniciar** chat (para el selector "nuevo chat"), según permisos. |
| DELETE | `/:mensajeId` | **Moderación**: pastor de la iglesia hace soft-delete (`borrado=1`, se muestra "mensaje eliminado") en `grupo`/`custom`. **403** en `directo`. |
| GET | `/stream?token=<jwt>` | Canal **SSE** (ver §4). |

### Permisos (helpers en `auth.js`)
- `puedeIniciarChatCon(actorId, destinoId)` → `true` si (firma sin `db`, usando el `db` de módulo,
  como el resto de helpers de `auth.js`):
  - actor es **pastor** o **líder** (`esPastor` o `esLiderOAdmin`, que cubre `admin`/`lider_musica`/`lider_ed`), **o**
  - destino es **líder/pastor de un grupo del actor** (el actor le puede escribir a su liderazgo), **o**
  - actor y destino **comparten al menos un grupo** (vía tabla `pertenencia`).
  - Siempre dentro de la **misma iglesia**.
  - Reutiliza los helpers existentes `esPastor`, `esLiderOAdmin` y consultas a `pertenencia`.
- Escritura en conversación: ser **miembro** de esa conversación.
- Moderación (DELETE): `esPastor(actor)` **y** `tipo ∈ {grupo, custom}`.
- Toda ruta valida `iglesia_id` del actor contra el de la conversación/persona.

### Notificaciones
- Los mensajes **no** crean notificación en la campana (evita ruido).
- Miembro **offline** (sin conexión SSE activa) → **push** vía `push.js` (`enviarPush`), con `url` que
  abre la conversación. Degrada con elegancia si no hay claves VAPID (igual queda el no leído).
- El menú **💬 Mensajes** muestra un **badge** con el total de no leídos.

## 4. Tiempo real — SSE

- `GET /api/mensajes/stream?token=<jwt>` responde `Content-Type: text/event-stream`, mantiene la
  conexión abierta y envía un **heartbeat** (comentario `:\n\n`) cada ~25 s para atravesar el proxy
  de Railway.
- **Hub en memoria** (`Map<persona_id, Set<res>>`) dentro de `mensajes.js`. Al conectar se registra;
  al cerrar (`req.on('close')`) se limpia. Si el hub crece, se extrae a un módulo `sse.js` (misma API).
- Al emitir un evento a una conversación, el hub busca los `persona_id` miembros conectados y les
  escribe el evento (`event:` + `data:` JSON).
- **Eventos** (server → cliente):
  - `mensaje` — `{conversacion_id, mensaje:{id, persona_id, nombre, texto, adjunto_url, adjunto_tipo, creado_en}}`
  - `escribiendo` — `{conversacion_id, persona_id, nombre}`
  - `leido` — `{conversacion_id, persona_id, ultimo_leido_mensaje_id}`
- Es **best-effort**: si un miembro no está conectado, no se guarda el evento SSE (el mensaje sí está
  en BD y se recupera al abrir la conversación / por push). No es un bus garantizado.

## 5. Autenticación del stream

`EventSource` (navegador) no permite headers personalizados, así que el JWT va como **query param**
`?token=`. El servidor lo valida con el mismo verificador del middleware de auth. Aceptable porque
Railway sirve por **HTTPS** (el token no viaja en claro) y en local es `localhost`. Riesgo asumido:
el token puede quedar en logs de acceso; se mitiga usando el mismo JWT de sesión (ya de vida acotada)
y no introduciendo un token nuevo de más privilegios.

## 6. Frontend (`web/app.js`, `web/index.html`, `web/styles.css`)

- Ítem de NAV **💬 Mensajes** (icono de línea, coherente con el rediseño), visible para todos, con
  **badge** de no leídos.
- Vista con **lista de conversaciones** → al abrir una, **hilo** con: burbujas por autor, input de
  texto, botón **adjuntar** (sube por `/api/upload` y manda `adjunto_url`), indicador **"escribiendo…"**,
  **doble-check** de leído. Marca **leído** al abrir y al llegar al final del hilo.
- **Nuevo chat**: selector poblado por `GET /contactos`; opción de crear **grupo a medida** (elegir
  varios). Los canales de grupo aparecen solos.
- Abre **un** `EventSource` a `/stream` mientras la app está activa; lo cierra al salir/inactividad.
  Enruta los eventos a la conversación abierta o actualiza badges/preview en la lista.
- Fechas y textos siguen las convenciones ya existentes (helpers de fecha, toasts, modales).

## 7. Manejo de errores

- **401** sin auth (incl. SSE con token inválido → cierra la conexión).
- **403** no eres miembro / no puedes iniciar ese chat / no puedes moderar / borrar 1:1.
- **404** conversación o mensaje inexistente (o de otra iglesia).
- **400** mensaje vacío sin adjunto / payload inválido / `participantes` vacío en custom.
- SSE: limpia el registro del hub al desconectar; heartbeat anti-timeout; **límite de largo** de
  mensaje (p. ej. 4000 chars) validado en `POST`.
- Adjuntos: limitados por la config de **multer** existente (tamaño/tipo).
- Todo se apoya en el **manejo de errores global** ya presente en `server.js`.

## 8. Pruebas (estilo "PROBADO vía API", como el resto del proyecto)

1. Feligrés escribe a **su líder** → OK; a un **feligrés de otro grupo** → **403**.
2. **Líder** escribe a cualquiera de su iglesia → OK.
3. Canal de **grupo** auto-creado y visible para sus miembros; alguien ajeno al grupo → 403 al abrirlo.
4. Enviar mensaje → aparece; `GET /conversaciones` muestra preview + no leídos correctos.
5. `POST /leido` actualiza el **doble-check** del otro.
6. `POST /escribiendo` se reemite por SSE a los otros miembros (no al emisor).
7. **Pastor** hace `DELETE` de un mensaje de **grupo** (soft, queda "mensaje eliminado") pero **403**
   en un mensaje **1:1**.
8. Mensaje con **adjunto** (subido por `/api/upload`) se guarda y se ve.
9. Un segundo usuario conectado por **SSE** recibe el `mensaje` enviado por el primero.
10. **Aislamiento:** usuario de iglesia B no ve ni abre conversaciones de iglesia A.
11. **Grupo a medida:** creador agrega 2 participantes; los 3 lo ven; el creador (admin) puede
    agregar/quitar; un participante no-admin no.

## 9. Organización del código

- **Nuevo:** `backend/src/mensajes.js` (rutas + hub SSE). Si el hub crece → extraer `backend/src/sse.js`.
- **Editar:** `backend/src/db.js` (tablas nuevas), `backend/src/server.js` (montar router),
  `backend/src/auth.js` (`puedeIniciarChatCon` y helpers de apoyo),
  `web/app.js` + `web/index.html` + `web/styles.css` (vista Mensajes),
  `web/sw.js` (que el `notificationclick` del push abra la conversación correcta),
  `backend/src/seed.js` (datos de demo: un par de conversaciones para probar la UI).
- Sin refactors ajenos al chat.

## 10. Decisiones abiertas (resueltas)

- El pastor **no** lee 1:1 privados (solo modera grupos/custom).
- **Silenciar** conversaciones: fuera de alcance esta fase (columna reservada).
- **Límite de adjunto:** el de multer ya configurado (no se cambia).
- Mensajes **no** llenan la campana; se avisan por **push** (offline) y **badge** (no leídos).
