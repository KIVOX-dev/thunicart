import { createHash, randomInt } from 'node:crypto';
import argon2 from 'argon2';
import mongoose from 'mongoose';
import { config } from '../../config/env';
import { Address, Banner, BlogPost, Brand, Cart, Category, CmsPage, Coupon, CouponUse, Customer, CustomerOtp, Item, Order, StockBalance, StockLedger, Store, StoreSession, StoreSettings, Variant, Wishlist, WalletLedger } from '../../models';
import { AppError, businessRule, conflict, forbidden, notFound, unauthorized } from '../../lib/errors';
import { rateLimitHit } from '../../middleware/rateLimit';
import { email as mailer, brandedMail } from '../../adapters/email';
import { loginCodeMail, welcomeMail } from '../../lib/emailTemplates';
import { verifyGoogleIdToken } from '../../adapters/auth/google';
import { STORE_REFRESH_SECONDS, hashStoreSecret, newStoreSecret, signCustomerToken, STORE_ACCESS_SECONDS } from '../../middleware/customerAuth';
import { nextNumber } from '../../lib/numberSeries';
import { effectivePrice, stockStatusOf } from '../../lib/stockStatus';
import { calcInvoice, taxableOf } from '../../lib/invoiceCalc';
import { isGstEnabled } from '../../lib/gst';
import { supplyFor } from '../../lib/purchaseTax';
import { resolveGstRate } from '../../lib/gstRate';
import { divRoundHalfUp } from '../../lib/money';
import { slugify } from '../../lib/crud';

const pepper = () => config().JWT_REFRESH_SECRET;
const hashCode = (email: string, code: string) => createHash('sha256').update(`${pepper()}:otp:${email}:${code}`).digest('hex');
const iso = (d: unknown) => (d ? new Date(d as any).toISOString() : null);
const oid = (s: string) => new mongoose.Types.ObjectId(s);

// ---------------- store settings and stock ----------------
export async function storeSettings() {
  const s: any = await StoreSettings.findOneAndUpdate({ singleKey: 'main' }, { $setOnInsert: { singleKey: 'main' } }, { upsert: true, new: true }).lean();
  return s;
}
export async function sellableStores(): Promise<any[]> {
  const ss: any[] = await Store.find({ active: true, code: { $ne: 'DAMAGED' } }).lean();
  return ss.sort((a, b) => (a.type === 'online' ? -1 : 0) - (b.type === 'online' ? -1 : 0));
}
/** What the website sells: available stock summed over every sellable store, the same balances the POS reads. */
export async function availability(variantIds: string[]) {
  const stores = (await sellableStores()).map((s) => s._id);
  const rows = await StockBalance.aggregate([{ $match: { variantId: { $in: variantIds.map(oid) }, storeId: { $in: stores } } }, { $group: { _id: '$variantId', q: { $sum: { $subtract: ['$onHand', '$reserved'] } } } }]);
  return new Map<string, number>(rows.map((r) => [String(r._id), Math.max(0, r.q)]));
}

// ---------------- customer account ----------------
async function sendMail(to: string, subject: string, heading: string, html: string) { try { await mailer().send(brandedMail(to, subject, heading, html)); } catch { /* a failed email never fails the request */ } }
export const notify = sendMail;

export async function sendOtp(emailAddr: string, ip: string) {
  await rateLimitHit('otp-ip', ip, 20, 3600); await rateLimitHit('otp-email', emailAddr, 5, 3600);
  const cur: any = await CustomerOtp.findOne({ email: emailAddr }).lean();
  if (cur?.lastSentAt && Date.now() - new Date(cur.lastSentAt).getTime() < 30_000 && new Date(cur.expiresAt) > new Date()) throw new AppError(429, 'RESEND_TOO_SOON', 'Please wait 30 seconds before asking for another code');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const minutes = config().OTP_EXPIRY_MINUTES;
  await CustomerOtp.findOneAndUpdate({ email: emailAddr }, { $set: { codeHash: hashCode(emailAddr, code), attempts: 0, lastSentAt: new Date(), expiresAt: new Date(Date.now() + minutes * 60000) } }, { upsert: true });
  try { await mailer().send(loginCodeMail(emailAddr, code, minutes)); } catch (e) {
    console.error('[email] login code not sent:', e instanceof Error ? e.message : e);
    // Never say "we sent a code" when we did not. The customer can try again at once, so the resend wait is cleared.
    await CustomerOtp.updateOne({ email: emailAddr }, { $unset: { lastSentAt: 1 } });
    throw new AppError(502, 'EMAIL_FAILED', 'We could not send the code right now. Please try again in a moment.');
  }
  return { sent: true as const, expiresInMinutes: minutes, resendAfterSeconds: 30 };
}

