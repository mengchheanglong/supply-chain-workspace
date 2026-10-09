# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile
COPY frontend ./frontend
RUN pnpm --filter @logistics-sandbox/frontend build

FROM nginx:1.27-alpine-slim AS runtime
RUN addgroup -g 10001 -S sandbox \
    && adduser -u 10001 -D -S -G sandbox sandbox \
    && printf 'server {\n    listen 5173;\n    server_name localhost;\n    location / {\n        root /usr/share/nginx/html;\n        index index.html index.htm;\n        try_files $$uri $$uri/ /index.html;\n    }\n}\n' > /etc/nginx/conf.d/default.conf \
    && touch /var/run/nginx.pid \
    && chown -R sandbox:sandbox /var/run/nginx.pid /var/cache/nginx /var/log/nginx /etc/nginx/conf.d
COPY --from=build --chown=sandbox:sandbox /app/frontend/dist /usr/share/nginx/html
USER sandbox
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
