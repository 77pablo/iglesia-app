# Consentimiento legal + derechos ARCO (autoservicio) — Diseño

*Fecha: 2026-07-23 · App de Iglesia · Estado: aprobado, pendiente de plan de implementación*

## 1. Problema y objetivo

La app trata datos personales (nombre, correo, teléfono, foto, cumpleaños, asistencia,
finanzas, mensajes) pero **hoy no captura ningún consentimiento** y no ofrece a la persona
ninguna vía para ejercer sus derechos sobre esos datos. La auditoría del 20-jul-2026 lo marcó
como uno de los bloqueantes para poder lanzar.

**Objetivo:** que toda persona usuaria acepte de forma **trazable** el tratamiento general de
sus datos (Términos + Política de Privacidad) y pueda ejercer sus derechos ARCO
(acceso, rectificación, cancelación, oposición) **por autoservicio** dentro de la app.

**Fuera de alcance (por decisión explícita):**
- Consentimiento **biométrico** (reconocimiento facial): va en la pantalla de inscripción facial
  (`/inscribir.html`), que hoy ni está desplegada. Se abordará cuando el servicio facial vuelva.
- Consentimiento **parental** de menores: el registro no captura edad hoy; se abordará si/cuando
  se registren menores como usuarios.
- **Redacción del texto legal**: los 5 documentos ya existen en `legal/*.md` y `web/legal/*.html`
  (borradores). Su texto y los placeholders (`[responsable]`, `[RUT]`, `[correo ARCO]`, `[fecha]`)
  son responsabilidad del dueño + un abogado. Este diseño solo **conecta** la mecánica a esos
  documentos.

## 2. Decisiones de diseño (cerradas)

| Tema | Decisión |
|---|---|
| Consentimientos a capturar | Solo el **general** (Términos + Política de Privacidad). |
| A quién se le pide | **Nuevos** (casilla en el registro) **+ existentes** (puerta bloqueante al entrar). |
| Trazabilidad | Tabla `consentimiento` append-only (historial); versión + fecha ISO + IP + user-agent. |
| Revocación / ARCO | **Autoservicio** en Ajustes → sección "Mis datos y privacidad". |
| Cancelación (borrado) | **Anonimizar al instante**; los registros históricos se conservan sin identificar. |
| Guarda de seguridad | El **único pastor activo** de una iglesia y cualquier **super-admin** no pueden auto-eliminarse. |
| Mensajes enviados | Se conserva el cuerpo (es comunicación de la iglesia); solo se des-identifica el autor. |
| Correo de contacto ARCO | **Configurable** vía env `LEGAL_CONTACT_EMAIL`; la página legal lo muestra solo si está definido. |
| Acceso (ARCO) | Se incluye "Descargar mis datos" (export JSON del propio perfil). |

## 3. Modelo de datos

### 3.1 Versión del consentimiento
- Constante `CONSENT_VERSION` (string, p.ej. `"2026-07-23"`) en un módulo compartido
  (`backend/src/consentimiento.js`). Se sube manualmente cuando el texto legal cambie de forma
  material; un cambio de versión hace que la puerta vuelva a aparecer (re-consentimiento).

### 3.2 Tabla `consentimiento` (append-only)
Creada con `CREATE TABLE IF NOT EXISTS` en `db.js` (patrón existente; BD = `node:sqlite`).

```
consentimiento (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  iglesia_id   INTEGER NOT NULL,
  persona_id   INTEGER NOT NULL,
  tipo         TEXT    NOT NULL DEFAULT 'general',   -- extensible a 'biometrico'/'parental'
  version      TEXT    NOT NULL,
  accion       TEXT    NOT NULL,                     -- 'otorgado' | 'revocado'
  fecha        TEXT    NOT NULL,                     -- ISO 8601
  ip           TEXT,
  user_agent   TEXT
)
```
Índice: `(persona_id, tipo, id)` para leer rápido la última fila por persona/tipo.