async function findOrCreateCustomer(emailAddr: string, name?: string) {
  let c: any = await Customer.findOne({ email: emailAddr });
  if (c) { if (!c.active) throw forbidden('This account is not active'); return c; }
  c = await Customer.create({ customerId: await nextNumber('CUST'), accountGroup: 'E-commerce B2C', name: name || emailAddr.split('@')[0], email: emailAddr, mobile: `pending-${randomInt(0, 2 ** 31).toString(16)}${Date.now().toString(16)}`, stateCode: '33' });
  // The first sign in is the sign up: say welcome. A failed email never stops the sign in.
  try { await mailer().send(welcomeMail(emailAddr, c.name)); } catch (e) { console.error('[email] welcome not sent:', e instanceof Error ? e.message : e); }
  return c;
}
async function startSession(emailAddr: string) {
  const secret = newStoreSecret();
  const s: any = await StoreSession.create({ email: emailAddr, secretHash: hashStoreSecret(secret), expiresAt: new Date(Date.now() + STORE_REFRESH_SECONDS * 1000) });
  return { sessionId: String(s._id), cookie: `${s._id}.${secret}`, accessToken: await signCustomerToken(emailAddr, String(s._id)) };
}
const customerDto = (c: any) => ({ id: String(c._id), customerId: c.customerId, email: c.email, name: c.name, mobile: c.mobile?.startsWith('pending-') ? null : c.mobile, gender: c.gender || null, dob: c.dob ? new Date(c.dob).toISOString().slice(0, 10) : null, profileComplete: !c.mobile?.startsWith('pending-') && !!c.gender && !!c.dob });

