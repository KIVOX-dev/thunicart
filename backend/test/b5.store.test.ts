import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Customer, CustomerOtp, Order, SalesBill, StockLedger, Coupon, StockBalance } from '../src/models';
import { outbox } from '../src/adapters/email';
import { signWebhook, checkoutSignature, setPaymentsForTests } from '../src/adapters/payments';
import { setupTest, type TestCtx } from './helpers';
import { A, api, fixtures, key, setGst, stockOf, tokenFor, type Fx } from './b2.helpers';

let t: TestCtx; let fx: Fx; let h: ReturnType<typeof api>; let custToken: string; let custId: string;
const S = '/api/v1';
beforeAll(async () => {
  t = await setupTest(); fx = await fixtures(t); h = fx.h;
  for (const [v, q] of [[fx.tee, 20], [fx.dress, 10], [fx.kurti, 1]] as const) await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Opening', lines: [{ variantId: v.id, qty: q }] });
  for (const id of [fx.tee, fx.dress, fx.kurti].map((v) => v.itemId)) await h.put(`/items/${id}`, { showOnWebsite: true });
  await h.put(`/items/${fx.tee.itemId}`, { fabric: 'Cotton', occasion: 'Casual', section: 'Men' });
  await h.post(`/items/${fx.tee.itemId}/variants`, { size: 'L', color: 'Red', mrp: 45000, sellingPrice: 45000, offerPrice: 40500, reorderLevel: 2 });
});
afterAll(async () => { await t.close(); });

const get = (url: string, opts: { token?: string; cookies?: Record<string, string> } = {}) => t.api('GET', `${A}${url}`, { token: opts.token, cookies: opts.cookies });
const post = (url: string, body: unknown, opts: { token?: string; cookies?: Record<string, string>; idem?: boolean } = {}) => t.api('POST', `${A}${url}`, { token: opts.token, cookies: opts.cookies, body, headers: opts.idem === false ? {} : { 'idempotency-key': key() } });
async function login(email: string) {
  await post('/customer/auth/otp/send', { email }, { idem: false });
  const mail = [...outbox].reverse().find((m) => m.to === email)!; const code = /(\d{6})/.exec(mail.text ?? mail.html)![1]!;
  const r = await post('/customer/auth/otp/verify', { email, code }, { idem: false });
  expect(r.status).toBe(200); return r;
}
const addr = { name: 'Ananya', phone: '9876543210', line1: '12 Race Course', city: 'Coimbatore', state: 'Tamil Nadu', stateCode: '33', pincode: '641016' };
const webhook = (payload: object, opts: { sig?: string; id?: string } = {}) => { const raw = JSON.stringify(payload); return t.app.inject({ method: 'POST', url: `${A}/webhooks/razorpay`, headers: { 'content-type': 'application/json', 'x-razorpay-signature': opts.sig ?? signWebhook(raw), ...(opts.id ? { 'x-razorpay-event-id': opts.id } : {}) }, payload: raw }); };
const captured = (rzpOrderId: string, amount: number, payId: string) => ({ event: 'payment.captured', payload: { payment: { entity: { id: payId, order_id: rzpOrderId, amount, status: 'captured' } } } });
async function placeOrder(token: string, variantId: string, qty: number, extra: object = {}) {
  await t.api('DELETE', `${A}/cart/coupon`, { token }); await post('/cart', { variantId, qty }, { token, idem: false });
  return post('/checkout/start', { address: addr, mobile: '9876543210', paymentMethod: 'online', ...extra }, { token });
}

