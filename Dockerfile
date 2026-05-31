# node:20-slim (Debian/glibc) lets better-sqlite3 and sharp use pre-built
# binaries — npm ci takes ~90s instead of 25+ min on Alpine/musl.
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js .
COPY scripts/ scripts/
COPY public/ public/
COPY icons_cut/ icons_cut/

ENV DATA_DIR=/data
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