export async function verifyOtp(emailAddr: string, code: string, cartCookie?: string) {
  const o: any = await CustomerOtp.findOne({ email: emailAddr });
  if (!o || o.expiresAt < new Date()) throw new AppError(401, 'OTP_EXPIRED', 'This code has expired. Ask for a new one.');
  if (o.attempts >= config().OTP_MAX_ATTEMPTS) throw new AppError(429, 'OTP_LOCKED', 'Too many wrong codes. Ask for a new one.');
  if (o.codeHash !== hashCode(emailAddr, code)) {
    o.attempts += 1; await o.save();
    throw new AppError(401, 'OTP_INVALID', `That code is not right. ${config().OTP_MAX_ATTEMPTS - o.attempts} attempt(s) left.`);
  }
  await CustomerOtp.deleteOne({ _id: o._id });
  return finishLogin(emailAddr, undefined, cartCookie);
}
let dummyHash: Promise<string> | undefined;
const getDummy = () => (dummyHash ??= argon2.hash('not-a-real-password-for-timing'));
/** Sign in with email and password. Unknown email, no password yet and a wrong password all give the same answer, after the same work. */
export async function passwordLogin(emailAddr: string, password: string, ip: string, cartCookie?: string) {
  await rateLimitHit('login-ip', ip, 30, 600); await rateLimitHit('login-email', emailAddr, 10, 600);
  const c: any = await Customer.findOne({ email: emailAddr, accountGroup: 'E-commerce B2C' }).select('+passwordHash').lean();
  const ok = c?.passwordHash ? await argon2.verify(c.passwordHash, password).catch(() => false) : (await argon2.verify(await getDummy(), password).catch(() => false), false);
  if (!c || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is not right. If you signed up with a code before, use "Forgot password" to set one.');
  if (!c.active) throw forbidden('This account is not active');
  return finishLogin(emailAddr, undefined, cartCookie);
}
/** Set or change the shop password of the signed in customer. Reached only after an emailed code (sign up, forgot password) or while signed in. */
export async function setPassword(customerId: string, password: string, audit?: (e: any) => void) {
  const r = await Customer.updateOne({ _id: customerId }, { $set: { passwordHash: await argon2.hash(password) } });
  if (!r.matchedCount) throw notFound('Customer');
  audit?.({ entity: 'customer', entityId: customerId, action: 'password_set' });
  return { ok: true as const };
}
export async function googleLogin(idToken: string, cartCookie?: string) {
  const g = await verifyGoogleIdToken(idToken);
  if (!g) throw unauthorized('Google sign in could not be verified');
  return finishLogin(g.email, g.name, cartCookie);
}
async function finishLogin(emailAddr: string, name: string | undefined, cartCookie?: string) {
  const c = await findOrCreateCustomer(emailAddr, name);
  const s = await startSession(emailAddr);
  if (cartCookie) await mergeGuestCart(cartCookie, String(c._id));
  return { ...s, expiresInSeconds: STORE_ACCESS_SECONDS, customer: customerDto(c) };
}
export async function refreshSession(cookie: string | undefined) {
  const [sid, secret] = (cookie ?? '').split('.');
  if (!sid || !secret || !/^[a-f\d]{24}$/i.test(sid)) throw unauthorized('No session');
  const s: any = await StoreSession.findById(sid);
  if (!s || s.revokedAt || s.expiresAt < new Date() || s.secretHash !== hashStoreSecret(secret)) { if (s) { s.revokedAt = new Date(); await s.save(); } throw unauthorized('Your session has ended. Please log in again.'); }
  const next = newStoreSecret(); s.secretHash = hashStoreSecret(next); s.expiresAt = new Date(Date.now() + STORE_REFRESH_SECONDS * 1000); await s.save();
  return { accessToken: await signCustomerToken(s.email, sid), expiresInSeconds: STORE_ACCESS_SECONDS, cookie: `${sid}.${next}` };
}
export async function logoutSession(cookie: string | undefined) { const sid = (cookie ?? '').split('.')[0]; if (sid && /^[a-f\d]{24}$/i.test(sid)) await StoreSession.updateOne({ _id: sid }, { $set: { revokedAt: new Date() } }); }

export async function getProfile(customerId: string) {
  const c: any = await Customer.findById(customerId).select('+passwordHash').lean();
  const bal = await walletBalance(customerId);
  return { ...customerDto(c), hasPassword: !!c.passwordHash, walletBalance: bal, currency: 'INR' as const };
}
export async function walletBalance(customerId: string) { const r = await WalletLedger.aggregate([{ $match: { customerId: oid(customerId) } }, { $group: { _id: null, p: { $sum: '$amount' } } }]); return (r[0]?.p ?? 0) as number; }

/**
 * A mobile number is collected at checkout. If it matches an existing shop customer, the online account is linked to that
 * record (after the email is verified): the shop record takes the email and the placeholder online record is merged away.
 */
export async function setMobile(customerId: string, mobile: string): Promise<string> {
  const me: any = await Customer.findById(customerId);
  if (me.mobile === mobile) return customerId;
  const other: any = await Customer.findOne({ mobile, _id: { $ne: me._id } });
  if (!other) { me.mobile = mobile; await me.save(); return customerId; }
  if (other.email && other.email !== me.email) throw conflict('This mobile number belongs to another account', 'MOBILE_IN_USE');
  const myEmail = me.email;
  await Promise.all([Address, Cart, Wishlist, Order, WalletLedger].map((M: any) => M.updateMany({ customerId: me._id }, { $set: { customerId: other._id } })));
  await Customer.deleteOne({ _id: me._id });
  other.email = myEmail; await other.save();
  return String(other._id);
}
export async function updateProfile(customerId: string, input: { name?: string; mobile?: string; gender?: 'Male' | 'Female' | 'Prefer not to say'; dob?: string; address?: any }) {
  const set: Record<string, unknown> = {};
  if (input.name) set.name = input.name;
  if (input.gender) set.gender = input.gender;
  if (input.dob) set.dob = new Date(`${input.dob}T00:00:00.000Z`);
  if (Object.keys(set).length) await Customer.updateOne({ _id: customerId }, { $set: set });
  let id = customerId; if (input.mobile) id = await setMobile(customerId, input.mobile);
  if (input.address) {
    const me: any = await Customer.findById(id).lean();
    await saveAddress(id, { ...input.address, name: me.name, phone: me.mobile, isDefault: true });
  }
  return getProfile(id);
}

// ---------------- delivery areas, charges and COD ----------------
export async function pincodeInfo(pin: string, subtotal = 0) {
  const s = await storeSettings(); const ship = s.shipping, cod = s.cod;
  const blocked = (ship.blockedPincodes ?? []).includes(pin);
  const restricted = (ship.allowedPincodes?.length ?? 0) > 0 || (ship.allowedStates?.length ?? 0) > 0;
  const serviceable = !blocked && (!restricted || (ship.allowedPincodes ?? []).includes(pin));
  const charge = ship.freeAbove != null && subtotal >= ship.freeAbove ? 0 : ship.flatCharge;
  const codAvailable = serviceable && cod.enabled && (!(cod.pincodes?.length) || cod.pincodes.includes(pin));
  return { pincode: pin, serviceable, shippingCharge: serviceable ? charge : 0, freeShippingAbove: ship.freeAbove ?? null, estimatedDays: ship.etaDays, codAvailable, codFee: codAvailable ? cod.fee : 0, codMaxOrderValue: cod.maxOrderValue, currency: 'INR' as const };
}

export async function listAddresses(customerId: string) {
  const rows: any[] = await Address.find({ customerId }).sort({ isDefault: -1, createdAt: -1 }).lean();
  return { items: await Promise.all(rows.map(async (a) => ({ id: String(a._id), name: a.name, phone: a.phone, line1: a.line1, line2: a.line2 ?? '', city: a.city, state: a.state, stateCode: a.stateCode, pincode: a.pincode, isDefault: !!a.isDefault, serviceable: (await pincodeInfo(a.pincode)).serviceable }))) };
}
export async function saveAddress(customerId: string, input: any, id?: string) {
  if (!(await pincodeInfo(input.pincode)).serviceable) throw businessRule('We do not deliver to this pincode yet', 'NOT_SERVICEABLE', [{ path: 'pincode', message: 'Not serviceable' }]);
  if (input.isDefault) await Address.updateMany({ customerId }, { $set: { isDefault: false } });
  const a: any = id ? await Address.findOneAndUpdate({ _id: id, customerId }, { $set: input }, { new: true }) : await Address.create({ ...input, customerId, isDefault: input.isDefault || !(await Address.exists({ customerId })) });
  if (!a) throw notFound('Address');
  return (await listAddresses(customerId)).items.find((x) => x.id === String(a._id))!;
}
export async function deleteAddress(customerId: string, id: string) { const r = await Address.deleteOne({ _id: id, customerId }); if (!r.deletedCount) throw notFound('Address'); }

export async function walletHistory(customerId: string) {
  const rows: any[] = await WalletLedger.find({ customerId }).sort({ at: -1 }).limit(100).lean();
  return { balance: await walletBalance(customerId), currency: 'INR' as const, items: rows.map((r) => ({ id: String(r._id), at: iso(r.at), type: r.type, amount: r.amount, docNumber: r.docNumber ?? null })) };
}

export async function getWishlist(customerId: string) {
  const w: any = await Wishlist.findOne({ customerId }).lean();
  return { wishlist: await cards((w?.variantIds ?? []).map(String)), compare: await cards((w?.compareIds ?? []).map(String)) };
}
export async function wishlistOp(customerId: string, list: 'variantIds' | 'compareIds', variantId: string, add: boolean) {
  if (add && !(await Variant.exists({ _id: variantId }))) throw notFound('Item');
  await Wishlist.updateOne({ customerId }, add ? { $addToSet: { [list]: variantId } } : { $pull: { [list]: variantId } }, { upsert: true });
  return getWishlist(customerId);
}

// ---------------- catalog ----------------
async function cards(variantIds: string[]) {
  if (!variantIds.length) return [];
  const vs: any[] = await Variant.find({ _id: { $in: variantIds } }).lean(); const av = await availability(vs.map((v) => String(v._id)));
  const items: any[] = await Item.find({ _id: { $in: vs.map((v) => v.itemId) } }).lean(); const im = new Map(items.map((i) => [String(i._id), i]));
  return vs.map((v) => ({ variantId: String(v._id), slug: im.get(String(v.itemId))?.slug ?? null, name: im.get(String(v.itemId))?.name ?? v.itemCode, size: v.size ?? null, color: v.color ?? null, price: effectivePrice(v), mrp: v.mrp, image: im.get(String(v.itemId))?.images?.[0] ?? null, inStock: (av.get(String(v._id)) ?? 0) > 0 }));
}

const discountPct = (mrp: number, price: number) => (mrp > 0 && price < mrp ? Math.round(((mrp - price) / mrp) * 100) : 0);

async function productView(item: any, variants: any[], av: Map<string, number>, names: { cat: Map<string, string>; brand: Map<string, string> }, sold?: number) {
  const vs = variants.map((v) => { const price = effectivePrice(v); const a = av.get(String(v._id)) ?? 0; return { id: String(v._id), itemCode: v.itemCode, size: v.size ?? null, color: v.color ?? null, mrp: v.mrp, price, discountPercent: discountPct(v.mrp, price), available: a, stockStatus: stockStatusOf(a, v.reorderLevel ?? 0) }; });
  const prices = vs.map((v) => v.price); const mrps = vs.map((v) => v.mrp);
  const lowest = vs.reduce((m, v) => (v.price < m.price ? v : m), vs[0]!);
  return {
    id: String(item._id), slug: item.slug, name: item.name, description: item.description ?? '', images: item.images ?? [], video: item.video ?? null, sizeChart: item.sizeChart ?? null, section: item.section ?? null,
    category: names.cat.get(String(item.categoryId)) ?? null, brand: names.brand.get(String(item.brandId)) ?? null, fabric: item.fabric ?? null, occasion: item.occasion ?? null,
    priceFrom: Math.min(...prices), priceTo: Math.max(...prices), mrpFrom: Math.min(...mrps), discountPercent: lowest.discountPercent, currency: 'INR' as const,
    colors: [...new Set(vs.map((v) => v.color).filter(Boolean))], sizes: [...new Set(vs.map((v) => v.size).filter(Boolean))], variants: vs,
    stockStatus: vs.some((v) => v.available > 0) ? (vs.every((v) => v.stockStatus === 'Low Stock' || v.available <= 0) ? 'Low Stock' : 'In Stock') : 'Out of Stock', popularity: sold ?? 0,
  };
}
async function nameMaps() { const [c, b]: any[] = await Promise.all([Category.find().lean(), Brand.find().lean()]); return { cat: new Map<string, string>(c.map((x: any) => [String(x._id), x.name])), brand: new Map<string, string>(b.map((x: any) => [String(x._id), x.name])) }; }

export async function listProducts(q: any) {
  const f: any = { showOnWebsite: true, active: true };
  if (q.section) f.section = q.section; if (q.fabric) f.fabric = new RegExp(`^${escape(q.fabric)}$`, 'i'); if (q.occasion) f.occasion = new RegExp(`^${escape(q.occasion)}$`, 'i');
  if (q.category) { const c: any = await Category.findOne({ $or: [{ slug: q.category }, ...(mongoose.isValidObjectId(q.category) ? [{ _id: q.category }] : [])] }).lean(); f.categoryId = c?._id ?? null; }
  if (q.brand) { const b: any = await Brand.findOne({ $or: [{ slug: q.brand }, ...(mongoose.isValidObjectId(q.brand) ? [{ _id: q.brand }] : [])] }).lean(); f.brandId = b?._id ?? null; }
  if (q.q) { const r = new RegExp(escape(q.q), 'i'); f.$or = [{ name: r }, { printName: r }, { model: r }, { fabric: r }, { occasion: r }]; }
  const items: any[] = await Item.find(f).lean();
  const vs: any[] = await Variant.find({ itemId: { $in: items.map((i) => i._id) }, active: true }).lean();
  const av = await availability(vs.map((v) => String(v._id))); const names = await nameMaps();
  const sold = new Map<string, number>(q.sort !== 'popularity' ? [] : (await StockLedger.aggregate([{ $match: { type: 'SALE', at: { $gte: new Date(Date.now() - 90 * 86400000) } } }, { $group: { _id: '$variantId', q: { $sum: { $multiply: ['$qty', -1] } } } }])).map((r) => [String(r._id), r.q]));
  const by = new Map<string, any[]>(); for (const v of vs) { const k = String(v.itemId); by.set(k, [...(by.get(k) ?? []), v]); }
  const rows = [] as any[];
  for (const item of items) {
    let list = by.get(String(item._id)) ?? []; if (!list.length) continue;
    const all = list;
    if (q.size) list = list.filter((v) => v.size === q.size); if (q.color) list = list.filter((v) => (v.color ?? '').toLowerCase() === q.color.toLowerCase());
    if (!list.length) continue;
    const prod = await productView(item, all, av, names, all.reduce((a, v) => a + (sold.get(String(v._id)) ?? 0), 0));
    const matching = prod.variants.filter((v) => list.some((x) => String(x._id) === v.id));
    if (q.minPrice != null && !matching.some((v) => v.price >= q.minPrice)) continue; if (q.maxPrice != null && !matching.some((v) => v.price <= q.maxPrice)) continue;
    if (q.minDiscount != null && prod.discountPercent < q.minDiscount) continue; if (q.availability === 'in_stock' && !matching.some((v) => v.available > 0)) continue;
    rows.push({ ...prod, createdAt: item.createdAt });
  }
  const cmp: Record<string, (a: any, b: any) => number> = { new: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt), price_asc: (a, b) => a.priceFrom - b.priceFrom, price_desc: (a, b) => b.priceFrom - a.priceFrom, discount: (a, b) => b.discountPercent - a.discountPercent, popularity: (a, b) => b.popularity - a.popularity };
  rows.sort(cmp[q.sort]!);
  const skip = (q.page - 1) * q.pageSize;
  return { items: rows.slice(skip, skip + q.pageSize).map(({ createdAt: _c, popularity: _p, ...r }) => r), total: rows.length, nextPage: skip + q.pageSize < rows.length ? q.page + 1 : null, filters: { sizes: [...new Set(rows.flatMap((r) => r.sizes))].sort(), colors: [...new Set(rows.flatMap((r) => r.colors))].sort(), fabrics: [...new Set(rows.map((r) => r.fabric).filter(Boolean))], brands: [...new Set(rows.map((r) => r.brand).filter(Boolean))] } };
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function getProduct(slug: string) {
  const item: any = await Item.findOne({ slug, showOnWebsite: true, active: true }).lean(); if (!item) throw notFound('Product');
  const vs: any[] = await Variant.find({ itemId: item._id, active: true }).lean(); if (!vs.length) throw notFound('Product');
  const names = await nameMaps(); const p: any = await productView(item, vs, await availability(vs.map((v) => String(v._id))), names);
  const gst = await isGstEnabled(); const rates = new Map<string, number | null>();
  if (gst && item.hsn) for (const v of vs) rates.set(String(v._id), (await resolveGstRate({ hsn: item.hsn, unitPricePaise: effectivePrice(v), override: item.gstRateOverride }))?.rate ?? null);
  const related: any[] = await Item.find({ _id: { $ne: item._id }, showOnWebsite: true, active: true, categoryId: item.categoryId }).limit(8).lean();
  return {
    ...p, gstMode: gst ? 'on' : 'off', variants: p.variants.map((v: any) => ({ ...v, gstRate: gst ? (rates.get(v.id) ?? null) : null })),
    related: (await cards((await Variant.find({ itemId: { $in: related.map((r) => r._id) }, active: true }).lean() as any[]).filter((v, i, a) => a.findIndex((x) => String(x.itemId) === String(v.itemId)) === i).map((v) => String(v._id)))),
    structuredData: { '@context': 'https://schema.org', '@type': 'Product', name: item.name, description: item.description ?? '', image: item.images ?? [], brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined,
      offers: { '@type': 'AggregateOffer', priceCurrency: 'INR', lowPrice: (p.priceFrom / 100).toFixed(2), highPrice: (p.priceTo / 100).toFixed(2), offerCount: p.variants.length, availability: p.stockStatus === 'Out of Stock' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' } },
  };
}

export async function storeHome() {
  const now = new Date();
  const banners: any[] = await Banner.find({ active: true, $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] }] }).sort({ order: 1 }).lean();
  const all = await listProducts({ page: 1, pageSize: 60, availability: 'all', sort: 'new' });
  const trending = await listProducts({ page: 1, pageSize: 8, availability: 'in_stock', sort: 'popularity' });
  return { banners: banners.map((b) => ({ id: String(b._id), title: b.title, imageKey: b.imageKey, link: b.link, order: b.order })), sections: { newArrivals: all.items.slice(0, 8), trending: trending.items }, categories: (await listCategories()).items.slice(0, 12) };
}
export async function listCategories() {
  const cats: any[] = await Category.find({ active: true }).sort({ name: 1 }).lean();
  const items: any[] = await Item.find({ showOnWebsite: true, active: true }, { categoryId: 1 }).lean(); const n = new Map<string, number>(); for (const i of items) n.set(String(i.categoryId), (n.get(String(i.categoryId)) ?? 0) + 1);
  return { items: cats.filter((c) => n.get(String(c._id))).map((c) => ({ id: String(c._id), name: c.name, slug: c.slug, section: c.section ?? null, productCount: n.get(String(c._id)) ?? 0 })) };
}
export async function searchProducts(q: string) { return listProducts({ q, page: 1, pageSize: 20, availability: 'all', sort: 'popularity' }); }

