import mongoose from 'mongoose';
import { Address, Customer, Order, Store, User, Variant, WalletLedger, CouponUse, Coupon, WebhookEvent, SalesBill, StockLedger } from '../../models';
import { AppError, badRequest, businessRule, conflict, forbidden, notFound } from '../../lib/errors';
import { withTransaction } from '../../lib/transaction';
import { nextNumber } from '../../lib/numberSeries';
import { calcInvoice } from '../../lib/invoiceCalc';
import { supplyFor } from '../../lib/purchaseTax';
import { getOperationsSettings, releaseStock, reserveStock } from '../../lib/stock';
import { payments, checkoutSignature, verifyWebhookSignature } from '../../adapters/payments';
import { shipping } from '../../adapters/shipping';
import { paginate, parseSort, iso, escapeRegex } from '../../lib/list';
import type { AuthUser } from '../../middleware/auth';
import type { AuditEntry } from '../../middleware/audit';
import { availability, clearCart, notify, pincodeInfo, priceCart, sellableStores, setMobile, storeSettings, walletBalance } from './store.service';
import { cancelInvoice, createInbound, createReturn } from '../sales/sales.service';
import { StockBalance } from '../../models';
import { homeStateCodeOf } from './helpers';

type Audit = (e: AuditEntry) => void;
const oid = (s: string) => new mongoose.Types.ObjectId(s);
const fmt = (p: number) => `Rs ${(p / 100).toFixed(2)}`;

/** Legal moves only. Anything else is 422. */
const NEXT: Record<string, string[]> = {
  created: ['payment_pending', 'confirmed', 'cancelled'], payment_pending: ['confirmed', 'cancelled'], confirmed: ['packed', 'cancelled'], packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered'], out_for_delivery: ['delivered'], delivered: ['return_requested'], return_requested: ['return_approved', 'delivered'],
  return_approved: ['returned'], returned: ['refunded'], cancelled: [], refunded: [],
};
const pushTimeline = (o: any, status: string, by: string, note = '') => { o.timeline.push({ status, at: new Date(), by, note }); o.status = status; };
const SYSTEM = 'system';

async function systemUser(): Promise<AuthUser> {
  const admin: any = await User.findOne({ active: true, deletedAt: null }).sort({ createdAt: 1 }).lean();
  return { id: String(admin?._id), name: 'Online store', email: 'online@thunikart', sessionId: '', roleId: '', roleName: 'Admin', isAdmin: true, permissions: new Set() };
}

export const orderDto = (o: any, full = true) => ({
  id: String(o._id), orderNumber: o.orderNumber, status: o.status, createdAt: iso(o.createdAt)!, paymentMethod: o.paymentMethod, currency: 'INR' as const,
  lines: o.lines, subtotal: o.subtotal, couponDiscount: o.couponDiscount, coupon: o.coupon?.code ? { code: o.coupon.code, discount: o.coupon.discount } : null, shipping: o.shipping, codFee: o.codFee, total: o.total, walletUsed: o.walletUsed, payable: o.payable,
  gstMode: o.gstMode, taxSplit: o.taxSplit ?? null, holdExpiresAt: iso(o.holdExpiresAt), invoiceNumber: o.invoiceNumber ?? null, customerId: String(o.customerId),
  ...(full ? { address: o.address, mobile: o.mobile, timeline: (o.timeline ?? []).map((t: any) => ({ status: t.status, at: iso(t.at), by: t.by, note: t.note })), shipment: o.shipment ?? null, returnRequest: o.returnRequest ?? null, refund: o.refund ?? null, razorpayOrderId: o.razorpayOrderId ?? null, clientReportedPayment: o.clientReportedPayment ?? null } : {}),
});

