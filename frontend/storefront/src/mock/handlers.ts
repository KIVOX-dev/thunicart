import type { Address, CartPricing, DeliveryCheck, Facets, HomeData, Order, OrderStatus, PricedLine, Product, ProductList, ReturnRequest, User, WalletEntry } from '../lib/types';
import { ANNOUNCEMENTS, BLOG, CATEGORIES, CONTACT, PAGES, PRODUCTS, SIZES_ALL } from './seed';

/**
 * The storefront's mock API. It answers the same paths the real API will (see docs/api-requests.md), in memory, so every page and the
 * whole checkout can be demoed without a backend or keys. Money is integer paise. Totals, discounts and shipping are worked out here.
 */
export interface Req { method: string; path: string[]; query: URLSearchParams; body: unknown; cookies: Record<string, string> }
export interface Res { status: number; json: unknown; cookies?: Array<{ name: string; value: string; maxAge?: number; httpOnly?: boolean }> }

interface Db {
  users: Array<User & { createdAt: string }>; sessions: Record<string, string>; otps: Record<string, number>; addresses: Record<string, Address[]>; wishlist: Record<string, string[]>;
  wallet: Record<string, WalletEntry[]>; orders: Order[]; seq: number; stock: Record<string, number>; payAt: Record<string, number>; gstOn: boolean;
}
const g = globalThis as unknown as { __tkdb?: Db };
function db(): Db {
  g.__tkdb ??= { users: [], sessions: {}, otps: {}, addresses: {}, wishlist: {}, wallet: {}, orders: [], seq: 0, stock: Object.fromEntries(PRODUCTS.flatMap((p) => p.variants.map((v) => [v.id, v.stock]))), payAt: {}, gstOn: process.env.NEXT_PUBLIC_MOCK_GST === 'on' };
  return g.__tkdb;
}
export const resetMockDb = () => { g.__tkdb = undefined; };

const ok = (json: unknown, status = 200, cookies?: Res['cookies']): Res => ({ status, json, cookies });
const err = (status: number, code: string, message: string, fields: Array<{ path: string; message: string }> = []): Res => ({ status, json: { code, message, fields, requestId: `req_mock_${Date.now().toString(36)}` } });
const num = (v: string | null, d: number) => (v ? Number(v) : d);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Stock shown to shoppers is the stock left after holds and sales. */
function live(p: Product): Product {
  const stock = db().stock;
  const variants = p.variants.map((v) => ({ ...v, stock: stock[v.id] ?? 0 }));
  const inStock = variants.some((v) => v.stock > 0);
  return { ...p, variants, inStock, lowStock: variants.some((v) => v.stock > 0 && v.stock <= 3) };
}

const PRICE_RANGES = [{ key: 'u500', label: 'Under ₹500' }, { key: '500-1000', label: '₹500 to ₹1,000' }, { key: '1000-1500', label: '₹1,000 to ₹1,500' }, { key: '1500+', label: 'Over ₹1,500' }];
const inRange = (p: Product, key: string) => { const r = p.fromPrice / 100; return key === 'u500' ? r < 500 : key === '500-1000' ? r >= 500 && r <= 1000 : key === '1000-1500' ? r > 1000 && r <= 1500 : key === '1500+' ? r > 1500 : true; };
const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

function facetsOf(list: Product[]): Facets {
  const uniq = <T,>(a: T[]) => [...new Set(a)];
  const colors = new Map<string, string>();
  list.forEach((p) => p.colors.forEach((c) => colors.set(c.name, c.hex)));
  return { sizes: SIZES_ALL.filter((s) => list.some((p) => p.variants.some((v) => v.size === s))), colors: [...colors].map(([name, hex]) => ({ name, hex })), fabrics: uniq(list.map((p) => p.fabric)).sort(), brands: uniq(list.map((p) => p.brand)).sort(), occasions: uniq(list.map((p) => p.occasion)).sort(), priceRanges: PRICE_RANGES };
}

