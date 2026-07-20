# ============================================================
#  App de Iglesia — imagen de producción (Node + Express + SQLite)
#  El backend sirve también el frontend estático (carpeta web/).
# ============================================================
FROM node:24-slim

WORKDIR /app

# 0) Litestream: réplica continua del SQLite a un bucket S3-compatible (R2).
#    Se instala el binario oficial (transparente para la app).
# 0b) rclone: respaldo continuo de la carpeta de uploads al mismo bucket R2
#    (mismo enfoque: binario oficial, sin tocar la app). Versión fija para
#    builds reproducibles.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSL https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz \
    | tar -xz -C /usr/local/bin litestream \
 && curl -fsSL -o /tmp/rclone.deb https://downloads.rclone.org/v1.74.4/rclone-v1.74.4-linux-amd64.deb \
 && dpkg -i /tmp/rclone.deb \
 && rm -f /tmp/rclone.deb \
 && apt-get purge -y curl && apt-get autoremove -y && apt-get clean && rm -rf /var/lib/apt/lists/*

# 1) Dependencias del backend (con lockfile = build reproducible)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# 2) Código: backend + frontend estático
COPY backend ./backend
COPY web ./web

# 3) Config de Litestream + entrypoint
COPY litestream.yml /etc/litestream.yml
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=3000
# BD local (efímera en free); Litestream la respalda/restaura desde R2.
ENV DB_PATH=/data/iglesia.db
# Uploads (efímeros en free); rclone los respalda/restaura desde R2 (subcarpeta uploads/).
ENV UPLOADS_DIR=/data/uploads

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