// ---------------- holds ----------------
/** Release stock holds whose 15 minutes ran out. Also called by the cron job. */
export async function releaseExpiredHolds() {
  const due: any[] = await Order.find({ status: { $in: ['created', 'payment_pending'] }, holdExpiresAt: { $lt: new Date() }, holdReleased: false }).lean();
  for (const o of due) await abandonOrder(String(o._id), 'Payment was not completed in time', SYSTEM).catch(() => undefined);
  return due.length;
}
async function releaseHold(o: any, session: mongoose.ClientSession) {
  if (o.holdReleased) return;
  for (const l of o.lines) await releaseStock({ variantId: String(l.variantId), storeId: String(o.storeId), qty: l.qty, docType: 'ONLINE_ORDER', docNumber: o.orderNumber }, session);
  o.holdReleased = true;
}
async function refundWallet(o: any, session: mongoose.ClientSession, note: string) {
  if (o.walletUsed > 0 && !o.walletRefunded) { await WalletLedger.create([{ customerId: o.customerId, amount: o.walletUsed, type: 'REFUND', docType: 'ORDER', docNumber: o.orderNumber }], { session }); o.walletRefunded = true; o.markModified('walletRefunded'); void note; }
}
/** Cancel an order that was never confirmed: give back the stock hold and the wallet money. */
async function abandonOrder(id: string, note: string, by: string) {
  await withTransaction(async (session) => {
    const o: any = await Order.findOne({ _id: id, status: { $in: ['created', 'payment_pending'] } }).session(session);
    if (!o) return;
    await releaseHold(o, session); await refundWallet(o, session, note); pushTimeline(o, 'cancelled', by, note);
    o.holdExpiresAt = null; await o.save({ session });
  });
}

// ---------------- checkout ----------------
async function pickStore(lines: { variantId: string; itemCode: string; qty: number }[]) {
  const stores = await sellableStores(); const ids = lines.map((l) => l.variantId);
  const rows = await StockBalance.find({ variantId: { $in: ids.map(oid) }, storeId: { $in: stores.map((s) => s._id) } }).lean() as any[];
  for (const s of stores) {
    if (lines.every((l) => { const r = rows.find((x) => String(x.storeId) === String(s._id) && String(x.variantId) === l.variantId); return r && r.onHand - r.reserved >= l.qty; })) return String(s._id);
  }
  const av = await availability(ids);
  const short = lines.find((l) => (av.get(l.variantId) ?? 0) < l.qty);
  if (short) throw new AppError(409, 'INSUFFICIENT_STOCK', `${short.itemCode} is no longer available in the quantity you asked for`, [{ path: `variantId:${short.variantId}`, message: `${av.get(short.variantId) ?? 0} available` }]);
  throw new AppError(409, 'INSUFFICIENT_STOCK', 'These items are in different stores and cannot be shipped together right now', [{ path: 'lines', message: 'Order the items separately' }]);
}