// ---------------- CMS (public) ----------------
export async function getPage(slug: string) { const p: any = await CmsPage.findOne({ slug, active: true }).lean(); if (!p) throw notFound('Page'); return { slug: p.slug, title: p.title, body: p.body ?? '', seoTitle: p.seoTitle || p.title, seoDescription: p.seoDescription ?? '' }; }
export async function listBlog() { const rows: any[] = await BlogPost.find({ active: true, publishedAt: { $lte: new Date() } }).sort({ publishedAt: -1 }).limit(50).lean(); return { items: rows.map((b) => ({ slug: b.slug, title: b.title, kind: b.kind, coverKey: b.coverKey ?? '', publishedAt: iso(b.publishedAt) })) }; }
export async function getBlog(slug: string) { const b: any = await BlogPost.findOne({ slug, active: true, publishedAt: { $lte: new Date() } }).lean(); if (!b) throw notFound('Post'); return { slug: b.slug, title: b.title, body: b.body, kind: b.kind, coverKey: b.coverKey ?? '', publishedAt: iso(b.publishedAt), seoTitle: b.seoTitle || b.title, seoDescription: b.seoDescription ?? '' }; }
/** Sitemap data: every URL the search engines should know. */
export async function sitemap() {
  const [items, cats, pages, posts]: any[] = await Promise.all([Item.find({ showOnWebsite: true, active: true, slug: { $exists: true } }, { slug: 1, updatedAt: 1 }).lean(), Category.find({ active: true }).lean(), CmsPage.find({ active: true }).lean(), BlogPost.find({ active: true }).lean()]);
  return { urls: [...items.map((i: any) => ({ path: `/products/${i.slug}`, lastModified: iso(i.updatedAt) })), ...cats.map((c: any) => ({ path: `/category/${c.slug}`, lastModified: iso(c.updatedAt) })), ...pages.map((p: any) => ({ path: `/pages/${p.slug}`, lastModified: iso(p.updatedAt) })), ...posts.map((b: any) => ({ path: `/blog/${b.slug}`, lastModified: iso(b.updatedAt) }))] };
}

