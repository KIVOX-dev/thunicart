# Frontend decisions

## Phase F0

- **Mock first.** The backend spec is not published, so the admin app runs on MSW (`VITE_API_URL=REPLACE_ME...` turns it on). Handlers validate with the shared zod schemas so mock and real behaviour match. The mock database lives in localStorage so a demo survives reloads. Demo logins: admin, sales, buyer and accounts at `@thunikart.test`, password `Thunikart@123`.
- **Own thin API wrapper** (`features/api/http.ts`) instead of the generated client, because the generated types are empty. It does the quiet refresh once on 401, Idempotency-Key, and typed errors with requestId. Replace with `shared/src/api-client` when the spec exists.
- **One module registry** (`app/modules.tsx`) drives the router, desktop sidebar, mobile tabs and the More page, filtered by `/me` permissions and GST mode. Modules from later phases show a short "not built yet" screen so a role's menu can be demoed now.
- **Views.** Mobile below 768 px, desktop from 768 px. The override is stored per user on the device and set from the profile menu. Forcing desktop on a phone gives a wide layout, like any desktop site on a phone.
- **Desktop first screens** (roles matrix) show a notice with a Switch to desktop link on mobile.
- **GST.** The app reads GST mode from `/me` and refetches it after saving the business profile, so menus and wording change without a reload. Saving a new GSTIN opens a confirmation listing what changes. Clearing a live GSTIN asks for confirmation and sends `confirmGstClear`.
- **Tokens and preset** live in `frontend/ui` and are used by both apps. White on orange and white on teal fail AA for small text, so buttons use navy text on orange, and a unit test plus the style guide check the approved pairs.
- **Overlays** (modal, drawer, bottom sheet) use the native `dialog` element for focus trap and Esc.
- **Font.** Inter, bundled through `@fontsource/inter` (400, 500, 600), no run time third party load.
- **Lint rule** `no-restricted-imports` fails if frontend code imports from backend (`frontend/ui/eslint.base.js`).
- **Logo.** A placeholder wordmark is used until the files arrive in `docs/source`.
- **Hosting (proposal, to confirm).** Storefront on Catalyst AppSail (Next.js server). Admin as static files on Catalyst Slate, because the built app is plain static output and Slate deploys from git with preview builds. To verify against current Zoho docs in F6.
- **Windows note.** Next `output: standalone` is switched on only outside Windows, because it needs symlinks.

## Phase F1

- **Data contracts** for items, vendors, customers, HSN rules and imports are written as zod schemas in `features/catalog/types.ts` until B1 publishes its own. Field labels follow the workbook (a star means mandatory).
- **One item per stock row.** The imported sheet has one row per code and size, so each row becomes an item with one size. The item form supports many sizes for items created by hand.
- **Stock Status is shown, never typed.** The API works it out from stock and reorder levels.
- **Prices** are typed in rupees and converted to paise in one helper (`features/api/money.ts`). A blank Selling price sends the MRP and a blank barcode sends the item code. That is a visible default, not tax or discount maths.
- **No HSN badge** shows on items always, because HSN is item data. The HSN and GST rates screen is a GST screen, so it shows only while GST is on.
- **Import wizard** is desktop first. Mobile shows a notice with a Switch to desktop link. The wizard guesses the column mapping from names and prefers a saved mapping when all its columns exist.
- **Review queue** shows one row per item per problem, with inline fixes, a suggested HSN per category, and bulk fixes by category. The Data quality report counts problems by type and category.
- **Negative stock.** The client sheet has one item with stock -1. It is imported as is (so the totals match 535 items and 5,019 pieces) and flagged NEGATIVE_STOCK for a stock adjustment in F2.
- **Scanning.** A keyboard scanner is detected as a burst of 4 or more characters, ending in Enter, averaging 60 ms or less per key, so normal typing is ignored. The camera uses the browser BarcodeDetector where it exists and falls back to typing the code. A good scan beeps, a miss gives a lower beep, and the result card turns teal.
- **Labels.** Code 128 bars are drawn as SVG by `print/code128.ts` (tested). Printing uses the browser dialog and a template specific `@page` size. Labels from a GRN arrive with receiving in F2.
- **Mock data.** The client stock sheet is turned into `src/mocks/data/stock.json` by `scripts/extract-stock.py`. That file holds client data, so it is git ignored. Without it the mock uses a 12 row sample so CI still runs.
- **tailwind-merge** was added to `frontend/ui` so a later class such as `w-52` beats an earlier `w-full`.

## Questions asked and answered

- **Negative stock on import:** keep it as the sheet has it and flag it "Stock is below zero". Answered by the client owner.
- **Label size:** 50 x 25 mm. It is the first and default template. The 38 x 25 mm template stays available in the designer list.
- **HSN and GST rates screen:** stays hidden while GST is off.

None yet.