export async function checkoutStart(customerId: string, input: any, audit: Audit) {
  await releaseExpiredHolds();
  const settings = await storeSettings();
  const cart: any = await (await import('../../models')).Cart.findOne({ customerId }).lean();
  if (!cart?.items?.length) throw businessRule('Your cart is empty', 'CART_EMPTY');
  customerId = await setMobile(customerId, input.mobile);
  let address: any;
  if (input.addressId) { address = await Address.findOne({ _id: input.addressId, customerId }).lean(); if (!address) throw badRequest('Address not found', [{ path: 'addressId', message: 'Choose one of your addresses' }]); }
  else if (input.address) address = (await Address.create({ ...input.address, customerId })).toObject();
  else throw badRequest('A delivery address is required', [{ path: 'addressId', message: 'Choose or enter an address' }]);
  const pin = await pincodeInfo(address.pincode);
  if (!pin.serviceable) throw businessRule('We do not deliver to this pincode yet', 'NOT_SERVICEABLE', [{ path: 'pincode', message: 'Not serviceable' }]);

  const home = await homeStateCodeOf();
  const supply = supplyFor(address.stateCode, home);
  const priced = await priceCart(cart.items.map((i: any) => ({ variantId: String(i.variantId), qty: i.qty })), cart.couponCode ?? null, customerId, supply);
  if (priced.unavailable.length) { const u = priced.unavailable[0]!; throw new AppError(409, 'INSUFFICIENT_STOCK', `${u.itemCode}: only ${u.available} left, you asked for ${u.wanted}`, priced.unavailable.map((x) => ({ path: `variantId:${x.variantId}`, message: `${x.available} available` }))); }
  const goods = priced.goodsTotal; const shippingCharge = (await pincodeInfo(address.pincode, goods)).shippingCharge;
  let codFee = 0;
  if (input.paymentMethod === 'cod') {
    if (!pin.codAvailable) throw businessRule('Cash on delivery is not available for this pincode', 'COD_NOT_AVAILABLE');
    codFee = settings.cod.fee;
    if (goods + shippingCharge + codFee > settings.cod.maxOrderValue) throw businessRule(`Cash on delivery is limited to ${fmt(settings.cod.maxOrderValue)}. Please pay online.`, 'COD_LIMIT');
  }
  const total = goods + shippingCharge + codFee;
  const wallet = input.useWallet ? Math.min(await walletBalance(customerId), total) : 0; const payable = total - wallet;
  const method: 'online' | 'cod' | 'wallet' = payable === 0 ? 'wallet' : input.paymentMethod;
  const orderNumber = await nextNumber('ORD'); const storeId = await pickStore(priced.lines);
  const me: any = await Customer.findById(customerId).lean();

  const id = await withTransaction(async (session) => {
    for (const l of priced.lines) await reserveStock({ variantId: l.variantId, storeId, qty: l.qty, docType: 'ONLINE_ORDER', docNumber: orderNumber }, session);
    if (wallet > 0) {
      const bal = await WalletLedger.aggregate([{ $match: { customerId: oid(customerId) } }, { $group: { _id: null, p: { $sum: '$amount' } } }]).session(session);
      if (wallet > (bal[0]?.p ?? 0)) throw businessRule('Your wallet balance changed. Try again.', 'INSUFFICIENT_WALLET');
      await WalletLedger.create([{ customerId, amount: -wallet, type: 'DEBIT', docType: 'ORDER', docNumber: orderNumber }], { session });
    }
    const [o] = await Order.create([{
      orderNumber, customerId, status: 'created', storeId, paymentMethod: method, mobile: input.mobile,
      lines: priced.lines.map((l) => ({ variantId: l.variantId, itemCode: l.itemCode, name: l.name, size: l.size, color: l.color, qty: l.qty, mrp: l.mrp, unitPrice: l.unitPrice })),
      address: { name: address.name, phone: address.phone, line1: address.line1, line2: address.line2, city: address.city, state: address.state, stateCode: address.stateCode, pincode: address.pincode },
      coupon: priced.coupon ? { code: priced.coupon.code, discount: priced.couponDiscount } : undefined, subtotal: priced.subtotal, couponDiscount: priced.couponDiscount, shipping: shippingCharge, codFee, total, walletUsed: wallet, payable,
      gstMode: priced.gstMode, taxSplit: priced.taxSplit, holdExpiresAt: new Date(Date.now() + settings.holdMinutes * 60000),
      timeline: [{ status: 'created', at: new Date(), by: me?.email ?? 'customer', note: '' }],
    }], { session });
    return String(o!._id);
  });
  audit({ entity: 'online_order', entityId: id, action: 'checkout_start', after: { orderNumber, total, wallet, payable, method } });
  // COD is accepted now; a wallet that covers everything is paid now. Otherwise the order waits for the gateway webhook.
  if (method === 'cod' || method === 'wallet') await confirmOrder(id, SYSTEM, method === 'cod' ? 'Cash on delivery accepted' : 'Paid from wallet', audit);
  else await Order.updateOne({ _id: id }, { $set: { status: 'payment_pending' }, $push: { timeline: { status: 'payment_pending', at: new Date(), by: 'system', note: 'Waiting for payment' } } });
  return orderDto(await Order.findById(id).lean() as any);
}

