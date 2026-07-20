# Informe de Seguridad — App de Iglesia (backend)

Rama: `feat/seguridad` (worktree `app-seguridad`, basada en `main` sin la feature de chat).
Fecha: 2026-07-20.

## Resumen ejecutivo

Se aplicaron las 6 areas de la politica de seguridad al backend (rate limiting,
variables de entorno, validacion de inputs con zod, cabeceras de seguridad con
helmet, revision de autenticacion/sesiones, y logging de seguridad), sin romper
la app existente. El servidor arranca, `/` y `/api/health` responden 200 con
las cabeceras de helmet, el login sigue funcionando y el rate limit de login
da 429 tras superar el limite.

**Actualizacion (Pasada 2):** se cerraron los 3 pendientes que quedaban
abiertos: **(1)** los 14 routers restantes con endpoints POST/PATCH se
migraron a `validar()`/zod (todo `backend/src` queda cubierto salvo
`recordatorios.js`/`obispo.js`, que no tienen POST/PATCH con body);
**(2)** `/api/cuenta/recuperar` y `/recuperar/confirmar` ahora llevan rate
limit estricto (5 req/IP/15min, reusando `limiterLogin`); **(3)** se verifico
con Playwright (navegador Chromium real) que la CSP no rompe login ni las
pantallas de Tesoreria/Administracion — cero errores de consola, no hizo
falta tocar la CSP. Se anadio 1 prueba nueva con `node:test` (total 7),
todas en verde. Detalle completo en la seccion "Pasada 2" mas abajo.

---

## 1. Rate limiting (`express-rate-limit`)

Nuevo modulo `backend/src/seguridad.js` centraliza tres limitadores:

- **`limiterGeneral`**: 100 req/IP cada 15 min, montado en `app.use('/api', limiterGeneral)`
  (server.js), antes de cualquier ruta `/api/*`.
- **`limiterLogin`**: 5 req/IP cada 15 min, montado solo en `POST /api/login`.
  Reemplaza el rate-limit casero (`intentosLogin` Map en memoria, 10/15min) que
  existia en `server.js` — se elimino por completo, sin duplicar logica.
- **`limiterSensible`**: 10 req/IP cada 15 min, montado en:
  - `app.use('/api/admin', limiterSensible, adminRouter)` (todo el router).
  - `app.post('/api/upload', authMiddleware, limiterSensible, ...)`.
  - **Tesoreria: trade-off documentado.** La vista de Tesoreria del frontend
    (`web/app.js`, funcion `vistaTesoreria`) dispara **4 GET en paralelo** al
    abrirse (`resumen`, `movimientos`, `campanias`, `transparencia`). Aplicar
    `limiterSensible` a todo el router habria agotado la cuota de 10
    peticiones con solo 2-3 visitas a la pantalla, rompiendo la app para el
    pastor/tesorero en uso normal. Se opto por aplicar `limiterSensible`
    **solo a las rutas que escriben dinero**: `POST /movimientos`,
    `POST /campanias`, `PATCH /campanias/:id/aportar` (en `tesoreria.js`).
    Las lecturas de tesoreria quedan cubiertas por el limitador general
    (100/15min), que es holgado para un dashboard. Esto cumple el espiritu
    de la regla (frenar abuso de escritura en un endpoint financiero
    sensible) sin degradar la experiencia de lectura. Verificado con curl:
    12 GET consecutivos a `/api/tesoreria/resumen` → los 12 responden 200.

Todos los 429 devuelven JSON `{ error: "..." }` con mensaje claro, y cada
`handler` loguea `[seguridad] rate-limit ... excedido: ip=... ruta=...` (sin
datos sensibles, solo IP y ruta).

Verificado con curl: 12 GET a `/api/admin/datos` → los primeros ~6-8 dan 200,
el resto 429 (el limitador ya tenia hits previos de la misma sesion de
pruebas, lo cual es el comportamiento esperado de una ventana compartida por
IP+ruta).

**Estado: aplicado** (con el trade-off de tesoreria documentado arriba).

---

## 2. Variables de entorno

