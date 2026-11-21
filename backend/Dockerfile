# syntax=docker/dockerfile:1
# Pinned Node LTS on alpine. Linux amd64 (Zoho Catalyst AppSail accepts only amd64 OCI images).
ARG NODE_IMAGE=node:24.11.0-alpine3.22

# ---- deps + dev (used by docker compose with hot reload) ----
FROM ${NODE_IMAGE} AS dev
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json turbo.json ./
COPY backend/package.json backend/
COPY shared/package.json shared/
COPY tooling/package.json tooling/
COPY vendor vendor
# The frontend packages are not part of the backend image.
RUN sed -i '/frontend/d' pnpm-workspace.yaml && pnpm install --filter @thunikart/backend... --no-frozen-lockfile
COPY shared shared
COPY backend backend
WORKDIR /repo/backend
ENV NODE_ENV=development
EXPOSE 4000
CMD ["sh", "-c", "pnpm seed && pnpm dev"]

# ---- build ----
FROM dev AS build
RUN pnpm build

# ---- production deps only ----
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/
COPY shared/package.json shared/
COPY tooling/package.json tooling/
COPY vendor vendor
RUN sed -i '/frontend/d' pnpm-workspace.yaml && pnpm install --filter @thunikart/backend... --prod --no-frozen-lockfile

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
# The deploy tells AppSail the app listens on 9000. If AppSail does not inject X_ZOHO_CATALYST_LISTEN_PORT, the app would fall back to 4000 and
# AppSail would report "check the startup command or port". The injected variable still wins when it is present.
ENV PORT=9000
# pnpm keeps every package in /repo/node_modules/.pnpm and links it from backend/node_modules. Both must be present at the same relative
# places, or every import fails at start ("Cannot find package") and AppSail reports a failed start. So the layout is /repo/backend here too.
WORKDIR /repo/backend
COPY --from=prod-deps /repo/node_modules /repo/node_modules
COPY --from=prod-deps /repo/backend/node_modules ./node_modules
COPY --from=build /repo/backend/dist ./dist
COPY backend/package.json ./package.json
# No secrets live in the image. AppSail injects variables and the port at runtime.
USER node
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${X_ZOHO_CATALYST_LISTEN_PORT:-${PORT:-9000}}/health" || exit 1
CMD ["node", "dist/src/main.js"]
