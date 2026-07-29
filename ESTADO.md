# 📌 ESTADO DEL PROYECTO — App de Iglesia
*Última actualización: 28 de julio de 2026, noche (indicador de persistencia — el respaldo ya no falla en silencio)*

Documento para **retomar el desarrollo más tarde**. Resume qué está hecho, cómo arrancar todo y qué quedó pendiente.

---

## 🔎 BLOQUEANTES DE LA AUDITORÍA DEL 20 DE JULIO — estado al 28 de julio

Aquella auditoría (4 agentes: seguridad, fiabilidad, funcional/UX, legal+interfaz) listó 5 bloqueantes. **Ya están desplegados los arreglos de código**; lo que queda depende de configuración o de terceros:

1. **`superadmin/1234` público** → ✅ CERRADO Y DESPLEGADO. `SEED_ON_EMPTY=0` en `render.yaml`, la clave del super-admin viene de `SUPERADMIN_PASSWORD`, y el super-admin es cuenta de sistema (`iglesia_id=NULL`).
2. **XSS almacenado** → ✅ CERRADO Y DESPLEGADO. `escHtml()`/`safeUrl()` en ~40 campos.
3. **Pérdida de datos en persistencia** → 🟡 **RESUELTO EN CÓDIGO, FALTA CONFIRMAR EN RENDER.** No hizo falta disco de pago: `docker-entrypoint.sh` restaura la BD desde **Cloudflare R2** al arrancar y la replica en continuo con **Litestream** (`litestream.yml`). Se activa solo si están definidas `R2_ENDPOINT`, `R2_BUCKET`, `LITESTREAM_ACCESS_KEY_ID` y `LITESTREAM_SECRET_ACCESS_KEY`; si faltan, el arranque avisa por log y los datos vuelven a ser efímeros. **Acción del dueño:** confirmar que esas 4 variables están puestas en Render.
4. **Recuperación de contraseña muerta** (SMTP sin configurar) → ❌ **SIGUE PENDIENTE.** El código de recuperación existe (`cuenta.js`, maneja correctamente el caso de dos personas con el mismo correo), pero sin `SMTP_USER`/`SMTP_PASS` no sale ningún correo.
5. **Legal** → 🟡 **PARCIALMENTE CERRADO Y DESPLEGADO.** El consentimiento general y el ejercicio ARCO autoservicio funcionan en producción. Falta que un abogado limpie los placeholders `[…]` de `web/legal/*.html` y que el dueño defina `LEGAL_CONTACT_EMAIL` — en ese orden (ver detalle abajo).

Los hallazgos **B1–B7** de aquella auditoría (obispo con permisos de admin, fugas entre iglesias, `PATCH` destructivos, borrado cruzado de notificaciones, validación de `presentes`) están **todos cerrados**: verificados uno por uno contra el código el 27 de julio.

### 👉 ACCIONES DEL DUEÑO EN RENDER (las que siguen abiertas)
- **`SUPERADMIN_PASSWORD`** — si no está definida, la clave vieja del super-admin sigue vigente.
- **`R2_*` y `LITESTREAM_*`** (4 variables) — sin ellas **no hay persistencia**: la BD se pierde en cada reinicio.
- **`SMTP_USER` / `SMTP_PASS`** — sin ellas nadie puede recuperar su contraseña por correo.
- **`LEGAL_CONTACT_EMAIL`** — solo *después* de que el abogado limpie los placeholders del texto legal.
- **`VAPID_*`** (3 variables) — sin ellas el push queda desactivado (las notificaciones siguen en la campana).

### 🟡 Bloqueante legal #5 — parcialmente cerrado (✅ desplegado; falta el trabajo del abogado)
- ✅ **IMPLEMENTADO:** consentimiento general (checkbox al registrarse + puerta para cuentas existentes vía `/me`) y ejercicio de derechos **ARCO autoservicio** (ver/editar/eliminar mis datos desde la cuenta).
- ✅ **IMPLEMENTADO:** correo de contacto legal (ARCO) configurable por variable de entorno `LEGAL_CONTACT_EMAIL` — endpoint público `GET /api/legal/contacto`, inyectado en las 5 páginas de `web/legal/` (se muestra solo si la variable está definida).
- ❌ **PENDIENTE del dueño:**
  1. Completar con un **abogado** todos los placeholders `[…]` restantes de `web/legal/*.html` (razón social, RUT, domicilio, ciudad, fecha, y el `[CORREO DE CONTACTO — PENDIENTE]` del texto estático) antes de considerar esos documentos vigentes/vinculantes.
  2. **Recién DESPUÉS** de limpiar esos placeholders, definir `LEGAL_CONTACT_EMAIL` en Render (y en `backend/.env` local) con el correo real de contacto ARCO. ⚠️ **Orden importante:** si defines `LEGAL_CONTACT_EMAIL` con el texto legal aún sin limpiar, la misma sección mostrará a la vez el placeholder `[CORREO…]` y el correo real inyectado — queda contradictorio de cara al usuario. Mientras el correo no esté definido, la línea dinámica simplemente no aparece (no rompe nada).

