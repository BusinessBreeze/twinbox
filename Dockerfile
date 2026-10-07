# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application source
COPY . .

# Build Nuxt/Nitro standalone server
RUN npm run build

# --- Production Runner ---
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Copy compiled standalone output
COPY --from=builder /app/.output ./.output

# Create data directory for SQLite database persistence
RUN mkdir -p /app/.data

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
