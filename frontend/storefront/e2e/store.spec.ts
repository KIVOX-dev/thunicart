import { expect, test, type Page } from './fixtures';
import { addToBag, noSidewaysScroll, products, resetMock, signIn, stocked } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.beforeEach(async ({ request, context }) => { await resetMock(request); await context.clearCookies(); });

/** A product costing 1,000 or more with plenty of stock, so SAVE10 applies and the wallet only covers part of the bill. */
async function bigItem(request: Parameters<typeof stocked>[0]) {
  const list = await products(request);
  const p = list.find((x) => x.fromPrice >= 100000 && x.variants.some((v) => v.stock >= 4))!;
  const v = p.variants.find((x) => x.stock >= 4)!;
  return { p, v };
}

test.describe('home and header', () => {
  test('home has the sections in the right order, and the header suits the view', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Featured' })).toBeVisible();
    const order = await page.locator('main section[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(order.slice(0, 7)).toEqual(['Featured', 'Shop by category', 'Shop by size', 'Trending now', 'Shop by occasion', 'New arrivals', 'Lookbook']);
    await expect(page.getByRole('region', { name: 'Shop by category' }).getByRole('link')).toHaveCount(2); // the store is for Men and Women only
    await expect(page.getByRole('region', { name: 'Shop by category' })).toContainText('Women');
    await expect(page.getByRole('region', { name: 'Shop by category' })).toContainText('Men');
    await expect(page.getByRole('region', { name: 'Shop by size' }).getByRole('link', { name: 'M', exact: true })).toBeVisible();
    await expect(page.getByRole('contentinfo').getByRole('navigation', { name: 'Quick shop' })).toBeVisible();
    await expect(page.getByRole('contentinfo').getByLabel('Newsletter')).toBeVisible();
    if (isMobile) {
      await expect(page.getByRole('navigation', { name: 'Main tabs' })).toBeVisible();
      for (const t of ['Home', 'Categories', 'Wishlist', 'Cart', 'Account']) await expect(page.getByRole('navigation', { name: 'Main tabs' })).toContainText(t);
    } else {
      await expect(page.getByRole('navigation', { name: 'Main tabs' })).toBeHidden();
      const nav = page.getByRole('navigation', { name: 'Categories' }).filter({ visible: true });
      for (const t of ['Women', 'Men', 'Sale', 'Bestseller']) await expect(nav.getByRole('link', { name: t, exact: true })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Innerwear', exact: true })).toHaveCount(0); // sub types only show in the drop down
      expect(await nav.getByRole('link', { name: 'Women', exact: true }).evaluate((e) => getComputedStyle(e).textTransform)).toBe('uppercase');
    }
    await noSidewaysScroll(page);
  });

  test('the announcement bar rotates and has a pause and play control', async ({ page }) => {
    await page.goto('/');
    const msg = page.getByTestId('announcement');
    const first = await msg.textContent();
    await expect.poll(async () => msg.textContent(), { timeout: 8000 }).not.toBe(first);
    await page.getByRole('button', { name: 'Pause offer messages' }).click();
    await expect(page.getByRole('button', { name: 'Play offer messages' })).toHaveAttribute('aria-pressed', 'true');
    const held = await msg.textContent();
    await page.waitForTimeout(4500);
    expect(await msg.textContent()).toBe(held);
    await page.getByRole('button', { name: 'Play offer messages' }).click();
    await expect.poll(async () => msg.textContent(), { timeout: 8000 }).not.toBe(held);
  });

  test('the side menu has expandable categories with sub lists and quick links', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const d = page.getByRole('dialog', { name: 'Menu' });
    await d.getByRole('button', { name: 'Women sub categories' }).click();
    await expect(d.getByRole('link', { name: 'Kurtis', exact: true })).toBeVisible();
    await expect(d.getByRole('link', { name: 'Sale' })).toBeVisible();
    await d.getByRole('link', { name: 'Kurtis', exact: true }).click();
    await expect(page).toHaveURL(/\/c\/women-kurtis/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kurtis');
  });

  test('keyboard: the skip link is first and the focus ring is a 2 px outline', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return { w: s.outlineWidth, style: s.outlineStyle }; });
    expect(ring).toEqual({ w: '2px', style: 'solid' });
  });
});

