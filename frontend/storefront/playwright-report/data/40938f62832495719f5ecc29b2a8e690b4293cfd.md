# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: store.spec.ts >> bag, coupon and stock problems >> an item with not enough stock is named and can be removed
- Location: e2e\store.spec.ts:259:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByTestId('unavailable')
Expected substring: "Modal Brief Pack"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" getByTestId('unavailable') with timeout 5000ms
  - waiting for getByTestId('unavailable')

```

```yaml
- link "Skip to content":
  - /url: "#main"
- region "Offers":
  - paragraph: Use code SAVE10 for 10% off above ₹999
  - button "Pause offer messages"
- banner:
  - button "Open menu"
  - link "Thunikart home":
    - /url: /
    - img "Thunikart by Krishnas Orchids"
  - button "Search"
  - link "Wishlist, 0 items":
    - /url: /account/wishlist
  - link "Account":
    - /url: /account
  - button "Open bag, 2 items": "2"
  - navigation "Categories":
    - list:
      - listitem:
        - link "Women":
          - /url: /c/women
      - listitem:
        - link "Men":
          - /url: /c/men
      - listitem:
        - link "Sale":
          - /url: /c/sale
      - listitem:
        - link "Bestseller":
          - /url: /c/bestseller
- main:
  - heading "Your bag (2)" [level=1]
  - list "Items in your bag":
    - listitem:
      - link "Modal Brief Pack":
        - /url: /p/modal-brief-pack
      - paragraph: Size M · Maroon
      - paragraph: ₹299.00₹400.00
      - button "Fewer Modal Brief Pack"
      - text: "2"
      - button "More Modal Brief Pack"
      - button "Remove Modal Brief Pack from your bag": Remove
      - strong: ₹598.00
  - complementary "Order totals":
    - form "Coupon":
      - text: Coupon code
      - textbox "Coupon code":
        - /placeholder: For example SAVE10
      - button "Apply"
    - term: Subtotal
    - definition: ₹598.00
    - term: Shipping
    - definition: ₹69.00
    - term: Total
    - definition: ₹667.00
    - link "Checkout":
      - /url: /checkout
    - paragraph: Free shipping above ₹999
- contentinfo:
  - img "Thunikart by Krishnas Orchids"
  - form "Newsletter":
    - text: Get offers by email
    - textbox "Get offers by email":
      - /placeholder: Your email
    - button "Join"
    - status
  - navigation "Quick shop":
    - heading "Quick shop" [level=2]
    - list:
      - listitem:
        - link "Women":
          - /url: /c/women
      - listitem:
        - link "Men":
          - /url: /c/men
      - listitem:
        - link "Sale":
          - /url: /c/sale
  - navigation "Helpful links":
    - heading "Helpful links" [level=2]
    - list:
      - listitem:
        - link "About us":
          - /url: /pages/about
      - listitem:
        - link "Contact":
          - /url: /pages/contact
      - listitem:
        - link "Shipping policy":
          - /url: /pages/shipping-policy
      - listitem:
        - link "Refund policy":
          - /url: /pages/refund-policy
      - listitem:
        - link "Privacy policy":
          - /url: /pages/privacy
      - listitem:
        - link "Terms of service":
          - /url: /pages/terms
  - heading "More" [level=2]
  - list:
    - listitem:
      - link "Blog and lookbook":
        - /url: /blog
    - listitem:
      - link "Track my order":
        - /url: /account/orders
    - listitem:
      - link "Compare products":
        - /url: /compare
  - text: Near KN Hall, Peedampalli Main Road, Pattanam, Coimbatore 641016
  - link "8400044191":
    - /url: tel:8400044191
  - text: hello@thunikart.test
  - list:
    - listitem:
      - link "Instagram":
        - /url: https://instagram.com/
    - listitem:
      - link "Facebook":
        - /url: https://facebook.com/
    - listitem:
      - link "YouTube":
        - /url: https://youtube.com/
  - paragraph: © 2026 Thunikart by Krishnas Orchids. All rights reserved.