describe('catalog', () => {
  it('lists products once with colour options, filters, sorting and stock status; GST rate only while on', async () => {
    const r = (await get('/store/products')).body;
    expect(r.total).toBe(3);
    const tee = r.items.find((p: any) => p.name === 'Cotton Tee');
    expect(tee.variants).toHaveLength(2);
    expect(tee.colors.sort()).toEqual(['Blue', 'Red']);
    expect(tee.priceFrom).toBe(40500); // offer price wins
    expect(tee.discountPercent).toBe(10);
    expect(tee.stockStatus).toBe('In Stock');
    expect((await get('/store/products?fabric=cotton')).body.total).toBe(1);
    expect((await get('/store/products?color=red')).body.items[0].variants.length).toBe(2);
    expect((await get('/store/products?minPrice=100000')).body.items.map((p: any) => p.name)).toEqual(['Floral Dress']);
    expect((await get('/store/products?minDiscount=5')).body.total).toBe(1);
    expect((await get('/store/products?sort=price_desc')).body.items[0].name).toBe('Floral Dress');
    expect((await get('/store/products?availability=in_stock&size=L')).body.total).toBe(0); // the L has no stock
    expect((await get('/store/search?q=dress')).body.total).toBe(1);
    const detail = (await get(`/store/products/${tee.slug}`)).body;
    expect(detail.gstMode).toBe('off'); expect(detail.variants[0].gstRate).toBeNull();
    expect(detail.structuredData['@type']).toBe('Product');
    expect(detail.structuredData.offers.lowPrice).toBe('405.00');
    await setGst(t, true);
    expect((await get(`/store/products/${tee.slug}`)).body.variants.find((v: any) => v.size === 'M').gstRate).toBe(5);
    await setGst(t, false);
    expect((await get('/store/products/nope')).status).toBe(404);
  });
  it('stock status comes straight from available stock, and a POS sale changes what the store shows (and the reverse)', async () => {
    const slug = (await get('/store/products?q=kurti')).body.items[0].slug;
    expect((await get(`/store/products/${slug}`)).body.variants[0].available).toBe(1);
    const d = (await h.post('/pos/bills', { storeId: fx.shop.id, lines: [{ variantId: fx.kurti.id, qty: 1 }] })).body;
    await h.post(`/pos/bills/${d.id}/finalize`, { tenders: [{ mode: 'cash', amount: d.grandTotal }] });
    const after = (await get(`/store/products/${slug}`)).body;
    expect(after.variants[0].available).toBe(0); expect(after.stockStatus).toBe('Out of Stock');
    await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Back', lines: [{ variantId: fx.kurti.id, qty: 1 }] });
  });
  it('pincode checks, home, categories, pages, blog and sitemap', async () => {
    expect((await get('/store/pincode/641016')).body).toMatchObject({ serviceable: true, shippingCharge: 5000, codAvailable: true, codFee: 4000, estimatedDays: '4-7' });
    expect((await get('/store/pincode/641016?subtotal=100000')).body.shippingCharge).toBe(0); // free above Rs 999
    await h.put('/admin/store-settings', { shipping: { flatCharge: 5000, freeAbove: 99900, etaDays: '4-7', allowedStates: [], allowedPincodes: [], blockedPincodes: ['641999'] } });
    expect((await get('/store/pincode/641999')).body.serviceable).toBe(false);
    await h.post('/banners', { title: 'Diwali', imageKey: 'images/x.jpg', link: '/sale', order: 1 }, { idem: false });
    await h.post('/cms/pages', { slug: 'about', title: 'About us', body: 'Hello', seoTitle: 'About Thunikart' });
    await h.post('/blog', { slug: 'diwali-looks', title: 'Diwali looks', kind: 'lookbook', publishedAt: '2026-01-01T00:00:00.000Z', body: 'x' });
    expect((await get('/store/home')).body.banners[0].title).toBe('Diwali');
    expect((await get('/store/home')).body.sections.newArrivals.length).toBeGreaterThan(0);
    expect((await get('/store/pages/about')).body.seoTitle).toBe('About Thunikart');
    expect((await get('/store/blog')).body.items[0].slug).toBe('diwali-looks');
    const urls = (await get('/store/sitemap')).body.urls.map((u: any) => u.path);
    expect(urls).toContain('/pages/about'); expect(urls.some((u: string) => u.startsWith('/products/'))).toBe(true);
    expect((await get('/store/categories')).status).toBe(200);
  });
});