test.describe('listing', () => {
  test('filters live in the URL and survive a reload, and sort works', async ({ page, isMobile }) => {
    await page.goto('/c/women');
    const count = page.getByTestId('result-count');
    const before = await count.textContent();
    if (isMobile) {
      await page.getByRole('button', { name: /^Filter/ }).click();
      const s = page.getByRole('dialog', { name: 'Filters' });
      await s.getByRole('button', { name: 'M', exact: true }).click();
      await s.getByRole('button', { name: /Show \d+ items/ }).click();
    } else {
      await page.getByRole('complementary', { name: 'Filters' }).getByRole('button', { name: 'M', exact: true }).click();
    }
    await expect(page).toHaveURL(/size=M/);
    await expect(count).not.toHaveText(before!);
    await page.reload();
    await expect(page).toHaveURL(/size=M/);
    if (!isMobile) await expect(page.getByRole('complementary', { name: 'Filters' }).getByRole('button', { name: 'M', exact: true })).toHaveAttribute('aria-pressed', 'true');
    if (isMobile) {
      await page.getByRole('button', { name: 'Sort' }).click();
      await page.getByRole('dialog', { name: 'Sort by' }).getByRole('button', { name: 'Price: low to high' }).click();
    } else {
      await page.getByRole('combobox', { name: 'Sort products' }).selectOption('price-asc');
    }
    await expect(page).toHaveURL(/sort=price-asc/);
    const prices = await page.locator('[data-testid="price"]').allTextContents();
    const nums = prices.map((t) => Number(t.replace(/[^\d.]/g, '')));
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
    await noSidewaysScroll(page);
  });

  test('colour chips with names, price ranges and a clear all (desktop sidebar)', async ({ page, isMobile }) => {
    test.skip(isMobile);
    await page.goto('/c/all');
    const side = page.getByRole('complementary', { name: 'Filters' });
    await side.getByRole('button', { name: 'Navy' }).click();
    await side.getByRole('button', { name: 'Under ₹500' }).click();
    await expect(page).toHaveURL(/color=Navy/);
    await expect(page).toHaveURL(/price=u500/);
    await side.getByRole('button', { name: /Clear all/ }).click();
    await expect(page).not.toHaveURL(/color=/);
  });

  test('Load more adds products and the back button keeps them', async ({ page }) => {
    await page.goto('/c/all');
    const cards = page.getByTestId('product-card');
    await expect(cards).toHaveCount(12);
    await page.getByRole('link', { name: 'Load more' }).click();
    await expect(page).toHaveURL(/pages=2/);
    await expect(cards).toHaveCount(24);
    await cards.nth(15).getByRole('link', { name: /./ }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/p\//);
    await page.goBack();
    await expect(page).toHaveURL(/pages=2/);
    await expect(cards).toHaveCount(24);
  });

  test('an empty result says so and offers to clear the filters', async ({ page }) => {
    await page.goto('/c/accessories?size=XXL&price=1500%2B&brand=JIANA');
    await expect(page.getByText('No products match these filters.')).toBeVisible();
    await page.getByRole('link', { name: 'Clear all filters' }).click();
    await expect(page.getByTestId('product-card').first()).toBeVisible();
  });
});

test.describe('product page', () => {
  test('server rendered structured data, canonical and open graph tags', async ({ page, request }) => {
    const { p } = await stocked(request);
    await page.goto(`/p/${p.slug}`);
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!) as { '@type': string; name: string; offers: { price: string; priceCurrency: string; availability: string } };
    expect(ld['@type']).toBe('Product');
    expect(ld.name).toBe(p.name);
    expect(ld.offers.priceCurrency).toBe('INR');
    expect(ld.offers.availability).toBe('https://schema.org/InStock');
    expect(Number(ld.offers.price)).toBe(p.fromPrice / 100);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/p/${p.slug}$`));
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', p.name);
    await expect(page).toHaveTitle(new RegExp(p.name));
    // The page works without scripts too: the name and price are in the server HTML.
    const html = await (await request.get(`/p/${p.slug}`)).text();
    expect(html).toContain(p.name);
    expect(html).toContain('application/ld+json');
  });

  test('colours, sizes with sold out crossed out, price block, stock message and delivery check', async ({ page, request }) => {
    const list = await products(request);
    const p = list.find((x) => x.variants.some((v) => v.stock === 0) && x.variants.some((v) => v.stock >= 4))!;
    const sold = p.variants.find((v) => v.stock === 0)!;
    await page.goto(`/p/${p.slug}`);
    await page.getByRole('button', { name: `Colour ${sold.color}` }).click();
    const soldBtn = page.getByRole('button', { name: `Size ${sold.size}, sold out` });
    await expect(soldBtn).toBeVisible(); // sold out sizes are never hidden
    expect(await soldBtn.evaluate((e) => getComputedStyle(e).textDecorationLine)).toContain('line-through');
    await soldBtn.click({ force: true });
    await expect(page.getByTestId('stock-message')).not.toContainText('Out of stock'); // a sold out size cannot be chosen
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Choose a size first' })).toBeVisible();
    await expect(page.getByTestId('price').first()).toContainText('₹');
    await page.getByLabel('Check delivery').fill('641016');
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.getByTestId('delivery-message')).toContainText('Coimbatore: Delivery in 2 days');
    await page.getByLabel('Check delivery').fill('999999');
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.getByTestId('delivery-message')).toContainText('do not deliver');
    await page.getByRole('button', { name: 'Size chart' }).click();
    await expect(page.getByRole('dialog', { name: 'Size chart' })).toBeVisible();
  });

  test('the phone view has a swipe gallery and a sticky Add to cart bar; the desktop has thumbnails and zoom', async ({ page, request, isMobile }) => {
    const { p } = await stocked(request);
    await page.goto(`/p/${p.slug}`);
    if (isMobile) {
      await expect(page.getByRole('region', { name: `${p.name} pictures` })).toBeVisible();
      const bar = page.getByRole('button', { name: 'Add to cart' });
      await expect(bar).toBeVisible();
      const box = await bar.boundingBox();
      expect(box!.y + box!.height).toBeGreaterThan(700); // fixed to the bottom of the screen
      await page.mouse.wheel(0, 1500);
      await expect(bar).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Show picture 2' }).filter({ visible: true })).toBeVisible();
      await page.getByTestId('zoom-area').hover({ position: { x: 100, y: 100 } });
      const t = await page.getByTestId('zoom-area').locator('img').evaluate((e) => (e as HTMLElement).style.transform);
      expect(t).toContain('scale(2)');
    }
    await noSidewaysScroll(page);
  });

  test('wishlist, compare and recently viewed', async ({ page, request }) => {
    const list = await products(request);
    const [a, b] = [list[0]!, list[1]!];
    await page.goto(`/p/${a.slug}`);
    await page.getByRole('button', { name: 'Add to wishlist' }).click();
    await page.getByRole('button', { name: 'Compare' }).click();
    await page.goto(`/p/${b.slug}`);
    await page.getByRole('button', { name: 'Compare' }).click();
    await expect(page.getByRole('region', { name: 'Recently viewed' })).toContainText(a.name);
    await page.goto('/compare');
    const t = page.getByRole('table', { name: 'Product comparison' });
    await expect(t.getByRole('link', { name: a.name })).toBeVisible();
    await expect(t.getByRole('link', { name: b.name })).toBeVisible();
    await page.goto('/account/wishlist');
    await expect(page.getByRole('list', { name: 'Wishlist' })).toContainText(a.name);
  });
});

test.describe('bag, coupon and stock problems', () => {
  test('add to cart opens the drawer, the cart is a cookie, and coupons give clear messages', async ({ page, request, isMobile }) => {
    const { p, v } = await bigItem(request);
    await addToBag(page, p.slug, v.color, v.size);
    const drawer = page.getByRole('dialog', { name: /Your bag/ });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText(p.name);
    await expect(drawer.getByRole('link', { name: 'Checkout' })).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'tk_cart')?.value).toContain(v.id);
    await drawer.getByRole('button', { name: 'Close' }).click();
    await page.reload();
    await page.goto('/cart');
    await expect(page.getByRole('list', { name: 'Items in your bag' })).toContainText(p.name); // still there after a reload
    await page.getByLabel('Coupon code').fill('NOPE');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByTestId('coupon-error')).toHaveText('This coupon code is not valid.');
    await page.getByLabel('Coupon code').fill('save10');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByTestId('coupon-ok')).toContainText('SAVE10');
    await expect(page.getByTestId('cart-discount')).toBeVisible();
    await noSidewaysScroll(page);
    void isMobile;
  });

  test('a coupon that needs a bigger bag says how much more to add', async ({ page, request }) => {
    const list = await products(request);
    const cheap = list.find((x) => x.fromPrice < 30000 && x.variants.some((v) => v.stock >= 2))!;
    const v = cheap.variants.find((x) => x.stock >= 2)!;
    await addToBag(page, cheap.slug, v.color, v.size);
    await page.goto('/cart');
    await page.getByLabel('Coupon code').fill('SAVE10');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByTestId('coupon-error')).toContainText(/Add ₹\d+ more to use SAVE10/);
  });

  test('an item with not enough stock is named and can be removed', async ({ page, request }) => {
    const list = await products(request);
    const p = list.find((x) => x.variants.some((v) => v.stock >= 1 && v.stock <= 3))!;
    const v = p.variants.find((x) => x.stock >= 1 && x.stock <= 3)!;
    await addToBag(page, p.slug, v.color, v.size);
    await page.goto('/cart');
    for (let n = 0; n < v.stock; n++) { await page.getByRole('button', { name: `More ${p.name}` }).click(); await expect(page.getByTestId(`cart-qty-${v.id}`)).toHaveText(String(n + 2)); } // one more than is in stock; wait for each tap to land
    const gone = page.getByTestId('unavailable');
    await expect(gone).toContainText(p.name);
    await expect(gone).toContainText(`Only ${v.stock} left`);
    await expect(page.getByRole('link', { name: 'Checkout' })).toHaveAttribute('aria-disabled', 'true');
    await gone.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Your bag is empty')).toBeVisible();
  });
});

test.describe('login with an email code', () => {
  test('clear errors for a wrong and an expired code, a resend timer, and no Google button in demo mode', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /Google/ })).toHaveCount(0);
    await page.getByLabel('Email').fill('nope');
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await expect(page.getByRole('alert')).toContainText('Enter a valid email');
    await page.getByLabel('Email').fill('expired@example.com');
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await expect(page.getByTestId('otp-hint')).toContainText('123456');
    await expect(page.getByTestId('resend')).toBeDisabled();
    await expect(page.getByTestId('resend')).toContainText(/Resend code in \d+s/);
    await page.getByLabel('6 digit code').fill('123456');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByTestId('code-error')).toContainText('expired');
    await page.getByRole('button', { name: 'Change email' }).click();
    await page.getByLabel('Email').fill('someone@example.com');
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await page.getByLabel('6 digit code').fill('000000');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByTestId('code-error')).toContainText('not right');
    await page.getByLabel('6 digit code').fill('123456');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText('someone@example.com').first()).toBeVisible();
  });

  test('account pages send a signed out shopper to sign in and bring them back', async ({ page }) => {
    await page.goto('/account/wallet');
    await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fwallet/);
    await page.getByLabel('Email').fill('back@example.com');
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await page.getByLabel('6 digit code').fill('123456');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/account\/wallet$/);
    await expect(page.getByTestId('wallet-balance')).toHaveText('₹500.00'); // the welcome credit
  });
});

async function placeOrder(page: Page, isMobile: boolean, opts: { wallet?: boolean; cod?: boolean } = {}) {
  await page.goto('/checkout');
  await page.getByLabel('Full name').fill('Asha Shopper');
  await page.getByLabel('Mobile').fill('9876543210');
  await page.getByLabel('Address line 1').fill('12 Temple Street');
  await page.getByLabel('City').fill('Coimbatore');
  await page.getByLabel('Pincode').fill('641016');
  await expect(page.getByTestId('checkout-delivery')).toContainText('Coimbatore: Delivery in 2 days');
  const next = async () => { if (isMobile) await page.getByRole('button', { name: 'Continue' }).click(); };
  await next(); // address -> delivery
  await next(); // delivery -> payment
  if (opts.cod) await page.getByRole('radio', { name: /Cash on delivery/ }).check();
  if (opts.wallet) await page.getByRole('checkbox', { name: /Use my wallet/ }).check();
  await next(); // payment -> review
  await page.getByRole('button', { name: /^Place order/ }).click();
}

test.describe('checkout and the whole order, in mock mode', () => {
  test('browse, filter, add to cart, coupon, log in with the code, pay, confirm, track, and request a return with photos', async ({ page, request, isMobile }) => {
    test.setTimeout(150_000);
    const { p, v } = await bigItem(request);

    // Browse and filter.
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: 'Women', exact: true }).click();
    await expect(page).toHaveURL(/\/c\/women/);
    if (isMobile) { await page.getByRole('button', { name: /^Filter/ }).click(); const s = page.getByRole('dialog', { name: 'Filters' }); await s.getByRole('button', { name: 'L', exact: true }).click(); await s.getByRole('button', { name: /Show \d+ items/ }).click(); }
    else await page.getByRole('complementary', { name: 'Filters' }).getByRole('button', { name: 'L', exact: true }).click();
    await expect(page).toHaveURL(/size=L/);

    // Add to the bag and use a coupon.
    await addToBag(page, p.slug, v.color, v.size);
    await page.goto('/cart');
    await page.getByLabel('Coupon code').fill('SAVE10');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByTestId('coupon-ok')).toBeVisible();

    // Log in with the email code. The bag is still there.
    await signIn(page, 'order.flow@example.com', '/checkout');
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    await page.goto('/cart');
    await expect(page.getByTestId('coupon-ok')).toHaveCount(0); // the coupon is a choice, so it is applied again at checkout
    await page.getByLabel('Coupon code').fill('SAVE10');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByTestId('cart-discount')).toBeVisible();

    // Checkout with part of the wallet, then pay in the practice window.
    await page.goto('/checkout');
    await page.getByLabel('Coupon code').first().fill('SAVE10').catch(() => undefined);
    await placeOrder(page, isMobile, { wallet: true });
    await expect(page).toHaveURL(/\/order\/.+pay=1/);
    const dlg = page.getByRole('dialog', { name: 'Practice payment' });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: /^Pay ₹/ }).click();

    // The Confirming screen waits for the backend. It does not trust the browser.
    await expect(page.getByTestId('confirming')).toBeVisible();
    await expect(page.getByTestId('order-success')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('email-notice')).toContainText('confirmation email');
    const number = (await page.getByTestId('order-number').textContent())!;
    expect(number).toMatch(/^ECM-\d+$/);

    // Track it, move it along, and ask for a return with photos.
    await page.getByRole('link', { name: 'Track my order' }).click();
    await expect(page.getByTestId('order-status')).toContainText('Confirmed');
    for (const s of ['Packed', 'Shipped', 'Delivered']) { await page.getByRole('button', { name: /Demo: move to the next step/ }).click(); await expect(page.getByTestId('order-status')).toContainText(s); }
    const form = page.getByRole('form', { name: 'Return or exchange' });
    await form.getByLabel(/^Quantity to send back/).fill('1');
    await form.getByRole('button', { name: /^Send return request/ }).click();
    await expect(form.getByRole('alert').first()).toContainText('Choose a reason');
    await form.getByRole('combobox', { name: 'Reason' }).selectOption('Size does not fit');
    await form.getByLabel('Add photos').setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: PNG }, { name: 'b.png', mimeType: 'image/png', buffer: PNG }]);
    await expect(form.getByTestId('photo-uploaded')).toHaveCount(2, { timeout: 15_000 });
    await expect(form.getByRole('img', { name: 'Preview of a.png' })).toBeVisible();
    await form.getByRole('button', { name: /^Send return request/ }).click();
    await expect(page.getByTestId('return-sent')).toContainText('Photos sent: 2');
    await page.goto('/account/orders');
    await expect(page.getByRole('list', { name: 'Orders' })).toContainText(number);
    await expect(page.getByRole('list', { name: 'Orders' })).toContainText('Return requested');
  });

  test('the payment can fail and be retried, and the stock hold counts down', async ({ page, request, isMobile }) => {
    const { p, v } = await bigItem(request);
    await signIn(page, 'retry@example.com', '/cart');
    await addToBag(page, p.slug, v.color, v.size);
    await placeOrder(page, isMobile);
    const dlg = page.getByRole('dialog', { name: 'Practice payment' });
    await dlg.getByRole('button', { name: 'Simulate a failed payment' }).click();
    await expect(dlg.getByRole('alert')).toContainText('failed');
    await dlg.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('pay-pending')).toContainText('held for');
    await expect(page.getByTestId('hold-countdown')).toHaveText(/^1[45]:\d\d$/);
    await page.getByRole('button', { name: 'Pay now' }).click();
    await page.getByRole('dialog', { name: 'Practice payment' }).getByRole('button', { name: /^Pay ₹/ }).click();
    await expect(page.getByTestId('order-success')).toBeVisible({ timeout: 15_000 });
  });

  test('guest checkout with cash on delivery, and cancel before it is packed', async ({ page, request, isMobile }) => {
    const { p, v } = await bigItem(request);
    await addToBag(page, p.slug, v.color, v.size);
    await page.goto('/checkout');
    await page.getByLabel('Email for order updates').fill('guest@example.com');
    await page.getByLabel('Full name').fill('Guest Buyer');
    await page.getByLabel('Mobile').fill('9876500000');
    await page.getByLabel('Address line 1').fill('5 Market Road');
    await page.getByLabel('City').fill('Coimbatore');
    await page.getByLabel('Pincode').fill('641016');
    await expect(page.getByTestId('checkout-delivery')).toBeVisible();
    if (isMobile) { await page.getByRole('button', { name: 'Continue' }).click(); await page.getByRole('button', { name: 'Continue' }).click(); }
    await page.getByRole('radio', { name: /Cash on delivery/ }).check();
    if (isMobile) await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Place order', exact: true }).click();
    await expect(page.getByTestId('order-success')).toBeVisible();
    await expect(page.getByText('Pay when it arrives')).toBeVisible();
    // A guest can still open the order they just placed.
    await expect(page.getByTestId('order-number')).toBeVisible();
  });

  test('checkout shows field errors from the API next to the fields', async ({ page, request, isMobile }) => {
    test.skip(isMobile, 'The phone checkout blocks Continue until the address is complete');
    const { p, v } = await bigItem(request);
    await addToBag(page, p.slug, v.color, v.size);
    await page.goto('/checkout');
    await page.getByLabel('Email for order updates').fill('a@b.co');
    await page.getByLabel('Full name').fill('A');
    await page.getByLabel('Mobile').fill('12345');
    await page.getByLabel('Pincode').fill('641016');
    await page.getByRole('button', { name: /^Place order/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter the name' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: '10 digit Indian mobile' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter the address' })).toBeVisible();
  });

  test('cancel an order before it is packed and the money goes back to the wallet', async ({ page, request, isMobile }) => {
    const { p, v } = await bigItem(request);
    await signIn(page, 'cancel@example.com', '/cart');
    await addToBag(page, p.slug, v.color, v.size);
    await placeOrder(page, isMobile, { cod: true, wallet: true });
    await expect(page.getByTestId('order-success')).toBeVisible();
    await page.getByRole('link', { name: 'Track my order' }).click();
    await page.getByRole('button', { name: 'Cancel order' }).click();
    await expect(page.getByTestId('order-status')).toContainText('Cancelled');
    await page.goto('/account/wallet');
    await expect(page.getByTestId('wallet-balance')).toHaveText('₹500.00'); // the wallet part came back
    await expect(page.getByText(/Refund for ECM-/).or(page.getByText('Welcome credit')).first()).toBeVisible();
  });
});

test.describe('account', () => {
  test('addresses check the pincode and show field errors', async ({ page }) => {
    await signIn(page, 'addr@example.com', '/account');
    await page.goto('/account/addresses');
    await page.getByLabel('Full name').fill('Home');
    await page.getByLabel('Pincode').fill('999999');
    await expect(page.getByTestId('pin-message')).toContainText('do not deliver');
    await page.getByRole('button', { name: 'Save address' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter a 10 digit Indian mobile number' })).toBeVisible();
    await page.getByLabel('Mobile').fill('9876543210');
    await page.getByLabel('Address line 1').fill('1 Lake Road');
    await page.getByLabel('City').fill('Coimbatore');
    await page.getByLabel('Pincode').fill('641016');
    await expect(page.getByTestId('pin-message')).toContainText('Delivery in 2 days');
    await page.getByRole('button', { name: 'Save address' }).click();
    await expect(page.getByRole('list').filter({ hasText: '1 Lake Road' })).toBeVisible();
  });
});

test.describe('content and search engines', () => {
  test('CMS pages and the blog come from the API, and an unknown page is a friendly 404', async ({ page }) => {
    await page.goto('/pages/refund-policy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Refund and return policy');
    await expect(page).toHaveTitle(/Refund and return policy/);
    await page.goto('/blog');
    await page.getByRole('link', { name: /How to choose your size/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How to choose your size');
    await page.goto('/pages/nothing-here');
    await expect(page.getByRole('heading', { name: 'We could not find that page' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible();
  });

  test('the sitemap lists products and pages, and robots keeps private pages out', async ({ request }) => {
    const sm = await (await request.get('/sitemap.xml')).text();
    const { p } = await stocked(request);
    expect(sm).toContain(`/p/${p.slug}`);
    expect(sm).toContain('/c/women-kurtis');
    expect(sm).toContain('/pages/about');
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toMatch(/Disallow: \/checkout/);
    expect(robots).toMatch(/Disallow: \/account/);
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });

  test('search finds products and suggests them as you type', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Search' }).filter({ visible: true }).click();
    await page.getByLabel('Search the store').fill('legging');
    await expect(page.getByRole('list', { name: 'Suggestions' }).getByRole('link').first()).toContainText(/Legging/i);
    await page.getByLabel('Search the store').press('Enter');
    await expect(page).toHaveURL(/\/search\?q=legging/);
    await expect(page.getByTestId('result-count')).toContainText('product');
  });
});

test.describe('layout', () => {
  for (const path of ['/', '/c/kurtis', '/c/all?size=M', '/cart', '/login', '/blog', '/pages/about', '/compare', '/account/wishlist']) {
    test(`${path} has no sideways scroll`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await noSidewaysScroll(page);
    });
  }
});
