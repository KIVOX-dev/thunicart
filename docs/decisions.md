# Decisions log

Every rule chosen, every question answered, and every sample row that disagreed with a rule. Newest phase last.

## Platform (Phase B0)

| # | Decision | Why |
|---|---|---|
| 1 | **Fastify 5** with zod 4 (not Express). Routes are declared with `defineRoute`, which validates input with the shared zod schemas, checks the permission, handles idempotency and rate limits, and feeds the OpenAPI builder. | One declaration gives validation, permission, docs and the typed client. |
| 2 | OpenAPI 3.0.3 is generated from the same route declarations (`z.toJSONSchema`). Every operation carries `x-permission` and `x-idempotency`. | The spec cannot drift from the code. |
| 3 | A test walks every registered route and fails if one has no permission or if a protected route answers anything but 401 without a token. | "Every route declares the permission it needs." |
| 4 | Staff access token: JWT HS256, 15 minutes, sent as a Bearer header. Refresh token: opaque, 7 days, httpOnly cookie `tk_admin_rt` scoped to `/api/v1/auth`, rotated on every use, stored hashed with a pepper. Replaying an old refresh cookie revokes the whole session. The storefront will use a separate cookie. | Short lived access plus revocable sessions. |
| 5 | Every authenticated request re-checks the session, user and role permissions in MongoDB, so a role change or a revoked session applies on the next request. | Stateless servers, instant revocation. |
| 6 | Login lock: 5 wrong passwords lock the account for 15 minutes (429 `ACCOUNT_LOCKED`). The counter is an atomic `$inc`. Admin can unlock via `POST /users/:id/unlock`. Unknown emails take the same time as wrong passwords. | Brief + no account enumeration. |
| 7 | Rate limits (login 20 per 10 minutes per IP, refresh 60) live in the `rate_limits` collection with a TTL index. Nothing is held in memory. `trustProxy` is on so the real client IP is used behind AppSail. | AppSail is stateless and may run several instances. |
| 8 | Idempotency: `Idempotency-Key` stored in `idempotency_keys` (unique per user and key, 24 hour TTL). A repeat returns the stored response with `Idempotent-Replay: true`. Same key with a different body is 422, still running is 409. Failed attempts release the key. It is `required` on money/stock POSTs (from B2) and `optional` on user and role creation. | Brief rule 4 of API rules. |
| 9 | Activity log: services call `audit({entity, entityId, action, before, after})`. A Fastify `onSend` hook stores the entries with user, IP and request id, and writes one generic entry for any successful write that gave none. Values whose key looks like password, secret, token, hash or otp are redacted. Failed logins are logged too. The log is written just after the transaction commits, not inside it; a failure there is logged as an error. | Every write logged. Same-transaction logging can be added for the money flows in B2/B3 if you want it stricter. |
| 10 | Money is integer paise (`lib/money.ts`). Division uses BigInt, round half up. The leftover paisa of a split goes to the largest line. | Brief calculation rules 1 and 4. |
| 11 | GST is decided in one place: `lib/gst.ts` `isGstEnabled()`. Nothing else reads the GSTIN. `gstEnabled` is derived on save, never accepted from a request. | Brief GST mode. |
| 12 | Saving a GSTIN checks format, the check character (mod 36), that the first two digits equal the profile's state code, and, when a PAN is present, that characters 3 to 12 equal the PAN. Clearing a live GSTIN needs an Admin and `confirmGstClear: true`. Go-live is recorded once; re-saving keeps it. History of enable, disable and change is kept in `business_profile.gstHistory`. | Brief. |
| 13 | **Sample GSTINs fail the checksum** (for example 27AAAAA1111A1Z1 and 33AAAAA1111A1Z1 from the workbook). They are placeholders, so they are rejected. Tests build valid ones with the real algorithm. | Rule 8: sample data is not real. |
| 14 | Number series: one document per key and financial year, unique on `(key, financialYear)`, taken with a single `findOneAndUpdate` + `$inc`. The first number of a new year uses upsert; the loser of a race retries once. Passing a transaction session makes the number roll back with the document, so there are no gaps. Counters can only be moved forward. | Brief + no gaps. |
| 15 | Series that restart each financial year: POS, ECM, CNT, PO, GRN, PR, CN, DN, as `POS-2026-27-000001`. CUST and VND never restart: `CUST-000001`. The workbook samples (`PO-2026-082`, `CUST-9082`, `VND-401`) use other shapes; prefix and padding are editable in `PUT /number-series/:key`. | Rule 6 says invoice numbers restart yearly; the others follow the same pattern for consistency. **Open question below.** |
| 16 | Financial year is computed on the Asia/Kolkata calendar, 1 April to 31 March. | Brief. |
| 17 | Admin protection runs in a transaction that first updates a `locks` document, so two Admins demoting each other at the same moment conflict and only one succeeds. Admin cannot remove their own Admin role, deactivate or delete themselves. The last active Admin cannot be demoted, deactivated or deleted. | Brief; covered by a concurrency test. |
| 18 | Deleting a user is a soft delete (email is renamed so it can be reused). The Admin role cannot be edited, renamed or deleted and always holds every permission. System roles cannot be renamed or deleted. A role with users cannot be deleted. | Keeps history readable. |
| 19 | Models are loosely typed (`Model<Record<string, any>>`). Strict Mongoose generics ran the TypeScript compiler out of memory. Services map documents to the shared DTO schemas, and responses are parsed with those schemas at runtime, so the contract is still enforced. | Practical. |
| 20 | Indexes are declared in the model files and synced by `pnpm seed` / `pnpm migrate` (never at request time, `autoIndex` is off). `migrate-mongo` is configured for future data migrations; the baseline migration is empty. | Brief: indexes in code. |
| 21 | Business profile stores brand colours from the address document (#0B1B54 deep blue, #F67025 orange, #0BBBB4 teal). | Address doc. |
| 22 | Backend never imports frontend: ESLint `no-restricted-imports` (verified to fail the build). The `shared` package is bundled into the backend build by tsup. | Brief. |
| 23 | In development a `REPLACE_ME` JWT secret becomes a random per process secret with a warning (logins reset on restart). In production, missing or `REPLACE_ME` variables, or JWT secrets under 32 characters, stop the process. | Brief. |
| 24 | Without MongoDB the API will not start (it prints how to start one). Mock mode covers outside services, not the database. | Transactions need a replica set. |

## Default permission matrix (as seeded)

The brief names actions that are not among the six (view, create, edit, delete, approve, export). Mapping used:

- "Request transfer" = `stock.create`; "Receive, adjust" = `stock.create` + `stock.edit`.
- "Pay" (vendor payments) = `accounts.create`; "Cancel" (invoices) = `sales.delete`; "Return" = `sales.create`.
- Wherever a role can create or edit, it also gets `view`.
- "Own sales only" for Sales reports and "Purchase and stock" reports for Buyer Purchase are **data scopes**, applied in B4. They are seeded as `reports.view` today.
- Modules added beyond the table: `orders` (online orders) and `cms` split from "Online store and CMS"; `roles`, `users`, `settings` are Admin only.

| Module | Admin | Sales | Buyer Purchase | Accounts |
|---|---|---|---|---|
| items | all | view | view, create, edit | view |
| vendors | all | none | view, create, edit | view |
| customers | all | view, create, edit | none | view |
| purchase | all | none | all except approve | view |
| stock | all | view, create | view, create, edit | view |
| pos | all | view, create | view | view |
| sales | all | view, create | view | view, delete (cancel) |
| accounts, gst | all | none | none | all |
| reports | all | view | view | all |
| orders | all | view, edit | none | view |
| cms | all | none | none | view |
| settings, users, roles | all | none | none | none |

## Source file findings (from docs/source)

- **Stock sheet** (`STOCKSUMMARYASON07112026_071120`): 535 item rows, 5,019 pieces, cost value 5,92,229.23. This matches the footer. 8 rows have "Primary" as category/brand, 10 as model, 111 as size. 183 have no HSN. One stray row contains the text "HSN Code" where a number belongs; it goes to the review queue in B1.
- **HSN sizes**: stock rows carry 8 digit codes (for example 61083100) while the HSN Master has 26 four digit headings. B1 looks up the rate by the first four digits and keeps the full code on the item.
- **HSN Master rule**: "Value <= 1000: 5% | Value > 1000: 12%". Seeded as unconfirmed in B1.
- **Workbook Sales Master** adds tax on top of the price (taxable = gross - discount, then tax added). That breaks rule 1 (prices include GST) and gives different totals from the sample invoice. We follow the rules, not the sheet. Its B2B row also has an inconsistent discount formula.
- **Workbook 4 inch sheet vs the PDF**: addresses (Mumbai) and GSTIN are placeholders. Terms differ: the sheet says no returns on washed, worn or customized garments and a 48 hour window for web shortages; the PDF says discounted items cannot be returned and defects within 48 hours. Seeded terms follow the sheet. **Open question below.**
- **Sample invoice POS-984322**: tax lines add to 183.12 (19.29 x2 + 72.27 x2). The PDF prints 183.11. We follow the calculation rules, so the invoice will show 183.12 and a round off of -0.01 (B3).
- **Proposal vs brief**: role names differ (Purchase Manager / Store Staff / Accountant vs Buyer Purchase / Sales / Accounts) - we use the brief's names. The proposal mentions mobile OTP login, the brief says email OTP (no SMS) - we use email OTP and Google. Proposal lists A4, 2 inch and 3 inch; the brief adds 4x6 - all four are built.
- **Hosting limits** (AppSail docs): 30 second request timeout, 256 MB default memory (we set 512), up to 5 instances, a new instance at 80 concurrent requests, 10 seconds to start listening, restricted local file writes. Imports, exports and backups will be chunked background jobs.
- **Atlas network**: AppSail has no fixed outgoing IP, so Atlas must allow 0.0.0.0/0, protected by TLS, a dedicated least-privilege database user and a strong password. Document this risk when we go live.
- **Deploy**: Docker image deploy (`catalyst deploy appsail --source docker://...`) is the preferred path; managed node24 deploy is kept working too. With a linked managed deploy, `app-config.json` replaces console variables, so the committed file has empty `env_variables` and secrets are set in the console for the Docker path.

## Open questions (waiting for you)

1. Should numbers for PO, GRN, PR, CN and DN restart each financial year like invoices (`PO-2026-27-000001`), or run continuously (`PO-000001`)? Sample files show `PO-2026-082`.
2. Discounted items: non-returnable (PDF terms) or returnable (brief allows refunds)? Which printed terms are right, the PDF's or the workbook's?
3. Is the 48 hour defect rule real, or do defects follow the 7 day window?
4. ~~First Admin email~~ Answered: thunikartbykrishnasorchids@gmail.com. Password still to be chosen by you (the seed prints a random one, or set SEED_ADMIN_PASSWORD).
5. Brief says Zoho Catalyst Docker deploy needs a container registry for the console path. Do you want me to prepare a GitHub Container Registry push in CI?