// ---------------- cart ----------------
async function findCart(customerId: string | undefined, cookieId: string | undefined) {
  if (customerId) return (await Cart.findOne({ customerId })) as any;
  if (cookieId) return (await Cart.findOne({ cookieId })) as any;
  return null;
}
async function mergeGuestCart(cookieId: string, customerId: string) {
  const g: any = await Cart.findOne({ cookieId }); if (!g) return;
  const mine: any = await Cart.findOne({ customerId });
  if (!mine) { g.customerId = customerId; g.cookieId = undefined; await g.save(); await Cart.updateOne({ _id: g._id }, { $unset: { cookieId: 1 } }); return; }
  for (const it of g.items) { const ex = mine.items.find((x: any) => String(x.variantId) === String(it.variantId)); if (ex) ex.qty = Math.min(20, ex.qty + it.qty); else mine.items.push(it); }
  mine.couponCode ??= g.couponCode; mine.touchedAt = new Date(); await mine.save(); await Cart.deleteOne({ _id: g._id });
}

export interface PricedCart { lines: any[]; subtotal: number; couponDiscount: number; coupon: { code: string; discount: number; message: string } | null; goodsTotal: number; gstMode: 'on' | 'off'; taxSplit: any; unavailable: { variantId: string; itemCode: string; wanted: number; available: number }[] }

