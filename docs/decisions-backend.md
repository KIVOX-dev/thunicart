# Backend decisions log

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
- **Workbook 4 inch sheet vs the PDF**: addresses (Mumbai) and GSTIN are placeholders. Terms differ: the sheet says no returns on washed, worn or customized garments and a 48 hour window for web shortages; the PDF says discounted items cannot be returned and defects within 48 hours. Seeded terms now follow the PDF (confirmed by the client).
- **Sample invoice POS-984322**: tax lines add to 183.12 (19.29 x2 + 72.27 x2). The PDF prints 183.11. We follow the calculation rules, so the invoice will show 183.12 and a round off of -0.01 (B3).
- **Proposal vs brief**: role names differ (Purchase Manager / Store Staff / Accountant vs Buyer Purchase / Sales / Accounts) - we use the brief's names. The proposal mentions mobile OTP login, the brief says email OTP (no SMS) - we use email OTP and Google. Proposal lists A4, 2 inch and 3 inch; the brief adds 4x6 - all four are built.
- **Hosting limits** (AppSail docs): 30 second request timeout, 256 MB default memory (we set 512), up to 5 instances, a new instance at 80 concurrent requests, 10 seconds to start listening, restricted local file writes. Imports, exports and backups will be chunked background jobs.
- **Atlas network**: AppSail has no fixed outgoing IP, so Atlas must allow 0.0.0.0/0, protected by TLS, a dedicated least-privilege database user and a strong password. Document this risk when we go live.
- **Deploy**: Docker image deploy (`catalyst deploy appsail --source docker://...`) is the preferred path; managed node24 deploy is kept working too. With a linked managed deploy, `app-config.json` replaces console variables, so the committed file has empty `env_variables` and secrets are set in the console for the Docker path.

## Answered by the client

- **Returns terms:** the PDF's terms are right. Discounted items are **not** returnable or refundable. Defective items must be reported within **48 hours** (this is real). The 7 day exchange window stays. Washed, worn and customized garments are also blocked (from the brief). Seeded as the invoice terms; B3 will add these as Settings: `returnWindowDays=7`, `returnDiscountedItems=false`, `defectReportHours=48`, `nonReturnableFlags`.
- **CI/CD:** yes. CI builds the Docker image and pushes it to GitHub Container Registry on every push to `main`; a manually triggered job deploys it to Catalyst.
- **First Admin email:** thunikartbykrishnasorchids@gmail.com. Password still to be chosen (the seed prints a random one, or set `SEED_ADMIN_PASSWORD`).
- **Branch:** only `main`.

## Open questions (waiting for you)

1. Should numbers for PO, GRN, PR, CN and DN restart each financial year like invoices (`PO-2026-27-000001`), or run continuously (`PO-000001`)? Sample files show `PO-2026-082`.
4. ~~First Admin email~~ Answered: thunikartbykrishnasorchids@gmail.com. Password still to be chosen by you (the seed prints a random one, or set SEED_ADMIN_PASSWORD).

---

# Phase B1: masters and data migration

## Rules chosen

