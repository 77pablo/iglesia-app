# Informe de Seguridad — App de Iglesia (backend)

Rama: `feat/seguridad` (worktree `app-seguridad`, basada en `main` sin la feature de chat).
Fecha: 2026-07-20.

## Resumen ejecutivo

Se aplicaron las 6 areas de la politica de seguridad al backend (rate limiting,
variables de entorno, validacion de inputs con zod, cabeceras de seguridad con
helmet, revision de autenticacion/sesiones, y logging de seguridad), sin romper
la app existente. El servidor arranca, `/` y `/api/health` responden 200 con
las cabeceras de helmet, el login sigue funcionando y el rate limit de login
da 429 tras superar el limite. Se anadieron 6 pruebas con `node:test`, todas
en verde.

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

**Pendiente (no cubierto en esta pasada, documentado para priorizar despues):**
`eventos.js`, `anuncios.js`, `asignaciones.js`, `asistencia.js`, `musica.js`,
`cuidado.js`, `ninos.js`, `facial.js`, `sermones.js`, `devocional.js`,
`recordatorios.js`, `grupo.js`, `predica.js`, `obispo.js`, `push.js`,
`notificaciones.js`. Todos siguen con sus validaciones manuales (`if (!x) return
400`) que ya existian y siguen funcionando — no quedaron sin ninguna
validacion, solo sin migrar al middleware `validar()`/zod. Se prioriza asi
por instruccion explicita ("prioriza auth + sensibles + los POST con body
principales; no hace falta cubrir el 100% de una vez").

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

1. Migrar el resto de routers (eventos, anuncios, musica, grupo, ninos,
   sermones, predica, obispo, cuidado, asistencia, asignaciones, push,
   notificaciones, recordatorios, facial, devocional) a `validar()`/zod.
   Hoy conservan sus validaciones manuales, funcionales pero menos
   consistentes/estrictas que zod.
2. Considerar aplicar un rate limit mas estricto tambien a
   `POST /api/cuenta/recuperar` y `/recuperar/confirmar` (hoy solo cubiertos
   por el limitador general de 100/15min) ya que son endpoints publicos de
   recuperacion de contrasena, superficie clasica de abuso.
3. Si se quiere endurecer la CSP mas alla de `'unsafe-inline'`, requeriria
   una refactorizacion del frontend (mover `onclick`/`style` inline a
   listeners/clases CSS y usar nonces) — no forma parte de esta tarea de
   backend.
4. El limite sensible de `/api/admin` (10 req/15min, todo el router) puede
   agotarse rapido en una sesion de administracion pesada (crear varios
   usuarios y asignar varios roles seguidos). Es el comportamiento pedido
   explicitamente por la politica; si en el uso real resulta molesto, se
   podria subir el limite o aplicarlo solo a las rutas mutantes (mismo
   criterio que se uso para tesoreria).

---

## Commits en `feat/seguridad`

Ver `git log` de la rama para el detalle; en resumen, se hicieron commits
logicos separados para: dependencias + modulo de seguridad (rate limit +
validar), cabeceras helmet en server.js + login, validacion zod en admin,
validacion zod en tesoreria + trade-off de rate limit, validacion zod en
cuenta, `.env.example` + chequeo de env vars, y pruebas `node:test`.