export async function priceCart(items: { variantId: string; qty: number }[], couponCode: string | null, customerId: string | undefined, supply: 'intra' | 'inter' = 'intra'): Promise<PricedCart> {
  const vs: any[] = await Variant.find({ _id: { $in: items.map((i) => i.variantId) }, active: true }).lean(); const vm = new Map(vs.map((v) => [String(v._id), v]));
  const its: any[] = await Item.find({ _id: { $in: vs.map((v) => v.itemId) } }).lean(); const im = new Map(its.map((i) => [String(i._id), i]));
  const av = await availability(vs.map((v) => String(v._id))); const gstOn = await isGstEnabled();
  const lines: any[] = []; const unavailable: PricedCart['unavailable'] = [];
  for (const it of items) {
    const v = vm.get(it.variantId); if (!v) continue; const item = im.get(String(v.itemId)); const a = av.get(it.variantId) ?? 0; const price = effectivePrice(v);
    let rate: number | null = null; if (gstOn && item?.hsn) rate = (await resolveGstRate({ hsn: item.hsn, unitPricePaise: price, override: item.gstRateOverride }))?.rate ?? null;
    if (it.qty > a) unavailable.push({ variantId: it.variantId, itemCode: v.itemCode, wanted: it.qty, available: a });
    lines.push({ variantId: it.variantId, itemCode: v.itemCode, name: item?.name ?? v.itemCode, size: v.size ?? null, color: v.color ?? null, image: item?.images?.[0] ?? null, qty: it.qty, mrp: v.mrp, unitPrice: price, lineTotal: price * it.qty, available: a, inStock: a >= it.qty, hsn: item?.hsn ?? '', rate, categoryId: item?.categoryId ? String(item.categoryId) : null, brandId: item?.brandId ? String(item.brandId) : null });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  let coupon: PricedCart['coupon'] = null; let couponDiscount = 0;
  if (couponCode) { const r = await evaluateCoupon(couponCode, lines, subtotal, customerId); couponDiscount = r.discount; coupon = { code: r.code, discount: r.discount, message: r.message }; }
  const calc = calcInvoice(lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, lineDiscount: 0, rate: l.rate, hsn: l.hsn })), couponDiscount, { gstOn, supply });
  return { lines, subtotal, couponDiscount, coupon, goodsTotal: calc.totals.grandTotal, gstMode: gstOn ? 'on' : 'off', taxSplit: gstOn ? { groups: calc.groups, taxable: calc.totals.taxable, cgst: calc.totals.cgst, sgst: calc.totals.sgst, igst: calc.totals.igst, tax: calc.totals.tax, roundOff: calc.totals.roundOff } : null, unavailable };
}

