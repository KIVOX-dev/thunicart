# Thunikart runbook

For GrowaLabs on call. Everything here is a command or a click you can do today.

## Deploy
1. CI (`.github/workflows/ci.yml`) lints, type checks, tests on an in-memory MongoDB replica set, regenerates the OpenAPI file, builds the image and pushes it to `ghcr.io/<owner>/<repo>/backend:<sha>` and `:latest` from `main`.
2. A green CI run on `main` deploys that exact image to Catalyst AppSail by itself (**Deploy backend to Catalyst AppSail**, `.github/workflows/deploy.yml`). To redeploy another version, run the same workflow by hand (Actions tab, choose the image tag). Choose the image tag and `development` or `production`. It pulls the image and runs `catalyst deploy appsail --name thunikart-api --source docker://... --port 9000 -ni`.
3. Without Docker: `node deploy/deploy-backend.mjs managed` builds the bundle and deploys it on the managed `node24` runtime.
4. Check `GET /health` (process) and `GET /ready` (database). Uptime monitor: point it at `/health`.
5. Never commit secrets. Set them in the Catalyst console (Docker path) or as CI secrets. For a linked managed deploy, `app-config.json` replaces console variables on every deploy, so put all variables there at deploy time.

## Environment
Every variable is in `backend/.env.example`. A value of `REPLACE_ME` switches that service to its mock. With `NODE_ENV=production` the API refuses to start while any required value is still `REPLACE_ME` or a JWT secret is under 32 characters. `BACKUP_ENCRYPTION_KEY` must be set and **kept safe outside the system**: without it a backup cannot be read.

## Scheduled jobs (Catalyst cron)
Each job is `POST https://<api>/internal/jobs/<name>` with header `x-cron-secret: <CRON_SECRET>`.

| Job | When | What |
|---|---|---|
| `backup` | nightly 02:00 IST | Encrypted backup of every collection to the private bucket, then prunes to 30 daily and 8 weekly |
| `stockBalanceCheck` | nightly 03:00 | Balances against ledger sums. Emails Admins on any difference |
| `reconciliation` | nightly 03:30 | Orders against gateway payments: paid but unconfirmed, confirmed without invoice, failed auto refunds |
| `releaseHolds` | every 5 minutes | Releases online stock holds older than 15 minutes |
| `reorderDigest` | daily 08:00 | Items at or below reorder level, by vendor, emailed to Admins |
| `exportCleanup` | daily | Deletes export files older than 7 days |
| `failedJobsSummary` | daily 09:00 | Emails Admins the jobs that failed in the last 24 hours |
| `activityLogTrim` | monthly | Removes activity rows older than 400 days |

## Backup and restore
- Run one now: `POST /admin/backups/run` (Admin) or the cron job.
- Files: `backups/<date>/<collection>.<part>.ndjson.gz.enc` plus `manifest.json.enc`. AES-256-GCM, gzip inside. Each file has a SHA-256 in the manifest.
- **Test the restore** any time: `POST /admin/backups/restore-test`. It restores the latest backup into a throw-away database, compares counts, drops it and returns `restoreMs`.
- **Real restore into a new database** (never over live data first):
  1. Create a new Atlas database user/cluster or choose a new database name.
  2. `MONGODB_URI=... MONGODB_DB_NAME=thunikart_restored BACKUP_ENCRYPTION_KEY=... pnpm --filter @thunikart/backend restore -- <backupRunId>`
  3. Check counts, point `MONGODB_DB_NAME` at it, redeploy. Keep the old database until sign off.
- Atlas also keeps its own snapshots. Take a manual snapshot right before any cutover.

## Rotate keys
- **JWT secrets**: change `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, redeploy. Everyone is logged out (staff and customers).
- **Razorpay / Shiprocket / Brevo / B2**: change in the vendor dashboard, update the Catalyst variable, redeploy. Razorpay webhook secret must match the dashboard.
- **BACKUP_ENCRYPTION_KEY**: do not change without keeping the old key. Old backups need the key they were made with.
- **CRON_SECRET**: change the variable and the Catalyst cron headers together.
- **Admin password**: `POST /users/:id/reset-password`, which also ends that user's sessions.

## Add a store, a user, a role
- Store: `POST /stores` (type shop, warehouse or online). It has no stock until a transfer or an opening import.
- Role: `POST /roles`, then `PUT /roles/:id/permissions`. Admin role is fixed.
- User: `POST /users` with the role. `POST /users/:id/unlock` if locked (5 wrong passwords lock for 15 minutes).

## When something looks wrong
- **Stock number is wrong**: `GET /stock/ledger?variantId=...` shows every movement with its document. Run `stockBalanceCheck`. A wrong entry is fixed with an adjustment, never by editing.
- **Order paid but not confirmed**: run `reconciliation`. If the webhook never arrived, check the Razorpay dashboard, then `POST /admin/orders/...` is not needed: re-send the webhook from Razorpay (it is processed once, safely).
- **Late payment refund failed**: the order shows `refund.status = needs_attention`. Refund in the Razorpay dashboard and note it on the order.
- **Duplicate or missing invoice number**: numbers have no gaps by design (taken inside the same transaction as the invoice). A missing number means a rolled back sale, which saved nothing.

## Rollback
Keep the previous image tag. Redeploy it with the Deploy workflow. The database is backward compatible within a phase; if a migration ran, restore the pre-cutover snapshot instead.
