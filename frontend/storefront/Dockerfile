# Local development and CI only. Production runs on Zoho Catalyst AppSail.
FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @thunikart/storefront...
ENV NEXT_PUBLIC_API_URL=REPLACE_ME_http://localhost:4000
EXPOSE 3000
CMD ["pnpm", "--filter", "@thunikart/storefront", "dev"]