export async function getCart(customerId: string | undefined, cookieId: string | undefined, pin?: string) {
  const cart = await findCart(customerId, cookieId);
  let priced: PricedCart | null = null;
  try { priced = await priceCart(cart?.items.map((i: any) => ({ variantId: String(i.variantId), qty: i.qty })) ?? [], cart?.couponCode ?? null, customerId); }
  catch (e: any) { if (e?.code?.startsWith?.('COUPON')) { if (cart) { cart.couponCode = null; await cart.save(); } priced = await priceCart(cart?.items.map((i: any) => ({ variantId: String(i.variantId), qty: i.qty })) ?? [], null, customerId); (priced as any).couponWarning = e.message; } else throw e; }
  const ship = pin ? await pincodeInfo(pin, priced.goodsTotal) : null;
  return { ...priced, itemCount: priced.lines.reduce((a, l) => a + l.qty, 0), shipping: ship, total: priced.goodsTotal + (ship?.shippingCharge ?? 0), currency: 'INR' as const };
}
async function ensureCart(customerId: string | undefined, cookieId: string | undefined): Promise<{ cart: any; newCookie?: string }> {
  const c = await findCart(customerId, cookieId); if (c) return { cart: c };
  if (customerId) return { cart: await Cart.create({ customerId, items: [] }) };
  const id = cookieId && /^[\w-]{16,64}$/.test(cookieId) ? cookieId : `c_${newStoreSecret().slice(0, 30)}`;
  return { cart: await Cart.create({ cookieId: id, items: [] }), newCookie: id };
}
export async function cartAdd(customerId: string | undefined, cookieId: string | undefined, variantId: string, qty: number) {
  const v: any = await Variant.findOne({ _id: variantId, active: true }).lean(); if (!v) throw notFound('Item');
  const { cart, newCookie } = await ensureCart(customerId, cookieId);
  const ex = cart.items.find((i: any) => String(i.variantId) === variantId); const want = Math.min(20, (ex?.qty ?? 0) + qty);
  const a = (await availability([variantId])).get(variantId) ?? 0;
  if (want > a) throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${a} of ${v.itemCode} available`, [{ path: `variantId:${variantId}`, message: `${a} available` }]);
  if (ex) ex.qty = want; else cart.items.push({ variantId, qty: want });
  cart.touchedAt = new Date(); await cart.save();
  return { cookie: newCookie, cart: await getCart(customerId, cart.cookieId ?? undefined) };
}
export async function cartSet(customerId: string | undefined, cookieId: string | undefined, variantId: string, qty: number) {
  const cart = await findCart(customerId, cookieId); if (!cart) throw notFound('Cart');
  const i = cart.items.findIndex((x: any) => String(x.variantId) === variantId); if (i < 0) throw notFound('Item in cart');
  if (qty === 0) cart.items.splice(i, 1); else {
    const a = (await availability([variantId])).get(variantId) ?? 0; if (qty > a) throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${a} available`, [{ path: `variantId:${variantId}`, message: `${a} available` }]);
    cart.items[i].qty = qty;
  }
  cart.touchedAt = new Date(); await cart.save(); return getCart(customerId, cookieId);
}
export async function cartCoupon(customerId: string | undefined, cookieId: string | undefined, code: string | null) {
  const { cart } = await ensureCart(customerId, cookieId);
  if (code) { const p = await priceCart(cart.items.map((i: any) => ({ variantId: String(i.variantId), qty: i.qty })), code, customerId); cart.couponCode = p.coupon!.code; } else cart.couponCode = null;
  await cart.save(); return getCart(customerId, cart.cookieId ?? undefined);
}
export async function clearCart(customerId: string) { await Cart.updateOne({ customerId }, { $set: { items: [], couponCode: null } }); }