/** Step 1 and 3 of the payment flow. Create the gateway order; or record what the browser reports (never confirms). */
export async function checkoutPay(customerId: string, input: any, audit: Audit) {
  const o: any = await Order.findOne({ _id: input.orderId, customerId });
  if (!o) throw notFound('Order');
  if (input.razorpayPaymentId && input.razorpaySignature) {
    if (!o.razorpayOrderId) throw businessRule('Start the payment first', 'NO_PAYMENT_ORDER');
    const ok = checkoutSignature(o.razorpayOrderId, input.razorpayPaymentId) === input.razorpaySignature;
    o.clientReportedPayment = { paymentId: input.razorpayPaymentId, signatureOk: ok, at: new Date() }; o.markModified('clientReportedPayment'); await o.save();
    audit({ entity: 'online_order', entityId: String(o._id), action: 'client_reported_payment', after: { signatureOk: ok } });
    return { ...orderDto(o.toObject(), false), note: 'Thanks. We confirm your order when the payment provider tells us the payment was received.', signatureOk: ok };
  }
  if (o.paymentMethod !== 'online') throw businessRule('This order does not need an online payment', 'NO_PAYMENT_NEEDED');
  if (!['created', 'payment_pending'].includes(o.status)) throw businessRule(`This order is ${o.status.replace('_', ' ')}`, 'BAD_STATUS');
  if (o.holdExpiresAt && o.holdExpiresAt < new Date()) { await abandonOrder(String(o._id), 'Payment was not completed in time', SYSTEM); throw businessRule('Your 15 minute hold on these items ran out. Please start again.', 'HOLD_EXPIRED'); }
  if (!o.razorpayOrderId) { const g = await payments().createOrder({ amount: o.payable, receipt: o.orderNumber }); o.razorpayOrderId = g.id; }
  o.status = 'payment_pending'; await o.save();
  return { orderId: String(o._id), orderNumber: o.orderNumber, razorpayOrderId: o.razorpayOrderId, keyId: payments().keyId, amount: o.payable, currency: 'INR' as const, mock: payments().kind === 'mock', holdExpiresAt: iso(o.holdExpiresAt) };
}

// ---------------- confirmation ----------------
/**
 * Confirmed = payment verified or COD accepted. Prepaid orders become an ECM invoice here (inbound order logic): the stock hold
 * turns into SALE rows. COD invoices are made at delivery, when the cash is settled.
 */
export async function confirmOrder(id: string, by: string, note: string, audit: Audit, paymentId?: string) {
  const sys = await systemUser();
  await withTransaction(async (session) => {
    const o: any = await Order.findOne({ _id: id, status: { $in: ['created', 'payment_pending'] } }).session(session);
    if (!o) return;
    if (paymentId) o.razorpayPaymentId = paymentId;
    if (o.paymentMethod !== 'cod') await makeInvoice(o, sys, session, audit);
    pushTimeline(o, 'confirmed', by, note); o.holdExpiresAt = o.paymentMethod === 'cod' ? null : o.holdExpiresAt;
    if (o.coupon?.code) { const c: any = await Coupon.findOneAndUpdate({ code: o.coupon.code }, { $inc: { usedCount: 1 } }, { session, new: true }); if (c) await CouponUse.create([{ couponId: c._id, customerId: o.customerId, orderId: o._id }], { session }); }
    await o.save({ session });
  });
  const o: any = await Order.findById(id).lean();
  if (o?.status === 'confirmed') { await clearCart(String(o.customerId)); const c: any = await Customer.findById(o.customerId).lean(); if (c?.email) await notify(c.email, `Order ${o.orderNumber} placed`, 'Thank you for your order', `<p>Order <b>${o.orderNumber}</b> is confirmed. Total ${fmt(o.total)}${o.paymentMethod === 'cod' ? ` (pay ${fmt(o.payable)} on delivery)` : ''}.</p>`); }
  return o;
}
async function makeInvoice(o: any, sys: AuthUser, session: mongoose.ClientSession, audit: Audit) {
  await releaseHold(o, session); // the hold turns into a sale in the same transaction
  const me: any = await Customer.findById(o.customerId).session(session).lean();
  const tenders: any[] = []; if (o.walletUsed > 0) tenders.push({ mode: 'wallet', amount: o.walletUsed });
  if (o.payable > 0) tenders.push({ mode: o.paymentMethod === 'cod' ? 'cash' : 'razorpay', amount: o.payable, reference: o.razorpayPaymentId });
  const inv: any = await createInbound(sys, {
    orderNumber: o.orderNumber, storeId: String(o.storeId), customerId: String(o.customerId), customer: { name: o.address.name, mobile: o.mobile, stateCode: o.address.stateCode, address: [o.address.line1, o.address.city, o.address.pincode].join(', ') },
    lines: o.lines.map((l: any) => ({ variantId: String(l.variantId), qty: l.qty, unitPrice: l.unitPrice, discountAmount: 0 })), shippingCharge: o.shipping + o.codFee, tenders, shipTo: [o.address.line1, o.address.city, o.address.pincode].join(', '),
    couponDiscount: o.couponDiscount, walletPrepaid: true,
  }, audit, session);
  o.invoiceId = inv.id; o.invoiceNumber = inv.invoiceNumber; void me;
}

