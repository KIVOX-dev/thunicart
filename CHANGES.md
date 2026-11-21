# Admin restructure: what moved, what was renamed, what was removed

Sidebar order (desktop sidebar, mobile **More** page, and the Go to search all follow the same list in `frontend/admin/src/app/modules.tsx`, `MENU`):

1. Billing center · 2. Review queue · 3. Vendors · 4. Customers · 5. Stock audit · 6. Return transfers · 7. Purchase and payment · 8. Online store · 9. Accounts (cashflow) · 10. Reports · 11. Business profile · 12. Users · 13. Number series · 14. Activity log and tracking

(The brief numbers 16 items; Store Content (9) and Export Center (12) are removed, so 14 remain.)
Extra, not in the brief, so nothing was lost: a **Dashboard** link at the top, and a small **Catalogue and stock** section at the bottom (Items and labels, Stock levels, Import stock).
Mobile bottom tabs are now Billing, Audit, Store, Reports, More.

## Moved
| From | To |
|---|---|
| POS / billing | **Billing center**: own route group (`/billing/*`, `app/billing-app.tsx`), own layout and `pos.*` permissions. Loaded as its own chunk; the admin shell is a separate chunk (`app/admin-app.tsx`), so `/billing` never loads it. |
| Purchase > Returns tab | Return transfers > **Vendor returns** |
| Transfers (store to store) | Return transfers > **Store transfers** (kept so nothing is lost) |
| Roles and permissions screen | Users > **Roles** and **Permissions** tabs |
| Online orders placeholder, Store content | **Online store** (`/store`): Orders, Banners, Content, Products |
| Online returns | Return transfers > Customer returns > Online orders |
| Expenses tab | Accounts > Expenses (now `/expenses`, with Charges split out) |

Old addresses redirect: `/settings/roles`, `/exports`, `/cms`, `/orders`, `/stock/transfers`.

## Renamed
Transfers → **Return transfers** · Purchase → **Purchase and payment** · POS → **Billing center** · Online orders / Store content → **Online store** · Accounts → **Accounts (cashflow)** · Users → **Users** (with tabs) · Activity log → **Activity log and tracking** · Stock → **Stock levels** · permission module labels follow (keys unchanged, so no role loses access).

## New
- **Vendors**: Purchase history tab (bills, dates, amounts, paid, outstanding, status) and vendor totals.
- **Customers**: one list with Online / Offline / All filter, Source badge, and *Find duplicates* (same phone, written differently, or same email) with a merge that moves bills, ledgers, orders and returns.
- **Purchase and payment**: bills carry Unpaid / Partially paid / Paid (filterable). Payments, returns (debit notes) and settlements all feed the vendor outstanding.
- **Accounts**: Expenses, **Charges** (bank, gateway, delivery, penalty), **Outstanding to vendors** (live), **Settlements** (full or partial, with reason, no cash movement). Customer receipts and customers-owe tabs are kept.
- **Return transfers**: Customer returns for online orders (approve, goods received, refund with restock or damaged, wallet or original) and counter returns.
- **Reports**: cashflow and outstanding widgets on the Dashboard. GST on/off behaviour is untouched.
- **Users**: Users | Roles | Permissions; create roles, tick permissions per module, assign users to a role. New top level **Employee** role (billing, customers view/add, stock audit, customer returns).
- **Activity log**: now records user, **role**, **module**, time, before/after; filter by user, module and date.
- **Export button** on each list (vendors, customers, items, stock, purchases, bills, expenses).
- 4 inch thermal label templates (100 x 50 and 100 x 25 mm); print page size is now applied (it was nested in `@media print`, which browsers ignore).

## Removed (dead code deleted)
- Store content menu item and its placeholder (`later`/`ComingSoon`).
- Export center: `ExportCenter`, `ExportsDesktop/Mobile`, `useDatasets`, `useExportHistory`, `useMonthlyEmail`, mock `/exports/datasets` and `/exports/settings`, `exportRecord`. The backend `/exports` job endpoints stay: the per list buttons use them.
- `RolesDesktop/RolesMobile` (now `components/roles/*`).
- Mock `monthlyEmail` state.

## Schema and migration
`backend/migrations/20261118000000-admin-restructure.cjs` (idempotent, additive only; run `pnpm --filter @thunikart/backend exec migrate-mongo up`):
- creates the Employee role and its permissions (existing roles and users untouched);
- adds the `VS` number series (vendor settlements);
- `purchase_bills.settled = 0`, `expenses.kind = 'expense'` where missing;
- backfills `activity_log.module` and `userRole`;
- adds the two 4 inch label templates.

New fields: `PurchaseBill.settled`, `Expense.kind`, `ActivityLog.userRole/module`, model `VendorSettlement`. Customer source needs no field: Online = account group *E-commerce B2C*.
New endpoints: `GET/POST /vendor-settlements`, `GET /customers/duplicates`, `POST /customers/merge`; extended: `/customers?source=`, `/purchase-bills?paymentStatus=`, `/expenses?kind=`, `/activity-log?module=&role=`. OpenAPI and the typed client are regenerated. `.env` placeholders and the GST toggle are unchanged.

## Assumptions to confirm
- Employee default permissions as in the brief; Sales, Buyer Purchase and Accounts stay as extra roles.
- "Stock audit updates actual stock and logs the difference": already how approving an audit works (variance posted to the stock ledger, expected vs counted kept).
- Settlements need the `accounts.approve` permission.
- Online store "Products" tab links to the item catalogue; there is no separate per product online switch yet.

## Not done / caveats
- Mock (demo) mode: the new screens call the real API paths, so Accounts, Settlements, Store, Return transfers and Vendor history need the backend (same as the already migrated purchase and stock screens). Mock seed gets the Employee role and activity fields only.
- Playwright e2e specs were updated for renamed screens but **not run**.
