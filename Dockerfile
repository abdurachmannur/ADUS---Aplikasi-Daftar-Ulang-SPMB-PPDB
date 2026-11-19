# ==============================================================================
# Stage 1: Build Frontend & Compile Native Dependencies (better-sqlite3)
# ==============================================================================
FROM node:26-alpine AS builder
WORKDIR /app

# Toolchain untuk kompilasi native module better-sqlite3 pada Alpine Linux
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

COPY . .
RUN npm run build

# Hapus devDependencies agar image produksi tetap ringan
RUN npm prune --omit=dev

# ==============================================================================
# Stage 2: Lightweight Production Runtime (Node 26 Alpine + Persistent Volumes)
# ==============================================================================
FROM node:26-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Jakarta
ENV SQLITE_DB_PATH=/app/data/spmb.db
ENV UPLOADS_DIR=/app/uploads

RUN apk add --no-cache tzdata

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/assets ./src/assets

# Direktori data, auto-backup & unggahan persisten (dimount melalui Docker Volume)
RUN mkdir -p /app/data/backups /app/uploads/images /app/uploads/documents

VOLUME ["/app/data", "/app/uploads"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