### 👉 ACCIÓN DEL DUEÑO EN RENDER (imprescindible tras desplegar)
- Definir **`SUPERADMIN_PASSWORD`** (contraseña fuerte) en Render → Environment. Al primer arranque, rota automáticamente la vieja `1234` del super-admin de producción. Sin esta variable, la `1234` actual sigue vigente.

---

## 🚀 EN PRODUCCIÓN (verificado el 28 jul 2026)
- **URL pública:** https://iglesia-app-r9ay.onrender.com
- **Deploy vivo:** commit `a15c397`. Verificado el 28 jul desde fuera: `/api/health` → 200; `/api/organizacion` → 401 (el router existe y exige sesión); el `styles.css` servido trae `--primary-tx` y `.cal-puntos`; el `app.js` servido trae `toLocaleString('es-CL')`.
- **Repositorio GitHub:** https://github.com/77pablo/iglesia-app  (rama `main`; se sube con **GitHub Desktop**)
- **Host:** **Render** (Docker, **Blueprint** desde `render.yaml`, plan **Free**), servicio `iglesia-app` (ID `srv-d9f23vrbc2fs738v1hu0`). Cada `push` a `main` en GitHub → **redeploy automático**.
- **Variables en `render.yaml`:** `NODE_ENV=production`, `JWT_SECRET` (autogenerado), **`SEED_ON_EMPTY=0`** (nunca sembrar demo en producción), `DB_PATH=/data/iglesia.db`, `UPLOADS_DIR=/data/uploads`, más los huecos de `SUPERADMIN_PASSWORD`, `R2_*`/`LITESTREAM_*` y `VAPID_*` que el dueño define en el panel.
- ⚠️ **Persistencia:** `/data` es efímero en el plan free. La BD sobrevive **solo si Litestream está configurado** (ver bloqueante #3 arriba). El servicio se **duerme** tras ~15 min de inactividad (primera visita ~30-50 s).
- Archivos de deploy en `app/`: `Dockerfile`, `.dockerignore`, `.gitignore`, `render.yaml` (bloque `disk:` retirado para free; instrucciones para re-activarlo), `DEPLOY.md`.
- *(Railway anterior descontinuado: se acabó el crédito.)*

### ⏳ Pendientes para uso real (no demo)
1. **Confirmar Litestream en Render** (4 variables `R2_*`/`LITESTREAM_*`): es lo único que separa la BD de ser efímera. Sin eso, cada reinicio borra todo. **El bucket `iglesia-app-db` ya existe y lleva tiempo en uso**, así que lo pendiente es *confirmar*, no crear (ver punto 1 de "por dónde retomar").
   Desde el 28 jul el panel del super-admin muestra el estado real del respaldo (tarjeta 💾 Respaldo) y avisa una vez al día si deja de funcionar, así que este fallo ya no es silencioso. **Ojo:** el indicador dice la verdad sobre lo que hay; no sustituye a poner las variables.
2. **SMTP** (`SMTP_USER`/`SMTP_PASS`): sin ellas la recuperación de contraseña no envía nada.
3. **Push real (VAPID):** añadir `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` en Render → Environment (ver Fase 5).
4. **Reconocimiento facial** (Python, carpeta `facial/`) NO está en el contenedor → desplegar aparte si se quiere usar `/inscribir.html` y `/kiosko.html`.
5. Considerar **OAuth de Google Drive** (hoy es vinculación por enlace de carpeta).

### ✅ Integrado a `main` (20 jul 2026)
- **Seguridad** (`feat/seguridad`): `helmet` (CSP con `connect-src 'self'`), `express-rate-limit`, validación `zod` en login/admin/tesorería/cuenta, validación de env al arrancar + `.env.example`, logging `[seguridad]`. Detalle en `INFORME-SEGURIDAD.md`. Pendiente: `zod` en el resto de routers. *(Los límites se cuentan **por persona** desde el 28 jul — ver Fase 9.)*
- **Chat interno** (`feat/mensajeria-chat`): ver **Fase 6** abajo.

---

## 🆕 FASE 11 (28 jul 2026): Indicador de persistencia — el respaldo deja de fallar en silencio — DESPLEGADO

Hasta hoy, que la BD se estuviera respaldando o no vivía en **una línea del log de arranque del contenedor**, que nadie lee. El fallo más caro del proyecto era también el más silencioso: si faltaba una variable o una clave estaba mal copiada, todo se veía normal —la gente se registraba, subía comprobantes, escribía en el chat— hasta que un reinicio se lo llevaba. Spec en `docs/superpowers/specs/2026-07-28-indicador-persistencia-design.md`, plan en `docs/superpowers/plans/2026-07-28-indicador-persistencia.md`.

**Cómo leer la tarjeta 💾 Respaldo** (primera cosa del panel del super-admin). Son **cuatro** estados, no dos, y la diferencia importa:

| Color | Qué significa | Qué hacer |
|---|---|---|
| ✅ **Verde** | Está respaldando, con la fecha del último respaldo | Nada |
| ⛔ **Rojo** | **No** está respaldando. Un reinicio borra los datos | Revisar las variables `R2_*`/`LITESTREAM_*` en Render |
| ⚠️ **Ámbar** | No se pudo comprobar (se colgó el comando, formato inesperado) | Mirar otra vez más tarde; **no** es una alarma |
| — **Gris** | Esta instancia no replica (normal en tu máquina) | Nada |

- **Se comprueba el respaldo REAL, no las variables.** A Litestream **se le pregunta** (`litestream generations` da el retraso verdadero), porque es un proceso vivo con estado: eso detecta la clave mal copiada y el bucket mal escrito. Al bucle de `rclone` de los uploads **no se le puede preguntar** —es un `while` de shell que, si muere, muere en silencio— así que deja un **sello** en disco tras cada sincronización correcta, y el sello envejeciendo es lo único que lo delata.
- **La salud de la BD se mide por el *retraso*, no por la fecha del último respaldo:** si nadie escribe en tres horas esa fecha envejece aunque todo esté bien, y medirlo así daría una alarma falsa cada noche.
- **En producción, sin variables = rojo.** Fuera de producción es gris. Sin esa distinción el indicador se callaba justo en el escenario que lo justificaba, que además es el estado real de Render hoy.
- **Aviso activo** al super-admin cuando pasa a rojo, **una vez al día** (tabla `aviso_sistema`; no sirve `recordatorio_enviado` porque su `iglesia_id` es `NOT NULL` y el super-admin no tiene iglesia). La dedupe es por día porque el registro de "ya avisé" vive en la misma BD cuya pérdida intenta prevenir.
- **Nunca grita por nada:** hay periodo de gracia de 3 min tras arrancar (al despertar del plan free el disco viene vacío), "no pude comprobarlo" nunca avisa, y un formato de salida inesperado degrada a ámbar en vez de a alarma.
- Backend nuevo `persistencia.js`, endpoint `GET /api/superadmin/persistencia`, vigilancia colgada de `/api/me` (no hay cron en el plan free: cualquier tráfico sirve de disparo), una línea en `docker-entrypoint.sh` para el sello. **43 tests nuevos.**

## 🆕 FASE 8 (28 jul 2026): Organización de eventos — DESPLEGADO

Apartado para organizar un evento: **qué llevar** (con cantidad y visto bueno) y **cuánto se gastó** (lista de gastos que se suma sola). Funciona pegado a un evento del calendario o como lista suelta.

- Backend nuevo `organizacion.js` (`/api/organizacion`, 11 rutas); tablas `evento_org`, `evento_org_cosa`, `evento_org_gasto` con índice único parcial (una hoja por evento, pero varias listas sueltas).
- **Ver:** líderes y pastor (`esLiderOAdmin`). **Editar:** solo quien creó la lista o el pastor. Todo acotado por `iglesia_id`: una hoja de otra iglesia devuelve 404, ni siquiera confirma que exista.
- `total_gastado` **nunca se guarda**: se recalcula al leer, así no queda descuadrado.
- La hoja de un evento **se crea sola** la primera vez que se abre. Si el `INSERT` choca con el índice único (otra iglesia, o dos procesos a la vez), se relee acotado a la iglesia en vez de reventar con 500.
- Borrar un evento borra su hoja con cosas y gastos, en la misma transacción.
- Frontend: apartado **🗒️ Organización** en el menú (solo líderes) y botón dentro de cada evento del calendario.
- **12 tests** del módulo. Spec y plan en `docs/superpowers/`.

## 🆕 FASE 10 (28 jul 2026): Organización v2 — la hoja sale del teléfono del líder — DESPLEGADO

v1 dejaba la hoja como cuaderno privado del líder: el feligrés recibía 403 en todo el módulo, así que la coordinación seguía ocurriendo en WhatsApp. v2 lo cierra. Diseño en `docs/superpowers/specs/2026-07-28-organizacion-v2-design.md`, plan en `docs/superpowers/plans/2026-07-28-organizacion-v2-responsable.md`.

- **Responsable por cosa** (`evento_org_cosa.responsable_id`, `asignada_en`): cualquier persona **activa de la iglesia** (decisión del dueño: media hoja es suelta y no cuelga de ningún grupo, y quien trae la torta a veces no está en el grupo). Si la cuenta se desactiva, el dato **no se borra**: la hoja avisa "cuenta inactiva — reasignar".
- **Aviso al asignar**, notificación + push, y **solo cuando el responsable cambia de verdad**: reenviar el mismo o editar el nombre de la cosa no vuelve a notificar (el líder edita la lista muchas veces mientras la arma).
- **La rendija**: `GET /mis-cosas` y `PATCH /mis-cosas/:id` registradas **entre `authMiddleware` y el gate de líderes**. El feligrés ve y marca SU línea sin que se le abra la hoja — nunca gastos, totales ni cosas de otros. Aparece como "📦 Mi parte" dentro de **Mi Servicio**, no como módulo aparte.
- **Recordatorio el día antes** a quien trae algo (`recordatorios.js`, clave `org_cosa:<id>:dia-1`, con dedupe).
- **Quién puso el dinero** (`evento_org_gasto.pagado_por`) + resumen "Quién puso qué". Los gastos anteriores a esta función no tienen pagador: suman al total pero no al resumen, y la hoja muestra la diferencia como "Sin registrar quién puso" para que las cifras cuadren.
- **Imprimir** (`@media print`, sin gastos: la hoja se pega en la puerta) y **copiar para WhatsApp** (texto plano, sin gastos: se pega en un grupo con feligreses).
- **Duplicar lista**, que reemplaza al sistema de plantillas: copia las cosas en limpio (sin marcar, sin responsables), nunca los gastos, y nace **suelta**. Basta con poder VER la hoja, así un líder parte de la lista de otro sin tocarla.
- **Fuera de alcance a propósito:** presupuesto estimado por línea (el spec lo deja quinto y condicionado: si los líderes no presupuestan de verdad, nadie lo usará), integración con Tesorería (choca con los permisos de `tesoreria.js`, y esa plata no es de la iglesia).

## 🆕 FASE 9 (28 jul 2026): Auditoría UX medible + límite de peticiones por persona — DESPLEGADO

**`scripts/auditoria-ux.py`** — la lista de deuda de UX ya no se vence, porque se vuelve a generar. Recorre **20 vistas** × 3 anchos (390/768/1280) × 2 temas y **mide**: área táctil, nombre accesible de los botones de ícono, contraste y desborde horizontal. Cómo correrlo y qué arrojó: `docs/AUDITORIA-UX-2026-07-27.md` (primera corrida, 11 vistas) y **`docs/AUDITORIA-UX-2026-07-28.md`** (recorrido ampliado, el vigente).

> **Ampliado el 28 jul:** entraron las 7 vistas que faltaban (Administración, Panel del Pastor, Reportes, Música, Niños, Cuidado pastoral, Mi Servicio) más los sub-estados de caso de cuidado y clase abierta. Como ninguna persona las ve todas, **cada vista declara con qué usuario se audita** y el script entra una vez por usuario (`pastor`, `abel`, `joaquin`, `marta`) fusionando los hallazgos; si una vista no está en el menú de su usuario, se registra como omitida en vez de reventar. Arrojó **contraste 9 → 0 · área táctil bajo el mínimo AA 18 → 0 · desborde horizontal 2 → 0**: enlaces sueltos con el azul por defecto del navegador (1.79:1 en oscuro) ahora con `--primary-tx`, checkbox de Escuela Dominical 23×23 → 24×24, título del himnario en Música, y la barra de botones de la hoja de Organización, que desbordaba a 390px.

Resultado: **nombres accesibles 36 → 0 · área táctil bajo el mínimo AA 54 → 0 · contraste bajo AA 75 → 0**. Lo arreglado:
- **Contraste en tema oscuro.** `aplicarAjustes()` fijaba los colores del acento iguales en ambos temas; el número del día del calendario quedaba en 1.78:1, ilegible. Se separó el acento **como texto** (`--primary-tx`, aclarado con `color-mix` solo en oscuro) del acento **como fondo**. 23 estilos que usaban `var(--red)`/`var(--green)` para texto pasaron a `--red-tx`/`--green-tx`.
- **Moneda unificada en CLP.** Convivían `es-MX` en Tesorería (`$1,250,000`) y `es-CL` en Organización. Ahora hay un solo `money()`.
- **Calendario en móvil.** La grilla tenía ancho mínimo de 480px con scroll lateral: a 390px se veía de LUN a VIE y **el domingo quedaba fuera**. Ahora entran las 7 columnas y cada evento es un punto del color de su grupo; el toque abre el detalle del día. En escritorio no cambia nada.

**Límite de peticiones por persona** (`seguridad.js`). Contaba **por IP**: toda la congregación en el wifi del templo compartía una sola cuota de 100 peticiones cada 15 min y se bloqueaban entre sí. Ahora, con sesión iniciada, la cuota es **por persona**; el tráfico anónimo se sigue contando por IP, y el **login sigue por IP** a propósito (es la protección contra fuerza bruta). El token **se verifica**, no solo se lee: si bastara con leerlo, cualquiera inventaría `persona_id` para saltarse el límite.

## 🆕 FASE 6 (20 jul 2026): Mensajería interna (chat) — PROBADO
- Chat **1:1**, **por grupo** (auto-provisionado) y **a medida**; tiempo real por **SSE** (`sse.js` hub + `GET /api/mensajes/stream?token=`), adjuntos (reusa `/api/upload`), **leído/no-leídos** (por `ultimo_leido_mensaje_id`), **"escribiendo…"** y **moderación del pastor** (soft-delete en grupo/custom, nunca 1:1; borra también el adjunto y poda a quien sale del grupo).
- Backend nuevo `mensajes.js` (`/api/mensajes`) + `sse.js`; tablas `conversacion`, `conversacion_miembro`, `mensaje`. Permisos en `auth.js` (`puedeIniciarChatCon`, `verificarToken`). Los mensajes **no** llenan la campana: push (offline) + badge de no-leídos.
- Push: `push.js` incluye `url` (`/#mensajes/<id>`); `web/sw.js` navega la pestaña a la conversación al tocar la notificación.
- Frontend: vista **💬 Mensajes** con `EventSource`. Seed: conversación demo `abel`↔`maria`.
- **Pruebas:** `npm test` en `backend/` — 21 (chat) + 6 (seguridad) en verde. Plan/spec en `app/docs/superpowers/`.

> ✅ Transpositor en el cancionero, fechas día-mes-año, comprobante en tesorería y push real: **hechos** (Fase 5).

### 🎨 Rediseño visual (aplicado)
Sidebar verde azulado oscuro (`#113438`), fondo crema (`#f4f3f0`), hero degradado verde→dorado, tarjetas gris cálido radius 16, números negro sólido, **iconos de línea** + logo de cruz, render de auditorio en Anuncios. Acento por defecto "Pino". Hay **Ajustes** (tema claro/oscuro/auto, color de acento, tamaño de texto).

---

## 🆕 FASE 7 (20 jul 2026): Directorio de miembros + cumpleaños — DESPLEGADO

*(Estaba marcado "EN CONSTRUCCIÓN" hasta el 28 jul; en realidad ya estaba terminado: `directorio.js` con 4 rutas, `directorio.test.js` en verde y `/api/directorio` respondiendo 401 en producción.)*

Módulo **Directorio** para que la congregación se conozca y se contacte entre sí, cuidando la privacidad de cada persona.

- **Perfiles del directorio:** cada miembro tiene una ficha con **foto**, nombre, grupo(s) a los que pertenece y datos de contacto (teléfono, correo). La foto reutiliza el mecanismo de subida existente (`/api/upload`).
- **Contacto oculto por defecto, sin excepciones:** el teléfono y el correo de cada persona aparecen **ocultos** en el directorio hasta que **la propia persona** decide mostrarlos. No hay atajo para pastor ni líderes: **cada quien activa su propia visibilidad**, igual que cualquier feligrés — coherente con el principio ya aplicado en otros módulos ("el pastor ve, pero no administra lo ajeno").
- **Cumpleaños del mes:** el directorio muestra quiénes cumplen años en el mes actual (ordenados por día), tomando el campo `persona.cumple` que ya existe en la base de datos.
- **Aviso automático de cumpleaños:** el día del cumpleaños de alguien, se notifica a **toda la iglesia** (reutiliza el mecanismo de segmentación `{tipo:'todos'}` de `notificaciones.js`, Fase 4), para que la congregación lo salude.
- **Columnas nuevas en `persona`** (pensadas como `ALTER TABLE` idempotente en `db.js`, igual que en fases anteriores): `foto_url` (ruta de la foto de perfil), `mostrar_telefono` y `mostrar_email` (booleanos, `0` por defecto = ocultos).
- **Endpoints previstos:** `GET /api/directorio` (listado con los campos de contacto según la visibilidad que cada persona haya activado, más el bloque de cumpleaños del mes), y una vía para que cada persona actualice su propia foto y sus preferencias `mostrar_telefono`/`mostrar_email` (en `cuenta.js`, junto a "cambiar contraseña").
- **Nota de diseño:** por tratarse de datos de contacto personal, conviene revisar este módulo junto con la Política de Privacidad y los Consentimientos (ver `docs/LEGAL.md`) — en particular, si la foto de perfil y la fecha de cumpleaños requieren su propio consentimiento específico o quedan cubiertas por el consentimiento general de tratamiento de datos.

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

## 🆕 FASE 5 (27 jun 2026): Transpositor en cancionero · Fechas día-mes-año · Comprobante · Push real

### 🎸 Transpositor de tono dentro del cancionero (Grupo de Alabanza)
- La columna `cancion.letra` y el backend (`POST/PATCH /api/musica/canciones` con `letra`) ya existían; se **cableó el frontend**.
- En **Grupo de Alabanza → Cancionero**: el form "+ Canción" ahora tiene un campo **Acordes/letra**; las canciones con acordes muestran chip **🎸 acordes** y al tocarlas abren un **visor con − / + tono y "Original"** (reusa `_renderAcordes`/`_transAcorde` del Himnario). El líder de música edita los acordes **inline** (✏️).
- En el **Orden del servicio**, tocar una canción abre el visor **ya transpuesto al "tono del día"** (`setlist_item.tono_dia`); el endpoint `GET /api/musica/setlist/:ev` ahora devuelve `cancion_id` y `letra`. Helper `_semitonosEntre(base,destino)`.
- Seed: "Sublime Gracia" trae acordes de ejemplo (tono RE). **PROBADO** (API + lógica de transposición: RE+2→MI, G+2→A, base RE→día MI = +2).

### 📅 Fechas en orden día-mes-año en TODOS los módulos
- Se reemplazaron todos los `<input type="date">` nativos (cuyo orden depende del idioma del navegador) por un **selector reutilizable día / mes / año**: helper `fechaSelectHTML(prefijo, valor, opts)` + `fechaSelectValor(prefijo)` en `web/app.js`.
- Aplicado en: eventos/pedir fecha, ensayo de música, tesorería, material de Escuela Dominical, asistencia, avisos de grupo, prédica y vigencia de predicador (desde/hasta). `opts.opcional` permite "en blanco"; si no, por defecto **hoy**.

### 📎 Comprobante en Tesorería — (ya estaba implementado)
- `formMov`/`guardarMov` suben el archivo con `/api/upload` y mandan `comprobante_url`; el backend lo guarda (`movimiento.comprobante_url`, columna por `ALTER TABLE` en `db.js`) y la lista muestra **📎 comprobante**.

### 🔔 Push real (Web Push / VAPID)  — `push.js`, tabla `push_sub`, `sw.js`
- Nuevo módulo `backend/src/push.js` con `enviarPush(personaIds,{titulo,texto,url})` (usa la librería **`web-push`**). Tabla `push_sub (persona_id, endpoint UNIQUE, p256dh, auth)`. Las suscripciones caducadas (404/410) se borran solas; **nunca rompe** el flujo de notificaciones.
- Rutas (`/api/push`): `GET /clave-publica`, `POST /suscribir`, `POST /baja`, `POST /probar`.
- **Conectado en TODOS los puntos** que generan notificación: `notificarSegmento` (anuncios/avisos), asignaciones, música (te toca tocar + recordatorio), recordatorios automáticos, "Mi Grupo", prédica (eres predicador), eventos (solicitud/aprobada/rechazada).
- `web/sw.js`: escucha el evento **`push`** y muestra la notificación (con la app cerrada) + **`notificationclick`** enfoca/abre la app.
- Frontend: en **Ajustes → 🔔 Notificaciones**, botón **Activar** (pide permiso, suscribe vía `pushManager`, guarda la sub), **Probar** y **Desactivar**.
- **Degrada con elegancia:** si NO hay claves VAPID, el push queda **desactivado** y las notificaciones siguen en la campana. **PROBADO** vía API: clave-publica/suscribir/probar OK; un envío con suscripción inválida falla en el log **sin tumbar el servidor** y la notificación in-app igual se crea.
- **Config de claves:** se cargan de variables de entorno (`VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`). Hay un **cargador `.env` mínimo** (`backend/src/env.js`, sin dependencias) que lee `backend/.env` en local (gitignored; hay `.env.example`). **En Railway hay que añadir esas 3 variables en el panel.** Generar par: `node -e "console.log(require('web-push').generateVAPIDKeys())"`. ⚠️ El push real necesita **HTTPS** (Railway lo tiene; en local funciona en `localhost`).

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
- 🗒️ Organización de eventos (cosas a llevar + gastos con total) — Fase 8
- 💬 Mensajería interna con SSE — Fase 6 · 👤 Directorio + cumpleaños — Fase 7
- 📷 **Reconocimiento facial** (Python InsightFace + Node + páginas `/inscribir.html` y `/kiosko.html`) — PROBADO: inscribir + reconocer con confianza 1.0

### Calidad
- Diseño profesional (sidebar, dashboard, toasts, modales, iconos SVG)
- **307 tests** en verde (`cd backend && node --test`), incluidos los de aislamiento multi-iglesia, permisos por rol, límite de peticiones, validación de subidas y estado del respaldo.
- Accesibilidad medida, no supuesta: contraste AA y área táctil verificados con `scripts/auditoria-ux.py` (ver Fase 9).
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
- ✅ ~~Subir comprobante en Tesorería~~ — ya estaba hecho (Fase 5)
- ✅ ~~Notificaciones push segmentadas · Modo offline Biblia/Notas · Notas del sermón · Recordatorios automáticos~~ — hechos (Fase 4)

### 👉 POR DÓNDE RETOMAR (al 28 jul 2026 · noche, todo desplegado y **307 tests en verde**)

1. **Persistencia: probablemente YA ESTÁ, solo falta confirmarlo.** El bucket **`iglesia-app-db`** existe en Cloudflare R2 desde hace tiempo, se ha trabajado siempre con él, y el 29 jul tenía **285 objetos / 1.51 MB** con ~6.470 operaciones de escritura en el periodo — eso es una réplica de Litestream viva, no un bucket dormido. **No hay que crear bucket ni token.** Lo único pendiente es mirar la tarjeta 💾 Respaldo en el panel del super-admin: si está verde con fecha reciente, este punto está cerrado. *(Las versiones anteriores de este documento decían que las variables "nunca se confirmaron", y eso mandó a crear de cero algo que ya existía. La duda era sobre la confirmación, no sobre la existencia.)*
   Después: `SMTP_USER`/`SMTP_PASS` (sin ellas nadie recupera su contraseña por correo) y `SUPERADMIN_PASSWORD`.
2. ✅ ~~**Test intermitente sin resolver**~~ — **acoplamiento roto el 28 jul, pero el fallo original nunca se reprodujo** (0 de 15 corridas aisladas antes de tocar nada, y 20 réplicas instrumentadas en paralelo con trazas idénticas). Se encontraron dos fragilidades reales: (a) el comentario del test decía "ya se hicieron 2 peticiones de login" cuando son **3** —el limitador corre antes que zod, así que el test del body inválido también cuenta—, dejando una holgura de exactamente una petición; y (b) `BASE` usaba `localhost`, que resuelve a `::1` **y** a `127.0.0.1`, y con `autoSelectFamily` cada conexión compite entre ambas familias: **dos cubos distintos del mismo limitador** (medido: `127.0.0.1` → 401 con `remaining=4` mientras `[::1]` → 429 con `remaining=0`). Ahora el test lee `RateLimit-Limit` del servidor y pide en bucle hasta el 429, y usa la IP literal. ⚠️ **Si vuelve a fallar, la causa es una tercera que no se vio.**
3. ✅ ~~**`POST /api/upload` no valida tipo MIME ni tamaño**~~ — **cerrado el 28 jul**, y de paso: la afirmación de esta línea era falsa a medias (la lista blanca de extensiones y el tope de 10 MB ya existían). Lo que faltaba de verdad era mirar el **contenido**: ahora son tres capas (extensión → MIME declarado coherente → *magic bytes* de PDF/PNG/JPEG/GIF, borrando el temporal si no cuadra). Y los campos-URL quedaron partidos en dos clases —archivo subido aquí (`/uploads/` obligatorio) vs. enlace externo a propósito (solo `http`/`https`)—, porque restringirlos todos por igual habría roto compartir un vídeo de YouTube. 24 tests nuevos.
4. ✅ ~~**El auditor de UX cubre 11 vistas**, no todas~~ — **cerrado el 28 jul**. Ahora recorre 20 vistas con cuatro usuarios distintos (ninguna persona las ve todas) y registra como omitida la vista que no esté en el menú, en vez de reventar. Encontró y cerró 9 casos de contraste, 18 de área táctil bajo el mínimo AA y 2 de desborde horizontal. Ver `docs/AUDITORIA-UX-2026-07-28.md`.

### Abierto de verdad (28 jul 2026)
- **Botones por debajo de lo recomendado:** menú lateral a 42px de alto y `small-btn` a 36px. Cumplen el mínimo exigible (24px), quedan cortos frente a los 44px recomendados. Subirlos mueve el ritmo visual de toda la app → decisión de diseño, no deuda.
- **Organización v2** (fuera del alcance de la Fase 8, por decisión del spec): responsable y costo por línea, plantillas de listas, export a PDF, notificaciones "trae tu parte", integración con Tesorería.
- ✅ ~~`zod` en el resto de los routers~~ — **cerrado el 28 jul**. Se creía pendiente por una línea vieja de este documento; al inventariar los 37 routers, 24 ya validaban y el único hueco real era **mensajería** (4 rutas: se colaban `[3]` como id, `{a:1}` guardado como `"[object Object]"` y difundido por SSE + push, y listas de participantes sin tope). Cubierto con 15 tests.
- ✅ ~~**`POST /api/upload` sigue sin validar**~~ y ✅ ~~**`adjunto_url` acepta hosts externos**~~ — ambos **cerrados el 28 jul** (ver punto 3 de "por dónde retomar").
- ✅ ~~**Guardar acordes de una canción da 400**~~ — **cerrado el 28 jul**. `guardarLetraCancion` reenvía la canción entera desde su copia en memoria, y `enlace`/`autor` viajaban como `null`; `z.string().optional()` acepta ausente o cadena, pero no nulo. El arreglo fue en el esquema y no en el frontend, porque el handler ya estaba escrito para esto (`autor ?? c.autor` = "si no viene, deja lo que había"): quien contradecía esa intención era el esquema. Revisados los otros 7 handlers con el mismo `??`: el bug era único — todos los demás `PATCH` arman su body desde los campos del formulario, que siempre dan cadena.
- ✅ ~~**Enlaces sin esquema se rechazan**~~ — **cerrado**. `normalizarEnlace()` en `web/app.js` le pone el `https://` al enviar, que es como la gente copia un enlace desde el navegador del teléfono. Se aplica en los tres sitios que mandan una URL de verdad (carpeta de Drive del grupo, recurso de grupo tipo *link*, recurso de prédica tipo *link*) y **no** en el tipo *libro*, que es texto libre. Dos cosas que no hace a propósito: si el texto **ya trae esquema** —incluido `javascript:`— lo deja tal cual para que lo rechace el backend (anteponerle `https://` lo convertiría en una URL válida y absurda, y taparía el intento); y si no parece un enlace (sin punto, o con espacios) tampoco lo toca, para que el usuario vea el error claro en vez de guardar `https://hola`. El candado del backend no se tocó. *(De paso: el formulario de canciones no tiene campo de enlace, así que ahí nunca hubo fricción.)*

### 🆕 Salió el 28 jul por la noche (Fase 11) — abierto

- ✅ ~~**La página pública oculta los eventos de HOY a partir de las 20:00**~~ — **cerrado el 28 jul por la noche**. `publico.js` filtraba con `fecha >= hoy` calculando `hoy` en **UTC**, y Chile va cuatro horas por detrás: los eventos de hoy desaparecían del portal justo en la franja en que alguien mira el sitio para saber si esa noche hay culto. Ahora hay un `fechaLocal()` exportado y probado con la zona horaria fijada (`publico-fecha.test.js`), así que el test demuestra el fallo en cualquier máquina y no solo a las 20:00 de Chile. **Lo interesante:** el test viejo construía sus fechas con el mismo criterio equivocado, así que la suite pasaba con el bug dentro; al arreglar el código se destapó y hubo que arreglar los dos. Un test que comparte el error del código no protege de nada.
- **Menores del indicador, diferidos a propósito** por la revisión final de la rama (ninguno bloquea): la tarjeta muestra la fecha absoluta del último respaldo en vez de "hace 4 h"; `retraso_seg` se calcula pero no se pinta (con `retraso_alto` no se distingue 16 min de 6 h); la clave del aviso diario usa UTC (un corte nocturno puede dar dos avisos en un mismo día local); con caché fría, `/api/me` y el panel pueden lanzar `litestream generations` dos veces casi a la vez; y en la carga que **detecta** el fallo, el número de la campana puede quedar en 0 hasta el siguiente refresco (la tarjeta roja sí lleva la señal).
- ⚠️ **Falta la verificación que ningún test puede hacer**, porque depende del contenedor real: que en Render la tarjeta se comporte como se diseñó. Si sale **ámbar** con "respuesta inesperada de Litestream", esa versión del binario imprime las columnas con otros nombres y hay que ajustar `interpretarGeneraciones` (se ve con `litestream generations -config /etc/litestream.yml $DB_PATH` desde la shell del contenedor). El diseño previó ese caso: degrada a ámbar **sin** alarma falsa.
- **Rama `chore/limpieza-profunda` (23 jul):** completamente fusionada en `main`, cero commits propios. Es un resto, se puede borrar.
