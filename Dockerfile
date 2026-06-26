# ============================================================
#  App de Iglesia — imagen de producción (Node + Express + SQLite)
#  El backend sirve también el frontend estático (carpeta web/).
# ============================================================
FROM node:24-slim

WORKDIR /app

# 1) Dependencias del backend (con lockfile = build reproducible)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# 2) Código: backend + frontend estático
COPY backend ./backend
COPY web ./web

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=3000
# BD y archivos subidos en /data → monta ahí un disco persistente
ENV DB_PATH=/data/iglesia.db
ENV UPLOADS_DIR=/data/uploads

EXPOSE 3000
CMD ["node", "src/server.js"]
