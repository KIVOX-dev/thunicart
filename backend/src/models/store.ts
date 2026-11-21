import { defineModel, oid, paise } from './_define';

const money = { ...paise };

export const CustomerOtp = defineModel('CustomerOtp', 'customer_otps', {
  email: { type: String, required: true }, codeHash: String, attempts: { type: Number, default: 0 }, lastSentAt: Date,
  expiresAt: { type: Date, required: true }, // TTL index: a code disappears after it expires
}, [[{ email: 1 }, { unique: true }], [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]]);

/** Storefront sessions use their own cookie, separate from staff. */
export const StoreSession = defineModel('StoreSession', 'store_sessions', {
  email: { type: String, required: true }, secretHash: String, expiresAt: { type: Date, required: true }, revokedAt: { type: Date, default: null },
}, [[{ email: 1 }], [{ expiresAt: 1 }, { expireAfterSeconds: 86400 }]]);

export const Address = defineModel('Address', 'customer_addresses', {
  customerId: { ...oid('Customer', true) }, name: String, phone: String, line1: String, line2: String, city: String, state: String, stateCode: String, pincode: String, isDefault: { type: Boolean, default: false },
}, [[{ customerId: 1 }]]);

export const Wishlist = defineModel('Wishlist', 'wishlists', {
  customerId: { ...oid('Customer', true) }, variantIds: [{ ...oid('Variant') }], compareIds: [{ ...oid('Variant') }],
}, [[{ customerId: 1 }, { unique: true }]]);

/** Guest carts live in MongoDB (identified by a cookie id), never in memory. */
export const Cart = defineModel('Cart', 'carts', {
  cookieId: { type: String }, customerId: { ...oid('Customer') }, items: [{ variantId: { ...oid('Variant') }, qty: Number, _id: false }], couponCode: { type: String, default: null },
  touchedAt: { type: Date, default: Date.now },
}, [[{ cookieId: 1 }, { unique: true, partialFilterExpression: { cookieId: { $type: 'string' } } }], [{ customerId: 1 }, { unique: true, partialFilterExpression: { customerId: { $type: 'objectId' } } }], [{ touchedAt: 1 }, { expireAfterSeconds: 30 * 86400 }]]);

export const Coupon = defineModel('Coupon', 'coupons', {
  code: { type: String, required: true }, type: { type: String, enum: ['flat', 'percent', 'buy_x_get_y', 'first_order'], required: true },
  value: { type: Number, default: 0 }, // flat paise, or percent
  maxDiscount: { ...money, default: null }, // cap for percent
  buyQty: { type: Number, default: 0 }, getQty: { type: Number, default: 0 },
  firstOrderKind: { type: String, enum: ['flat', 'percent'], default: 'percent' },
  startsAt: { type: Date, default: null }, endsAt: { type: Date, default: null }, minCartValue: { ...money },
  usageLimitTotal: { type: Number, default: 0 }, usageLimitPerCustomer: { type: Number, default: 0 },
  includeCategoryIds: [{ ...oid('Category') }], excludeCategoryIds: [{ ...oid('Category') }], includeBrandIds: [{ ...oid('Brand') }], excludeBrandIds: [{ ...oid('Brand') }],
  stackable: { type: Boolean, default: false }, active: { type: Boolean, default: true }, usedCount: { type: Number, default: 0 },
}, [[{ code: 1 }, { unique: true }]]);
export const CouponUse = defineModel('CouponUse', 'coupon_uses', { couponId: { ...oid('Coupon', true) }, customerId: { ...oid('Customer', true) }, orderId: { ...oid('Order') }, at: { type: Date, default: Date.now } }, [[{ couponId: 1, customerId: 1 }]], { timestamps: false });

export const StoreSettings = defineModel('StoreSettings', 'store_settings', {
  singleKey: { type: String, default: 'main' },
  shipping: { type: Object, default: { flatCharge: 5000, freeAbove: 99900, etaDays: '4-7', allowedStates: [], allowedPincodes: [], blockedPincodes: [] } },
  cod: { type: Object, default: { enabled: true, fee: 4000, maxOrderValue: 500000, pincodes: [] } },
  holdMinutes: { type: Number, default: 15 },
  /** What the admin changed on the website home page: section order, on or off, headings and cards. Empty means the automatic layout. */
  home: { type: Object, default: {} },
  returnPickup: { type: Boolean, default: true },
}, [[{ singleKey: 1 }, { unique: true }]], { minimize: false });

export const Order = defineModel('Order', 'online_orders', {
  orderNumber: { type: String, required: true },
  customerId: { ...oid('Customer', true) },
  status: { type: String, enum: ['created', 'payment_pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'return_approved', 'returned', 'refunded'], default: 'created' },
  storeId: { ...oid('Store', true) },
  lines: [{ variantId: { ...oid('Variant') }, itemCode: String, name: String, size: String, color: String, qty: Number, mrp: money, unitPrice: money, _id: false }],
  address: { type: Object, default: {} },
  mobile: String,
  paymentMethod: { type: String, enum: ['online', 'cod', 'wallet'], default: 'online' },
  coupon: { code: String, discount: money, _id: false },
  subtotal: money, couponDiscount: money, shipping: money, codFee: money, total: money, walletUsed: money, payable: money,
  gstMode: { type: String, default: 'off' },
  taxSplit: { type: Object, default: null },
  razorpayOrderId: String, razorpayPaymentId: String, clientReportedPayment: { type: Object, default: null },
  holdExpiresAt: { type: Date, default: null }, holdReleased: { type: Boolean, default: false },
  invoiceId: { ...oid('SalesBill') }, invoiceNumber: String,
  timeline: [{ status: String, at: Date, by: String, note: String, _id: false }],
  shipment: { type: Object, default: null },
  returnRequest: { type: Object, default: null },
  refund: { type: Object, default: null },
  notes: String,
  walletRefunded: { type: Boolean, default: false },
  deliveredAt: { type: Date, default: null },
}, [[{ orderNumber: 1 }, { unique: true }], [{ customerId: 1, createdAt: -1 }], [{ status: 1, createdAt: -1 }], [{ razorpayOrderId: 1 }, { sparse: true }], [{ holdExpiresAt: 1, status: 1 }]], { minimize: false });

/** Raw gateway and courier events, stored as received and processed once. */
export const WebhookEvent = defineModel('WebhookEvent', 'webhook_events', {
  source: { type: String, required: true }, eventId: { type: String, required: true }, signatureOk: Boolean, raw: String, processedAt: { type: Date, default: null }, result: String,
}, [[{ source: 1, eventId: 1 }, { unique: true }]]);

export const Banner = defineModel('Banner', 'banners', { title: String, imageKey: String, link: String, startsAt: Date, endsAt: Date, order: { type: Number, default: 0 }, active: { type: Boolean, default: true } }, [[{ order: 1 }]]);
export const CmsPage = defineModel('CmsPage', 'cms_pages', { slug: { type: String, required: true }, title: String, body: String, seoTitle: String, seoDescription: String, active: { type: Boolean, default: true } }, [[{ slug: 1 }, { unique: true }]]);
export const BlogPost = defineModel('BlogPost', 'blog_posts', { slug: { type: String, required: true }, title: String, body: String, coverKey: String, kind: { type: String, enum: ['blog', 'lookbook'], default: 'blog' }, publishedAt: Date, seoTitle: String, seoDescription: String, active: { type: Boolean, default: true } }, [[{ slug: 1 }, { unique: true }], [{ publishedAt: -1 }]]);
