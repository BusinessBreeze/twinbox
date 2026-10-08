# syntax=docker/dockerfile:1
# glibc, not alpine: libsql resolves its native binding at runtime, so Nitro's static
# dependency trace can't see which variant is needed and always bundles
# @libsql/linux-x64-gnu. On musl that fails with
#   Cannot find module '@libsql/linux-x64-musl'
# On a glibc base the bundled binding is the correct one. Multi-arch safe: the trace
# follows process.arch, so an arm64 build bundles @libsql/linux-arm64-gnu.
FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application source
COPY . .

# Build Nuxt/Nitro standalone server
RUN npm run build

# --- Production Runner ---
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

RUN mkdir -p /app/Artifacts

# Copy compiled standalone output
COPY --from=builder /app/.output ./.output

# NOTE: this image deliberately cannot migrate. NuxtHub only applies migrations during
# build and dev (applyMigrationsDuringBuild / applyMigrationsDuringDev) -- the build-time
# pass runs against the builder's throwaway /app/.data, and no migration code is bundled
# into .output at all. Migrations are a separate, explicit step run from the `builder`
# stage, which has the nuxt CLI and the full source:
#   docker compose run --rm migrate
# A fresh deploy must run that before the first `up`, or the app starts against an empty
# DB and fails with "no such table: roles".

EXPOSE 3000

# libsql opens file:/app/.data/db/sqlite.db (path baked at build time) and does not create
# intermediate dirs -> SQLITE_CANTOPEN (14). Create it at start rather than at build time,
# since the .data bind mount shadows anything the image created there.
CMD ["sh", "-c", "mkdir -p /app/.data/db && exec node .output/server/index.mjs"]
