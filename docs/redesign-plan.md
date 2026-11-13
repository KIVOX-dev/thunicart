# Thunikart UI redesign: "Bold and colourful"

Same palette (navy #0B1B54, orange #F67025, teal #0BBBB4, white). Everything else changes: shapes, type, colour use, depth, motion, layout.

## Design language

| | Before | After |
|---|---|---|
| Shape | 2 px sharp corners | Soft: 12 px controls, 20 px cards, 28 px panels, pill buttons and chips |
| Type | Small uppercase letter-spaced headings | Heavy sentence-case headings (Inter 800, tight tracking), big display sizes on the store, uppercase only for tiny labels |
| Colour | White page, navy text, orange only on buttons | Big navy blocks, orange and teal colour panels, soft tinted surfaces (tints of the same three colours), colour-coded categories |
| Depth | Flat, 1 px lines | Soft layered shadows, hover lift, coloured offset shadows on key cards |
| Motion | Fades | Springy press and hover, marquee strip, staggered reveal (all off for reduced motion) |
| Contrast rule | Navy on orange and teal | Unchanged. White text only on navy. Tints keep 4.5:1 with navy text |

Tints used (all derived from the three brand colours): navy-50 #EEF1FA, navy-100 #DDE3F5, orange-50 #FFF1E8, orange-100 #FFDFC8, teal-50 #E3F8F7, teal-100 #BFEFEC.

## Phases (all built in one stretch, tests after each)

1. **R0 Design system** (`frontend/ui`): new tokens (radius, shadows, tints, display type), Button (pill, press), Input/Select/Checkbox (rounded, bigger), Badge (soft tints), Tabs (pill tabs), Table (rounded card, zebra tint), Modal/Drawer/Sheet (large radius), Toast, Skeleton, EmptyState, style guide page.
2. **R1 Storefront shell**: announcement marquee, header with pill search and icon buttons, bold category bar and mega menu with colour tiles, mobile header and bottom bar, side menu, cart drawer, footer (navy block with big wordmark).
3. **R2 Storefront pages**: home (colour-block hero, category tiles, size chips, occasion tiles, product rows, lookbook, newsletter), listing and filters, product card, product page, cart, checkout, order, account, compare, blog, content pages, login.
4. **R3 Admin shell and screens**: navy sidebar with colour-coded groups and pill active state, top bar, mobile tabs and More sheet, login and forgot screens, dashboard cards, tables and forms (through the shared components), report and import screens.
5. **R4 Billing counter**: bigger touch targets, bold totals, colour-coded pay buttons, scanner state banner.
6. **R5 Checks**: update tests that assert old text or style, run admin and storefront suites at 390 and 1440, contrast test, builds, commit.

## Out of scope
Backend, API contracts, copy, and information architecture (menus and routes stay as they are).
