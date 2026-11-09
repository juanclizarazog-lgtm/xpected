# Xpected · imagen para cualquier hosting con Docker (Render, Railway, Fly.io, un VPS…). Sin dependencias: solo Node.
FROM node:22-alpine

WORKDIR /app
COPY . .
# data/ se llena sola al arrancar (con los datos iniciales de lib/seed/); debe poder escribirse
RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV NODE_ENV=production PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1

CMD ["node", "server.js"]
