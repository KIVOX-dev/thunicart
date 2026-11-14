# CI/CD

Push to GitHub and everything below happens by itself, except production, which needs a person to approve.

| What | Trigger | Where it runs | Result |
|---|---|---|---|
| **CI** (`ci.yml`) | every push and pull request | GitHub Actions | lint, type check, backend tests, OpenAPI check, build; on `main` it also pushes the backend image to `ghcr.io` as `:<commit>` and `:latest` |
| **frontend** (`frontend.yml`) | pushes and pull requests that touch `frontend/`, `shared/` or the lockfile | GitHub Actions | typecheck, lint, tests, both builds, admin end to end tests at 390 px and 1440 px |
| **Deploy backend** (`deploy.yml`) | CI succeeded on `main` (automatic), or "Run workflow" by hand | GitHub Actions to Catalyst AppSail | pulls the image CI just built and deploys `thunikart-api` to **development**; then checks `/health` |
| **Frontends** (Vercel) | every push (production branch `main`) and pull request (preview) | Vercel | store at `/`, admin at `/admin` (see `docs/deploy-vercel.md`) |

Production for the backend is manual on purpose: run **Deploy backend** from the Actions tab, choose `production`, and approve it. Add yourself as a required reviewer on the `production` environment (Settings, Environments).

## One time setup
**GitHub, Settings, Environments:** create `development` and `production`. On `production`, switch on **Required reviewers**.

**GitHub secrets** (add them to each environment, so production can use different values):
| Name | What it is |
|---|---|
| `CATALYST_TOKEN` | run `catalyst token:generate` on your computer |
| `CATALYST_PROJECT_ID` | the Catalyst project id (console, project settings) |
| `CATALYST_ORG_ID` | the Catalyst organisation id |

**GitHub variable (optional):** `BACKEND_HEALTH_URL`, the AppSail address plus `/health`. When set, a deploy fails if the new version does not answer within about 3 minutes.

**Catalyst console:** set the backend's own settings on the AppSail (database address, JWT secret, `ADMIN_URL`, `STOREFRONT_URL`). They are never stored in GitHub or in the image.

**Vercel:** import the repository with Root Directory `frontend` (see `docs/deploy-vercel.md`). Optional: Settings, Git, "Deployment Checks" so that a failing CI run blocks the production deploy.

## Rolling back
Run **Deploy backend** by hand with the earlier commit's image tag (every CI run on `main` keeps its `:<commit>` image). For the frontends, open the earlier deployment in Vercel and choose "Promote to Production".