// ---------------- webhooks ----------------
export async function razorpayWebhook(raw: string, signature: string | undefined, eventIdHeader: string | undefined, audit: Audit) {
  const ok = verifyWebhookSignature(raw, signature);
  let payload: any = {}; try { payload = JSON.parse(raw); } catch { /* handled below */ }
  const eventId = eventIdHeader || payload?.id || `${payload?.event}:${payload?.payload?.payment?.entity?.id}`;
  if (!ok) { audit({ entity: 'webhook', action: 'razorpay_bad_signature', after: { eventId } }); throw new AppError(400, 'BAD_SIGNATURE', 'Webhook signature is not valid'); }
  if (!eventId) throw badRequest('Webhook has no event id');
  let ev: any;
  try { ev = await WebhookEvent.create({ source: 'razorpay', eventId, signatureOk: true, raw }); } catch (e: any) { if (e?.code === 11000) return { received: true, duplicate: true }; throw e; }
  const pay = payload?.payload?.payment?.entity; const razorpayOrderId = pay?.order_id ?? payload?.payload?.order?.entity?.id;
  let result = 'ignored';
  if (['payment.captured', 'order.paid'].includes(payload?.event) && razorpayOrderId) {
    const o: any = await Order.findOne({ razorpayOrderId }).lean();
    if (!o) result = 'order not found';
    else if (pay?.amount && pay.amount !== o.payable) result = 'amount mismatch';
    else if (['created', 'payment_pending'].includes(o.status) && !(o.holdExpiresAt && o.holdExpiresAt < new Date())) { await confirmOrder(String(o._id), 'razorpay', 'Payment verified', audit, pay?.id); result = 'confirmed'; }
    else if (['created', 'payment_pending', 'cancelled'].includes(o.status) && !o.invoiceId) result = await lateRefund(o, pay?.id, audit);
    else result = 'already confirmed';
  }
  await WebhookEvent.updateOne({ _id: ev._id }, { $set: { processedAt: new Date(), result } });
  return { received: true, result };
}
/** A payment that arrives after the stock hold expired is refunded automatically, or flagged if the refund fails. */
async function lateRefund(o: any, paymentId: string | undefined, audit: Audit) {
  if (['created', 'payment_pending'].includes(o.status)) await abandonOrder(String(o._id), 'Payment arrived after the stock hold expired', SYSTEM);
  let refund: any;
  try { const r = await payments().refund({ paymentId: paymentId ?? 'unknown', amount: o.payable }); refund = { status: 'auto_refunded', id: r.id, amount: o.payable, at: new Date(), reason: 'late payment' }; }
  catch (e: any) { refund = { status: 'needs_attention', error: String(e?.message ?? e).slice(0, 200), amount: o.payable, at: new Date() }; }
  await Order.updateOne({ _id: o._id }, { $set: { refund, razorpayPaymentId: paymentId }, $push: { timeline: { status: 'cancelled', at: new Date(), by: 'system', note: `Late payment ${refund.status}` } } });
  audit({ entity: 'online_order', entityId: String(o._id), action: 'late_payment', after: refund });
  return refund.status;
}

