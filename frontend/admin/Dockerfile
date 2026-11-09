# Local development and CI only. Production serves the built static files.
FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @thunikart/admin...
EXPOSE 5173
CMD ["pnpm", "--filter", "@thunikart/admin", "dev"]
