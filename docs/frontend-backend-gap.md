# Admin frontend vs backend: contract gap (found 2026-11-11 by running both together)

The admin app was built against its own mock (`docs/api-requests.md`). The backend is published in `docs/api/openapi.json` and
`shared/src/api-client`. They disagree. The backend is the source of truth. The frontend should move to the generated client.

## Differences that affect every screen
1. **Store context.** The backend needs a `storeId` on shifts, bills, stock, transfers and the like. The frontend never sends one
   (`features/api/http.ts` has no store). The store switcher in the header must hold a selected store and pass it.
2. **Response shapes.** Paged lists are `{ items, total, page, pageSize }`. Frontend zod schemas (`shiftDto`, `billSummary`, `heldDto`,
   `invoiceDto`, ...) use other field names. Replace them with the `shared` schemas.
3. **Idempotency-Key** is required on 19 money and stock POSTs (see openapi).

## Path map (frontend call -> backend path)
| Frontend | Backend |
|---|---|
| GET/PUT `/settings/business-profile` | GET/PUT `/settings/business` |
| GET/POST `/accounts/expenses` | GET/POST `/expenses` (+ `/expense-categories`) |
| POST `/accounts/receipts` | POST `/receipts` |
| GET `/accounts/receivables` | GET `/reports/outstanding` |
| GET `/reports` (list) | none. The 11 report keys are fixed: stock, mrp, non-moving, slow-moving, purchases, sales, daily-sales, margin, profit-loss, outstanding, purchase-vs-sales (+ `gst/*`) |
| `/reports/:key/download?format=` | GET `/reports/:key?format=xlsx|csv|pdf` |
| `/reports/jobs`, `/exports/datasets`, `/exports/settings` | POST/GET `/exports`, GET `/exports/:id`, `/exports/:id/download`, POST `/exports/full`. Datasets list and monthly email are not built |
| GET `/pos/shift`, POST `/pos/shift/open`, `/pos/shift/close` | GET `/pos/shifts/current?storeId=`, POST `/pos/shifts/open` {storeId, openingCash}, POST `/pos/shifts/:id/close` |
| `/pos/bills`, `/pos/held`, `/pos/preview`, `/pos/returns`, `/pos/credit-notes` | `/pos/*` and `/sales/*` as in openapi (check each) |
| `/review-queue`, `/hsn-rules`, `/import-mappings` | see `/imports/*` and `/hsn` in openapi |
| storefront `/catalog/*`, `/cms/*` | `/store/*` in openapi |

Run `node` over `docs/api/openapi.json` for the exact list. Every operation declares its permission and errors.

## Import wizard (found when uploading the stock file)
| Frontend | Backend |
|---|---|
| POST `/uploads/presign` {filename, contentType, kind} | same path, but the body schema and `kind` values differ (400). See `uploads.routes.ts` |
| GET/PUT `/import-mappings/:target` | GET `/imports/mappings` |
| GET `/review-queue`, PATCH `/review-queue/:id`, POST `/review-queue/bulk-fix` | `/imports/review-queue`, PATCH `/imports/review-queue/bulk` |
| POST `/imports/:id/dry-run` | PUT `/imports/:id/mapping`, then GET `/imports/:id/preview` |
| GET `/reports/data-quality` | GET `/imports/data-quality` |