export async function shiprocketWebhook(token: string | undefined, body: any, expected: string, audit: Audit) {
  if (!token || token !== expected) throw new AppError(401, 'UNAUTHORIZED', 'Invalid webhook token');
  const eventId = `${body.awb}:${body.current_status}:${body.current_timestamp ?? ''}`;
  try { await WebhookEvent.create({ source: 'shiprocket', eventId, signatureOk: true, raw: JSON.stringify(body) }); } catch (e: any) { if (e?.code === 11000) return { received: true, duplicate: true }; throw e; }
  const map: Record<string, string> = { SHIPPED: 'shipped', 'OUT FOR DELIVERY': 'out_for_delivery', DELIVERED: 'delivered' };
  const next = map[String(body.current_status).toUpperCase()];
  const o: any = await Order.findOne({ 'shipment.awb': body.awb }).lean();
  if (o && next && NEXT[o.status]?.includes(next)) await moveOrder(String(o._id), next, 'shiprocket', String(body.current_status), audit);
  return { received: true };
}

// ---------------- the state machine ----------------
export async function moveOrder(id: string, status: string, by: string, note: string, audit: Audit) {
  const o0: any = await Order.findById(id).lean(); if (!o0) throw notFound('Order');
  if (!(NEXT[o0.status] ?? []).includes(status)) throw businessRule(`An order that is ${o0.status.replace(/_/g, ' ')} cannot move to ${status.replace(/_/g, ' ')}`, 'ILLEGAL_TRANSITION');
  if (status === 'cancelled') return cancelOrder(id, by, note, audit);
  if (status === 'delivered' && o0.status !== 'return_requested') await deliver(id, by, note, audit);
  else {
    const set: any = {};
    if (status === 'shipped') { const s = await shipping().createShipment({ orderNumber: o0.orderNumber, address: o0.address }); set.shipment = { ...s, createdAt: new Date() }; }
    if (status === 'delivered') set.status = undefined;
    await Order.updateOne({ _id: id, status: o0.status }, { $set: { status, ...set }, $push: { timeline: { status, at: new Date(), by, note } } });
  }
  const o: any = await Order.findById(id).lean(); const c: any = await Customer.findById(o.customerId).lean();
  if (c?.email && ['shipped', 'delivered'].includes(status)) await notify(c.email, `Order ${o.orderNumber} ${status}`, status === 'shipped' ? 'Your order is on its way' : 'Your order was delivered', `<p>Order <b>${o.orderNumber}</b> is ${status}.${o.shipment?.trackingUrl ? ` Track: <a href="${o.shipment.trackingUrl}">${o.shipment.awb}</a>` : ''}</p>`);
  audit({ entity: 'online_order', entityId: id, action: `status_${status}`, before: { status: o0.status }, after: { status } });
  return orderDto(o);
}
/** COD: cash is settled at delivery, so the invoice and the sale are made now. */
async function deliver(id: string, by: string, note: string, audit: Audit) {
  const sys = await systemUser();
  await withTransaction(async (session) => {
    const o: any = await Order.findById(id).session(session);
    if (o.paymentMethod === 'cod' && !o.invoiceId) await makeInvoice(o, sys, session, audit);
    pushTimeline(o, 'delivered', by, note); o.deliveredAt = new Date(); o.markModified('deliveredAt'); await o.save({ session });
  });
}
export async function cancelOrder(id: string, by: string, note: string, audit: Audit, actorIsCustomer = false) {
  const o0: any = await Order.findById(id).lean(); if (!o0) throw notFound('Order');
  if (actorIsCustomer && !['created', 'payment_pending', 'confirmed'].includes(o0.status)) throw businessRule('This order can no longer be cancelled. Request a return after delivery.', 'CANNOT_CANCEL');
  if (!['created', 'payment_pending', 'confirmed', 'packed'].includes(o0.status)) throw businessRule(`An order that is ${o0.status.replace(/_/g, ' ')} cannot be cancelled`, 'ILLEGAL_TRANSITION');
  if (['created', 'payment_pending'].includes(o0.status) || (o0.paymentMethod === 'cod' && !o0.invoiceId)) {
    await withTransaction(async (session) => {
      const o: any = await Order.findById(id).session(session); await releaseHold(o, session); await refundWallet(o, session, note);
      pushTimeline(o, 'cancelled', by, note); await o.save({ session });
    });
  } else {
    // paid and invoiced: a full credit note, stock back on the shelf, money to the wallet
    const sys = await systemUser(); await cancelInvoice(sys, String(o0.invoiceId), note || 'Order cancelled', audit, 'wallet');
    await Order.updateOne({ _id: id }, { $set: { status: 'cancelled', refund: { status: 'refunded_to_wallet', amount: o0.total - o0.shipping - o0.codFee, at: new Date() } }, $push: { timeline: { status: 'cancelled', at: new Date(), by, note } } });
  }
  const o: any = await Order.findById(id).lean(); const c: any = await Customer.findById(o.customerId).lean();
  if (c?.email) await notify(c.email, `Order ${o.orderNumber} cancelled`, 'Your order was cancelled', `<p>Order <b>${o.orderNumber}</b> was cancelled. Any money paid is back in your Thunikart wallet.</p>`);
  audit({ entity: 'online_order', entityId: id, action: 'cancel', before: { status: o0.status }, after: { status: 'cancelled' } });
  return orderDto(o);
}

