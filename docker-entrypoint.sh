#!/bin/sh
# ============================================================
#  Entrypoint del contenedor.
#  - Si Litestream está configurado (hay bucket R2 + llaves):
#      1) restaura el iglesia.db desde R2 (si existe respaldo)
#      2) arranca la app bajo replicación continua
#  - Si NO está configurado: arranca la app normal (degrada con
#    elegancia; no rompe el deploy si aún no pusiste las llaves).
# ============================================================
set -e

: "${DB_PATH:=/data/iglesia.db}"
mkdir -p "$(dirname "$DB_PATH")"

if [ -n "$R2_BUCKET" ] && [ -n "$LITESTREAM_ACCESS_KEY_ID" ] && [ -n "$R2_ENDPOINT" ]; then
  echo "[litestream] restaurando $DB_PATH desde R2 (si hay respaldo)..."
  litestream restore -if-replica-exists -config /etc/litestream.yml "$DB_PATH" \
    || echo "[litestream] sin respaldo previo; se parte de una BD nueva"
  echo "[litestream] arrancando app con replicacion continua a R2..."
  exec litestream replicate -config /etc/litestream.yml -exec "node src/server.js"
else
  echo "[litestream] no configurado (faltan R2_*/LITESTREAM_*); arranque normal SIN persistencia externa"
  exec node src/server.js
fi
