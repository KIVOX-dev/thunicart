# Architecture

## One system, one stock
```
Admin app (React)      Storefront (Next.js)
        \                   /
         v                 v
        Thunikart API  (Fastify, /api/v1, OpenAPI)
   auth - roles - masters - purchase - stock - POS/sales - accounts/GST - reports - online store - jobs
        |                 |                  |                |
     MongoDB Atlas   Backblaze B2        Razorpay         Brevo / Shiprocket
   (replica set)  (media + backups)   (payments)     (email, shipping)
```
Hosted on Zoho Catalyst AppSail: stateless, one port (`X_ZOHO_CATALYST_LISTEN_PORT`), `/health`, 30 second request limit, 1 to 5 instances. Nothing is kept in memory: carts, rate limits, idempotency keys, login codes and sessions are all MongoDB documents (with TTL indexes where they expire).

## Rules that hold everywhere
- **Money is integer paise.** Division rounds half up (`lib/money.ts`). Prices include GST; purchase costs exclude it.
- **One GST switch.** `lib/gst.ts` `isGstEnabled()` is the only reader of the GSTIN. Off: no tax lines, Bill of Supply, GST reports empty. On: tax invoices from the go-live moment; older invoices never change.
- **One stock ledger.** `lib/stock.ts` `postStock` writes an append-only row and updates `stock_balances` in the same transaction. A removal is a conditional update, so stock cannot go below zero under concurrency. POS, ERP and website read the same balances.
- **Transactions** wrap everything that touches more than one document: finalize a bill, GRN, transfer, order confirm, return, import batch. Number series are one atomic `$inc`, taken inside the transaction so a rollback leaves no gap.
- **Idempotency.** Money and stock POSTs need an `Idempotency-Key`; a retry replays the stored answer. Webhooks store the raw event and process it once.
- **Finalized documents are never edited.** Fixes are returns, credit notes, debit notes, cancellations (a full credit note) or reversing entries. An invoice stores a full printed snapshot, so a reprint is identical.
- **Every write is logged** with user, time, IP, request id and before and after values (passwords and tokens redacted).
- **Adapters with mock twins**: payments, storage, email, shipping, Google. Mock mode when the variable is `REPLACE_ME`.

## Layout
`backend/src/modules/<domain>` each with routes and service. `shared/` holds the zod schemas, constants, formatting and the typed client generated from `docs/api/openapi.json`; the backend never imports frontend code (lint rule).

## Data model (collections)
Auth: users, roles, permissions, role_permissions, sessions. Masters: items, variants, categories, brands, hsn, gst_rates, stores, vendors, customers, label_templates. Stock: stock_ledger, stock_balances, stock_audits, stock_transfers, transfer_discrepancies. Purchase: purchase_orders, grns, purchase_bills, purchase_returns, vendor_payments. Sales: sales_bills (invoices), sales_returns (credit notes), pos_shifts, loyalty_ledger, wallet_ledger. Accounts: expenses, expense_categories, customer_receipts, payment_vouchers, export_jobs. Online: online_orders, carts, coupons, coupon_uses, customer_addresses, wishlists, customer_otps, store_sessions, banners, cms_pages, blog_posts, store_settings, webhook_events. System: business_profile, number_series, activity_log, idempotency_keys, rate_limits, locks, app_settings, import_*, backup_runs, job_runs.

## Sized for a shop, not a marketplace
Reports load the documents of the period into memory and total them (fine for a shop with thousands of invoices a month; the exports run as background jobs). Move the heaviest to aggregation pipelines if volume grows 10 times.
