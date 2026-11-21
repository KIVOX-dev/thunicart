import { z } from 'zod';
import { objectId } from './common';

const money = z.number().int().min(0);
export const ORDER_STATUSES = ['created', 'payment_pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'return_approved', 'returned', 'refunded'] as const;
export const looseDto = z.looseObject({});

// ---- customer account ----
export const otpSendBody = z.object({ email: z.string().trim().toLowerCase().email() });
export const otpVerifyBody = z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().regex(/^\d{6}$/, 'The code is 6 digits') });
export const googleBody = z.object({ idToken: z.string().min(5) });
export const customerSession = z.object({ accessToken: z.string(), expiresInSeconds: z.number().int(), customer: z.looseObject({ id: objectId, email: z.string(), name: z.string() }) });
const dobRule = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth').refine((d) => { const t = Date.parse(d); return t > Date.parse('1900-01-01') && t < Date.now(); }, 'Enter a valid date of birth');
/** The account form after the first sign in: name, mobile, gender and date of birth are needed; the address is optional. */
export const profileBody = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10 digit mobile number').optional(),
  gender: z.enum(['Male', 'Female']).optional(),
  dob: dobRule.optional(),
  address: z.object({
    line1: z.string().trim().min(3).max(150), line2: z.string().trim().max(150).default(''), city: z.string().trim().min(2).max(60),
    state: z.string().trim().min(2).max(60), stateCode: z.string().regex(/^\d{2}$/), pincode: z.string().regex(/^\d{6}$/),
  }).optional(),
});
export const addressBody = z.object({
  name: z.string().trim().min(2).max(100), phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10 digit mobile number'), line1: z.string().trim().min(3).max(150), line2: z.string().trim().max(150).default(''),
  city: z.string().trim().min(2).max(60), state: z.string().trim().min(2).max(60), stateCode: z.string().regex(/^\d{2}$/), pincode: z.string().regex(/^\d{6}$/), isDefault: z.boolean().default(false),
});
export const addressDto = addressBody.extend({ id: objectId, serviceable: z.boolean() });
export const wishlistBody = z.object({ variantId: objectId });

