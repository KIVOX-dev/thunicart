# API requests from the frontend

`docs/api/openapi.json` does not exist yet and `shared/src/api-client/schema.d.ts` is still a placeholder, so Phase F0 runs on an MSW mock
(`frontend/admin/src/mocks`) that follows the zod schemas in `shared/src/schemas`. When the spec lands, `frontend/admin/src/features/api/http.ts`
is replaced by the generated client and the mock handlers are checked against it. Nothing under backend or shared was edited.

## Endpoints the F0 screens assume (please confirm or correct)

| Method and path | Used by | Notes |
| --- | --- | --- |
| POST /auth/login | Login | body `loginBody`, returns `loginResponse`, sets httpOnly refresh cookie |
| POST /auth/refresh | Quiet refresh, page reload | cookie only, returns `refreshResponse`. 401 when no session |
| POST /auth/logout | Sign out | clears cookie |
| POST /auth/forgot-password | Forgot password | body `{ email }`. Always 200 so emails are not revealed |
| GET /auth/sessions | Profile | array of `sessionDto` |
| GET /me | Menus and permissions | `meResponse` |
| GET /settings/gst-status | GST mode | `gstStatus`. Also inside `/me`, so the app reads it once from there |
| GET, PUT /settings/business-profile | Business profile | PUT body `businessProfileBody`. 422 field errors for GSTIN. Code `GST_CLEAR_CONFIRM_REQUIRED` when clearing a live GSTIN without `confirmGstClear` |
| GET /settings/number-series, PATCH /settings/number-series/:key | Number series | `numberSeriesDto`, body `numberSeriesUpdateBody` |
| GET, POST /users, PATCH /users/:id, POST /users/:id/reset-password | Users | list envelope `listResponse(userDto)` with `q`, `page`, `pageSize` |
| GET, POST /roles, PATCH /roles/:id, PUT /roles/:id/permissions, GET /roles/permission-catalog | Roles | `roleDto`, `permissionCatalog` |
| GET /activity | Activity log | `listResponse(activityDto)` with `entity`, `userId` filters |

## Questions for the backend

1. Which permission keys gate Number series and Activity log? F0 uses `settings.view` and `settings.edit`.
2. Should `GET /me` include the list of stores for the store switcher? F0 shows one fixed store.
3. Is `entity` on the activity log a free string? The filter list in the UI is fixed to user, role, business-profile, number-series.


## Phase F1 endpoints (proposals, built against the mock)

The B1 spec is not published, so the F1 contracts are defined in `frontend/admin/src/features/catalog/types.ts` as zod schemas. Money is integer paise.

| Method and path | Used by | Notes |
| --- | --- | --- |
| GET /items | Items list, label picker, stock search | filters `q category brand stockStatus active issue sort page pageSize`. Envelope has `items total nextPage` plus `pieces` (sum of stock for the filter) |
| GET /items/facets | Filters, stock by store | `categories brands stores` |
| GET /items/lookup?barcode= | Keyboard scanner, camera, typed code | matches a size barcode or the item code, case insensitive. 404 when unknown. Returns `item` and `variantId` |
| POST /items, GET, PUT /items/:id | Item form | body `itemBody`. 409 `CODE_TAKEN` with a field error. `stockStatus` and per store stock are computed by the API and read only |
| POST /items/bulk | Items bulk actions | `{ ids, action: activate, deactivate or set-category, category? }` |
| POST /uploads/presign | Item media, import file, return photos | `{ filename, contentType, kind }` returns `{ uploadUrl, key }`. The browser then PUTs the file to `uploadUrl` |
| GET, POST, PUT /vendors | Vendors | 422 field errors for GSTIN, PAN and state mismatch. `outstanding` is read only |
| GET, POST, PUT /customers, GET /customers/:id/ledgers | Customers | `outstanding`, loyalty and wallet are read only. 409 `MOBILE_TAKEN` |
| GET /hsn-rules, PATCH /hsn-rules/:hsn, POST /hsn-rules/confirm | HSN and GST rates | `rule` is the text from the master sheet. Confirm needs `gst.approve` |
| GET, PUT /import-mappings/:target | Import wizard | saved column mapping (PUT is sent inside dry-run with `saveMapping`) |
| POST /imports, GET /imports, GET /imports/:id | Import wizard, history | status `uploaded, dry-run, committing, committed, rolled-back`, `progress` 0 to 100 while committing |
| POST /imports/:id/dry-run | Import wizard | `{ sheet, target, mapping, saveMapping }` returns counts `rows ok warnings errors items pieces` and the error list |
| POST /imports/:id/commit | Import wizard | sent with an Idempotency-Key. A second call returns the same batch |
| POST /imports/:id/rollback | Import wizard | removes the items from that batch, needs `items.delete` |
| GET /review-queue, PATCH /review-queue/:itemId, POST /review-queue/bulk-fix | Review queue | issues `MISSING_HSN SIZE_PLACEHOLDER MISSING_MRP MISSING_RATE NEGATIVE_STOCK`. Each MISSING_HSN row carries `suggestedHsn` (the most used HSN in the same category). Bulk actions `accept-hsn-suggestions` and `set-size`, optionally by `category` |
| GET /reports/data-quality | Data quality report | counts by issue and by category |
| GET, POST /label-templates | Labels | `name widthMm heightMm fields fontPx` |

Questions for the backend (F1)
1. Is a negative opening quantity allowed on import? The client sheet has one item at -1 and the stated totals (535 items, 5,019 pieces) include it. F1 imports it as is and flags it NEGATIVE_STOCK.
2. Should the importer read `.xlsb` itself? Browsers cannot, so the file goes to storage and the API reads it. The mock replays the client sheet from `frontend/admin/scripts/extract-stock.py`.
3. Item code in the client sheet is sometimes numeric (one row is a 13 digit barcode). F1 treats codes as strings.
