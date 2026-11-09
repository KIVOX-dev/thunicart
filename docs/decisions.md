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

## Questions asked and answered

None yet.
