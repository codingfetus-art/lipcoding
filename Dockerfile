# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Install all workspace deps using the lockfile for reproducible builds.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

# Build server (tsc) and web (vite).
COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV STATIC_DIR=/app/web/dist

# Production dependencies only. The GitHub Copilot CLI is bundled with the
# Node.js SDK, so no separate CLI install is required.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev

# Built artifacts.
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

EXPOSE 3001
CMD ["node", "server/dist/index.js"]