| # | Decision | Why |
|---|---|---|
| 25 | **Source file facts.** The stock sheet has 535 data rows, but row 57 is a header repeated inside the data (`Code`, `Group`, `HSN Code`, all zeros). It is skipped and reported, so **534 real items** load, not 535. The totals row (sheet row 538) is skipped too. | Real data. |
| 26 | **The footer total includes one row with quantity -1** (cost 64.50). Imported: 5,020 pieces, cost 5,92,293.73. Source footer: 5,019 pieces, 5,92,229.23. The difference is exactly that row, and the preview prints a note saying so. The row is **not posted** (no negative stock unless an Admin allows it; that setting arrives in B3) and is flagged NEGATIVE_QTY for the physical count. | Brief rule 5 vs the footer. **Open question 1.** |
| 27 | The HSN Master sheet has **25** data rows, not 26. All are seeded in `hsn` and `gst_rates` as **unconfirmed** (24 slab rules: 5% up to Rs 1,000, 12% above; 4202 flat 18%). `POST /gst-rates/:id/confirm` needs `gst.approve`. Editing a rule makes it unconfirmed again. | Brief. |
| 28 | **Three HSN codes in use have no GST rate rule:** 6212 (30 items), 5208 (10), 6213 (2). The master sheet does not list them. The data quality report shows them in `hsnWithoutRate`. The rate lookup returns "no rule" instead of guessing. | Never hardcode a rate. **Open question 2.** |
| 29 | **Rate lookup** (`lib/gstRate.ts`): the item override wins; otherwise the longest HSN match (8, 6, then 4 digits) that is effective on the bill date; slab rules use the per piece price (at or below the limit gets the lower rate). Used by `GET /gst-rates/resolve` and barcode lookup. While GST is off both return no rate. | Brief. |
| 30 | **Valid headings.** HSN is text of 4, 6 or 8 digits. Chapters a garment shop uses have a last valid heading (for example 64 stops at 6406, so 6407 is flagged INVALID_HSN). Chapters not in the table are only format checked. The API refuses an invalid heading; the import accepts it and flags it. | Brief: 6407 appears 16 times. |
| 31 | **Item codes.** The `ITEM` series gives `KO1000370` style codes (prefix KO, no separator, never restarts). After an import it moves forward to the highest imported KO code. Existing codes are kept as given, including numeric ones like 8905133052549 (stored as text). | Brief rule 6. |
| 32 | **Barcodes.** A variant with no barcode gets Code-128 of its item code. `POST /items/:id/barcode {format:"ean13"}` turns those into in-store EAN-13 (prefix 20, a 10 digit sequence from the `EAN` series, check digit). Real barcodes are kept unless `replace:true`. The EAN series only moves forward, so a number is never reused. | Brief. |
| 33 | **Prices.** MRP >= selling >= offer, MRP required. Online price = offer if set, else selling, else MRP (`effectivePrice`). The import raises an MRP below the selling price to the selling price (flag MRP_RAISED, 71 rows) and flags rows with no price at all (NO_PRICE, 30 rows; a zero price is allowed only through import). | Brief + data. |
| 34 | **Import is four steps** (upload, map, preview, commit) plus rollback. Files go to the **private** bucket through the presign endpoint (mock: local folder). Commit works in batches of 60 products, one transaction per batch, saves progress, and can be called again until `done` (AppSail's 30 second limit). A bad unit is retried alone so it cannot sink the batch. Two commit calls cannot run at once (lock). | Brief + AppSail. |
| 35 | **Targets.** `items` creates or updates products and variants (no stock). `opening_stock` does the same and posts OPENING ledger rows dated 7 Nov 2026 (from the saved Krishnas Orchids mapping). The store defaults to the first shop, Krishnas Orchids Hub, or pass `storeId`. A variant that already has stock history never gets a second opening balance, so re-importing the same file is safe. | Brief. **Open question 3.** |
| 36 | **Grouping.** Rows with the same brand, model and category become one product; if any of the three is blank each row is its own product. Real file: 534 variants form 142 products. Product HSN is the most common non blank HSN of its rows. | Brief. |
| 37 | **Cleaning.** `Primary` means blank in category, model, brand and size. Sizes like `80.0` become `80`; `MLXL2XL` and `S M L XL XXL` stay one row and are flagged MULTI_SIZE (47 rows) with the detected sizes. HSN numbers like 61083100.0 become text. Names are trimmed. | Brief. |
| 38 | **Review queue** (`import_review_queue`), real file: MISSING_SIZE 111, MISSING_HSN 183, INVALID_HSN 16, MULTI_SIZE 47, MISSING_MODEL 10, MISSING_CATEGORY 8, MISSING_BRAND 8, NO_PRICE 30, MRP_RAISED 71, NO_COST 69, ODD_SIZE 4, ODD_CODE 1, NEGATIVE_QTY 1. Reasons that come from data clear when the data is fixed; MRP_RAISED, NEGATIVE_QTY, NO_COST and ODD_CODE stay until dismissed. A re-import never duplicates an open review row. | Brief. |
| 39 | **HSN suggestions** are the most common valid HSN already used in the same category, with the count behind it and a low confidence note under 60%. They are only applied through `PATCH /imports/review-queue/bulk` with `action: apply_suggestion`. | Brief: never apply silently. |
| 40 | **Splitting sizes** (`split_sizes`): the original variant keeps the first size and the opening stock; new variants get the other sizes with no stock, so a stock audit must spread the quantity. | Stock per size is unknown from a combined row. |
| 41 | **Rollback** removes everything the batch created (items, variants, opening ledger rows, balances, categories and brands nothing else uses, vendors, customers, loyalty rows) and restores what it changed. This is the one permitted deletion of stock ledger rows. It is **blocked** if any imported item has a later stock movement. Variants added later by splitting go with their product unless they have stock. | Brief: rollback removes opening entries. |
| 42 | **Vendors and customers.** IDs come from the VND and CUST series (an ID in an import file is kept). GSTIN is required for vendors only while GST is on and for B2B customers always; it is validated for format, check character, state code and PAN. If a GSTIN is given without a PAN, the PAN is taken from it. A vendor without a GSTIN needs no PAN while GST is off. Mobile is unique per customer. Loyalty points and wallet are ledgers (`loyalty_ledger`, `wallet_ledger`); an imported balance becomes an OPENING row. | Brief. |
| 43 | **Sample rows are not trusted.** The workbook's sample vendor and B2B customer GSTINs fail the checksum, so those rows are reported as failed with the reason. The three sample Stock Master rows import cleanly. | Rule 8. |
| 44 | **Masters with transactions are never deleted.** Deleting runs registered usage checks (items in a category, variants with stock history, a store with movements, a customer with ledger entries) and answers 422 `HAS_TRANSACTIONS`; use `active:false`. | Brief. |
| 45 | **Uploads.** Image 5 MB (jpeg, png, webp), video 50 MB (mp4, webm), PDF 5 MB, import spreadsheets 10 MB. The API checks type and size, then returns a 10 minute URL. Import files go to the private bucket. Resizing to WebP (thumb, card, product, zoom) is not part of B1; it arrives with the storefront in B5. | Brief. |
| 46 | The `xlsx` library (SheetJS 0.20.3, needed for `.xlsb`) is **vendored** in `vendor/` because the npm copy is old and vulnerable and the official one is only published on cdn.sheetjs.com. The file's SHA-256 is `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`. | Supply chain safety. |
| 47 | Backend decisions live in `docs/decisions-backend.md`. `docs/decisions.md` is the frontend's file (the frontend session overwrote my copy once, so they are now separate). | Avoid clobbering. |

## Open questions (B1)

1. The stock file has one row with quantity -1. Leave it unposted (current behaviour, imported total 5,020), or post it as -1 once an Admin allows negative stock?
2. Which GST rate applies to HSN 6212 (bras and similar, 30 items), 5208 (10 items) and 6213 (2 items)? The master sheet does not list them. Do you want the same 5% up to Rs 1,000 and 12% above rule, or something else? Until a rule exists they show as "no rule".
3. Which store holds the opening stock: Krishnas Orchids Hub (shop, used by default) or Main Warehouse?
4. Is "535 items" in the brief meant to include the repeated header row? We load 534.

---

# Phase B2: purchase and inventory

## Rules chosen

| # | Decision | Why |
|---|---|---|
| 48 | **One stock engine** (`lib/stock.ts` `postStock`). Every movement writes one append-only ledger row and updates `stock_balances` in the **same transaction**. A removal is one conditional update (`available >= qty`), so two requests at the same moment can never take stock below zero (409 `INSUFFICIENT_STOCK`). Only an Admin setting (`allowNegativeStock`, default off) or a physical audit can take it below zero. There is no route that edits or deletes a ledger row; a wrong entry is fixed with a reversing entry. | Brief rule 5. |
| 49 | **Reserved stock.** Online order holds change `reserved` only (rows `ONLINE_ORDER_RESERVE` carry the quantity held, `ONLINE_ORDER_RELEASE` the negative). Available = on hand - reserved. The functions exist now; B5 uses them. | Brief. |
| 50 | **Purchase tax** (`lib/purchaseTax.ts`). Costs exclude GST. `taxable = qty x unit cost - trade discount`. CGST = SGST = round half up of `taxable x rate / 2`; IGST = round half up of `taxable x rate`. State is compared with the business state code (33) from Settings: same state is CGST+SGST, otherwise IGST. While GST is off every tax field is 0 and the taxable value is the full cost, no input credit is kept. | Brief. |
| 51 | **Discount is a percent of the line value** (for example 2.5). The brief says "discount" without a unit. A percent applies the same way to partial receipts. | Practical. **Open question 1.** |
| 52 | **GST rate on a line**: the typed rate, else the item override, else the rate rules for the HSN and unit cost. If none applies while GST is on, the line is refused with a field error (never a guessed rate). | Brief rule 3. |
| 53 | **PO** statuses draft, approved, sent, partly received, closed, cancelled. A PO above the limit in `Settings > operations` (default Rs 50,000 incl. GST) must be approved with `purchase.approve` (Admin) before it can be sent; below the limit it can be sent straight from draft. Drafts are edited with `If-Match: <version>`; a stale version is 409 `STALE_EDIT`. Sent orders are cancelled (only if nothing was received) not deleted. A partly received PO can be closed to drop the pending balance. | Brief. |
| 54 | **GRN**: only accepted quantity (received - rejected) enters stock. Receipts need a sent or partly received PO, or are direct (unit cost required). Over-receipt (cumulative accepted more than ordered) needs `approveOverReceipt: true` **and** the `purchase.approve` permission. The same vendor invoice number cannot be received twice (unique per vendor). A GRN's tax is calculated on the accepted quantity. | Brief. |
| 55 | **Landed cost** = (accepted taxable value + this line's share of GRN freight) / accepted quantity, rounded half up. Freight on the GRN (ex GST) is shared across lines by taxable value. Freight and other charges on the **bill** are payable amounts only and do not change stock cost. | Brief says freight shared by value; bill charges are accounting. **Open question 2.** |
| 56 | **Weighted average cost** updates on every GRN over the on-hand of **all stores** before the receipt lands: `(existing qty x existing cost + received qty x landed cost) / total qty`, round half up. With nothing on hand the received cost is the cost. The ledger row keeps the cost of that movement, so later receipts never change history. Three GRNs at 100, 130, 160 give 100, 120, 130. | Brief. |
| 57 | **Purchase bill** is made from GRNs: lines are the **unbilled accepted quantities**. The vendor bill number is unique per vendor (case and spaces ignored), checked up front (409 `DUPLICATE`) and by a unique index. Due date = bill date + payment terms (NET15 = 15 days, ADVANCE = same day). Input tax credit is stored only while GST was on. Round off on the vendor's bill is -50 to +50 paise. | Brief. |
| 58 | **Purchase return** is against a bill (already billed) or a GRN (not yet billed), with a reason. It posts PURCHASE_RETURN rows (stock out, 409 if not enough), makes a return number (PR) and a debit note number (DN), and its tax follows the original line. A return against a bill cuts that bill's outstanding; a return against an unbilled GRN reduces what can still be billed. Weighted average cost is not changed by returns. | Brief. |
| 59 | **Vendor payment** (cash, bank, UPI, cheque) with allocations to bills. Part payment and advance are allowed; the unallocated part is the vendor's advance. Allocation uses a conditional update, so two payments racing for the same balance cannot both succeed (422 `OVER_PAYMENT`). `POST /vendor-payments` needs `accounts.create` ("Accounts: pay"); Buyer Purchase cannot pay. | Brief. |
| 60 | **Outstanding** = bills - debit notes - payments, with ageing from the **due date**: current (not due), 0-30, 31-60, 61-90, over 90 days (IST calendar days). `netPayable` = outstanding - advance. | Brief. |
| 61 | **Transfers**: requested, dispatched, partly received, received, cancelled. Dispatch posts TRANSFER_OUT at the source (409 and the transfer stays requested if any line is short). The transit pool is dispatched - received - short per line (it is not stored in any store's balance, so ledger = balances always holds). Receive can be partial; `final: true` closes it and turns anything not received into a **discrepancy** (list, never deleted). A discrepancy is resolved as found at destination, returned to source (stock is put back by a TRANSFER_IN) or written off. A Sales user can request (`stock.create`); dispatch and receive need `stock.edit`. | Brief. |
| 62 | **Audit**: snapshot of system quantity per variant as at the start for a store (optionally one category or bin). Scans add counts (or set them); a scanned item not in the snapshot is added with its current quantity. Stock is not frozen, so the sheet flags items that **moved during the audit** (movement since start). Approval (`stock.approve`) posts `counted - system at start` as an AUDIT entry per variant (a physical count may correct stock even below zero); uncounted items are skipped by default or treated as zero. | Brief. |
| 63 | **Reorder alerts**: variants with a reorder level above 0 whose available stock is at or below it, grouped by the last vendor who supplied them (most recent GRN). Suggested quantity = reorder level x multiplier (default 2, in settings) - available, at least 1. `POST /purchase-orders/from-alerts` drafts a PO for one vendor. The daily digest job is B6. | Brief. |
| 64 | **Settings > operations** (`GET/PUT /settings/operations`): allow negative stock, PO approval limit, reorder target multiplier. | Brief. |
| 65 | **Idempotency-Key is required** on GRN, purchase bill, purchase return, vendor payment, stock adjustment, transfer request, dispatch, receive and audit approval; a retry returns the stored answer and does not post twice. Optional on PO creation. | Brief. |
| 66 | New number series: `PB` (purchase bill), `VP` (vendor payment), `ADJ`, `AUD`, `TRF`. All restart each financial year. | Brief. |
| 67 | Permissions used: purchase.view/create/edit/delete/approve for orders, GRN, bills, returns; `accounts.view/create` for vendor payments; `stock.view/create/edit/approve` for stock (create = request transfer and start audit, edit = adjust, receive, dispatch, scan, approve = approve audits and resolve discrepancies). | Brief matrix. |

## Open questions (B2)

1. Is the PO line "discount" a percent (what we built) or an amount?
2. Should freight and other charges on the vendor's **bill** also be added to stock cost? (Today only freight on the GRN is.)
3. Over-receipt tolerance: should small over-receipts (for example up to 2%) be allowed without approval? Today any excess needs approval.
4. Should the PO approval limit default stay at Rs 50,000?