// ---- catalog ----
export const productsQuery = z.object({
  q: z.string().trim().optional(), section: z.string().optional(), category: z.string().optional(), brand: z.string().optional(), size: z.string().optional(), color: z.string().optional(),
  fabric: z.string().optional(), occasion: z.string().optional(), minPrice: z.coerce.number().int().min(0).optional(), maxPrice: z.coerce.number().int().min(0).optional(),
  minDiscount: z.coerce.number().min(0).max(100).optional(), availability: z.enum(['in_stock', 'all']).default('all'),
  sort: z.enum(['new', 'price_asc', 'price_desc', 'discount', 'popularity']).default('new'),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

// ---- cart and checkout ----
export const cartAddBody = z.object({ variantId: objectId, qty: z.number().int().min(1).max(20).default(1) });
export const cartPatchBody = z.object({ qty: z.number().int().min(0).max(20) });
export const cartCouponBody = z.object({ code: z.string().trim().min(2).max(30) });
export const checkoutStartBody = z.object({
  addressId: objectId.optional(), address: addressBody.optional(), mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10 digit mobile number'),
  paymentMethod: z.enum(['online', 'cod']).default('online'), useWallet: z.boolean().default(false),
});
export const checkoutPayBody = z.object({ orderId: objectId, razorpayPaymentId: z.string().optional(), razorpaySignature: z.string().optional() });
export const orderReturnBody = z.object({
  reason: z.enum(['size', 'defect', 'wrong_item', 'other']), note: z.string().trim().max(300).default(''),
  /** Up to 4 photo keys from /uploads/presign. */ photoKeys: z.array(z.string()).max(4).default([]),
  lines: z.array(z.object({ variantId: objectId, qty: z.number().int().min(1) })).min(1),
});

// ---- admin ----
const couponShape = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/), type: z.enum(['flat', 'percent', 'buy_x_get_y', 'first_order']), value: z.number().min(0).default(0),
  maxDiscount: money.nullable().optional(), buyQty: z.number().int().min(0).default(0), getQty: z.number().int().min(0).default(0), firstOrderKind: z.enum(['flat', 'percent']).default('percent'),
  startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional(), minCartValue: money.default(0),
  usageLimitTotal: z.number().int().min(0).default(0), usageLimitPerCustomer: z.number().int().min(0).default(0),
  includeCategoryIds: z.array(objectId).default([]), excludeCategoryIds: z.array(objectId).default([]), includeBrandIds: z.array(objectId).default([]), excludeBrandIds: z.array(objectId).default([]),
  stackable: z.boolean().default(false), active: z.boolean().default(true),
};
export const couponBody = z.object(couponShape);
export const bannerBody = z.object({ title: z.string().trim().max(100).default(''), imageKey: z.string().min(1).max(300), link: z.string().trim().max(300).default(''), startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional(), order: z.number().int().default(0), active: z.boolean().default(true) });
export const cmsPageBody = z.object({ slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/), title: z.string().trim().min(2).max(120), body: z.string().max(50000).default(''), seoTitle: z.string().max(70).default(''), seoDescription: z.string().max(170).default(''), active: z.boolean().default(true) });
export const blogBody = cmsPageBody.omit({ body: true }).extend({ body: z.string().max(100000).default(''), coverKey: z.string().max(300).default(''), kind: z.enum(['blog', 'lookbook']).default('blog'), publishedAt: z.string().datetime().nullable().optional() });
export const storeSettingsBody = z.object({
  shipping: z.object({ flatCharge: money, freeAbove: money.nullable(), etaDays: z.string().max(20), allowedStates: z.array(z.string()), allowedPincodes: z.array(z.string()), blockedPincodes: z.array(z.string()) }).optional(),
  cod: z.object({ enabled: z.boolean(), fee: money, maxOrderValue: money, pincodes: z.array(z.string()) }).optional(),
  holdMinutes: z.number().int().min(1).max(120).optional(), returnPickup: z.boolean().optional(),
});
export const adminOrderQuery = z.object({ orderStatus: z.enum(ORDER_STATUSES).optional(), customerId: objectId.optional() });
export const adminOrderPatchBody = z.object({ status: z.enum(ORDER_STATUSES), note: z.string().trim().max(300).default('') });
export const returnDecisionBody = z.object({ note: z.string().trim().max(300).default('') });
export const returnRefundBody = z.object({ refundTo: z.enum(['wallet', 'original']).default('wallet'), condition: z.enum(['restock', 'damaged']).default('restock') });
export const cancelOrderBody = z.object({ note: z.string().trim().max(300).default('') });

// ---------- home page layout (edited in the admin Online store, shown on the website home page) ----------
export const HOME_SECTIONS = [
  { key: 'strip', label: 'Offer strip', about: 'The coloured bar under the banners. The title is the big line, the first card is the small line.', cards: true, imageSize: '' },
  { key: 'categories', label: 'Shop by category', about: 'The round-cornered category tiles.', cards: true, imageSize: '600 x 600 px (square)' },
  { key: 'sizes', label: 'Shop by size', about: 'The size buttons. Sizes come from your stock.', cards: false, imageSize: '' },
  { key: 'trending', label: 'Trending now', about: 'Best selling products, picked automatically.', cards: false, imageSize: '' },
  { key: 'occasions', label: 'Shop by occasion', about: 'Picture cards for an occasion or a collection.', cards: true, imageSize: '600 x 600 px (square)' },
  { key: 'newArrivals', label: 'New arrivals', about: 'Newest products, picked automatically.', cards: false, imageSize: '' },
  { key: 'lookbook', label: 'Lookbook', about: 'Picture cards that link to a collection or a story.', cards: true, imageSize: '900 x 1200 px (3:4, portrait)' },
] as const;
export const homeCard = z.object({ title: z.string().trim().max(80), image: z.string().trim().max(500).default(''), link: z.string().trim().max(300).default('') });
export const homeSectionBody = z.object({ enabled: z.boolean().default(true), title: z.string().trim().max(100).default(''), cards: z.array(homeCard).max(24).optional() });
export const homeLayoutBody = z.object({ order: z.array(z.string()).max(20).default([]), sections: z.record(z.string(), homeSectionBody) });
