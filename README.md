# Thunikart

Connected ERP, POS billing and online store for Thunikart (Krishnas Orchids, Coimbatore), built by GrowaLabs.
One MongoDB, one API, one stock. This repo holds the backend, the shared contract, and (built separately) the frontends.

## Run everything with one command

```bash
docker compose up --build
```

This starts MongoDB as a single node replica set, then the backend with hot reload on http://localhost:4000. It seeds roles,
permissions, the business profile, stores, number series and the first Admin (`thunikartbykrishnasorchids@gmail.com` / `Admin-Dev-2026`, development only).
Every outside service (payments, storage, email, shipping, Google) runs as a **mock** while its variable is `REPLACE_ME`.

- API docs page: http://localhost:4000/api/docs
- OpenAPI file: `docs/api/openapi.json`
- Health: http://localhost:4000/health and `/ready`

## Without Docker

```bash
corepack enable && pnpm install
pnpm --filter @thunikart/backend dev:db          # MongoDB replica set on :27018 (in memory)
export MONGODB_URI="mongodb://127.0.0.1:27018/?replicaSet=rs0"
pnpm seed                                        # prints the first Admin password once
pnpm --filter @thunikart/backend dev             # API on :4000
sh docs/demo-b0.sh                               # the Phase B0 demo (set ADMIN_PASSWORD)
```

## Commands

| Command | What it does |
|---|---|
| `pnpm --filter @thunikart/backend test` | Unit and API tests on an in-memory MongoDB replica set |
| `pnpm --filter @thunikart/backend --filter @thunikart/shared lint` | ESLint, including the rule that backend never imports frontend |
| `pnpm --filter @thunikart/backend --filter @thunikart/shared typecheck` | TypeScript strict |
| `pnpm openapi` | Regenerates `docs/api/openapi.json` and the typed client in `shared/src/api-client` |
| `pnpm --filter @thunikart/backend migrate` | Syncs indexes declared in the model files |
| `pnpm deploy-backend` | Deploys to Zoho Catalyst AppSail (see `deploy/deploy-backend.mjs`) |

## Layout

- `backend/` Fastify API, Mongoose models, modules, seed, tests. Never imports frontend code (lint enforced).
- `shared/` the contract: zod request/response schemas, constants, formatting, generated API client. No business logic.
- `docs/` `decisions.md` (every rule and choice), `api/openapi.json`, source files in `docs/source`.

## Configuration

Copy `backend/.env.example` to `backend/.env`. Any value left as `REPLACE_ME` turns that service into a mock.
With `NODE_ENV=production` the API refuses to start while any required value is still `REPLACE_ME`.
Secrets are never committed.

## Documents

| File | What |
|---|---|
| `docs/decisions-backend.md` | Every rule chosen, answers received, sample rows that disagreed, open questions |
| `docs/runbook.md` | Deploy, jobs, backup and restore, key rotation, add a store or user |
| `docs/cutover.md` | Cutover plan, rollback triggers, go-live checklist |
| `docs/security-checklist.md` | Security checklist with evidence |
| `docs/architecture.md` | How it fits together |
| `docs/third-party-accounts.md` | Every outside account and its owner |
| `docs/api/openapi.json` | The API (also at `/api/docs`) |
| `docs/demo-b0.sh`, `demo-b1.sh`, `demo-b2.sh` | curl demos |