function catalog(q: URLSearchParams): ProductList {
  const all = PRODUCTS.map(live);
  const cat = q.get('category');
  const base = all.filter((p) => !cat || cat === 'all' || p.categorySlug === cat || p.subSlug === cat || (cat === 'sale' && p.discountPct >= 10) || (cat === 'bestseller' && p.trending) || (cat === 'new-arrivals' && p.isNew));
  const sizes = csv(q.get('size')), colors = csv(q.get('color')), fabrics = csv(q.get('fabric')), brands = csv(q.get('brand')), occ = csv(q.get('occasion'));
  const text = (q.get('q') ?? '').toLowerCase();
  const ids = csv(q.get('ids'));
  let out = base.filter((p) => (!sizes.length || p.variants.some((v) => sizes.includes(v.size))) && (!colors.length || p.colors.some((c) => colors.includes(c.name))) && (!fabrics.length || fabrics.includes(p.fabric)) && (!brands.length || brands.includes(p.brand)) && (!occ.length || occ.includes(p.occasion))
    && (!q.get('price') || inRange(p, q.get('price')!)) && (!q.get('discount') || p.discountPct >= Number(q.get('discount'))) && (q.get('availability') !== 'in' || p.inStock) && (!text || `${p.name} ${p.code} ${p.category} ${p.brand}`.toLowerCase().includes(text)) && (!ids.length || ids.includes(p.id) || ids.includes(p.slug)));
  const sort = q.get('sort') ?? 'popular';
  out = [...out].sort((a, b) => (sort === 'new' ? b.createdAt.localeCompare(a.createdAt) : sort === 'price-asc' ? a.fromPrice - b.fromPrice : sort === 'price-desc' ? b.fromPrice - a.fromPrice : sort === 'discount' ? b.discountPct - a.discountPct : b.popularity - a.popularity));
  const page = num(q.get('page'), 1), size = num(q.get('pageSize'), 12);
  const pages = num(q.get('pages'), 1);
  const upto = out.slice(0, Math.max(page, pages) * size); // the server can send pages 1..N at once, so Load More survives the back button
  return { items: pages > 1 || page === 1 ? upto : out.slice((page - 1) * size, page * size), total: out.length, nextPage: Math.max(page, pages) * size < out.length ? Math.max(page, pages) + 1 : null, facets: facetsOf(base) };
}

const gstStatus = () => ({ gstMode: db().gstOn ? 'on' : 'off' });

/* Pricing */
const COUPONS: Record<string, { pct?: number; flat?: number; min: number; freeShip?: boolean }> = { SAVE10: { pct: 10, min: 99900 }, FIRST100: { flat: 10000, min: 50000 }, FREESHIP: { min: 0, freeShip: true } };
function price(lines: Array<{ variantId: string; qty: number }>, couponCode: string | null, useWallet: boolean, user: User | null): CartPricing {
  const priced: PricedLine[] = [];
  const unavailable: CartPricing['unavailable'] = [];
  for (const l of lines) {
    const p = PRODUCTS.find((x) => x.variants.some((v) => v.id === l.variantId));
    const v = p?.variants.find((x) => x.id === l.variantId);
    if (!p || !v) continue;
    const stock = db().stock[v.id] ?? 0;
    const available = stock >= l.qty;
    const unit = v.offer ?? v.price;
    const message = available ? null : stock === 0 ? 'Sold out' : `Only ${stock} left`;
    if (!available) unavailable.push({ variantId: v.id, name: p.name, size: v.size, message: message! });
    priced.push({ variantId: v.id, productId: p.id, slug: p.slug, name: p.name, image: p.images[0]!, size: v.size, color: v.color, qty: l.qty, mrp: v.mrp, price: unit, lineTotal: unit * l.qty, stock, available, message });
  }
  const subtotal = priced.reduce((a, l) => a + l.lineTotal, 0);
  let discount = 0, coupon: CartPricing['coupon'] = null, couponError: string | null = null, freeShip = false;
  if (couponCode) {
    const c = COUPONS[couponCode.trim().toUpperCase()];
    if (!c) couponError = 'This coupon code is not valid.';
    else if (subtotal < c.min) couponError = `Add ₹${Math.ceil((c.min - subtotal) / 100)} more to use ${couponCode.toUpperCase()}.`;
    else { discount = c.pct ? Math.round((subtotal * c.pct) / 100) : c.flat ?? 0; freeShip = !!c.freeShip; coupon = { code: couponCode.toUpperCase(), message: c.freeShip ? 'Free shipping applied.' : `You saved ₹${discount / 100}.` }; }
  }
  const afterDiscount = subtotal - discount;
  const shipping = !priced.length || freeShip || afterDiscount >= 99900 ? 0 : 6900;
  const gross = afterDiscount + shipping;
  const walletUsed = useWallet && user ? Math.min(user.wallet, gross) : 0;
  const tax = db().gstOn ? Math.round(afterDiscount * 5 / 105) : null;
  return { lines: priced, subtotal, discount, shipping, tax, walletUsed, total: gross - walletUsed, coupon, couponError, unavailable, pieces: priced.reduce((a, l) => a + l.qty, 0) };
}

