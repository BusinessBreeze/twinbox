# syntax=docker/dockerfile:1
# glibc, not alpine: libsql selects its native binding at runtime from platform/arch/libc,
# which Nitro's static dependency trace cannot evaluate. On alpine it bundled the glibc
# binding and died with "Cannot find module '@libsql/linux-x64-musl'". A glibc base matches
# what the trace bundles on x64. See the COPY in the runner stage for the arm64 half.
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

# Nitro's trace cannot resolve libsql's runtime-selected native binding, and what it bundles
# depends on the build arch: on x64 it happens to include @libsql/linux-x64-gnu, on arm64 it
# includes no binding at all, so the app dies with
#   Cannot find module '@libsql/linux-arm64-gnu'
# Overlay the bindings npm actually installed for this platform. Arch-agnostic by
# construction -- npm only installs the current platform's variants -- so this is correct
# unchanged on x86_64 and on aarch64 (DGX Spark, Pi 5). Do not "simplify" this away: the
# traced output looks complete on x64 and is silently empty on arm64.
COPY --from=builder /app/node_modules/@libsql ./.output/server/node_modules/@libsql

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