// ---------------- coupons ----------------
export async function evaluateCoupon(code: string, lines: any[], subtotal: number, customerId?: string) {
  const c: any = await Coupon.findOne({ code: code.trim().toUpperCase() }).lean();
  const bad = (m: string, k = 'COUPON_INVALID') => new AppError(422, k, m);
  if (!c || !c.active) throw bad('This coupon code is not valid');
  const now = new Date(); if ((c.startsAt && c.startsAt > now) || (c.endsAt && c.endsAt < now)) throw bad('This coupon has expired or has not started yet', 'COUPON_EXPIRED');
  if (c.usageLimitTotal && c.usedCount >= c.usageLimitTotal) throw bad('This coupon has been fully used', 'COUPON_LIMIT_REACHED');
  if (c.usageLimitPerCustomer) { if (!customerId) throw bad('Log in to use this coupon', 'COUPON_LOGIN_REQUIRED'); if ((await CouponUse.countDocuments({ couponId: c._id, customerId })) >= c.usageLimitPerCustomer) throw bad('You have already used this coupon', 'COUPON_LIMIT_REACHED'); }
  if (subtotal < (c.minCartValue ?? 0)) throw bad(`Add items worth Rs ${((c.minCartValue - subtotal) / 100).toFixed(2)} more to use this coupon`, 'COUPON_MIN_CART');
  if (c.type === 'first_order') { if (!customerId) throw bad('Log in to use this coupon', 'COUPON_LOGIN_REQUIRED'); if (await Order.exists({ customerId, status: { $nin: ['created', 'payment_pending', 'cancelled'] } })) throw bad('This coupon is only for your first order', 'COUPON_FIRST_ORDER_ONLY'); }
  const inc = (ids: any[], v: string | null) => ids.some((x) => String(x) === v);
  const eligible = lines.filter((l) => (!c.includeCategoryIds?.length || inc(c.includeCategoryIds, l.categoryId)) && !inc(c.excludeCategoryIds ?? [], l.categoryId) && (!c.includeBrandIds?.length || inc(c.includeBrandIds, l.brandId)) && !inc(c.excludeBrandIds ?? [], l.brandId));
  const base = eligible.reduce((s, l) => s + l.lineTotal, 0);
  if (!base) throw bad('This coupon does not apply to the items in your cart');
  let d = 0;
  const pct = (p: number) => { let x = divRoundHalfUp(base * Math.round(p * 100), 10000); if (c.maxDiscount) x = Math.min(x, c.maxDiscount); return x; };
  if (c.type === 'flat') d = Math.min(c.value, base);
  else if (c.type === 'percent') d = pct(c.value);
  else if (c.type === 'first_order') d = c.firstOrderKind === 'flat' ? Math.min(c.value, base) : pct(c.value);
  else { const units = eligible.flatMap((l) => Array(l.qty).fill(l.unitPrice) as number[]).sort((a, b) => a - b); const g = c.buyQty + c.getQty; if (g > 0) { const free = Math.floor(units.length / g) * c.getQty; d = units.slice(0, free).reduce((a, b) => a + b, 0); } }
  if (d <= 0) throw bad(c.type === 'buy_x_get_y' ? `Add ${Math.max(0, c.buyQty + c.getQty - eligible.reduce((s, l) => s + l.qty, 0))} more item(s) to get this offer` : 'This coupon gives no discount on your cart', 'COUPON_NOT_APPLICABLE');
  return { code: c.code, couponId: String(c._id), discount: Math.min(d, subtotal), message: `${c.code} applied` };
}
export const _x = { slugify, taxableOf, supplyFor, Order };