// ---------------- returns ----------------
export async function requestReturn(customerId: string, id: string, input: any, audit: Audit) {
  const o: any = await Order.findOne({ _id: id, customerId }); if (!o) throw notFound('Order');
  if (o.status !== 'delivered') throw businessRule('You can request a return after the order is delivered', 'BAD_STATUS');
  const s = await getOperationsSettings(); const since = (o.timeline as any[]).find((t) => t.status === 'delivered')?.at ?? o.createdAt; // the window runs from the first delivery
  if (Date.now() - new Date(since).getTime() > s.returnWindowDays * 86400000) throw businessRule(`The ${s.returnWindowDays} day return window has passed`, 'RETURN_WINDOW_PASSED');
  const inv: any = await SalesBill.findById(o.invoiceId).lean();
  for (const l of input.lines) {
    const il = inv.lines.find((x: any) => String(x.variantId) === l.variantId);
    if (!il || l.qty > il.qty - (il.returnedQty ?? 0)) throw businessRule('That item or quantity is not on this order', 'RETURN_EXCEEDS_SALE');
    if (!s.returnDiscountedItems && (il.lineDiscount > 0 || il.billDiscountShare > 0)) throw businessRule(`${il.itemCode} was bought at a discount and cannot be returned`, 'NOT_RETURNABLE');
  }
  o.returnRequest = { status: 'requested', reason: input.reason, note: input.note, photoKeys: input.photoKeys, lines: input.lines, requestedAt: new Date() }; o.markModified('returnRequest');
  pushTimeline(o, 'return_requested', 'customer', input.reason); await o.save();
  audit({ entity: 'online_order', entityId: id, action: 'return_requested', after: o.returnRequest });
  return orderDto(o.toObject());
}
export async function decideReturn(id: string, approve: boolean, note: string, by: string, audit: Audit) {
  const o: any = await Order.findById(id); if (!o) throw notFound('Order');
  if (o.status !== 'return_requested') throw businessRule('There is no return waiting for a decision', 'BAD_STATUS');
  if (approve) {
    const st = await storeSettings();
    if (st.returnPickup) { const r = await shipping().createReversePickup({ orderNumber: o.orderNumber, address: o.address }); o.shipment = { ...(o.shipment ?? {}), reverseAwb: r.awb, reverseCourier: r.courier }; o.markModified('shipment'); }
    o.returnRequest = { ...o.returnRequest, status: 'approved', decisionNote: note, decidedAt: new Date() }; pushTimeline(o, 'return_approved', by, note);
  } else { o.returnRequest = { ...o.returnRequest, status: 'rejected', decisionNote: note, decidedAt: new Date() }; pushTimeline(o, 'delivered', by, `Return rejected: ${note}`); }
  o.markModified('returnRequest'); await o.save();
  const c: any = await Customer.findById(o.customerId).lean(); if (c?.email) await notify(c.email, `Return ${approve ? 'approved' : 'update'} for ${o.orderNumber}`, approve ? 'Your return was approved' : 'About your return request', `<p>${approve ? 'Your return was approved. A pickup will be arranged.' : 'We could not approve your return.'} ${note}</p>`);
  audit({ entity: 'online_order', entityId: id, action: approve ? 'return_approved' : 'return_rejected', after: { note } });
  return orderDto(o.toObject());
}
export async function markReturnReceived(id: string, by: string, audit: Audit) { return moveOrder(id, 'returned', by, 'Return received', audit); }
/** On receipt: restock or damaged stock, a credit note, and the money to the wallet (or the original method if the Admin chooses). */
export async function refundReturn(id: string, input: { refundTo: 'wallet' | 'original'; condition: 'restock' | 'damaged' }, by: string, audit: Audit) {
  let o: any = await Order.findById(id).lean(); if (!o) throw notFound('Order');
  if (o.status === 'return_approved') { await moveOrder(id, 'returned', by, 'Return received', audit); o = await Order.findById(id).lean(); }
  if (o.status !== 'returned') throw businessRule('Mark the return as received before refunding', 'BAD_STATUS');
  const sys = await systemUser(); const rr = o.returnRequest;
  const cn: any = await createReturn(sys, { invoiceId: String(o.invoiceId), reason: input.condition === 'damaged' ? 'defect' : (rr.reason === 'defect' ? 'other' : rr.reason), note: rr.note, lines: rr.lines, refundTo: input.refundTo === 'original' ? 'original' : 'wallet', skipChecks: true }, audit);
  if (input.refundTo === 'original' && o.razorpayPaymentId) { try { await payments().refund({ paymentId: o.razorpayPaymentId, amount: cn.refundTotal }); } catch { /* recorded on the credit note; Accounts can retry */ } }
  await Order.updateOne({ _id: id }, { $set: { status: 'refunded', refund: { status: 'refunded', creditNote: cn.creditNoteNumber, amount: cn.refundTotal, to: input.refundTo, condition: input.condition, at: new Date() } }, $push: { timeline: { status: 'refunded', at: new Date(), by, note: `${cn.creditNoteNumber} ${fmt(cn.refundTotal)} to ${input.refundTo}` } } });
  const c: any = await Customer.findById(o.customerId).lean(); if (c?.email) await notify(c.email, `Refund for ${o.orderNumber}`, 'Your refund is done', `<p>${fmt(cn.refundTotal)} was refunded to your ${input.refundTo === 'wallet' ? 'Thunikart wallet' : 'original payment method'} (credit note ${cn.creditNoteNumber}).</p>`);
  return orderDto((await Order.findById(id).lean()) as any);
}

