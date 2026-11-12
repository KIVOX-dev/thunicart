# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: store.spec.ts >> listing >> filters live in the URL and survive a reload, and sort works
- Location: e2e\store.spec.ts:75:3

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.textContent: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByTestId('result-count')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [active]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - navigation [ref=e7]:
          - button [disabled] [ref=e8]:
            - img "previous" [ref=e9]
          - generic [ref=e11]:
            - generic [ref=e12]: 1/
            - text: "1"
          - button [disabled] [ref=e13]:
            - img "next" [ref=e14]
        - link "Next.js 15.5.29 (outdated) Webpack" [ref=e17] [cursor=pointer]:
          - /url: https://nextjs.org/docs/messages/version-staleness
          - generic "An outdated version detected (latest is 16.4.6), upgrade is highly recommended!" [ref=e20]: Next.js 15.5.29 (outdated)
          - generic [ref=e21]: Webpack
      - generic [ref=e22]:
        - dialog "Runtime Error" [ref=e23]:
          - generic [ref=e26]:
            - generic [ref=e27]:
              - generic [ref=e28]:
                - generic [ref=e29]: Runtime Error
                - generic [ref=e31]:
                  - button "Copy Error Info" [ref=e32] [cursor=pointer]
                  - button "No related documentation found" [disabled] [ref=e35]
                  - link "Learn more about enabling Node.js inspector for server code with Chrome DevTools" [ref=e38] [cursor=pointer]:
                    - /url: https://nextjs.org/docs/app/building-your-application/configuring/debugging#server-side-code
              - paragraph [ref=e48]: invariant expected app router to be mounted
            - generic [ref=e49]:
              - generic [ref=e50]:
                - paragraph [ref=e52]:
                  - generic [ref=e57]: src\components\shared\SearchBox.tsx (17:27) @ SearchPanel
                  - button "Open in editor" [ref=e58] [cursor=pointer]
                - generic [ref=e63]:
                  - generic [ref=e64]: 15 | const [q, setQ] = useState('');
                  - generic [ref=e65]: 16 | const [list, setList] = useState<Suggestion[]>([]);
                  - generic [ref=e66]: "> 17 | const router = useRouter();"
                  - generic [ref=e67]: "| ^"
                  - generic [ref=e68]: "18 | useEffect(() => {"
                  - generic [ref=e69]: "19 | if (q.trim().length < 2) { setList([]); return; }"
                  - generic [ref=e70]: "20 | const t = setTimeout(async () => { try { setList(await capi<Suggestion[]>('GET', `/catalog/suggest?q=${encodeURIComponent(q.trim())}`)); } catch { setList([]); } }, 150);"
              - generic [ref=e71]:
                - generic [ref=e72]:
                  - paragraph [ref=e73]:
                    - text: Call Stack
                    - generic [ref=e74]: "14"
                  - button "Show 12 ignore-listed frame(s)" [ref=e75] [cursor=pointer]
                - generic [ref=e78]:
                  - generic [ref=e79]:
                    - text: SearchPanel
                    - button "Open SearchPanel in editor" [ref=e80] [cursor=pointer]
                  - text: src\components\shared\SearchBox.tsx (17:27)
                - generic [ref=e83]:
                  - generic [ref=e84]:
                    - text: RootLayout
                    - button "Open RootLayout in editor" [ref=e85] [cursor=pointer]
                  - text: src\app\layout.tsx (44:11)
          - generic [ref=e88]:
            - generic [ref=e89]: "1"
            - generic [ref=e90]: "2"
        - contentinfo [ref=e91]:
          - region "Error feedback" [ref=e92]:
            - paragraph [ref=e93]:
              - link "Was this helpful?" [ref=e94] [cursor=pointer]:
                - /url: https://nextjs.org/telemetry#error-feedback
            - button "Mark as helpful" [ref=e95] [cursor=pointer]
            - button "Mark as not helpful" [ref=e99] [cursor=pointer]
    - generic [ref=e106] [cursor=pointer]:
      - button "Open Next.js Dev Tools" [ref=e107]
      - generic [ref=e111]:
        - button "Open issues overlay" [ref=e112]:
          - generic [ref=e113]:
            - generic [aria-hidden] [ref=e114]: "0"
            - generic [ref=e115]: "1"
          - generic [ref=e116]: Issue
        - button "Collapse issues badge" [ref=e117]
  - 'heading "Application error: a client-side exception has occurred while loading localhost (see the browser console for more information)." [level=2] [ref=e122]'
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | import { addToBag, noSidewaysScroll, products, resetMock, signIn, stocked } from './helpers';
  3   | 
  4   | const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  5   | 
  6   | test.beforeEach(async ({ request, context }) => { await resetMock(request); await context.clearCookies(); });
  7   | 
  8   | /** A product costing 1,000 or more with plenty of stock, so SAVE10 applies and the wallet only covers part of the bill. */
  9   | async function bigItem(request: Parameters<typeof stocked>[0]) {
  10  |   const list = await products(request);
  11  |   const p = list.find((x) => x.fromPrice >= 100000 && x.variants.some((v) => v.stock >= 4))!;
  12  |   const v = p.variants.find((x) => x.stock >= 4)!;
  13  |   return { p, v };
  14  | }
  15  | 
  16  | test.describe('home and header', () => {
  17  |   test('home has the sections in the right order, and the header suits the view', async ({ page, isMobile }) => {
  18  |     await page.goto('/');
  19  |     await expect(page.getByRole('region', { name: 'Featured' })).toBeVisible();
  20  |     const order = await page.locator('main section[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  21  |     expect(order.slice(0, 7)).toEqual(['Featured', 'Shop by category', 'Shop by size', 'Trending now', 'Shop by occasion', 'New arrivals', 'Lookbook']);
  22  |     await expect(page.getByRole('region', { name: 'Shop by category' }).getByRole('link')).toHaveCount(6);
  23  |     await expect(page.getByRole('region', { name: 'Shop by size' }).getByRole('link', { name: 'M', exact: true })).toBeVisible();
  24  |     await expect(page.getByRole('contentinfo').getByRole('navigation', { name: 'Quick shop' })).toBeVisible();
  25  |     await expect(page.getByRole('contentinfo').getByLabel('Newsletter')).toBeVisible();
  26  |     if (isMobile) {
  27  |       await expect(page.getByRole('navigation', { name: 'Main tabs' })).toBeVisible();
  28  |       for (const t of ['Home', 'Categories', 'Wishlist', 'Cart', 'Account']) await expect(page.getByRole('navigation', { name: 'Main tabs' })).toContainText(t);
  29  |     } else {
  30  |       await expect(page.getByRole('navigation', { name: 'Main tabs' })).toBeHidden();
  31  |       const nav = page.getByRole('navigation', { name: 'Categories' }).filter({ visible: true });
  32  |       for (const t of ['Sale', 'Bestseller']) await expect(nav.getByRole('link', { name: t })).toBeVisible();
  33  |       expect(await nav.getByRole('link', { name: 'Kurtis' }).evaluate((e) => getComputedStyle(e).textTransform)).toBe('uppercase');
  34  |     }
  35  |     await noSidewaysScroll(page);
  36  |   });
  37  | 
  38  |   test('the announcement bar rotates and has a pause and play control', async ({ page }) => {
  39  |     await page.goto('/');
  40  |     const msg = page.getByTestId('announcement');
  41  |     const first = await msg.textContent();
  42  |     await expect.poll(async () => msg.textContent(), { timeout: 8000 }).not.toBe(first);
  43  |     await page.getByRole('button', { name: 'Pause offer messages' }).click();
  44  |     await expect(page.getByRole('button', { name: 'Play offer messages' })).toHaveAttribute('aria-pressed', 'true');
  45  |     const held = await msg.textContent();
  46  |     await page.waitForTimeout(4500);
  47  |     expect(await msg.textContent()).toBe(held);
  48  |     await page.getByRole('button', { name: 'Play offer messages' }).click();
  49  |     await expect.poll(async () => msg.textContent(), { timeout: 8000 }).not.toBe(held);
  50  |   });
  51  | 
  52  |   test('the side menu has expandable categories with sub lists and quick links', async ({ page }) => {
  53  |     await page.goto('/');
  54  |     await page.getByRole('button', { name: 'Open menu' }).click();
  55  |     const d = page.getByRole('dialog', { name: 'Menu' });
  56  |     await d.getByRole('button', { name: 'Kurtis sub categories' }).click();
  57  |     await expect(d.getByRole('link', { name: 'Cotton kurtis' })).toBeVisible();
  58  |     await expect(d.getByRole('link', { name: 'Sale' })).toBeVisible();
  59  |     await d.getByRole('link', { name: 'Cotton kurtis' }).click();
  60  |     await expect(page).toHaveURL(/\/c\/cotton-kurtis/);
  61  |     await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cotton kurtis');
  62  |   });
  63  | 
  64  |   test('keyboard: the skip link is first and the focus ring is a 2 px outline', async ({ page }) => {
  65  |     await page.goto('/');
  66  |     await page.keyboard.press('Tab');
  67  |     await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  68  |     await page.keyboard.press('Tab');
  69  |     const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return { w: s.outlineWidth, style: s.outlineStyle }; });
  70  |     expect(ring).toEqual({ w: '2px', style: 'solid' });
  71  |   });
  72  | });
  73  | 
  74  | test.describe('listing', () => {
  75  |   test('filters live in the URL and survive a reload, and sort works', async ({ page, isMobile }) => {
  76  |     await page.goto('/c/kurtis');
  77  |     const count = page.getByTestId('result-count');
> 78  |     const before = await count.textContent();
      |                                ^ Error: locator.textContent: Test timeout of 90000ms exceeded.
  79  |     if (isMobile) {
  80  |       await page.getByRole('button', { name: /^Filter/ }).click();
  81  |       const s = page.getByRole('dialog', { name: 'Filters' });
  82  |       await s.getByRole('button', { name: 'M', exact: true }).click();
  83  |       await s.getByRole('button', { name: /Show \d+ items/ }).click();
  84  |     } else {
  85  |       await page.getByRole('complementary', { name: 'Filters' }).getByRole('button', { name: 'M', exact: true }).click();
  86  |     }
  87  |     await expect(page).toHaveURL(/size=M/);
  88  |     await expect(count).not.toHaveText(before!);
  89  |     await page.reload();
  90  |     await expect(page).toHaveURL(/size=M/);
  91  |     if (!isMobile) await expect(page.getByRole('complementary', { name: 'Filters' }).getByRole('button', { name: 'M', exact: true })).toHaveAttribute('aria-pressed', 'true');
  92  |     if (isMobile) {
  93  |       await page.getByRole('button', { name: 'Sort' }).click();
  94  |       await page.getByRole('dialog', { name: 'Sort by' }).getByRole('button', { name: 'Price: low to high' }).click();
  95  |     } else {
  96  |       await page.getByRole('combobox', { name: 'Sort products' }).selectOption('price-asc');
  97  |     }
  98  |     await expect(page).toHaveURL(/sort=price-asc/);
  99  |     const prices = await page.locator('[data-testid="price"]').allTextContents();
  100 |     const nums = prices.map((t) => Number(t.replace(/[^\d.]/g, '')));
  101 |     expect([...nums].sort((a, b) => a - b)).toEqual(nums);
  102 |     await noSidewaysScroll(page);
  103 |   });
  104 | 
  105 |   test('colour chips with names, price ranges and a clear all (desktop sidebar)', async ({ page, isMobile }) => {
  106 |     test.skip(isMobile);
  107 |     await page.goto('/c/all');
  108 |     const side = page.getByRole('complementary', { name: 'Filters' });
  109 |     await side.getByRole('button', { name: 'Navy' }).click();
  110 |     await side.getByRole('button', { name: 'Under ₹500' }).click();
  111 |     await expect(page).toHaveURL(/color=Navy/);
  112 |     await expect(page).toHaveURL(/price=u500/);
  113 |     await side.getByRole('button', { name: /Clear all/ }).click();
  114 |     await expect(page).not.toHaveURL(/color=/);
  115 |   });
  116 | 
  117 |   test('Load more adds products and the back button keeps them', async ({ page }) => {
  118 |     await page.goto('/c/all');
  119 |     const cards = page.getByTestId('product-card');
  120 |     await expect(cards).toHaveCount(12);
  121 |     await page.getByRole('link', { name: 'Load more' }).click();
  122 |     await expect(page).toHaveURL(/pages=2/);
  123 |     await expect(cards).toHaveCount(24);
  124 |     await cards.nth(15).getByRole('link', { name: /./ }).filter({ visible: true }).first().click();
  125 |     await expect(page).toHaveURL(/\/p\//);
  126 |     await page.goBack();
  127 |     await expect(page).toHaveURL(/pages=2/);
  128 |     await expect(cards).toHaveCount(24);
  129 |   });
  130 | 
  131 |   test('an empty result says so and offers to clear the filters', async ({ page }) => {
  132 |     await page.goto('/c/accessories?size=XXL&price=1500%2B&brand=JIANA');
  133 |     await expect(page.getByText('No products match these filters.')).toBeVisible();
  134 |     await page.getByRole('link', { name: 'Clear all filters' }).click();
  135 |     await expect(page.getByTestId('product-card').first()).toBeVisible();
  136 |   });
  137 | });
  138 | 
  139 | test.describe('product page', () => {
  140 |   test('server rendered structured data, canonical and open graph tags', async ({ page, request }) => {
  141 |     const { p } = await stocked(request);
  142 |     await page.goto(`/p/${p.slug}`);
  143 |     const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!) as { '@type': string; name: string; offers: { price: string; priceCurrency: string; availability: string } };
  144 |     expect(ld['@type']).toBe('Product');
  145 |     expect(ld.name).toBe(p.name);
  146 |     expect(ld.offers.priceCurrency).toBe('INR');
  147 |     expect(ld.offers.availability).toBe('https://schema.org/InStock');
  148 |     expect(Number(ld.offers.price)).toBe(p.fromPrice / 100);
  149 |     await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/p/${p.slug}$`));
  150 |     await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', p.name);
  151 |     await expect(page).toHaveTitle(new RegExp(p.name));
  152 |     // The page works without scripts too: the name and price are in the server HTML.
  153 |     const html = await (await request.get(`/p/${p.slug}`)).text();
  154 |     expect(html).toContain(p.name);
  155 |     expect(html).toContain('application/ld+json');
  156 |   });
  157 | 
  158 |   test('colours, sizes with sold out crossed out, price block, stock message and delivery check', async ({ page, request }) => {
  159 |     const list = await products(request);
  160 |     const p = list.find((x) => x.variants.some((v) => v.stock === 0) && x.variants.some((v) => v.stock >= 4))!;
  161 |     const sold = p.variants.find((v) => v.stock === 0)!;
  162 |     await page.goto(`/p/${p.slug}`);
  163 |     await page.getByRole('button', { name: `Colour ${sold.color}` }).click();
  164 |     const soldBtn = page.getByRole('button', { name: `Size ${sold.size}, sold out` });
  165 |     await expect(soldBtn).toBeVisible(); // sold out sizes are never hidden
  166 |     expect(await soldBtn.evaluate((e) => getComputedStyle(e).textDecorationLine)).toContain('line-through');
  167 |     await soldBtn.click();
  168 |     await expect(page.getByTestId('stock-message')).not.toContainText('Out of stock'); // a sold out size cannot be chosen
  169 |     await page.getByRole('button', { name: 'Add to cart' }).click();
  170 |     await expect(page.getByRole('alert').filter({ hasText: 'Choose a size first' })).toBeVisible();
  171 |     await expect(page.getByTestId('price').first()).toContainText('₹');
  172 |     await page.getByLabel('Check delivery').fill('641016');
  173 |     await page.getByRole('button', { name: 'Check', exact: true }).click();
  174 |     await expect(page.getByTestId('delivery-message')).toContainText('Coimbatore: Delivery in 2 days');
  175 |     await page.getByLabel('Check delivery').fill('999999');
  176 |     await page.getByRole('button', { name: 'Check', exact: true }).click();
  177 |     await expect(page.getByTestId('delivery-message')).toContainText('do not deliver');
  178 |     await page.getByRole('button', { name: 'Size chart' }).click();
```