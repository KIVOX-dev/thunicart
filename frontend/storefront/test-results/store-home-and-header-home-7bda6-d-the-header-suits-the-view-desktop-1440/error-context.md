# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: store.spec.ts >> home and header >> home has the sections in the right order, and the header suits the view
- Location: e2e\store.spec.ts:17:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('region', { name: 'Featured' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('region', { name: 'Featured' }) with timeout 5000ms
  - waiting for getByRole('region', { name: 'Featured' })

```

```yaml
- 'heading "Application error: a client-side exception has occurred while loading localhost (see the browser console for more information)." [level=2]'
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
> 19  |     await expect(page.getByRole('region', { name: 'Featured' })).toBeVisible();
      |                                                                  ^ Error: expect(locator).toBeVisible() failed
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
```