// ---------------- reads ----------------
export async function myOrders(customerId: string, page: number, pageSize: number) {
  const f = { customerId }; const skip = (page - 1) * pageSize;
  const [rows, total]: any = await Promise.all([Order.find(f).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(), Order.countDocuments(f)]);
  return { items: rows.map((o: any) => orderDto(o, false)), total, nextPage: skip + rows.length < total ? page + 1 : null };
}
export async function myOrder(customerId: string, id: string) { const o: any = await Order.findOne({ _id: id, customerId }).lean(); if (!o) throw notFound('Order'); return orderDto(o); }
export async function track(customerId: string, id: string) { const o: any = await Order.findOne({ _id: id, customerId }).lean(); if (!o) throw notFound('Order'); return { orderNumber: o.orderNumber, status: o.status, timeline: orderDto(o).timeline, shipment: o.shipment ? { awb: o.shipment.awb, courier: o.shipment.courier, trackingUrl: o.shipment.trackingUrl } : null }; }
export async function adminOrders(q: any) {
  const f: any = {}; if (q.orderStatus) f.status = q.orderStatus; if (q.customerId) f.customerId = q.customerId; if (q.q) f.orderNumber = new RegExp(escapeRegex(q.q), 'i');
  return paginate(Order, f, q, parseSort(q.sort, ['createdAt', 'orderNumber', 'total'], { createdAt: -1 }), (o) => orderDto(o, false));
}
export async function adminOrder(id: string) { const o: any = await Order.findById(id).lean(); if (!o) throw notFound('Order'); return orderDto(o); }

export const _u = { conflict, forbidden, calcInvoice, Store, Variant, StockLedger };