**Nunca se hace UPDATE/DELETE sobre esta tabla** — cada acción es una fila nueva. Eso da el
historial que exige el principio "trazable + revocable".

### 3.3 Helper de vigencia
`tieneConsentimientoVigente(personaId, tipo='general') -> boolean`
= la fila más reciente `(persona, tipo)` tiene `accion='otorgado'` **y** `version===CONSENT_VERSION`.

## 4. Componentes

### 4.1 `backend/src/consentimiento.js` (nuevo)
- Exporta `CONSENT_VERSION`, `tieneConsentimientoVigente()`, y `registrarConsentimiento(personaId, iglesiaId, accion, req)`
  (inserta fila con fecha/IP/user-agent tomados de `req`).
- Router `/api/consentimiento`:
  - `GET /estado` → `{ vigente: bool, version, fecha|null }` para el usuario autenticado.
  - `POST /aceptar` → registra `otorgado` para el usuario autenticado; responde `{ ok:true }`.
- Registrado en `server.js` con `authMiddleware` (excepto que reusa el patrón de los demás routers).

### 4.2 Captura en el registro nuevo — `backend/src/registro.js` + modal frontend
- `registroSchema`: añadir `acepto: z.literal(true)` (o booleano que debe ser `true`); si falta o es
  `false` → **400** con mensaje claro. La app no crea la cuenta sin aceptación.
- Tras el `INSERT` de la persona, llamar `registrarConsentimiento(persona.id, iglesia.id, 'otorgado', req)`.
- Modal `abrirRegistro` (`web/app.js`): añadir casilla **obligatoria**
  "He leído y acepto los **[Términos]** y la **[Política de Privacidad]**", con enlaces
  `target="_blank"` a `/legal/terminos.html` y `/legal/privacidad.html` (ya existen). `confirmarRegistro`
  bloquea el envío si no está marcada y envía `acepto:true`.

### 4.3 Puerta de consentimiento (usuarios existentes) — `/api/me` + frontend
- `/api/me` (`server.js`/`auth.js`) añade al payload `consentimiento_pendiente: !tieneConsentimientoVigente(persona.id)`.
- `web/app.js`: al cargar la app (`cargarApp`), si `consentimiento_pendiente`, mostrar una **pantalla
  bloqueante** siguiendo el patrón existente de cambio de contraseña obligatorio
  (`mostrarCambioObligatorio`): resumen breve + enlaces a Términos/Privacidad + botón **"Acepto"**
  (`POST /api/consentimiento/aceptar`) + opción "Cerrar sesión". No se puede navegar la app sin aceptar.
- Cubre a los usuarios de siempre (seed/reales) y a las cuentas que crea el pastor desde Admin.

### 4.4 Autoservicio ARCO — Ajustes → "Mis datos y privacidad" (`web/app.js` + `backend/src/cuenta.js`)
- **Acceso** — botón "Descargar mis datos": `GET /api/cuenta/mis-datos` → JSON con perfil
  (nombre, usuario, correo, teléfono, cumpleaños, foto), grupos/pertenencias, e historial de
  consentimientos de la persona. El frontend lo descarga como archivo `.json`.