- **`backend/.env.example`** actualizado (ya existia uno parcial; se amplio)
  para documentar SOLO nombres, sin valores: `JWT_SECRET`, `VAPID_PUBLIC`,
  `VAPID_PRIVATE`, `VAPID_SUBJECT`, `DB_PATH`, `UPLOADS_DIR`, `PORT`,
  `CORS_ORIGIN`, `SEED_ON_EMPTY`, `NODE_ENV`. Se conservaron ademas (fuera del
  set minimo pedido, pero ya usadas por el codigo) `SMTP_USER/PASS/FROM` y
  `FACIAL_PY_URL/FACIAL_UMBRAL`, claramente marcadas como "otras opcionales".
- **`.gitignore` (raiz) y `backend/.gitignore`**: ya incluian `.env` y
  `backend/.env` (verificado, no se necesito anadir nada). No hay ningun
  `.env` real trackeado en el repo (`git ls-files | grep .env$` → vacio).
- **Validacion al arrancar**: en `backend/src/auth.js` se amplio el chequeo
  existente de `JWT_SECRET` a una lista `REQUERIDAS_PRODUCCION` (hoy con un
  solo elemento, pero extensible) que en `NODE_ENV=production` revisa todas
  las requeridas y, si falta alguna, **lanza un error que lista exactamente
  cuales faltan** y la app no arranca:
  `[seguridad] Faltan variables de entorno requeridas en produccion: JWT_SECRET. ...`
  Probado: `NODE_ENV=production node src/server.js` (sin `JWT_SECRET`) falla
  al arrancar con ese mensaje (ver seccion de evidencia).
- **VAPID no es obligatorio**: `backend/src/push.js` ya degradaba con
  elegancia (push desactivado, notificaciones siguen in-app) y ya avisaba por
  consola (`[push] VAPID no configurado ...`) — se conservo tal cual, cumple
  el punto "avisa pero no bloquea".

**Estado: aplicado.**

---

## 3. Validacion de inputs (`zod`)

Middleware reutilizable `validar(schema, fuente = 'body')` en
`backend/src/seguridad.js`: valida `req[fuente]` con `schema.safeParse`; en
fallo responde `400 { error: "Datos invalidos: revisa <campos>" }` y loguea
`[seguridad] entrada rechazada: <METODO> <ruta> - campos invalidos: <lista>`
— **nunca** vuelca el valor recibido (evita filtrar contrasenas o datos
personales en logs).

Aplicado a:

| Endpoint | Archivo | Notas |
|---|---|---|
| `POST /api/login` | `server.js` | 3 campos string no vacios |
| `POST /api/dispositivo` | `server.js` | token requerido |
| `POST /api/admin/usuarios` | `admin.js` | nombre/usuario/password/email |
| `PATCH /api/admin/usuarios/:id` | `admin.js` | activo/es_pastor booleanos |
| `POST /api/admin/usuarios/:id/rol` | `admin.js` | grupo_id numerico, rol en enum |
| `POST /api/admin/grupos` | `admin.js` | nombre requerido |
| `PATCH /api/admin/grupos/:id` | `admin.js` | nombre/color opcionales |
| `POST /api/tesoreria/movimientos` | `tesoreria.js` | tipo enum, monto positivo |
| `POST /api/tesoreria/campanias` | `tesoreria.js` | nombre requerido |
| `PATCH /api/tesoreria/campanias/:id/aportar` | `tesoreria.js` | monto positivo |
| `POST /api/cuenta/recuperar` | `cuenta.js` | email valido |
| `POST /api/cuenta/recuperar/confirmar` | `cuenta.js` | email + codigo 6 digitos + password |
| `PATCH /api/cuenta/email` | `cuenta.js` | email opcional valido |
| `PATCH /api/cuenta/password` | `cuenta.js` | nueva password min 4 |

**Actualizacion (segunda pasada, ver seccion "Pendientes resueltos" al final
del informe): se migro el resto de routers a `validar()`/zod.** Quedan
`recordatorios.js` y `obispo.js` sin cambios porque no tienen ningun
POST/PATCH con body (recordatorios solo tiene `POST /generar` sin body;
obispo.js es 100% de solo lectura, GET).

