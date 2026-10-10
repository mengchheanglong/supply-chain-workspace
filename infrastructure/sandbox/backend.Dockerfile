# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile
COPY backend ./backend
RUN pnpm --filter @logistics-sandbox/backend build
RUN pnpm --filter @logistics-sandbox/backend deploy --prod /app/deploy

FROM node:20-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 sandbox \
    && useradd --system --uid 10001 --gid sandbox sandbox
WORKDIR /app
COPY --from=build --chown=sandbox:sandbox /app/deploy/dist ./dist
COPY --from=build --chown=sandbox:sandbox /app/deploy/node_modules ./node_modules
COPY --from=build --chown=sandbox:sandbox /app/deploy/package.json ./package.json
USER sandbox
EXPOSE 8500
ENV NODE_ENV=production
ENV PORT=8500
CMD ["node", "dist/index.js"]
