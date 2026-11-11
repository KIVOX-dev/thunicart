# Security checklist (Phase B6)

| Item | Status | Evidence |
|---|---|---|
| HTTPS only with HSTS | Ready, needs the real domain | HSTS header set when `NODE_ENV=production`; Catalyst terminates TLS and renews the certificate. Verify after the custom domain is mapped |
| Secure, httpOnly cookies | Done | Refresh cookies are httpOnly, `secure` in production, `SameSite=Lax`, path scoped. Staff `tk_admin_rt` and storefront `tk_store_rt` are separate (tests) |
| CORS limited to our domains | Done | Only `STOREFRONT_URL` and `ADMIN_URL`; a test checks an evil origin gets no header |
| Rate limits | Done | Login 20 per 10 minutes per IP, account lock after 5 wrong passwords, OTP per email and IP, stored in MongoDB |
| Input validation | Done | Every route validates with the shared zod schemas; 1 MB body limit (413 test) |
| Upload type and size limits | Done | Images 5 MB, video 50 MB, PDF 5 MB, imports 10 MB, checked before a presigned URL is issued |
| No secrets in code or logs | Done | `.env.example` only; logs redact authorization, cookie, signature and cron headers; request logs carry the path without the query string |
| Personal data not in logs | Done | Query strings (mobile, email) are not logged; activity log redacts password, token, secret, hash, otp |
| Dependencies audited | Done | `pnpm audit` run before go-live (results in docs/decisions-backend.md). SheetJS is vendored at 0.20.3 because the npm copy is vulnerable |
| Server side permission test for every endpoint | Done | A test walks every registered route and requires a declared permission and a 401 without a token; role tests check 403s |
| Backups encrypted | Done | AES-256-GCM, SHA-256 per file, tamper detection test, restore test endpoint |
| Webhooks verified | Done | Razorpay HMAC over the raw body (constant time compare), raw event stored, processed once; Shiprocket token header |
| Passwords | Done | argon2id, 10+ characters with a digit, refresh tokens hashed with a pepper and rotated, replay revokes the session |
| Customer login codes | Done | 6 digits, 5 minutes, 3 attempts, resend after 30 seconds, stored hashed with a TTL index |
| API responses not cached | Done | `Cache-Control: no-store` on `/api/v1` |
| Atlas network access | Needs your decision | AppSail has no fixed outgoing IP: Atlas must allow 0.0.0.0/0. Mitigation: dedicated least-privilege database user, strong password, TLS, alerts on logins from new IPs |

Not done (out of scope or later): web push notifications (VAPID keys are in the config but no push sender yet), SMS and WhatsApp (excluded), penetration test by a third party.