**SQL**: se audito el codigo buscando concatenacion de input de usuario en
SQL. **No se encontro ninguna.** Todas las queries usan
`db.prepare(...).get/all/run(...)` con parametros `?`. Los unicos usos de
template strings dentro de `db.prepare()` (`db.js` linea 460/463 —
`PRAGMA table_info(${tabla})`/`ALTER TABLE ${tabla}`, `seed.js` linea 18 —
`DELETE FROM ${t}`, `push.js` linea 37 — placeholders `?` generados por
cantidad de IDs, `tesoreria.js` linea 25 — fragmento de condicion SQL fijo
pasado por codigo interno) son **nombres de tabla/columna fijos definidos en
el propio codigo**, nunca valores que vengan de `req.body`/`req.query`/
`req.params`. No requirieron cambios.

**Estado: parcial** (auth + admin + tesoreria + cuenta cubiertos con zod;
resto de routers pendiente, sin regresion de seguridad porque conservan sus
validaciones manuales previas).

---

## 4. Headers de seguridad (`helmet`)

Se audito `web/index.html` y `web/app.js` antes de configurar la CSP:

- `index.html` tiene un `<script>` inline (registro del service worker) y
  varios atributos `onclick="..."` inline.
- `web/app.js` genera HTML con `onclick=`/`onkeydown=`/`onchange=` inline
  (151 + 10 ocurrencias) y `style="..."` inline (335 ocurrencias) — el
  frontend entero se construye con esos patrones.
- `index.html`/`inscribir.html`/`kiosko.html` cargan tipografia de
  **Google Fonts** (`https://fonts.googleapis.com` para el CSS,
  `https://fonts.gstatic.com` para los archivos de fuente).
- `web/styles.css` usa un `background-image: url("data:image/svg+xml,...")`
  (icono inline en CSS).
- **No se encontro `EventSource`/SSE en esta rama** (es una feature de la
  rama de chat, no presente en `main`). `connect-src 'self'` ya cubre
  `fetch()` a `/api` y `/uploads` (mismo origen); si se agrega SSE en el
  futuro seguira funcionando porque tambien cae bajo `connect-src`.

Con esa evidencia, la CSP en `server.js` (helmet, `useDefaults: false` para
tener control total) quedo:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data:;
connect-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'self';
```

`'unsafe-inline'` en `script-src`/`style-src` es necesario por el uso real
descrito arriba (migrar a nonces/hashes implicaria reescribir todo
`app.js` y no es parte de esta tarea; queda como mejora futura si se quiere
endurecer mas). Ademas helmet deja activos por defecto:
`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (+
`frame-ancestors 'self'` en la CSP), `Strict-Transport-Security` (maxAge 180
dias + includeSubDomains — solo tiene efecto real sobre HTTPS; en HTTP/dev el
navegador lo ignora, no rompe nada), `Referrer-Policy: no-referrer`,
`X-DNS-Prefetch-Control`, `X-Download-Options`, `X-Permitted-Cross-Domain-Policies`,
`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`.

**Verificado que la app sigue funcionando** (ver seccion de evidencia): `/`
sirve `index.html` 200 con las cabeceras presentes, `/api/health` 200 con las
mismas cabeceras, login funciona end-to-end con el token resultante.

**Estado: aplicado.**

---

## 5. Autenticacion y sesiones

- **CSRF: N/A.** La app usa JWT en el header `Authorization: Bearer <token>`
  (`backend/src/auth.js`, `authMiddleware`), **no cookies de sesion**. CSRF
  clasico depende de que el navegador adjunte automaticamente credenciales
  (cookies) a peticiones cross-site; como el token va en un header que solo
  el JS de la propia app adjunta explicitamente, un sitio malicioso no puede
  forzar al navegador a incluirlo. No se anadio proteccion CSRF (tokens
  anti-CSRF, `SameSite`, etc.) porque no aplica al modelo, y no se convirtio
  el esquema a cookies de sesion (se preservo el modelo JWT existente tal
  cual, como exige la tarea).
- **Contrasenas**: siguen hasheadas con `bcryptjs` (`hashPassword`/
  `verifyPassword` en `auth.js`) — no se tocaron.
- **Cookies**: no se anadio ninguna cookie. Si en el futuro se necesitara
  alguna (p.ej. para un refresh token), deberia ser `httpOnly` + `secure` +
  `sameSite`, pero hoy no hace falta y no se introdujo.