- **Rectificación** — ya existe (editar perfil en Directorio / cuenta en Ajustes): solo se enlaza/menciona.
- **Revocación + Cancelación** — botón "Retirar consentimiento y eliminar mi cuenta" con
  **confirmación escrita** (escribir p.ej. ELIMINAR) → `POST /api/cuenta/eliminar`:
  1. **Guarda**: si `rol_global==='super_admin'`, o la persona es el **único pastor activo**
     (`es_pastor=1`) de su iglesia → **409** con mensaje: "Eres responsable de la iglesia;
     transfiere el rol antes de eliminar tu cuenta, o escribe a `LEGAL_CONTACT_EMAIL`."
  2. Si pasa la guarda, **anonimizar** en una transacción:
     - `persona`: `nombre='Usuario eliminado'`, `usuario='eliminado_<id>'` (libera el usuario y evita login),
       `email=NULL, telefono=NULL, foto_url=NULL, cumple=NULL, mostrar_telefono=0, mostrar_email=0,
       activo=0, password_hash=<aleatorio inutilizable>`.
     - Borrar el archivo físico de la foto anterior si existía (en `UPLOADS_DIR`).
     - `registrarConsentimiento(persona.id, iglesia.id, 'revocado', req)`.
     - Los registros históricos (asistencia, tesorería, mensajes, pertenencias) **se conservan**;
       ahora referencian a una persona anonimizada. Los **cuerpos de los mensajes se conservan**.
  3. Respuesta `{ ok:true }`; el frontend borra el token y vuelve al login.

### 4.5 Correo de contacto legal — `LEGAL_CONTACT_EMAIL`
- Nueva env opcional. `server.js` la expone en un endpoint público liviano `GET /api/legal/contacto`
  → `{ email: string|null }`. Cada página `web/legal/*.html` lleva un `<span>` de contacto vacío y un
  pequeño script inline que hace `fetch('/api/legal/contacto')`: si viene `email`, rellena y muestra la
  línea; si viene `null`, deja la línea oculta (sin romper). Documentar la env en `.env.example`.

## 5. Manejo de errores
- Registro sin `acepto` → 400 (`falta aceptar los términos`).
- `POST /aceptar` sin sesión → 401 (authMiddleware).
- `POST /cuenta/eliminar` con guarda activa → 409 con mensaje explicativo (no borra nada).
- Anonimización dentro de transacción: si algo falla, rollback (no deja la cuenta a medias).
- `LEGAL_CONTACT_EMAIL` ausente → las vistas legales simplemente no muestran esa línea.

## 6. Pruebas (`backend/test/`, estilo `node:test`)
1. Registro sin `acepto` → 400; **no** crea persona.
2. Registro con `acepto:true` → crea persona **y** una fila `consentimiento otorgado` con la versión vigente.
3. `GET /consentimiento/estado`: pendiente cuando no hay fila; vigente tras aceptar.
4. Cambiar `CONSENT_VERSION` invalida un consentimiento previo (vuelve a pendiente).
5. `POST /consentimiento/aceptar` registra `otorgado` para el usuario autenticado.
6. `/api/me` devuelve `consentimiento_pendiente` correcto.
7. `POST /cuenta/eliminar`: anonimiza la fila (nombre/correo/teléfono/foto vacíos, `activo=0`),
   escribe `revocado`, y **conserva** un registro histórico asociado (p.ej. una asistencia/mensaje).
8. Guarda: super-admin → bloqueado; único pastor de la iglesia → bloqueado; segundo pastor presente → permitido.
9. `GET /cuenta/mis-datos` devuelve el perfil propio y el historial de consentimientos; no filtra datos de otros.
10. Aislamiento multi-iglesia intacto en todos los endpoints nuevos.

## 7. Archivos afectados
- **Nuevos:** `backend/src/consentimiento.js`, `backend/test/consentimiento.test.js`.
- **Modificados:** `backend/src/db.js` (tabla + índice), `server.js` (routers + `/api/me` + `/api/legal/contacto`),
  `registro.js` (schema + registro de consentimiento), `cuenta.js` (`/mis-datos`, `/eliminar`),
  `auth.js` (si el flag va en `/me`), `web/app.js` (casilla de registro, puerta bloqueante, sección Ajustes),
  `web/legal/*.html` (línea de contacto condicional), `.env.example`, `ESTADO.md`.

## 8. Acciones del dueño (fuera de código)
- Definir `LEGAL_CONTACT_EMAIL` en el entorno (Render) cuando lo tenga (opción: Gmail gratis dedicado).
- Completar los placeholders de `legal/*.md` y `web/legal/*.html` con un abogado antes de lanzar.