/* Delivery */
function delivery(pincode: string): DeliveryCheck {
  if (!/^\d{6}$/.test(pincode)) return { pincode, ok: false, city: '', days: 0, fee: 0, cod: false, message: 'Enter a 6 digit pincode.' };
  const first = pincode[0]!;
  if (!['5', '6', '7', '4', '1', '2', '3', '8'].includes(first)) return { pincode, ok: false, city: '', days: 0, fee: 0, cod: false, message: 'We do not deliver to this pincode yet.' };
  const south = first === '6' || first === '5';
  return { pincode, ok: true, city: first === '6' ? (pincode.startsWith('641') ? 'Coimbatore' : 'Tamil Nadu') : south ? 'South India' : 'India', days: pincode.startsWith('641') ? 2 : south ? 3 : 6, fee: 6900, cod: south, message: `Delivery in ${pincode.startsWith('641') ? 2 : south ? 3 : 6} days${south ? ', cash on delivery available' : ''}.` };
}

/* Session */
function userOf(cookies: Record<string, string>): User | null {
  const id = db().sessions[cookies.tk_session ?? ''];
  const u = db().users.find((x) => x.id === id);
  if (!u) return null;
  const entries = db().wallet[u.id] ?? [];
  return { id: u.id, email: u.email, name: u.name, mobile: u.mobile, wallet: entries[0]?.balance ?? 0 };
}
const walletAdd = (userId: string, amount: number, note: string) => {
  const list = (db().wallet[userId] ??= []);
  list.unshift({ id: `w${db().seq++}`, at: new Date().toISOString(), note, amount, balance: (list[0]?.balance ?? 0) + amount });
};

/* Orders */
const HOLD_MS = 15 * 60 * 1000;
function release(o: Order, reason: string) {
  for (const l of o.lines) db().stock[l.variantId] = (db().stock[l.variantId] ?? 0) + l.qty;
  o.status = 'cancelled'; o.holdUntil = null; o.tracking.push({ status: 'Cancelled', at: new Date().toISOString(), note: reason }); o.canCancel = false;
}
/** Lazy transitions: a payment confirmed by the gateway webhook lands after a short delay, and an unpaid order loses its stock hold when time is up. */
function tick(o: Order) {
  const now = Date.now();
  const due = db().payAt[o.id];
  if (o.status === 'pending-payment' && due && now >= due) {
    o.status = 'paid'; o.payment.status = 'paid'; o.holdUntil = null; o.canCancel = true; o.emailSent = true;
    o.tracking.push({ status: 'Payment confirmed', at: new Date(now).toISOString(), note: 'Thank you. We are packing your order.' });
    if (o.totals.walletUsed) { const uid = (o as unknown as { userId?: string }).userId; if (uid) walletAdd(uid, -o.totals.walletUsed, `Used on ${o.number}`); }
  } else if (o.status === 'pending-payment' && o.holdUntil && now > new Date(o.holdUntil).getTime()) release(o, 'The stock hold ran out before payment.');
  return o;
}
const ownsOrder = (o: Order, user: User | null, cookies: Record<string, string>) => (user && (o as unknown as { userId?: string }).userId === user.id) || (cookies.tk_guest_orders ?? '').split(',').includes(o.id);

const clean = (o: Order): Order => { const { ...rest } = o as Order & { userId?: string }; delete (rest as { userId?: string }).userId; return rest; };