- **JWT_SECRET**: sigue siendo obligatorio en produccion (punto 2), con
  fallback de desarrollo (`dev-solo-local-cambia-esto`) inalterado.

**Estado: N/A donde corresponde (CSRF/cookies), resto conservado tal cual.**

---

## 6. Logging de seguridad

Todo con prefijo `[seguridad]`, sin contrasenas/tokens/datos personales:

- **Logins fallidos**: `server.js`, en el `catch` de `POST /api/login` →
  `[seguridad] login fallido: iglesia="..." usuario="..." ip=...` (nunca la
  contrasena; iglesia/usuario son identificadores de cuenta, no email/telefono).
- **Rate limit excedido**: los 3 `handler` en `seguridad.js` →
  `[seguridad] rate-limit {general|login|sensible} excedido: ip=... ruta=...`.
- **Inputs rechazados por zod**: `validar()` en `seguridad.js` →
  `[seguridad] entrada rechazada: <METODO> <ruta> - campos invalidos: <lista de nombres de campo>`
  (nunca el valor recibido).

**Estado: aplicado.**

---

## Evidencia: la app sigue arrancando y sirviendo

Comandos ejecutados (Windows, Git Bash) y resultados clave:

```
$ cd backend && npm install express-rate-limit helmet zod
added 112 packages ... found 0 vulnerabilities

$ SEED_ON_EMPTY=1 JWT_SECRET=test PORT=3210 node src/server.js
[db] Esquema listo (SQLite: iglesia.db)
[push] VAPID no configurado (...) -> push real desactivado; ...
[mail] SMTP no configurado (...) -> el correo de recuperacion no se enviara.
[seed] BD vacía → sembrando datos de demo…
[server] API escuchando en el puerto 3210

$ curl -s -D - http://localhost:3210/api/health
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self';script-src 'self' 'unsafe-inline';...
Strict-Transport-Security: max-age=15552000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
RateLimit-Limit: 100
{"ok":true,"mensaje":"Backend de la iglesia funcionando","hora":"..."}

$ curl -s -D - http://localhost:3210/
HTTP/1.1 200 OK
Content-Security-Policy: ... (mismas cabeceras)
Content-Type: text/html; charset=UTF-8
```

Login + rate limit (6 peticiones a `/api/login` desde la misma IP: la primera
fue el login valido y quedo contabilizada; luego una peticion con body
invalido; luego 3 con password incorrecta → la 6ta peticion total ya da 429):

```
POST /api/login (correcto)                         -> 200 {token,...}
POST /api/login (body invalido, {"iglesia":""})     -> 400 {"error":"Datos invalidos: revisa iglesia, usuario, password"}
POST /api/login (password mala) x3                  -> 401,401,401
POST /api/login (password mala) x3 mas               -> 429,429,429
```

Log del servidor durante esa prueba:
```
[seguridad] entrada rechazada: POST /api/login - campos invalidos: iglesia, usuario, password
[seguridad] login fallido: iglesia="MONTESION" usuario="pastor" ip=::1
[seguridad] login fallido: iglesia="MONTESION" usuario="pastor" ip=::1
[seguridad] login fallido: iglesia="MONTESION" usuario="pastor" ip=::1
[seguridad] rate-limit login excedido: ip=::1
[seguridad] rate-limit login excedido: ip=::1
[seguridad] rate-limit login excedido: ip=::1
```

Flujo admin + tesoreria de extremo a extremo (servidor nuevo, DB limpia):

```
POST /api/admin/usuarios {nombre,usuario,password}          -> 200 {"ok":true,"id":12}
POST /api/admin/usuarios {nombre,usuario}  (sin password)   -> 400 {"error":"Datos invalidos: revisa password"}
POST /api/tesoreria/movimientos como pastor (no tesorero)   -> 403 {"error":"Solo el tesorero puede registrar..."}
POST /api/tesoreria/movimientos como tesorero, monto:-5     -> 400 {"error":"Datos invalidos: revisa monto"}
POST /api/tesoreria/movimientos como tesorero, monto:100    -> 200 {"ok":true}
GET  /api/tesoreria/resumen x12 seguidos                    -> 200 x12 (no se bloquea: confirma el trade-off del punto 1)
GET  /api/admin/datos x12 seguidos                          -> 200 hasta agotar la cuota de 10, despues 429 (limite sensible activo en admin)
```

