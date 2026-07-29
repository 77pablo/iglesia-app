# 🚀 Despliegue profesional — App de Iglesia

La app es un backend Node + Express que **también sirve el frontend** (carpeta `web/`).
Base de datos: **SQLite** (archivo). Con Docker queda lista para Render, Railway o Fly.io con **HTTPS**.

> Carpeta a desplegar: **`app/`** (este directorio). El `Dockerfile`, `render.yaml`, `.dockerignore` y `.gitignore` ya están aquí.

---

## 1) Subir el código a GitHub (una vez)
Desde `App-Iglesia/app`:
```bash
git init
git add .
git commit -m "App de Iglesia - listo para deploy"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/iglesia-app.git
git push -u origin main
```
*(El `.gitignore` ya evita subir `node_modules`, la BD local y los uploads.)*

---

## 2A) Render (recomendado, 1-click con Blueprint)
1. Entra a https://render.com → **New + → Blueprint**.
2. Conecta el repo. Render detecta `render.yaml`.
3. **Root Directory:** `app` (si subiste todo el proyecto) o déjalo en `/` si el repo es solo `app/`.
4. Deploy. Render:
   - construye con el `Dockerfile`,
   - genera `JWT_SECRET` automáticamente,
   - siembra datos de demo (`SEED_ON_EMPTY=1`),
   - expone una URL `https://iglesia-app.onrender.com`.
5. **Disco persistente:** el bloque `disk` en `render.yaml` requiere **plan de pago**. En **plan free**, coméntalo: los datos se reinician al reiniciar el servicio, pero se vuelven a sembrar solos.

## 2B) Railway
1. https://railway.app → **New Project → Deploy from GitHub repo**.
2. Railway detecta el `Dockerfile`. En **Settings → Root Directory** pon `app`.
3. **Variables**: agrega `JWT_SECRET` (un texto largo aleatorio) y `SEED_ON_EMPTY=1`. Para persistencia, añade un **Volume** montado en `/data` y define `DB_PATH=/data/iglesia.db`, `UPLOADS_DIR=/data/uploads`.
4. Deploy → te da una URL HTTPS pública.

## 2C) Fly.io
```bash
cd app
fly launch            # detecta el Dockerfile; di NO a Postgres
fly volumes create data --size 1
# en fly.toml: [mounts] source="data" destination="/data"
fly secrets set JWT_SECRET="<texto-largo-aleatorio>" SEED_ON_EMPTY=1
fly deploy
```

---

## 3) Variables de entorno
| Variable | Para qué | Ejemplo |
|---|---|---|
| `JWT_SECRET` | **Obligatoria en producción.** Firma los tokens. | (texto largo aleatorio) |
| `PORT` | Puerto (lo define el host). | `3000` |
| `DB_PATH` | Ruta de la BD SQLite (disco persistente). | `/data/iglesia.db` |
| `UPLOADS_DIR` | Carpeta de archivos subidos (comprobantes, material). | `/data/uploads` |
| `SEED_ON_EMPTY` | Si `=1`, siembra datos de demo cuando la BD está vacía. | `1` |
| `CORS_ORIGIN` | (Opcional) orígenes permitidos, separados por coma. No hace falta si todo es mismo dominio. | |
| `R2_*` / `LITESTREAM_*` | **Las cuatro de la persistencia. Sin ellas cada reinicio borra la BD** → ver **3B**. | |
| `SUPERADMIN_PASSWORD` | Contraseña del super-admin. Sin ella sigue vigente la anterior. | (contraseña fuerte) |

---

## 3B) 🔴 Persistencia real: Cloudflare R2 + Litestream (IMPRESCINDIBLE)

**Sin esto, cada reinicio del servicio borra la base de datos y los archivos subidos.** En el plan free de Render el disco `/data` es efímero: no es un riesgo teórico, pasa en cada redeploy y cada vez que el servicio se duerme y despierta.

> ℹ️ **En este despliegue ya está montado:** el bucket es **`iglesia-app-db`** en Cloudflare R2 y lleva tiempo en uso. Los pasos 1 y 2 de abajo son para un despliegue **nuevo** (u otra iglesia); si solo quieres saber si el respaldo funciona **hoy**, ve directo al **paso 4**.

`docker-entrypoint.sh` mira **tres** variables al arrancar. Si están, restaura la BD desde R2 y arranca replicando en continuo con Litestream, además de sincronizar los archivos subidos con `rclone` cada 30 s. Si falta cualquiera, escribe un aviso en el log y arranca **sin persistencia**.