export async function handle(req: Req): Promise<Res> {
  const [a, b, c, d] = req.path;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const user = userOf(req.cookies);
  const m = req.method;

  if (a === 'settings' && b === 'gst-status') return ok(gstStatus());

  /* Catalog and CMS */
  if (a === 'catalog') {
    if (b === 'categories') return ok(CATEGORIES);
    if (b === 'products' && !c) return ok(catalog(req.query));
    if (b === 'products' && c) { const p = PRODUCTS.find((x) => x.slug === c || x.id === c); return p ? ok(live(p)) : err(404, 'NOT_FOUND', 'We could not find this product.'); }
    if (b === 'suggest') { const t = (req.query.get('q') ?? '').toLowerCase(); return ok(t.length < 2 ? [] : PRODUCTS.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(t)).slice(0, 6).map((p) => ({ slug: p.slug, name: p.name, image: p.images[0], price: p.fromPrice }))); }
  }
  if (a === 'cms') {
    if (b === 'home') {
      const all = PRODUCTS.map(live);
      const home: HomeData = {
        announcements: ANNOUNCEMENTS, categories: CATEGORIES, sizes: SIZES_ALL, contact: CONTACT,
        banners: [
          { id: 'b1', title: 'Festive kurtis', subtitle: 'Rich colours, easy fits', mobileImage: '/api/img/banner-m1/1?w=390&h=520', desktopImage: '/api/img/banner-d1/1?w=1600&h=560', href: '/c/kurtis' },
          { id: 'b2', title: 'Soft nightwear', subtitle: 'Cotton comfort for every night', mobileImage: '/api/img/banner-m2/1?w=390&h=520', desktopImage: '/api/img/banner-d2/1?w=1600&h=560', href: '/c/nightwear' },
          { id: 'b3', title: 'Everyday leggings', subtitle: 'From ₹349', mobileImage: '/api/img/banner-m3/1?w=390&h=520', desktopImage: '/api/img/banner-d3/1?w=1600&h=560', href: '/c/leggings' },
        ],
        occasions: ['Daily wear', 'Festive', 'Office', 'Night', 'Wedding'].map((n) => ({ name: n, image: `/api/img/occ-${slugify(n)}/1`, href: `/c/all?occasion=${encodeURIComponent(n)}` })),
        trending: all.filter((p) => p.trending).slice(0, 8), newArrivals: all.filter((p) => p.isNew).slice(0, 8),
        lookbook: [1, 2, 3, 4].map((n) => ({ image: `/api/img/look-${n}/1`, title: `Look ${n}`, href: '/c/all' })),
      };
      return ok(home);
    }
    if (b === 'pages' && c) { const p = PAGES.find((x) => x.slug === c); return p ? ok(p) : err(404, 'NOT_FOUND', 'Page not found.'); }
    if (b === 'blog' && !c) return ok(BLOG);
    if (b === 'blog' && c) { const p = BLOG.find((x) => x.slug === c); return p ? ok(p) : err(404, 'NOT_FOUND', 'Article not found.'); }
    if (b === 'sitemap') return ok({ products: PRODUCTS.map((p) => p.slug), categories: CATEGORIES.flatMap((x) => [x.slug, ...x.children.map((s) => s.slug)]), pages: PAGES.map((p) => p.slug), blog: BLOG.map((p) => p.slug) });
  }
  if (a === 'delivery' && b === 'check') return ok(delivery(req.query.get('pincode') ?? ''));

  /* Cart and coupons */
  if (a === 'cart' && b === 'price' && m === 'POST') return ok(price((body.lines as Array<{ variantId: string; qty: number }>) ?? [], (body.coupon as string) || null, !!body.useWallet, user));

  /* Email code login */
  if (a === 'auth') {
    if (b === 'otp' && c === 'request') {
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return err(422, 'VALIDATION', 'Enter a valid email.', [{ path: 'email', message: 'Enter a valid email' }]);
      db().otps[email] = Date.now() + 10 * 60 * 1000;
      return ok({ ok: true, resendAfterSeconds: 30, hint: process.env.NEXT_PUBLIC_API_URL?.includes('REPLACE_ME') ?? true ? 'Demo mode: the code is 123456' : undefined });
    }
    if (b === 'otp' && c === 'verify') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const code = String(body.code ?? '');
      if (!/^\d{6}$/.test(code)) return err(422, 'VALIDATION', 'Enter the 6 digit code.', [{ path: 'code', message: 'Enter the 6 digit code' }]);
      if (email.startsWith('expired') || (db().otps[email] ?? 0) < Date.now()) return err(422, 'CODE_EXPIRED', 'This code has expired. Ask for a new one.', [{ path: 'code', message: 'Code expired' }]);
      if (code !== '123456') return err(422, 'WRONG_CODE', 'That code is not right. Check it and try again.', [{ path: 'code', message: 'Wrong code' }]);
      let u = db().users.find((x) => x.email === email);
      if (!u) { u = { id: `u${++db().seq}`, email, name: email.split('@')[0]!, mobile: '', wallet: 0, createdAt: new Date().toISOString() }; db().users.push(u); walletAdd(u.id, 50000, 'Welcome credit'); }
      const token = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      db().sessions[token] = u.id;
      return ok({ ok: true }, 200, [{ name: 'tk_session', value: token, httpOnly: true, maxAge: 60 * 60 * 24 * 30 }]);
    }
    if (b === 'logout') { delete db().sessions[req.cookies.tk_session ?? '']; return ok({ ok: true }, 200, [{ name: 'tk_session', value: '', maxAge: 0, httpOnly: true }]); }
  }
  if (a === 'me' && !b) {
    if (!user) return err(401, 'UNAUTHENTICATED', 'Please sign in.');
    if (m === 'PUT') { const u = db().users.find((x) => x.id === user.id)!; if (typeof body.name === 'string') u.name = body.name.trim(); if (typeof body.mobile === 'string') { if (body.mobile && !/^[6-9]\d{9}$/.test(body.mobile)) return err(422, 'VALIDATION', 'Check the highlighted fields.', [{ path: 'mobile', message: 'Enter a 10 digit Indian mobile number' }]); u.mobile = body.mobile; } return ok(userOf(req.cookies)); }
    return ok(user);
  }

  /* The pages below need a signed in shopper, except orders which guests can also use */
  if (a === 'addresses') {
    if (!user) return err(401, 'UNAUTHENTICATED', 'Please sign in.');
    const list = (db().addresses[user.id] ??= []);
    if (m === 'GET') return ok(list);
    if (m === 'DELETE' && b) { db().addresses[user.id] = list.filter((x) => x.id !== b); return ok({ ok: true }); }
    if (m === 'POST' || m === 'PUT') {
      const fields: Array<{ path: string; message: string }> = [];
      const s = (k: string) => String(body[k] ?? '').trim();
      if (s('name').length < 2) fields.push({ path: 'name', message: 'Enter the name' });
      if (!/^[6-9]\d{9}$/.test(s('mobile'))) fields.push({ path: 'mobile', message: 'Enter a 10 digit Indian mobile number' });
      if (!s('line1')) fields.push({ path: 'line1', message: 'Enter the address' });
      if (!s('city')) fields.push({ path: 'city', message: 'Enter the city' });
      const dc = delivery(s('pincode'));
      if (!dc.ok) fields.push({ path: 'pincode', message: dc.message });
      if (fields.length) return err(422, 'VALIDATION', 'Check the highlighted fields.', fields);
      const addr: Address = { id: m === 'PUT' && b ? b : `a${++db().seq}`, name: s('name'), mobile: s('mobile'), line1: s('line1'), line2: s('line2'), city: s('city'), state: s('state') || 'Tamil Nadu', pincode: s('pincode'), isDefault: !!body.isDefault || list.length === 0 };
      if (addr.isDefault) list.forEach((x) => { x.isDefault = false; });
      if (m === 'PUT') db().addresses[user.id] = list.map((x) => (x.id === addr.id ? addr : x)); else list.push(addr);
      return ok(addr, m === 'POST' ? 201 : 200);
    }
  }
  if (a === 'wallet') return user ? ok(db().wallet[user.id] ?? []) : err(401, 'UNAUTHENTICATED', 'Please sign in.');
  if (a === 'wishlist') {
    if (!user) return err(401, 'UNAUTHENTICATED', 'Please sign in.');
    if (m === 'PUT') { db().wishlist[user.id] = ((body.ids as string[]) ?? []).slice(0, 100); }
    return ok(db().wishlist[user.id] ?? []);
  }
  if (a === 'uploads' && b === 'presign') { const key = `returns/${Date.now()}-${slugify(String(body.filename ?? 'photo'))}`; return ok({ uploadUrl: `/api/mock-b2/${key}`, key }); }

  /* Orders */
  if (a === 'orders') {
    if (m === 'POST' && !b) {
      const lines = (body.lines as Array<{ variantId: string; qty: number }>) ?? [];
      const addr = body.address as Partial<Address> | undefined;
      const fields: Array<{ path: string; message: string }> = [];
      if (!lines.length) return err(422, 'EMPTY_CART', 'Your bag is empty.');
      const s = (v: unknown) => String(v ?? '').trim();
      if (s(addr?.name).length < 2) fields.push({ path: 'address.name', message: 'Enter the name' });
      if (!/^[6-9]\d{9}$/.test(s(addr?.mobile))) fields.push({ path: 'address.mobile', message: 'Enter a 10 digit Indian mobile number' });
      if (!s(addr?.line1)) fields.push({ path: 'address.line1', message: 'Enter the address' });
      if (!s(addr?.city)) fields.push({ path: 'address.city', message: 'Enter the city' });
      const dc = delivery(s(addr?.pincode));
      if (!dc.ok) fields.push({ path: 'address.pincode', message: dc.message });
      if (!user && !/^\S+@\S+\.\S+$/.test(s(body.email))) fields.push({ path: 'email', message: 'Enter your email for the order updates' });
      if (fields.length) return err(422, 'VALIDATION', 'Check the highlighted fields.', fields);
      const method = body.method === 'cod' ? 'cod' : 'razorpay';
      if (method === 'cod' && !dc.cod) return err(422, 'COD_NOT_AVAILABLE', 'Cash on delivery is not available for this pincode. Pay online instead.', [{ path: 'method', message: 'Not available here' }]);
      const pr = price(lines, (body.coupon as string) || null, !!body.useWallet, user);
      if (pr.unavailable.length) return err(409, 'ITEM_UNAVAILABLE', `${pr.unavailable.map((u) => `${u.name} (${u.size}): ${u.message}`).join('; ')}. Remove it to continue.`, pr.unavailable.map((u) => ({ path: `lines.${u.variantId}`, message: u.message })));
      if (pr.couponError) return err(422, 'BAD_COUPON', pr.couponError, [{ path: 'coupon', message: pr.couponError }]);
      for (const l of pr.lines) db().stock[l.variantId] = (db().stock[l.variantId] ?? 0) - l.qty; // the 15 minute stock hold
      const id = `o${++db().seq}`;
      const order: Order & { userId?: string } = {
        id, number: `ECM-${String(100000 + db().orders.length + 1)}`, status: method === 'cod' ? 'paid' : 'pending-payment', createdAt: new Date().toISOString(), holdUntil: method === 'cod' ? null : new Date(Date.now() + HOLD_MS).toISOString(), lines: pr.lines,
        totals: { subtotal: pr.subtotal, discount: pr.discount, shipping: pr.shipping, tax: pr.tax, walletUsed: pr.walletUsed, total: pr.total },
        address: { id: 'snap', name: s(addr?.name), mobile: s(addr?.mobile), line1: s(addr?.line1), line2: s(addr?.line2), city: s(addr?.city), state: s(addr?.state) || 'Tamil Nadu', pincode: s(addr?.pincode), isDefault: false },
        payment: { method, status: method === 'cod' ? 'pending' : 'pending', gatewayOrderId: `order_mock_${id}` }, tracking: [{ status: 'Order placed', at: new Date().toISOString(), note: method === 'cod' ? 'Pay when it arrives.' : 'Waiting for payment.' }],
        awb: null, canCancel: method === 'cod', returns: [], emailSent: method === 'cod', userId: user?.id,
      };
      if (method === 'cod') { order.tracking.push({ status: 'Confirmed', at: new Date().toISOString(), note: 'We are packing your order.' }); if (user && pr.walletUsed) walletAdd(user.id, -pr.walletUsed, `Used on ${order.number}`); }
      db().orders.unshift(order);
      const guestIds = [...new Set([...(req.cookies.tk_guest_orders ?? '').split(',').filter(Boolean), id])].slice(-10).join(',');
      return ok(clean(order), 201, [{ name: 'tk_guest_orders', value: guestIds, maxAge: 60 * 60 * 24 * 30 }]);
    }
    if (m === 'GET' && !b) {
      if (!user) return err(401, 'UNAUTHENTICATED', 'Please sign in.');
      return ok(db().orders.filter((o) => (o as unknown as { userId?: string }).userId === user.id).map((o) => clean(tick(o))));
    }
    const o = db().orders.find((x) => x.id === b);
    if (!o || !ownsOrder(o, user, req.cookies)) return err(404, 'NOT_FOUND', 'We could not find this order.');
    tick(o);
    if (m === 'GET' && !c) return ok(clean(o));
    if (c === 'cancel' && m === 'POST') {
      if (!o.canCancel || !['paid', 'pending-payment'].includes(o.status)) return err(409, 'CANNOT_CANCEL', 'This order is already packed, so it cannot be cancelled now.');
      const wasPaid = o.payment.status === 'paid'; release(o, 'Cancelled by you.');
      const uid = (o as unknown as { userId?: string }).userId;
      if (uid && wasPaid) walletAdd(uid, o.totals.total + o.totals.walletUsed, `Refund for ${o.number}`);
      return ok(clean(o));
    }
    if (c === 'return' && m === 'POST') {
      const photos = (body.photos as string[]) ?? [];
      const rl = (body.lines as Array<{ variantId: string; qty: number }>) ?? [];
      const fields: Array<{ path: string; message: string }> = [];
      if (o.status !== 'delivered') return err(409, 'NOT_DELIVERED', 'You can ask for a return after the order is delivered.');
      if (!String(body.reason ?? '').trim()) fields.push({ path: 'reason', message: 'Choose a reason' });
      if (!rl.length) fields.push({ path: 'lines', message: 'Choose at least one item' });
      if (photos.length > 4) fields.push({ path: 'photos', message: 'You can add up to 4 photos' });
      if (fields.length) return err(422, 'VALIDATION', 'Check the highlighted fields.', fields);
      const r: ReturnRequest = { id: `r${++db().seq}`, orderId: o.id, kind: body.kind === 'exchange' ? 'exchange' : 'return', reason: String(body.reason), lines: rl.map((l) => ({ ...l, name: o.lines.find((x) => x.variantId === l.variantId)?.name ?? '' })), photos, status: 'requested', createdAt: new Date().toISOString() };
      o.returns.push(r); o.status = 'return-requested'; o.tracking.push({ status: `${r.kind === 'exchange' ? 'Exchange' : 'Return'} requested`, at: r.createdAt, note: r.reason });
      return ok(r, 201);
    }
  }

  /* Mock only: the payment gateway and the warehouse, so a whole order can be demoed */
  if (a === 'mock') {
    if (b === 'payments' && c && d === 'succeed') { db().payAt[c] = Date.now() + 1500; return ok({ ok: true }); }
    if (b === 'payments' && c && d === 'fail') { const o = db().orders.find((x) => x.id === c); if (o) o.payment.status = 'failed'; return ok({ ok: true }); }
    if (b === 'orders' && c && d === 'advance') {
      const o = db().orders.find((x) => x.id === c);
      if (!o) return err(404, 'NOT_FOUND', 'Order not found.');
      const next: Partial<Record<OrderStatus, OrderStatus>> = { paid: 'packed', packed: 'shipped', shipped: 'delivered' };
      const to = next[o.status];
      if (!to) return err(409, 'NO_NEXT', 'This order cannot move on from here.');
      o.status = to; o.canCancel = false; if (to === 'shipped') o.awb = `AWB${100000 + db().orders.length}`;
      o.tracking.push({ status: to === 'packed' ? 'Packed' : to === 'shipped' ? 'Shipped' : 'Delivered', at: new Date().toISOString(), note: to === 'shipped' ? `Tracking ${o.awb}` : '' });
      return ok(clean(o));
    }
    if (b === 'gst' && c) { db().gstOn = c === 'on'; return ok(gstStatus()); }
    if (b === 'reset') { resetMockDb(); return ok({ ok: true }); }
  }
  return err(404, 'NOT_FOUND', 'Not found.');
}
