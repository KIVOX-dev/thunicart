# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: store.spec.ts >> listing >> an empty result says so and offers to clear the filters
- Location: e2e\store.spec.ts:131:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('No products match these filters.')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('No products match these filters.') with timeout 5000ms
  - waiting for getByText('No products match these filters.')

```

```yaml
- 'heading "Application error: a client-side exception has occurred while loading localhost (see the browser console for more information)." [level=2]'
```

# Test source

```ts
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
  78  |     const before = await count.textContent();
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
> 133 |     await expect(page.getByText('No products match these filters.')).toBeVisible();
      |                                                                      ^ Error: expect(locator).toBeVisible() failed
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
  179 |     await expect(page.getByRole('dialog', { name: 'Size chart' })).toBeVisible();
  180 |   });
  181 | 
  182 |   test('the phone view has a swipe gallery and a sticky Add to cart bar; the desktop has thumbnails and zoom', async ({ page, request, isMobile }) => {
  183 |     const { p } = await stocked(request);
  184 |     await page.goto(`/p/${p.slug}`);
  185 |     if (isMobile) {
  186 |       await expect(page.getByRole('region', { name: `${p.name} pictures` })).toBeVisible();
  187 |       const bar = page.getByRole('button', { name: 'Add to cart' });
  188 |       await expect(bar).toBeVisible();
  189 |       const box = await bar.boundingBox();
  190 |       expect(box!.y + box!.height).toBeGreaterThan(780); // fixed to the bottom of the screen
  191 |       await page.mouse.wheel(0, 1500);
  192 |       await expect(bar).toBeVisible();
  193 |     } else {
  194 |       await expect(page.getByRole('button', { name: 'Show picture 2' }).filter({ visible: true })).toBeVisible();
  195 |       await page.getByTestId('zoom-area').hover({ position: { x: 100, y: 100 } });
  196 |       const t = await page.getByTestId('zoom-area').locator('img').evaluate((e) => (e as HTMLElement).style.transform);
  197 |       expect(t).toContain('scale(2)');
  198 |     }
  199 |     await noSidewaysScroll(page);
  200 |   });
  201 | 
  202 |   test('wishlist, compare and recently viewed', async ({ page, request }) => {
  203 |     const list = await products(request);
  204 |     const [a, b] = [list[0]!, list[1]!];
  205 |     await page.goto(`/p/${a.slug}`);
  206 |     await page.getByRole('button', { name: 'Add to wishlist' }).click();
  207 |     await page.getByRole('button', { name: 'Compare' }).click();
  208 |     await page.goto(`/p/${b.slug}`);
  209 |     await page.getByRole('button', { name: 'Compare' }).click();
  210 |     await expect(page.getByRole('region', { name: 'Recently viewed' })).toContainText(a.name);
  211 |     await page.goto('/compare');
  212 |     const t = page.getByRole('table', { name: 'Product comparison' });
  213 |     await expect(t.getByRole('link', { name: a.name })).toBeVisible();
  214 |     await expect(t.getByRole('link', { name: b.name })).toBeVisible();
  215 |     await page.goto('/account/wishlist');
  216 |     await expect(page.getByRole('list', { name: 'Wishlist' })).toContainText(a.name);
  217 |   });
  218 | });
  219 | 
  220 | test.describe('bag, coupon and stock problems', () => {
  221 |   test('add to cart opens the drawer, the cart is a cookie, and coupons give clear messages', async ({ page, request, isMobile }) => {
  222 |     const { p, v } = await bigItem(request);
  223 |     await addToBag(page, p.slug, v.color, v.size);
  224 |     const drawer = page.getByRole('dialog', { name: /Your bag/ });
  225 |     await expect(drawer).toBeVisible();
  226 |     await expect(drawer).toContainText(p.name);
  227 |     await expect(drawer.getByRole('link', { name: 'Checkout' })).toBeVisible();
  228 |     const cookies = await page.context().cookies();
  229 |     expect(cookies.find((c) => c.name === 'tk_cart')?.value).toContain(v.id);
  230 |     await drawer.getByRole('button', { name: 'Close' }).click();
  231 |     await page.reload();
  232 |     await page.goto('/cart');
  233 |     await expect(page.getByRole('list', { name: 'Items in your bag' })).toContainText(p.name); // still there after a reload
```