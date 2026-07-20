#!/bin/sh
# ============================================================
#  Entrypoint del contenedor.
#  - Si hay R2 configurado (bucket R2 + llaves LITESTREAM_*):
#      1) Litestream restaura el iglesia.db desde R2 (si existe
#         respaldo) y la app arranca bajo replicación continua.
#      2) rclone restaura la carpeta de uploads (UPLOADS_DIR) desde
#         R2 (si existe respaldo) y queda sincronizándola en segundo
#         plano cada ~30s (respaldo continuo, en paralelo a Litestream,
#         mismo bucket, subcarpeta "uploads").
#  - Si NO está configurado: arranca la app normal (degrada con
#    elegancia; no rompe el deploy si aún no pusiste las llaves, y
#    no instala/usa rclone en absoluto).
# ============================================================
set -e

: "${DB_PATH:=/data/iglesia.db}"
: "${UPLOADS_DIR:=/data/uploads}"
mkdir -p "$(dirname "$DB_PATH")"
mkdir -p "$UPLOADS_DIR"

if [ -n "$R2_BUCKET" ] && [ -n "$LITESTREAM_ACCESS_KEY_ID" ] && [ -n "$R2_ENDPOINT" ]; then
  echo "[litestream] restaurando $DB_PATH desde R2 (si hay respaldo)..."
  litestream restore -if-replica-exists -config /etc/litestream.yml "$DB_PATH" \
    || echo "[litestream] sin respaldo previo; se parte de una BD nueva"

  # --- rclone: persistencia de UPLOADS_DIR en el mismo bucket R2 -----------
  # Remote "R2" configurado por variables de entorno (sin archivo de config,
  # reutiliza las mismas llaves que ya usa Litestream).
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$LITESTREAM_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$LITESTREAM_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
  export RCLONE_CONFIG_R2_REGION=auto

  echo "[rclone] restaurando $UPLOADS_DIR desde R2:$R2_BUCKET/uploads (si hay respaldo)..."
  # No usamos "|| true" silencioso: el mensaje de rclone (si lo hay) ya salió
  # por stderr arriba, así un error real de conexión/credenciales queda
  # visible en los logs y no se confunde con "carpeta vacía" (caso normal
  # la primera vez que se despliega).
  rclone copy "R2:$R2_BUCKET/uploads" "$UPLOADS_DIR" \
    || echo "[rclone] restauracion de uploads con error o sin respaldo previo (ver detalle arriba); se continua con lo que haya en disco"

  echo "[rclone] iniciando respaldo periodico de $UPLOADS_DIR -> R2:$R2_BUCKET/uploads (cada 30s, en background)..."
  (
    while true; do
      sleep 30
      rclone sync "$UPLOADS_DIR" "R2:$R2_BUCKET/uploads" \
        || echo "[rclone] fallo el respaldo periodico de uploads (revisa conexion/credenciales R2)"
    done
  ) &

  echo "[litestream] arrancando app con replicacion continua a R2..."
  exec litestream replicate -config /etc/litestream.yml -exec "node src/server.js"
else
  echo "[litestream] no configurado (faltan R2_*/LITESTREAM_*); arranque normal SIN persistencia externa (uploads y BD son efimeros)"
  exec node src/server.js
fi