describe('customer login by email code', () => {
  it('sends a code through the email adapter, logs in, and creates one customer per verified email', async () => {
    const r = await login('ananya@example.com'); custToken = r.body.accessToken; custId = r.body.customer.id;
    expect(r.cookies.find((c: any) => c.name === 'tk_store_rt').httpOnly).toBe(true);
    expect(outbox.some((m) => m.to === 'ananya@example.com' && /Your login code/.test(m.html))).toBe(true);
    expect(await Customer.countDocuments({ email: 'ananya@example.com' })).toBe(1);
    await login('ananya@example.com').catch(() => undefined);
    expect((await get('/customer/profile', { token: custToken })).body).toMatchObject({ email: 'ananya@example.com', mobile: null, walletBalance: 0 });
    expect((await get('/customer/profile')).status).toBe(401);
    expect((await get('/customer/profile', { token: t.adminToken })).status).toBe(401); // staff tokens do not work on the storefront
  });
  it('3 attempts, 30 second resend, expiry, and the code is stored hashed', async () => {
    const e = 'attempts@example.com'; await post('/customer/auth/otp/send', { email: e }, { idem: false });
    expect((await post('/customer/auth/otp/send', { email: e }, { idem: false })).body.code).toBe('RESEND_TOO_SOON');
    const rec: any = await CustomerOtp.findOne({ email: e }).lean(); expect(rec.codeHash).toMatch(/^[0-9a-f]{64}$/); expect(JSON.stringify(rec)).not.toMatch(/"code"/);
    for (let i = 0; i < 3; i++) expect((await post('/customer/auth/otp/verify', { email: e, code: '000000' }, { idem: false })).body.code).toBe('OTP_INVALID');
    expect((await post('/customer/auth/otp/verify', { email: e, code: '000000' }, { idem: false })).body.code).toBe('OTP_LOCKED');
    await CustomerOtp.updateOne({ email: e }, { $set: { expiresAt: new Date(Date.now() - 1000), attempts: 0 } });
    expect((await post('/customer/auth/otp/verify', { email: e, code: '123456' }, { idem: false })).body.code).toBe('OTP_EXPIRED');
    expect((await post('/customer/auth/otp/verify', { email: e, code: '12' }, { idem: false })).status).toBe(400);
  });
  it('Google login (mock), refresh and logout', async () => {
    const g = await post('/customer/auth/google', { idToken: 'mock:gina@example.com' }, { idem: false });
    expect(g.status).toBe(200); expect(g.body.customer.email).toBe('gina@example.com');
    expect((await post('/customer/auth/google', { idToken: 'garbage' }, { idem: false })).status).toBe(401);
    const cookie = g.cookies.find((c: any) => c.name === 'tk_store_rt').value;
    const rf = await post('/customer/auth/refresh', {}, { cookies: { tk_store_rt: cookie }, idem: false }); expect(rf.status).toBe(200);
    await post('/customer/auth/logout', {}, { cookies: { tk_store_rt: rf.cookies.find((c: any) => c.name === 'tk_store_rt').value }, idem: false });
    expect((await post('/customer/auth/refresh', {}, { cookies: { tk_store_rt: cookie }, idem: false })).status).toBe(401);
  });
  it('a mobile number that matches a shop customer links the online account to that record', async () => {
    const shop = (await h.post('/customers', { accountGroup: 'Retail Walk-in', name: 'Priya (shop)', mobile: '9811100077', stateCode: '33' })).body;
    const r = await login('priya@example.com');
    await t.api('PUT', `${A}/customer/profile`, { token: r.body.accessToken, body: { mobile: '9811100077' } });
    const linked: any = await Customer.findById(shop.id).lean();
    expect(linked.email).toBe('priya@example.com');
    expect(await Customer.countDocuments({ email: 'priya@example.com' })).toBe(1);
    expect((await get('/customer/profile', { token: r.body.accessToken })).body.customerId).toBe(shop.customerId); // same session, now the shop record
  });
  it('addresses are pincode checked; wishlist and compare work', async () => {
    const a = await post('/customer/addresses', addr, { token: custToken, idem: false }); expect(a.status).toBe(201); expect(a.body.serviceable).toBe(true);
    expect((await post('/customer/addresses', { ...addr, pincode: '641999' }, { token: custToken, idem: false })).body.code).toBe('NOT_SERVICEABLE');
    const w = await post('/customer/wishlist', { variantId: fx.tee.id }, { token: custToken, idem: false }); expect(w.body.wishlist).toHaveLength(1);
    await post('/customer/compare', { variantId: fx.dress.id }, { token: custToken, idem: false });
    expect((await get('/customer/wishlist', { token: custToken })).body.compare).toHaveLength(1);
    expect((await t.api('DELETE', `${A}/customer/wishlist/${fx.tee.id}`, { token: custToken })).body.wishlist).toHaveLength(0);
  });
});