- status
- alert
```

# Test source

```ts
  167 |     const soldBtn = page.getByRole('button', { name: `Size ${sold.size}, sold out` });
  168 |     await expect(soldBtn).toBeVisible(); // sold out sizes are never hidden
  169 |     expect(await soldBtn.evaluate((e) => getComputedStyle(e).textDecorationLine)).toContain('line-through');
  170 |     await soldBtn.click({ force: true });
  171 |     await expect(page.getByTestId('stock-message')).not.toContainText('Out of stock'); // a sold out size cannot be chosen
  172 |     await page.getByRole('button', { name: 'Add to cart' }).click();
  173 |     await expect(page.getByRole('alert').filter({ hasText: 'Choose a size first' })).toBeVisible();
  174 |     await expect(page.getByTestId('price').first()).toContainText('₹');
  175 |     await page.getByLabel('Check delivery').fill('641016');
  176 |     await page.getByRole('button', { name: 'Check', exact: true }).click();
  177 |     await expect(page.getByTestId('delivery-message')).toContainText('Coimbatore: Delivery in 2 days');
  178 |     await page.getByLabel('Check delivery').fill('999999');
  179 |     await page.getByRole('button', { name: 'Check', exact: true }).click();
  180 |     await expect(page.getByTestId('delivery-message')).toContainText('do not deliver');
  181 |     await page.getByRole('button', { name: 'Size chart' }).click();
  182 |     await expect(page.getByRole('dialog', { name: 'Size chart' })).toBeVisible();
  183 |   });
  184 | 
  185 |   test('the phone view has a swipe gallery and a sticky Add to cart bar; the desktop has thumbnails and zoom', async ({ page, request, isMobile }) => {
  186 |     const { p } = await stocked(request);
  187 |     await page.goto(`/p/${p.slug}`);
  188 |     if (isMobile) {
  189 |       await expect(page.getByRole('region', { name: `${p.name} pictures` })).toBeVisible();
  190 |       const bar = page.getByRole('button', { name: 'Add to cart' });
  191 |       await expect(bar).toBeVisible();
  192 |       const box = await bar.boundingBox();
  193 |       expect(box!.y + box!.height).toBeGreaterThan(700); // fixed to the bottom of the screen
  194 |       await page.mouse.wheel(0, 1500);
  195 |       await expect(bar).toBeVisible();
  196 |     } else {
  197 |       await expect(page.getByRole('button', { name: 'Show picture 2' }).filter({ visible: true })).toBeVisible();
  198 |       await page.getByTestId('zoom-area').hover({ position: { x: 100, y: 100 } });
  199 |       const t = await page.getByTestId('zoom-area').locator('img').evaluate((e) => (e as HTMLElement).style.transform);
  200 |       expect(t).toContain('scale(2)');
  201 |     }
  202 |     await noSidewaysScroll(page);
  203 |   });
  204 | 
  205 |   test('wishlist, compare and recently viewed', async ({ page, request }) => {
  206 |     const list = await products(request);
  207 |     const [a, b] = [list[0]!, list[1]!];
  208 |     await page.goto(`/p/${a.slug}`);
  209 |     await page.getByRole('button', { name: 'Add to wishlist' }).click();
  210 |     await page.getByRole('button', { name: 'Compare' }).click();
  211 |     await page.goto(`/p/${b.slug}`);
  212 |     await page.getByRole('button', { name: 'Compare' }).click();
  213 |     await expect(page.getByRole('region', { name: 'Recently viewed' })).toContainText(a.name);
  214 |     await page.goto('/compare');
  215 |     const t = page.getByRole('table', { name: 'Product comparison' });
  216 |     await expect(t.getByRole('link', { name: a.name })).toBeVisible();
  217 |     await expect(t.getByRole('link', { name: b.name })).toBeVisible();
  218 |     await page.goto('/account/wishlist');
  219 |     await expect(page.getByRole('list', { name: 'Wishlist' })).toContainText(a.name);
  220 |   });
  221 | });
  222 | 
  223 | test.describe('bag, coupon and stock problems', () => {
  224 |   test('add to cart opens the drawer, the cart is a cookie, and coupons give clear messages', async ({ page, request, isMobile }) => {
  225 |     const { p, v } = await bigItem(request);
  226 |     await addToBag(page, p.slug, v.color, v.size);
  227 |     const drawer = page.getByRole('dialog', { name: /Your bag/ });
  228 |     await expect(drawer).toBeVisible();
  229 |     await expect(drawer).toContainText(p.name);
  230 |     await expect(drawer.getByRole('link', { name: 'Checkout' })).toBeVisible();
  231 |     const cookies = await page.context().cookies();
  232 |     expect(cookies.find((c) => c.name === 'tk_cart')?.value).toContain(v.id);
  233 |     await drawer.getByRole('button', { name: 'Close' }).click();
  234 |     await page.reload();
  235 |     await page.goto('/cart');
  236 |     await expect(page.getByRole('list', { name: 'Items in your bag' })).toContainText(p.name); // still there after a reload
  237 |     await page.getByLabel('Coupon code').fill('NOPE');
  238 |     await page.getByRole('button', { name: 'Apply' }).click();
  239 |     await expect(page.getByTestId('coupon-error')).toHaveText('This coupon code is not valid.');
  240 |     await page.getByLabel('Coupon code').fill('save10');
  241 |     await page.getByRole('button', { name: 'Apply' }).click();
  242 |     await expect(page.getByTestId('coupon-ok')).toContainText('SAVE10');
  243 |     await expect(page.getByTestId('cart-discount')).toBeVisible();
  244 |     await noSidewaysScroll(page);
  245 |     void isMobile;
  246 |   });
  247 | 
  248 |   test('a coupon that needs a bigger bag says how much more to add', async ({ page, request }) => {
  249 |     const list = await products(request);
  250 |     const cheap = list.find((x) => x.fromPrice < 30000 && x.variants.some((v) => v.stock >= 2))!;
  251 |     const v = cheap.variants.find((x) => x.stock >= 2)!;
  252 |     await addToBag(page, cheap.slug, v.color, v.size);
  253 |     await page.goto('/cart');
  254 |     await page.getByLabel('Coupon code').fill('SAVE10');
  255 |     await page.getByRole('button', { name: 'Apply' }).click();
  256 |     await expect(page.getByTestId('coupon-error')).toContainText(/Add ₹\d+ more to use SAVE10/);
  257 |   });
  258 | 
  259 |   test('an item with not enough stock is named and can be removed', async ({ page, request }) => {
  260 |     const list = await products(request);
  261 |     const p = list.find((x) => x.variants.some((v) => v.stock >= 1 && v.stock <= 3))!;
  262 |     const v = p.variants.find((x) => x.stock >= 1 && x.stock <= 3)!;
  263 |     await addToBag(page, p.slug, v.color, v.size);
  264 |     await page.goto('/cart');
  265 |     for (let n = 0; n < v.stock; n++) await page.getByRole('button', { name: `More ${p.name}` }).click(); // one more than is in stock
  266 |     const gone = page.getByTestId('unavailable');
> 267 |     await expect(gone).toContainText(p.name);
      |                        ^ Error: expect(locator).toContainText(expected) failed
  268 |     await expect(gone).toContainText(`Only ${v.stock} left`);
  269 |     await expect(page.getByRole('link', { name: 'Checkout' })).toHaveAttribute('aria-disabled', 'true');
  270 |     await gone.getByRole('button', { name: 'Remove' }).click();
  271 |     await expect(page.getByText('Your bag is empty')).toBeVisible();
  272 |   });
  273 | });
  274 | 
  275 | test.describe('login with an email code', () => {
  276 |   test('clear errors for a wrong and an expired code, a resend timer, and no Google button in demo mode', async ({ page }) => {
  277 |     await page.goto('/login');
  278 |     await expect(page.getByRole('button', { name: /Google/ })).toHaveCount(0);
  279 |     await page.getByLabel('Email').fill('nope');
  280 |     await page.getByRole('button', { name: 'Send me a code' }).click();
  281 |     await expect(page.getByRole('alert')).toContainText('Enter a valid email');
  282 |     await page.getByLabel('Email').fill('expired@example.com');
  283 |     await page.getByRole('button', { name: 'Send me a code' }).click();
  284 |     await expect(page.getByTestId('otp-hint')).toContainText('123456');
  285 |     await expect(page.getByTestId('resend')).toBeDisabled();
  286 |     await expect(page.getByTestId('resend')).toContainText(/Resend code in \d+s/);
  287 |     await page.getByLabel('6 digit code').fill('123456');
  288 |     await page.getByRole('button', { name: 'Sign in' }).click();
  289 |     await expect(page.getByTestId('code-error')).toContainText('expired');
  290 |     await page.getByRole('button', { name: 'Change email' }).click();
  291 |     await page.getByLabel('Email').fill('someone@example.com');
  292 |     await page.getByRole('button', { name: 'Send me a code' }).click();
  293 |     await page.getByLabel('6 digit code').fill('000000');
  294 |     await page.getByRole('button', { name: 'Sign in' }).click();
  295 |     await expect(page.getByTestId('code-error')).toContainText('not right');
  296 |     await page.getByLabel('6 digit code').fill('123456');
  297 |     await page.getByRole('button', { name: 'Sign in' }).click();
  298 |     await expect(page).toHaveURL(/\/account$/);
  299 |     await expect(page.getByText('someone@example.com').first()).toBeVisible();
  300 |   });
  301 | 
  302 |   test('account pages send a signed out shopper to sign in and bring them back', async ({ page }) => {
  303 |     await page.goto('/account/wallet');
  304 |     await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fwallet/);
  305 |     await page.getByLabel('Email').fill('back@example.com');
  306 |     await page.getByRole('button', { name: 'Send me a code' }).click();
  307 |     await page.getByLabel('6 digit code').fill('123456');
  308 |     await page.getByRole('button', { name: 'Sign in' }).click();
  309 |     await expect(page).toHaveURL(/\/account\/wallet$/);
  310 |     await expect(page.getByTestId('wallet-balance')).toHaveText('₹500.00'); // the welcome credit
  311 |   });
  312 | });
  313 | 
  314 | async function placeOrder(page: Page, isMobile: boolean, opts: { wallet?: boolean; cod?: boolean } = {}) {
  315 |   await page.goto('/checkout');
  316 |   await page.getByLabel('Full name').fill('Asha Shopper');
  317 |   await page.getByLabel('Mobile').fill('9876543210');
  318 |   await page.getByLabel('Address line 1').fill('12 Temple Street');
  319 |   await page.getByLabel('City').fill('Coimbatore');
  320 |   await page.getByLabel('Pincode').fill('641016');
  321 |   await expect(page.getByTestId('checkout-delivery')).toContainText('Coimbatore: Delivery in 2 days');
  322 |   const next = async () => { if (isMobile) await page.getByRole('button', { name: 'Continue' }).click(); };
  323 |   await next(); // address -> delivery
  324 |   await next(); // delivery -> payment
  325 |   if (opts.cod) await page.getByRole('radio', { name: /Cash on delivery/ }).check();
  326 |   if (opts.wallet) await page.getByRole('checkbox', { name: /Use my wallet/ }).check();
  327 |   await next(); // payment -> review
  328 |   await page.getByRole('button', { name: /^Place order/ }).click();
  329 | }
  330 | 
  331 | test.describe('checkout and the whole order, in mock mode', () => {
  332 |   test('browse, filter, add to cart, coupon, log in with the code, pay, confirm, track, and request a return with photos', async ({ page, request, isMobile }) => {
  333 |     test.setTimeout(150_000);
  334 |     const { p, v } = await bigItem(request);
  335 | 
  336 |     // Browse and filter.
  337 |     await page.goto('/');
  338 |     await page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: 'Women', exact: true }).click();
  339 |     await expect(page).toHaveURL(/\/c\/women/);
  340 |     if (isMobile) { await page.getByRole('button', { name: /^Filter/ }).click(); const s = page.getByRole('dialog', { name: 'Filters' }); await s.getByRole('button', { name: 'L', exact: true }).click(); await s.getByRole('button', { name: /Show \d+ items/ }).click(); }
  341 |     else await page.getByRole('complementary', { name: 'Filters' }).getByRole('button', { name: 'L', exact: true }).click();
  342 |     await expect(page).toHaveURL(/size=L/);
  343 | 
  344 |     // Add to the bag and use a coupon.
  345 |     await addToBag(page, p.slug, v.color, v.size);
  346 |     await page.goto('/cart');
  347 |     await page.getByLabel('Coupon code').fill('SAVE10');
  348 |     await page.getByRole('button', { name: 'Apply' }).click();
  349 |     await expect(page.getByTestId('coupon-ok')).toBeVisible();
  350 | 
  351 |     // Log in with the email code. The bag is still there.
  352 |     await signIn(page, 'order.flow@example.com', '/checkout');
  353 |     await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  354 |     await page.goto('/cart');
  355 |     await expect(page.getByTestId('coupon-ok')).toHaveCount(0); // the coupon is a choice, so it is applied again at checkout
  356 |     await page.getByLabel('Coupon code').fill('SAVE10');
  357 |     await page.getByRole('button', { name: 'Apply' }).click();
  358 |     await expect(page.getByTestId('cart-discount')).toBeVisible();
  359 | 
  360 |     // Checkout with part of the wallet, then pay in the practice window.
  361 |     await page.goto('/checkout');
  362 |     await page.getByLabel('Coupon code').first().fill('SAVE10').catch(() => undefined);
  363 |     await placeOrder(page, isMobile, { wallet: true });
  364 |     await expect(page).toHaveURL(/\/order\/.+pay=1/);
  365 |     const dlg = page.getByRole('dialog', { name: 'Practice payment' });
  366 |     await expect(dlg).toBeVisible();
  367 |     await dlg.getByRole('button', { name: /^Pay ₹/ }).click();
```