Arranque en produccion sin `JWT_SECRET` (debe fallar, y falla):

```
$ NODE_ENV=production node src/server.js
Error: [seguridad] Faltan variables de entorno requeridas en produccion: JWT_SECRET.
Definelas antes de arrancar (no se usan valores por defecto en produccion).
```

---

## Pruebas anadidas (`backend/test/seguridad.test.js`, runner nativo `node:test`)

Arranca el servidor real como proceso hijo (con `DB_PATH` temporal propio y
`SEED_ON_EMPTY=1`, puerto 3931 fijo) porque `server.js` no exporta el objeto
`app` (llama `app.listen` directamente); usa `fetch` nativo contra el proceso
levantado y lo mata al terminar.

```
$ npm test
✔ GET /api/health responde 200 con las cabeceras de seguridad de helmet
✔ GET / (index.html) responde 200
✔ POST /api/login con body invalido responde 400 (validacion zod)
✔ POST /api/login con credenciales correctas funciona (200 + token)
✔ POST /api/admin/usuarios con body invalido responde 400 (validacion zod en endpoint sensible)
✔ POST /api/login: al superar 5 peticiones/IP en la ventana, responde 429
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

---

## Pendientes / trabajo futuro sugerido

1. ~~Migrar el resto de routers ... a `validar()`/zod.~~ **RESUELTO** (ver
   seccion "Pasada 2" mas abajo): se migraron los 14 routers restantes que
   tenian POST/PATCH con body. Detalle completo en la tabla de la seccion
   siguiente.
2. ~~Considerar aplicar un rate limit mas estricto tambien a
   `POST /api/cuenta/recuperar` y `/recuperar/confirmar`.~~ **RESUELTO**: se
   aplico `limiterLogin` (el mismo limitador de `/api/login`, 5 req/IP/15min)
   a ambas rutas. Ver detalle mas abajo.
3. ~~Verificar con Playwright que la CSP no rompe nada en un navegador
   real.~~ **RESUELTO**: se probo login + Tesoreria + Administracion con
   Playwright; cero errores de CSP en consola, cero ajustes necesarios en
   `server.js`. Ver detalle mas abajo.
4. El limite sensible de `/api/admin` (10 req/15min, todo el router) puede
   agotarse rapido en una sesion de administracion pesada (crear varios
   usuarios y asignar varios roles seguidos). Es el comportamiento pedido
   explicitamente por la politica; si en el uso real resulta molesto, se
   podria subir el limite o aplicarlo solo a las rutas mutantes (mismo
   criterio que se uso para tesoreria). **Sigue pendiente a proposito** (decision
   ya tomada y aceptada, no forma parte de esta pasada).

---

## Pasada 2: cierre de los pendientes 1-3

### 1. Migracion de los 14 routers restantes a `validar()`/zod

Se aplico el mismo patron ya usado en `admin.js`/`tesoreria.js`/`cuenta.js`:
un schema `zod` por endpoint que replica fielmente la validacion manual que
ya existia (`if (!x) return 400 {...}`), montado como middleware
`validar(schema)` antes del handler. La logica que depende de la base de
datos (permisos, "ya existe", pertenencia a la iglesia, etc.) se dejo tal
cual en el handler, despues de que zod ya valido la forma del body.

`recordatorios.js` y `obispo.js` **no se tocaron**: `recordatorios.js` solo
tiene `POST /generar` sin body, y `obispo.js` es 100% de solo lectura (GET).
No hay ningun endpoint con body sin cubrir.

| Endpoint | Archivo | Notas |
|---|---|---|
| `POST /api/eventos` | `eventos.js` | grupo_id/titulo/fecha requeridos |
| `PATCH /api/eventos/:id/rechazar` | `eventos.js` | motivo opcional |
| `PATCH /api/eventos/:id` | `eventos.js` | todos los campos opcionales |
| `POST /api/anuncios` | `anuncios.js` | titulo requerido, segmento tipado (todos/grupo/rol) |
| `PATCH /api/anuncios/:id` | `anuncios.js` | todos los campos opcionales |
| `POST /api/asignaciones` | `asignaciones.js` | evento_id/persona_id requeridos, tipo en enum |
| `PATCH /api/asignaciones/:id` | `asignaciones.js` | accion/motivo opcionales |
| `POST /api/asistencia/evento/:id` | `asistencia.js` | presentes: array de ids numericos |
| `POST /api/musica/canciones` | `musica.js` | titulo requerido |
| `PATCH /api/musica/canciones/:id` | `musica.js` | todos opcionales |
| `POST /api/musica/setlist/:eventoId` | `musica.js` | cancion_id requerido |
| `POST /api/musica/plan/:eventoId/equipo` | `musica.js` | persona_id requerido |
| `POST /api/musica/plan/:eventoId/ensayo` | `musica.js` | todos opcionales |
| `POST /api/musica/material` | `musica.js` | titulo + archivo_url requeridos |
| `POST /api/cuidado` | `cuidado.js` | persona_id requerido |
| `POST /api/cuidado/:id/contacto` | `cuidado.js` | tipo/nota opcionales |
| `POST /api/ninos/clases` | `ninos.js` | nombre requerido |
| `POST /api/ninos/ninos` | `ninos.js` | clase_id/nombre requeridos |
| `POST /api/ninos/material` | `ninos.js` | clase_id/titulo requeridos |
| `POST /api/ninos/asistencia` | `ninos.js` | clase_id/fecha requeridos, presentes: array de {nino_id, retiro_por?} |
| `POST /api/facial/inscribir` | `facial.js` | persona_id requerido, image: string min(1) sin limite de largo (imagenes base64) |
| `POST /api/facial/reconocer` | `facial.js` | image requerida |
| `POST /api/sermones` | `sermones.js` | titulo requerido, puntos: array de strings |
| `PATCH /api/sermones/:id` | `sermones.js` | todos opcionales |
| `POST /api/sermones/:id/notas` | `sermones.js` | texto requerido, origen en enum |
| `PATCH /api/sermones/notas/:notaId` | `sermones.js` | texto/comentario opcionales |
| `POST /api/devocional` | `devocional.js` | titulo requerido |
| `PATCH /api/devocional/:id` | `devocional.js` | todos opcionales |
| `POST /api/grupo/:gid/drive` | `grupo.js` | url opcional, formato https:// validado con `.refine()` |
| `POST /api/grupo/:gid/miembros` | `grupo.js` | persona_id requerido |
| `POST /api/grupo/:gid/recursos` | `grupo.js` | titulo/url requeridos |
| `POST /api/grupo/:gid/avisos` | `grupo.js` | titulo requerido |
| `POST /api/grupo/:gid/avisar` | `grupo.js` | titulo requerido, persona_id opcional |
| `POST /api/grupo/:gid/tareas` | `grupo.js` | persona_id/titulo requeridos |
| `POST /api/predica` | `predica.js` | titulo requerido |
| `PATCH /api/predica/:id` | `predica.js` | todos opcionales |
| `POST /api/predica/:id/recurso` | `predica.js` | titulo requerido |
| `POST /api/predica/predicadores` | `predica.js` | persona_id/desde/hasta requeridos |
| `POST /api/push/suscribir` | `push.js` | endpoint + keys.p256dh + keys.auth requeridos |
| `POST /api/push/baja` | `push.js` | endpoint opcional |
| `POST /api/notificaciones/segmentada` | `notificaciones.js` | titulo requerido, segmento tipado |

**Verificacion**: cada endpoint de la tabla se probo con curl (servidor local
`SEED_ON_EMPTY=1 JWT_SECRET=test`) con al menos un caso invalido (400 por
zod) y un caso valido (200, usando el usuario con el rol correcto cuando el
endpoint es exclusivo de un rol — p.ej. `joaquin`/lider_musica para
`musica.js`, `marta`/lider_ed para `ninos.js`). Todos respondieron como se
esperaba. `npm test` se corrio despues de cada 3-4 archivos migrados; se
mantuvo en verde durante todo el proceso.

### 2. Rate limit en recuperacion de contrasena

`POST /api/cuenta/recuperar` y `POST /api/cuenta/recuperar/confirmar` ahora
montan `limiterLogin` (el mismo limitador ya usado en `/api/login`, 5
req/IP/15 min) ademas de `validar()`. Decision: **reusar el limitador
existente en vez de crear uno nuevo**, porque el perfil de riesgo es
identico al de login (credenciales/codigos de acceso, mismo endpoint
publico sin auth) y 5 intentos/15min es razonable tanto para pedir un codigo
como para probarlo — un feligres real que se equivoca una vez no se ve
afectado, pero un atacante que intenta fuerza bruta sobre el codigo de 6
digitos (1 millon de combinaciones) queda frenado con creces.

**Nota importante sobre el comportamiento**: `express-rate-limit` cuenta por
IP, no por ruta, y como es el **mismo objeto limitador** (`limiterLogin`)
montado en `/api/login`, `/api/cuenta/recuperar` y
`/api/cuenta/recuperar/confirmar`, las tres rutas **comparten el mismo
cupo de 5 peticiones/15min por IP**. Es decir, alguien que ya gasto su cupo
intentando loguearse tambien queda bloqueado temporalmente de pedir
recuperacion de contrasena (y viceversa). Se considero deliberadamente: son
todas rutas de "acceso a la cuenta" con el mismo perfil de riesgo, y
mantenerlas en un solo cupo compartido es mas simple y mas estricto (mejor
para seguridad) que separarlas — el costo en UX es minimo (5 intentos entre
las tres rutas combinadas siguen alcanzando para un uso normal).

Verificado con curl: 6 peticiones seguidas a `/api/cuenta/recuperar` desde la
misma IP → las primeras 5 pasan la validacion (400 con email invalido, o 503
por SMTP no configurado en el entorno de prueba — logica de negocio, no rate
limit), la 6ta responde
`429 {"error":"Demasiados intentos de acceso. Espera unos minutos e intentalo de nuevo."}`.
Tambien se agrego un test nuevo en `seguridad.test.js` que confirma esto
(ver seccion de pruebas mas abajo).

### 3. Verificacion en navegador real (Playwright) de la CSP

Se uso la skill `webapp-testing` para levantar el servidor
(`SEED_ON_EMPTY=1 JWT_SECRET=test`) y automatizar un navegador Chromium
headless real:

1. Cargar `/` → formulario de login (wizard de 3 pasos: iglesia → usuario →
   contraseña).
2. Login con `MONTESION` / `pastor` / `1234` (credenciales de seed) → llega
   al dashboard ("Inicio") con datos reales (proximo evento, notificaciones,
   anuncios).
3. Navegar a **Tesoreria** → carga saldo ($2,100), campañas, transparencia y
   movimientos reales, todo renderizado con estilos.
4. Navegar a **Administracion** → carga la lista completa de usuarios con
   sus roles, los 4 grupos/ministerios y la tabla de roles y accesos, todo
   renderizado con estilos.

En las 4 pantallas se capturo la consola del navegador completa (todos los
niveles: log/warn/error) y se busco especificamente cualquier mensaje con
"Content-Security-Policy" o "Refused to". **Resultado: consola vacia en las
4 pantallas, cero violaciones de CSP.** Las capturas de pantalla confirman
visualmente que las pantallas cargan con estilos y datos (no en blanco).

**No se necesito ningun ajuste a la CSP de `server.js`.** La configuracion
existente (`'unsafe-inline'` en script-src/style-src, Google Fonts en
style-src/font-src) ya cubria exactamente lo que el frontend real usa, tal
como se habia auditado en la Pasada 1.

---

## Commits en `feat/seguridad`

Ver `git log` de la rama para el detalle. Pasada 1: dependencias + modulo de
seguridad (rate limit + validar), cabeceras helmet en server.js + login,
validacion zod en admin, validacion zod en tesoreria + trade-off de rate
limit, validacion zod en cuenta, `.env.example` + chequeo de env vars, y
pruebas `node:test`. Pasada 2: migracion a zod del resto de routers (en
varios commits agrupados por modulos relacionados), rate limit en
recuperacion de contrasena, y este informe actualizado.