### Paso 1 — Crear el bucket en Cloudflare R2
1. Cloudflare → **R2** → *Create bucket*. Un nombre cualquiera, p. ej. `iglesia-app`. Anótalo → será `R2_BUCKET`.
2. Apunta tu **Account ID** (aparece en el panel de R2). El endpoint es:
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` → será `R2_ENDPOINT`.

### Paso 2 — Crear el token de acceso
R2 → **Manage API Tokens** → *Create API token*, con permiso **Object Read & Write** sobre ese bucket. Al crearlo te muestra **una sola vez**:
- *Access Key ID* → `LITESTREAM_ACCESS_KEY_ID`
- *Secret Access Key* → `LITESTREAM_SECRET_ACCESS_KEY`

Si cierras esa pantalla sin copiarlas, no se pueden recuperar: hay que crear otro token.

### Paso 3 — Rellenarlas en Render
`render.yaml` ya las declara con `sync: false`, así que **en Render → servicio `iglesia-app` → Environment aparecen las cuatro, vacías**: no hay que crearlas, solo poner su valor.

| Variable | Valor |
|---|---|
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | el nombre del bucket |
| `LITESTREAM_ACCESS_KEY_ID` | el Access Key ID del token |
| `LITESTREAM_SECRET_ACCESS_KEY` | el Secret Access Key del token |

Guardar dispara un redeploy. **Cuidado con los espacios al pegar:** una clave con un espacio de más falla igual que una clave equivocada.

⚠️ **`LITESTREAM_SECRET_ACCESS_KEY` no se comprueba al arrancar.** El script solo mira las otras tres para decidir si replica; el secreto lo usa Litestream por dentro. Si lo olvidas, el contenedor arranca *creyendo* que replica, Litestream falla en silencio y el log de arranque **no** lo dice. Lo delata la tarjeta 💾 Respaldo, en rojo con "Litestream devolvió un error" — que es justo para lo que se construyó.

### Paso 4 — Comprobar que funcionó
Entra como super-admin y mira la tarjeta **💾 Respaldo**, lo primero del panel. No hace falta leer logs: para eso existe.

| Color | Qué significa |
|---|---|
| ✅ **Verde**, con fecha del último respaldo | Funciona. Ya está. |
| ⛔ **Rojo**, "faltan las variables…" | Alguna de las cuatro no llegó. Revisa que estén las **tres** que mira el arranque (`R2_ENDPOINT`, `R2_BUCKET`, `LITESTREAM_ACCESS_KEY_ID`). |
| ⛔ **Rojo**, "el respaldo va muy atrasado" / "Litestream devolvió un error" | Las variables están, pero R2 las rechaza: clave mal copiada, bucket mal escrito, o el token sin permiso de escritura. |
| ⚠️ **Ámbar**, "el servicio acaba de arrancar" | Espera un minuto y recarga: es el periodo de gracia. |
| ⚠️ **Ámbar**, "respuesta inesperada de Litestream" | Esa versión del binario imprime las columnas con otros nombres. Míralo con `litestream generations -config /etc/litestream.yml $DB_PATH` en la shell del contenedor y ajusta `interpretarGeneraciones` en `backend/src/persistencia.js`. |

La fila **"Archivos subidos"** se pone verde por su cuenta dentro del primer minuto: el bucle de `rclone` escribe su sello tras la primera sincronización correcta.

> **Ojo con el orden:** si ya tienes datos reales en producción **sin** respaldo configurado, el primer arranque con R2 restaura desde un bucket vacío y no encuentra nada — no borra lo que hay en disco, pero tampoco lo rescata si el servicio se reinicia antes de la primera réplica. Configúralo cuanto antes, no después de acumular datos que duelan.

---

## 4) Sembrar / resetear datos manualmente
En la consola del host (Render Shell, Railway, `fly ssh console`):
```bash
cd backend && npm run seed
```
⚠️ `seed` **borra** y recrea los datos de prueba.

---

## 5) ⚠️ Antes de usarlo en serio (no solo demo)
- **Cambia las contraseñas:** los usuarios de prueba usan `1234`. Para producción, crea usuarios reales / cambia los hashes (no dejes el seed de demo público).
- **Pon `SEED_ON_EMPTY=0`** una vez tengas datos reales (para que no intente sembrar).
- **Usa disco persistente** (`/data`) para no perder datos ni comprobantes.
- El **reconocimiento facial** (carpeta `facial/`, Python) es un servicio aparte en el puerto 5001 y **no** se incluye en este contenedor; las páginas `/inscribir.html` y `/kiosko.html` lo necesitan. Para producción se desplegaría como un servicio separado.
- HTTPS lo da el host automáticamente → el **service worker / modo offline (PWA)** ya funcionará (requiere HTTPS).
