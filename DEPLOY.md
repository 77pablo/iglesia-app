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