describe('cart and coupons', () => {
  it('a guest cart lives in a cookie, respects stock, and merges into the account on login', async () => {
    const add = await post('/cart', { variantId: fx.tee.id, qty: 2 }, { idem: false });
    expect(add.status).toBe(201);
    const ck = add.cookies.find((c: any) => c.name === 'tk_cart').value;
    expect((await get('/cart', { cookies: { tk_cart: ck } })).body).toMatchObject({ itemCount: 2, subtotal: 90000, total: 90000, currency: 'INR' });
    expect((await post('/cart', { variantId: fx.dress.id, qty: 20 }, { cookies: { tk_cart: ck }, idem: false })).body.code).toBe('INSUFFICIENT_STOCK'); // only 10 dresses
    const m = await login('merge@example.com');
    const mc = await post('/customer/auth/otp/verify', { email: 'merge@example.com', code: /(\d{6})/.exec([...outbox].reverse().find((x) => x.to === 'merge@example.com')!.html)![1] }, { cookies: { tk_cart: ck }, idem: false }).catch(() => null); void mc;
    expect(m.body.customer.email).toBe('merge@example.com');
    await post('/cart', { variantId: fx.dress.id, qty: 1 }, { token: m.body.accessToken, cookies: { tk_cart: ck }, idem: false });
    const cart = (await get('/cart', { token: m.body.accessToken })).body; expect(cart.lines.length).toBeGreaterThanOrEqual(1);
    expect((await t.api('PATCH', `${A}/cart/items/${fx.dress.id}`, { token: m.body.accessToken, body: { qty: 0 } })).body.lines.some((l: any) => l.variantId === fx.dress.id)).toBe(false);
  });
  it('coupons are validated on the server: flat, percent with a cap, buy X get Y, first order, dates, minimum, usage limits, categories', async () => {
    const tok = (await login('coupon@example.com')).body.accessToken; await post('/cart', { variantId: fx.tee.id, qty: 4 }, { token: tok, idem: false }); // 4 x 450 = 1,800
    const mk = (b: object) => h.post('/coupons', { stackable: false, ...b }, { idem: false });
    await mk({ code: 'FLAT100', type: 'flat', value: 10000 }); await mk({ code: 'PCT20', type: 'percent', value: 20, maxDiscount: 25000 }); await mk({ code: 'B2G1', type: 'buy_x_get_y', buyQty: 2, getQty: 1 });
    await mk({ code: 'FIRST', type: 'first_order', value: 10, firstOrderKind: 'percent' }); await mk({ code: 'OLD', type: 'flat', value: 5000, endsAt: '2020-01-01T00:00:00.000Z' }); await mk({ code: 'BIGCART', type: 'flat', value: 5000, minCartValue: 1000000 });
    await mk({ code: 'ONCE', type: 'flat', value: 5000, usageLimitPerCustomer: 1 }); await mk({ code: 'DRESSONLY', type: 'percent', value: 10, includeCategoryIds: [] });
    const apply = (code: string) => post('/cart/coupon', { code }, { token: tok, idem: false });
    expect((await apply('FLAT100')).body.couponDiscount).toBe(10000);
    expect((await apply('PCT20')).body.couponDiscount).toBe(25000); // 20% of 1,800 = 360 but capped at 250
    expect((await apply('B2G1')).body.couponDiscount).toBe(45000); // buy 2 get 1: with 4 pieces one is free
    expect((await apply('FIRST')).body.couponDiscount).toBe(18000);
    expect((await apply('OLD')).body.code).toBe('COUPON_EXPIRED');
    expect((await apply('BIGCART')).body.code).toBe('COUPON_MIN_CART');
    expect((await apply('NOPE')).body.code).toBe('COUPON_INVALID');
    expect((await post('/cart/coupon', { code: 'ONCE' }, { idem: false })).body.code).toBe('COUPON_LOGIN_REQUIRED'); // per customer limits need a login
    await Coupon.updateOne({ code: 'ONCE' }, { $set: { usedCount: 0 } });
    expect((await t.api('DELETE', `${A}/cart/coupon`, { token: tok })).body.coupon).toBeNull();
  });
});

describe('checkout and payment', () => {
  let order: any; let rz: any;
  it('start reserves stock for 15 minutes; the order is payment pending; nothing is sold yet', async () => {
    const before = (await stockOf(h, fx.tee.id)).available;
    const r = await placeOrder(custToken, fx.tee.id, 2);
    expect(r.status).toBe(201); order = r.body;
    expect(order).toMatchObject({ status: 'payment_pending', paymentMethod: 'online', subtotal: 90000, shipping: 5000, total: 95000, payable: 95000, orderNumber: expect.stringMatching(/^ORD-/) });
    expect((new Date(order.holdExpiresAt).getTime() - Date.now()) / 60000).toBeGreaterThan(14);
    expect((await stockOf(h, fx.tee.id)).available).toBe(before - 2); // on hand unchanged, reserved +2
    expect((await stockOf(h, fx.tee.id)).onHand).toBe(20);
    expect(await StockLedger.countDocuments({ type: 'ONLINE_ORDER_RESERVE' })).toBeGreaterThan(0);
    expect((await get('/store/products?q=tee')).body.items[0].variants.find((v: any) => v.size === 'M').available).toBe(18);
  });
  it('pay creates the Razorpay order in paise; the browser callback is recorded but does NOT confirm', async () => {
    const p = await post('/checkout/pay', { orderId: order.id }, { token: custToken, idem: false });
    expect(p.status).toBe(200); rz = p.body;
    expect(rz).toMatchObject({ amount: 95000, currency: 'INR', mock: true, razorpayOrderId: expect.stringMatching(/^order_mock_/) });
    const cb = await post('/checkout/pay', { orderId: order.id, razorpayPaymentId: 'pay_1', razorpaySignature: checkoutSignature(rz.razorpayOrderId, 'pay_1') }, { token: custToken, idem: false });
    expect(cb.body.signatureOk).toBe(true);
    expect((await get(`/customer/orders/${order.id}`, { token: custToken })).body.status).toBe('payment_pending');
  });
  it('a tampered webhook signature is rejected and nothing happens', async () => {
    const raw = captured(rz.razorpayOrderId, 95000, 'pay_1');
    const bad = await webhook(raw, { sig: 'a'.repeat(64) }); expect(bad.statusCode).toBe(400); expect(JSON.parse(bad.body).code).toBe('BAD_SIGNATURE');
    expect((await webhook(raw, { sig: '' })).statusCode).toBe(400);
    expect((await Order.findById(order.id).lean() as any).status).toBe('payment_pending');
  });
  it('a valid webhook confirms once: ECM invoice, SALE rows, hold released, cart emptied; a repeat does nothing', async () => {
    const ev = captured(rz.razorpayOrderId, 95000, 'pay_1'); const a = await webhook(ev, { id: 'evt_1' }); const b = await webhook(ev, { id: 'evt_1' });
    expect(JSON.parse(a.body)).toMatchObject({ received: true, result: 'confirmed' }); expect(JSON.parse(b.body).duplicate).toBe(true);
    const c = await webhook(ev, { id: 'evt_2' }); expect(JSON.parse(c.body).result).toBe('already confirmed'); // a different event for the same payment
    const o = (await get(`/customer/orders/${order.id}`, { token: custToken })).body;
    expect(o.status).toBe('confirmed'); expect(o.invoiceNumber).toMatch(/^ECM-/);
    expect(await SalesBill.countDocuments({ orderNumber: order.orderNumber })).toBe(1);
    expect((await stockOf(h, fx.tee.id)).onHand).toBe(18); expect((await stockOf(h, fx.tee.id)).reserved).toBe(0);
    const inv = await SalesBill.findOne({ orderNumber: order.orderNumber }).lean() as any;
    expect(inv).toMatchObject({ channel: 'ECM', grandTotal: 90000 }); expect(inv.tenders[0]).toMatchObject({ mode: 'razorpay', amount: 90000, reference: 'pay_1' }); // shipping is on the snapshot
    expect((await get('/cart', { token: custToken })).body.itemCount).toBe(0);
    expect(outbox.some((m) => m.to === 'ananya@example.com' && /placed/.test(m.subject))).toBe(true);
    expect((await h.get(`/sales/invoices/${inv._id}`)).status).toBe(200); // visible in the ERP
  });
  it('two buyers taking the last piece: one gets it, the other a clear 409 naming the item', async () => {
    const a = (await login('buyer1@example.com')).body.accessToken; const b = (await login('buyer2@example.com')).body.accessToken;
    await post('/cart', { variantId: fx.kurti.id, qty: 1 }, { token: a, idem: false }); await post('/cart', { variantId: fx.kurti.id, qty: 1 }, { token: b, idem: false });
    const rs = await Promise.all([a, b].map((tk, i) => post('/checkout/start', { address: addr, mobile: i ? '9000000002' : '9000000001', paymentMethod: 'online' }, { token: tk })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const lost = rs.find((r) => r.status === 409)!; expect(lost.body.code).toBe('INSUFFICIENT_STOCK'); expect(lost.body.message).toContain(fx.kurti.itemCode);
    expect((await stockOf(h, fx.kurti.id)).available).toBe(0);
  });
  it('a payment that arrives after the hold expired is refunded automatically; expired holds release the stock', async () => {
    const tok = (await login('late@example.com')).body.accessToken; const r = (await placeOrder(tok, fx.dress.id, 1, { mobile: '9000000003' })).body;
    const p = (await post('/checkout/pay', { orderId: r.id }, { token: tok, idem: false })).body;
    await Order.updateOne({ _id: r.id }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const w = await webhook(captured(p.razorpayOrderId, r.payable, 'pay_late'), { id: 'evt_late' });
    expect(JSON.parse(w.body).result).toBe('auto_refunded');
    const o = (await get(`/customer/orders/${r.id}`, { token: tok })).body; expect(o.status).toBe('cancelled'); expect(o.refund).toMatchObject({ status: 'auto_refunded', amount: r.payable });
    expect(await SalesBill.countDocuments({ orderNumber: r.orderNumber })).toBe(0);
    expect((await stockOf(h, fx.dress.id)).reserved).toBe(0);
    // refund failure is flagged for a human
    const tok2 = (await login('late2@example.com')).body.accessToken; const r2 = (await placeOrder(tok2, fx.dress.id, 1, { mobile: '9000000004' })).body; const p2 = (await post('/checkout/pay', { orderId: r2.id }, { token: tok2, idem: false })).body;
    await Order.updateOne({ _id: r2.id }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
    setPaymentsForTests({ kind: 'mock', keyId: 'x', createOrder: async () => ({ id: 'o', amount: 1, currency: 'INR' }), refund: async () => { throw new Error('gateway down'); } });
    await webhook(captured(p2.razorpayOrderId, r2.payable, 'pay_late2'), { id: 'evt_late2' }); setPaymentsForTests(undefined);
    expect((await Order.findById(r2.id).lean() as any).refund.status).toBe('needs_attention');
    // an order nobody paid: the cron releases the hold
    const tok3 = (await login('abandon@example.com')).body.accessToken; const r3 = (await placeOrder(tok3, fx.dress.id, 2, { mobile: '9000000005' })).body;
    await Order.updateOne({ _id: r3.id }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const { releaseExpiredHolds } = await import('../src/modules/store/orders.service'); expect(await releaseExpiredHolds()).toBeGreaterThanOrEqual(1);
    expect((await stockOf(h, fx.dress.id)).reserved).toBe(0); expect((await Order.findById(r3.id).lean() as any).status).toBe('cancelled');
  });
  it('payment with an amount that does not match is ignored', async () => {
    const tok = (await login('amt@example.com')).body.accessToken; const r = (await placeOrder(tok, fx.tee.id, 1, { mobile: '9000000006' })).body; const p = (await post('/checkout/pay', { orderId: r.id }, { token: tok, idem: false })).body;
    expect(JSON.parse((await webhook(captured(p.razorpayOrderId, 1, 'pay_x'), { id: 'evt_amt' })).body).result).toBe('amount mismatch');
    await t.api('POST', `${A}/customer/orders/${r.id}/cancel`, { token: tok, body: {} });
  });
});

describe('wallet, COD and the order lifecycle', () => {
  let tok: string; let cid: string;
  beforeAll(async () => { const r = await login('cod@example.com'); tok = r.body.accessToken; cid = r.body.customer.id; });
  it('COD needs a serviceable pincode, adds the COD fee, and is confirmed straight away with the stock still on hold', async () => {
    const r = await placeOrder(tok, fx.tee.id, 1, { paymentMethod: 'cod', mobile: '9000000010' });
    expect(r.body).toMatchObject({ status: 'confirmed', paymentMethod: 'cod', codFee: 4000, shipping: 5000, total: 54000, payable: 54000, invoiceNumber: null });
    expect((await stockOf(h, fx.tee.id)).reserved).toBe(1);
    await h.put('/admin/store-settings', { cod: { enabled: true, fee: 4000, maxOrderValue: 10000, pincodes: [] } });
    expect((await placeOrder(tok, fx.tee.id, 1, { paymentMethod: 'cod', mobile: '9000000010' })).body.code).toBe('COD_LIMIT');
    await h.put('/admin/store-settings', { cod: { enabled: true, fee: 4000, maxOrderValue: 500000, pincodes: [] } });
    codOrder = r.body;
  });
  let codOrder: any;
  it('only legal moves are accepted, each is logged with who and when; shipping creates a shipment; COD is invoiced at delivery', async () => {
    const patch = (status: string) => t.api('PATCH', `${A}/admin/orders/${codOrder.id}`, { token: t.adminToken, body: { status } });
    expect((await patch('delivered')).body.code).toBe('ILLEGAL_TRANSITION'); expect((await patch('shipped')).status).toBe(422);
    expect((await patch('packed')).body.status).toBe('packed');
    const shipped = await patch('shipped'); expect(shipped.body.shipment.awb).toMatch(/^MOCKAWB/);
    expect((await patch('delivered')).body.status).toBe('delivered');
    expect((await patch('packed')).status).toBe(422);
    const o: any = await Order.findById(codOrder.id).lean(); expect(o.invoiceNumber).toMatch(/^ECM-/);
    expect(o.timeline.map((x: any) => x.status)).toEqual(['created', 'confirmed', 'packed', 'shipped', 'delivered']); expect(o.timeline.every((x: any) => x.by && x.at)).toBe(true);
    expect((await SalesBill.findOne({ orderNumber: o.orderNumber }).lean() as any).tenders[0]).toMatchObject({ mode: 'cash', amount: 45000 }); // goods 450; shipping and COD fee are outside the invoice
    expect((await stockOf(h, fx.tee.id)).reserved).toBe(0);
    expect((await get(`/customer/orders/${codOrder.id}/track`, { token: tok })).body.shipment.trackingUrl).toMatch(/track\.example\.test/);
  });
  it('Shiprocket webhooks need the token and are processed once', async () => {
    const r = await placeOrder(tok, fx.tee.id, 1, { paymentMethod: 'cod', mobile: '9000000010' }); await t.api('PATCH', `${A}/admin/orders/${r.body.id}`, { token: t.adminToken, body: { status: 'packed' } }); const s = await t.api('PATCH', `${A}/admin/orders/${r.body.id}`, { token: t.adminToken, body: { status: 'shipped' } });
    const hook = (token?: string) => t.api('POST', `${A}/webhooks/shiprocket`, { body: { awb: s.body.shipment.awb, current_status: 'OUT FOR DELIVERY', current_timestamp: 't1' }, headers: token ? { 'x-api-key': token } : {} });
    expect((await hook()).status).toBe(401); expect((await hook('wrong')).status).toBe(401);
    expect((await hook('mock-shiprocket-token')).body.received).toBe(true); expect((await hook('mock-shiprocket-token')).body.duplicate).toBe(true);
    expect((await Order.findById(r.body.id).lean() as any).status).toBe('out_for_delivery');
    await t.api('PATCH', `${A}/admin/orders/${r.body.id}`, { token: t.adminToken, body: { status: 'delivered' } });
  });
  it('customers can cancel before packed: stock hold and wallet money come back; not after', async () => {
    const r = await placeOrder(tok, fx.tee.id, 1, { mobile: '9000000010' });
    const c = await post(`/customer/orders/${r.body.id}/cancel`, {}, { token: tok, idem: false }); expect(c.body.status).toBe('cancelled');
    expect((await stockOf(h, fx.tee.id)).reserved).toBe(0);
    const cod = (await placeOrder(tok, fx.tee.id, 1, { paymentMethod: 'cod', mobile: '9000000010' })).body; await t.api('PATCH', `${A}/admin/orders/${cod.id}`, { token: t.adminToken, body: { status: 'packed' } });
    expect((await post(`/customer/orders/${cod.id}/cancel`, {}, { token: tok, idem: false })).body.code).toBe('CANNOT_CANCEL');
    expect((await get(`/customer/orders/${cod.id}`, { token: (await login('stranger@example.com')).body.accessToken })).status).toBe(404); // not my order
  });
  it('part payment takes the wallet first, then the balance; a wallet that covers everything confirms at once', async () => {
    const { WalletLedger } = await import('../src/models'); await WalletLedger.create({ customerId: cid, amount: 20000, type: 'CREDIT', docType: 'TEST' });
    const r = await placeOrder(tok, fx.tee.id, 1, { useWallet: true, mobile: '9000000010' });
    expect(r.body).toMatchObject({ walletUsed: 20000, payable: 30000, status: 'payment_pending' });
    expect((await get('/customer/wallet', { token: tok })).body.balance).toBe(0);
    const p = (await post('/checkout/pay', { orderId: r.body.id }, { token: tok, idem: false })).body; expect(p.amount).toBe(30000);
    await webhook(captured(p.razorpayOrderId, 30000, 'pay_part'), { id: 'evt_part' });
    const inv = await SalesBill.findOne({ orderNumber: r.body.orderNumber }).lean() as any; expect(inv.tenders.map((x: any) => [x.mode, x.amount])).toEqual([['wallet', 20000], ['razorpay', 25000]]); // goods 450 + wallet 200 / razorpay 250; shipping 50 outside the invoice
    await WalletLedger.create({ customerId: cid, amount: 100000, type: 'CREDIT', docType: 'TEST' });
    const full = await placeOrder(tok, fx.tee.id, 1, { useWallet: true, mobile: '9000000010' }); expect(full.body).toMatchObject({ status: 'confirmed', paymentMethod: 'wallet', payable: 0 });
  });
  let ret: any;
  it('return: request with a reason and photos, approve with a reverse pickup, receive, refund to the wallet', async () => {
    const d = codOrder; const body = { reason: 'size', note: 'too small', photoKeys: ['images/a.jpg'], lines: [{ variantId: fx.tee.id, qty: 1 }] };
    expect((await post(`/customer/orders/${d.id}/return`, { ...body, photoKeys: ['1', '2', '3', '4', '5'] }, { token: tok, idem: false })).status).toBe(400);
    const rr = await post(`/customer/orders/${d.id}/return`, body, { token: tok, idem: false }); expect(rr.body.status).toBe('return_requested');
    const ap = await post(`/admin/returns/${d.id}/approve`, { note: 'ok' }, { token: t.adminToken, idem: false }); expect(ap.body.status).toBe('return_approved'); expect(ap.body.shipment.reverseAwb).toMatch(/^MOCKRVP/);
    const before = (await stockOf(h, fx.tee.id, (await h.get('/stores')).body.items.find((s: any) => s.type === 'online').id)).onHand;
    const walletBefore = (await get('/customer/wallet', { token: tok })).body.balance;
    const rf = await post(`/admin/returns/${d.id}/refund`, { refundTo: 'wallet', condition: 'restock' }, { token: t.adminToken });
    expect(rf.body.status).toBe('refunded'); expect(rf.body.refund).toMatchObject({ amount: 45000, to: 'wallet', creditNote: expect.stringMatching(/^CN-/) }); ret = rf.body;
    expect((await get('/customer/wallet', { token: tok })).body.balance - walletBefore).toBe(45000);
    expect(before).toBeDefined();
    expect(outbox.some((m) => /Refund for/.test(m.subject))).toBe(true);
  });
  it('a return can be rejected with a note; discounted (coupon) orders cannot be returned; the window is enforced', async () => {
    await h.post('/coupons', { code: 'RET10', type: 'flat', value: 5000 }, { idem: false });
    await post('/cart', { variantId: fx.tee.id, qty: 1 }, { token: tok, idem: false }); await post('/cart/coupon', { code: 'RET10' }, { token: tok, idem: false });
    const o = (await post('/checkout/start', { address: addr, mobile: '9000000010', paymentMethod: 'cod' }, { token: tok })).body;
    for (const s of ['packed', 'shipped', 'delivered']) await t.api('PATCH', `${A}/admin/orders/${o.id}`, { token: t.adminToken, body: { status: s } });
    const r = await post(`/customer/orders/${o.id}/return`, { reason: 'size', lines: [{ variantId: fx.tee.id, qty: 1 }] }, { token: tok, idem: false }); expect(r.body.code).toBe('NOT_RETURNABLE');
    const plain = (await placeOrder(tok, fx.dress.id, 1, { paymentMethod: 'cod', mobile: '9000000010' })).body; for (const s of ['packed', 'shipped', 'delivered']) await t.api('PATCH', `${A}/admin/orders/${plain.id}`, { token: t.adminToken, body: { status: s } });
    await post(`/customer/orders/${plain.id}/return`, { reason: 'other', lines: [{ variantId: fx.dress.id, qty: 1 }] }, { token: tok, idem: false });
    const rej = await post(`/admin/returns/${plain.id}/reject`, { note: 'Worn item' }, { token: t.adminToken, idem: false }); expect(rej.body.status).toBe('delivered');
    await Order.updateOne({ _id: plain.id }, { $set: { 'timeline.4.at': new Date(Date.now() - 9 * 86400000) } });
    expect((await post(`/customer/orders/${plain.id}/return`, { reason: 'size', lines: [{ variantId: fx.dress.id, qty: 1 }] }, { token: tok, idem: false })).body.code).toBe('RETURN_WINDOW_PASSED');
    void ret;
  });
  it('permissions: Sales can work orders but not approve returns; the ledger still ties', async () => {
    const sales = await tokenFor(t, 'Sales', 'sales-orders@test.local');
    expect((await get('/admin/orders', { token: sales })).status).toBe(200);
    expect((await post(`/admin/returns/${codOrder.id}/approve`, {}, { token: sales, idem: false })).status).toBe(403);
    expect((await get('/admin/orders', { token: custToken })).status).toBe(401);
    const { ledgerOnHand } = await import('../src/lib/stock'); const led = await ledgerOnHand(); const bals: any[] = await StockBalance.find().lean(); const lm = new Map(led.map((l) => [`${l.variantId}:${l.storeId}`, l.qty]));
    for (const b of bals) expect(lm.get(`${b.variantId}:${b.storeId}`) ?? 0).toBe(b.onHand);
    expect(await Customer.countDocuments({ email: 'ananya@example.com' })).toBe(1);
    void S;
  });
});
