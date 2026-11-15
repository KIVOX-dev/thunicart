import argon2 from 'argon2';
import type { ClientSession } from 'mongoose';
import type { ListQuery } from '@thunikart/shared';
import { BusinessProfile, Customer, Item, LoyaltyLedger, SalesBill, SalesReturn, Shift, Store, StockBalance, User, Variant, WalletLedger } from '../../models';
import { AppError, badRequest, businessRule, forbidden, notFound } from '../../lib/errors';
import { withTransaction } from '../../lib/transaction';
import { nextNumber } from '../../lib/numberSeries';
import { allocateProportionally, divRoundHalfUp } from '../../lib/money';
import { calcInvoice, discountToPaise, taxableOf } from '../../lib/invoiceCalc';
import { getOperationsSettings, postStock } from '../../lib/stock';
import { isGstEnabled } from '../../lib/gst';
import { resolveGstRate } from '../../lib/gstRate';
import { parseSizes } from '../../lib/sizes';
import { effectivePrice } from '../../lib/stockStatus';
import { supplyFor } from '../../lib/purchaseTax';
import { escapeRegex, paginate, parseSort, iso } from '../../lib/list';
import type { AuthUser } from '../../middleware/auth';
import type { AuditEntry } from '../../middleware/audit';

type Audit = (e: AuditEntry) => void;
type Session = ClientSession;
const SERIES = { POS: 'POS', ECM: 'ECM', CNT: 'CNT' } as const;

export const billDto = (b: any, extra: Record<string, unknown> = {}) => ({
  id: String(b._id), invoiceNumber: b.invoiceNumber ?? null, status: b.status, channel: b.channel, storeId: String(b.storeId), customerId: b.customerId ? String(b.customerId) : null,
  customer: b.customer ?? {}, placeOfSupply: b.placeOfSupply ?? '', supply: b.supply ?? null, gstMode: b.gstMode ?? 'off',
  lines: (b.lines ?? []).map((l: any) => ({ variantId: String(l.variantId), itemCode: l.itemCode, description: l.description, hsn: l.hsn ?? null, size: l.size ?? null, qty: l.qty, mrp: l.mrp, unitPrice: l.unitPrice, lineDiscount: l.lineDiscount, billDiscountShare: l.billDiscountShare, gross: l.gross, net: l.net, rate: l.gstRate ?? l.rate ?? null, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, returnedQty: l.returnedQty ?? 0 })),
  groups: b.groups ?? [], totals: b.totals ?? {}, roundOff: b.roundOff ?? 0, grandTotal: b.grandTotal ?? 0, tenders: b.tenders ?? [], creditDue: b.creditDue ?? 0, dueDate: iso(b.dueDate),
  loyaltyEarned: b.loyaltyEarned ?? 0, loyaltyRedeemed: b.loyaltyRedeemed ?? 0, notes: b.notes ?? '', orderNumber: b.orderNumber ?? null,
  finalizedAt: iso(b.finalizedAt), createdAt: iso(b.createdAt)!, currency: 'INR' as const, version: b.version ?? 0, snapshot: b.snapshot ?? null, ...extra,
});

async function business(session?: Session) { return (await BusinessProfile.findOne({ singleKey: 'main' }).session(session ?? null).lean()) as any; }

interface PlanLine { variantId: string; itemCode: string; description: string; hsn: string; size: string | null; qty: number; mrp: number; unitPrice: number; lineDiscount: number; discountInput: any; rate: number | null; unitCostAtSale: number }
interface Plan {
  channel: 'POS' | 'ECM' | 'CNT'; storeId: string; customerId?: string; customer: any; lines: PlanLine[]; billDiscount: number; billDiscountInput: any; notes: string; dueDate?: Date | null;
  orderNumber?: string; exchangeOfReturnId?: string; extraDiscount?: number;
}

async function resolveCustomer(input: { customerId?: string; customer?: any }, b: any, session?: Session) {
  if (input.customerId) {
    const c: any = await Customer.findById(input.customerId).session(session ?? null).lean();
    if (!c) throw badRequest('Customer not found', [{ path: 'customerId', message: 'Choose an existing customer' }]);
    return { id: String(c._id), snap: { customerId: c.customerId, name: c.name, mobile: c.mobile, address: [c.address, c.city].filter(Boolean).join(', '), stateCode: c.stateCode, gstin: c.gstin ?? '', accountGroup: c.accountGroup }, doc: c };
  }
  const x = input.customer ?? {};
  return { id: undefined, snap: { customerId: null, name: x.name || 'Walk-in Customer', mobile: x.mobile ?? '', address: x.address ?? '', stateCode: x.stateCode ?? b?.stateCode ?? '33', gstin: x.gstin ?? '', accountGroup: 'Retail Walk-in' }, doc: null };
}

async function prepareLines(lines: any[], date: Date, gstOn: boolean, session?: Session): Promise<PlanLine[]> {
  const ids = lines.map((l) => l.variantId);
  const vs: any[] = await Variant.find({ _id: { $in: ids } }).session(session ?? null).lean(); const vm = new Map(vs.map((v) => [String(v._id), v]));
  const items: any[] = await Item.find({ _id: { $in: vs.map((v) => v.itemId) } }).session(session ?? null).lean(); const im = new Map(items.map((i) => [String(i._id), i]));
  const out: PlanLine[] = [];
  for (const [i, l] of lines.entries()) {
    const v = vm.get(l.variantId);
    if (!v) throw badRequest('Item not found', [{ path: `lines.${i}.variantId`, message: 'Choose an existing item' }]);
    if (!v.active) throw businessRule(`${v.itemCode} is inactive`, 'VARIANT_INACTIVE');
    const item = im.get(String(v.itemId));
    // Several sizes in one row share one stock count. The cashier says which size is being sold; it goes on the bill and stock drops by the quantity.
    const sold = parseSizes(v.size);
    let size: string | null = v.size ?? null;
    if (sold.multi) {
      const chosen = typeof l.size === 'string' ? sold.sizes.find((x) => x.toUpperCase() === l.size.trim().toUpperCase()) : undefined;
      if (!chosen) throw badRequest(`Choose the size sold for ${v.itemCode}`, [{ path: `lines.${i}.size`, message: `Choose one of: ${sold.sizes.join(', ')}` }]);
      size = chosen;
    }
    const unitPrice = l.unitPrice ?? effectivePrice(v);
    let rate: number | null = null;
    if (item?.hsn) rate = (await resolveGstRate({ hsn: item.hsn, unitPricePaise: unitPrice, date, override: item.gstRateOverride }, session))?.rate ?? null;
    if (gstOn && rate === null) throw badRequest(`GST rate is not known for ${v.itemCode}`, [{ path: `lines.${i}.variantId`, message: item?.hsn ? `No GST rate rule covers HSN ${item.hsn}` : 'The item has no HSN' }]);
    out.push({ variantId: l.variantId, itemCode: v.itemCode, description: [item?.printName || item?.name, size].filter(Boolean).join(' '), hsn: item?.hsn ?? '', size, qty: l.qty, mrp: v.mrp ?? 0, unitPrice, lineDiscount: discountToPaise(l.discount, l.qty * unitPrice), discountInput: l.discount ?? null, rate, unitCostAtSale: v.baseCost ?? 0 });
  }
  return out;
}

/** Above the role's maximum discount a manager PIN is needed. The approval is logged. */
async function checkDiscount(user: AuthUser, gross: number, discount: number, approval: { pin: string } | undefined, audit: Audit) {
  if (gross <= 0 || discount <= 0) return;
  const pct = (discount / gross) * 100;
  const s = await getOperationsSettings();
  const max = user.isAdmin ? 100 : (s.maxDiscountPct[user.roleName] ?? 0);
  if (pct <= max + 1e-9) return;
  if (!approval?.pin) throw businessRule(`A ${pct.toFixed(1)}% discount is above your ${max}% limit. A manager PIN is needed.`, 'DISCOUNT_APPROVAL_REQUIRED', [{ path: 'approval', message: 'Manager PIN required' }]);
  if (!s.managerPinHash || !(await argon2.verify(s.managerPinHash, approval.pin).catch(() => false))) throw forbidden('Manager PIN is not correct');
  audit({ entity: 'discount_approval', action: 'approved', after: { user: user.email, discountPct: Number(pct.toFixed(2)), discount } });
}

async function openShift(user: AuthUser, storeId: string, session?: Session) {
  return (await Shift.findOne({ cashierId: user.id, storeId, status: 'open' }).session(session ?? null).lean()) as any;
}

async function loyaltyBalance(customerId: string, session?: Session) {
  const r = await LoyaltyLedger.aggregate([{ $match: { customerId: new (await import('mongoose')).default.Types.ObjectId(customerId) } }, { $group: { _id: null, p: { $sum: '$points' } } }]).session(session ?? null);
  return r[0]?.p ?? 0;
}
async function walletBalance(customerId: string, session?: Session) {
  const r = await WalletLedger.aggregate([{ $match: { customerId: new (await import('mongoose')).default.Types.ObjectId(customerId) } }, { $group: { _id: null, p: { $sum: '$amount' } } }]).session(session ?? null);
  return r[0]?.p ?? 0;
}

function planFromInput(input: any, user: AuthUser, lines: PlanLine[], cust: Awaited<ReturnType<typeof resolveCustomer>>, billDiscount: number): Plan {
  return { channel: input.channel ?? 'POS', storeId: input.storeId, customerId: cust.id, customer: cust.snap, lines, billDiscount, billDiscountInput: input.billDiscount ?? null, notes: input.notes ?? '', dueDate: input.dueDate ? new Date(input.dueDate) : null };
}

/** Totals for a draft or hold bill. Nothing is reserved and no stock moves until finalize. */
async function previewTotals(plan: Plan, session?: Session) {
  const gstOn = await isGstEnabled(session); const biz = await business(session);
  const supply = gstOn ? supplyFor(plan.customer.stateCode || biz.stateCode, biz.stateCode) : 'intra';
  const gross = plan.lines.reduce((a, l) => a + l.qty * l.unitPrice - l.lineDiscount, 0);
  const calc = calcInvoice(plan.lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, lineDiscount: l.lineDiscount, rate: l.rate, hsn: l.hsn })), plan.billDiscount, { gstOn, supply });
  return { calc, gstOn, supply, biz, gross };
}
const linesDoc = (plan: Plan, calc: ReturnType<typeof calcInvoice>) => plan.lines.map((l, i) => ({ ...l, ...calc.lines[i]!, discountInput: l.discountInput, gstRate: undefined, rate: l.rate }));

export async function saveBill(user: AuthUser, input: any, audit: Audit, existingId?: string, version?: number) {
  if (input.lines === undefined && existingId) { const cur: any = await SalesBill.findById(existingId).lean(); input = { ...input, lines: cur.lines.map((l: any) => ({ variantId: String(l.variantId), qty: l.qty, unitPrice: l.unitPrice, discount: l.discountInput ?? undefined })), storeId: input.storeId ?? String(cur.storeId), billDiscount: input.billDiscount ?? cur.billDiscountInput ?? undefined, channel: cur.channel, customerId: input.customerId ?? (cur.customerId ? String(cur.customerId) : undefined) }; }
  const date = new Date(); const gstOn = await isGstEnabled(); const biz = await business();
  const cust = await resolveCustomer(input, biz);
  const lines = await prepareLines(input.lines, date, gstOn);
  const base = lines.reduce((a, l) => a + l.qty * l.unitPrice - l.lineDiscount, 0);
  const plan = planFromInput(input, user, lines, cust, discountToPaise(input.billDiscount, base));
  const { calc, supply } = await previewTotals(plan);
  const fields = { channel: plan.channel, storeId: plan.storeId, customerId: plan.customerId, customer: plan.customer, placeOfSupply: plan.customer.stateCode || biz.stateCode, supply: gstOn ? supply : null, gstMode: gstOn ? 'on' : 'off',
    lines: linesDoc(plan, calc), billDiscountInput: plan.billDiscountInput, groups: calc.groups, totals: calc.totals, roundOff: calc.totals.roundOff, grandTotal: calc.totals.grandTotal, notes: plan.notes, dueDate: plan.dueDate, status: input.hold ? 'hold' : 'draft' };
  let doc: any;
  if (existingId) {
    doc = await SalesBill.findOneAndUpdate({ _id: existingId, status: { $in: ['draft', 'hold'] }, version }, { $set: fields, $inc: { version: 1 } }, { new: true }).lean();
    if (!doc) { const cur: any = await SalesBill.findById(existingId).lean(); if (!cur) throw notFound('Bill'); if (!['draft', 'hold'].includes(cur.status)) throw businessRule('A finalized bill cannot be edited. Use a return or credit note.', 'NOT_DRAFT'); throw new AppError(409, 'STALE_EDIT', `This bill changed (now version ${cur.version}). Reload it and try again.`); }
  } else doc = (await SalesBill.create({ ...fields, cashierId: user.id, createdBy: user.id })).toObject();
  audit({ entity: 'sales_bill', entityId: String(doc._id), action: existingId ? 'update' : 'create', after: { status: doc.status, grandTotal: doc.grandTotal } });
  return billDto(doc);
}

/** Totals for a cart exactly as finalize would compute them. Writes nothing and reserves nothing. Used by the POS screen while the cashier types. */
export async function previewBill(user: AuthUser, input: any) {
  const date = new Date(); const gstOn = await isGstEnabled(); const biz = await business();
  const cust = await resolveCustomer(input, biz);
  const lines = await prepareLines(input.lines, date, gstOn);
  const base = lines.reduce((a, l) => a + l.qty * l.unitPrice - l.lineDiscount, 0);
  const plan = planFromInput(input, user, lines, cust, discountToPaise(input.billDiscount, base));
  const { calc, supply } = await previewTotals(plan);
  const bal: any[] = await StockBalance.find({ storeId: input.storeId, variantId: { $in: lines.map((l) => l.variantId) } }).lean();
  const avail = new Map(bal.map((b) => [String(b.variantId), b.onHand - b.reserved]));
  return { gstMode: (gstOn ? 'on' : 'off') as 'on' | 'off', supply: gstOn ? supply : null, lines: linesDoc(plan, calc).map((l: any) => ({ ...l, available: avail.get(String(l.variantId)) ?? 0 })), groups: calc.groups, totals: calc.totals };
}

export async function getBill(id: string) {
  const b: any = await SalesBill.findById(id).lean();
  if (!b) throw notFound('Bill');
  return billDto(b);
}
export async function listBills(q: ListQuery & { channel?: string; invoiceStatus?: string; customerId?: string }, mine?: string) {
  const f: any = {};
  if (q.channel) f.channel = q.channel; if (q.invoiceStatus) f.status = q.invoiceStatus; if (q.status) f.status = q.status; if (q.customerId) f.customerId = q.customerId; if (q.store) f.storeId = q.store;
  if (mine) f.cashierId = mine;
  if (q.from || q.to) f.createdAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  if (q.q) { const r = new RegExp(escapeRegex(q.q), 'i'); f.$or = [{ invoiceNumber: r }, { 'customer.name': r }, { 'customer.mobile': r }]; }
  const res = await paginate(SalesBill, f, q, parseSort(q.sort, ['createdAt', 'invoiceNumber', 'grandTotal'], { createdAt: -1 }), (b) => b);
  return { ...res, items: res.items.map((b: any) => ({ ...billDto(b), snapshot: undefined })) };
}

/**
 * Finalize in ONE transaction: check stock, take the invoice number, write the invoice and payments, write SALE ledger rows and
 * balances, update loyalty and wallet. If anything fails (for example the last piece was sold a moment ago), nothing is saved.
 */
async function finalizeCore(user: AuthUser, plan: Plan, input: { tenders: any[]; redeemPoints?: number; approval?: any; draftId?: string; creditNoteTender?: number; walletPrepaid?: boolean; extraBillDiscount?: number }, audit: Audit, session: Session) {
  const settings = await getOperationsSettings(session);
  if (settings.requireOpenShift && plan.channel === 'POS' && !(await openShift(user, plan.storeId, session))) throw businessRule('Open a shift before billing', 'SHIFT_REQUIRED');
  const date = new Date(); const gstOn = await isGstEnabled(session); const biz = await business(session);
  const cust = plan.customerId ? await Customer.findById(plan.customerId).session(session).lean() as any : null;
  if (plan.channel === 'CNT') { if (!cust || cust.accountGroup !== 'B2B Trade' || !cust.gstin) throw badRequest('A B2B counter bill needs a B2B customer with a GSTIN', [{ path: 'customerId', message: 'GSTIN is required' }]); }
  const grossBase = plan.lines.reduce((a, l) => a + l.qty * l.unitPrice - l.lineDiscount, 0);
  if (plan.channel !== 'ECM') await checkDiscount(user, plan.lines.reduce((a, l) => a + l.qty * l.unitPrice, 0), plan.lines.reduce((a, l) => a + l.lineDiscount, 0) + plan.billDiscount, input.approval, audit);

  let redeem = 0;
  if (input.redeemPoints) {
    const L = settings.loyalty;
    if (!L.enabled) throw businessRule('Loyalty is not switched on in Settings', 'LOYALTY_OFF');
    if (!plan.customerId) throw badRequest('Choose a customer to redeem points', [{ path: 'redeemPoints', message: 'Customer required' }]);
    if (input.redeemPoints < L.minRedeem) throw businessRule(`The minimum to redeem is ${L.minRedeem} points`, 'BELOW_MIN_REDEEM');
    if (input.redeemPoints > (await loyaltyBalance(plan.customerId, session))) throw businessRule('Not enough loyalty points', 'INSUFFICIENT_POINTS');
    redeem = Math.min(input.redeemPoints * L.pointValuePaise, grossBase - plan.billDiscount);
  }
  const supply = gstOn ? supplyFor(plan.customer.stateCode || biz.stateCode, biz.stateCode) : 'intra';
  const calc = calcInvoice(plan.lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, lineDiscount: l.lineDiscount, rate: l.rate, hsn: l.hsn })), plan.billDiscount + redeem + (input.extraBillDiscount ?? 0), { gstOn, supply });
  const grand = calc.totals.grandTotal;

  // payments: one or more tenders; the amount paid equals the grand total, unless credit is used (B2B only, within the credit limit)
  const tenders = input.tenders.map((t) => ({ mode: t.mode, amount: t.amount, reference: t.reference }));
  const paid = tenders.reduce((a, t) => a + t.amount, 0);
  const credit = tenders.filter((t) => t.mode === 'credit').reduce((a, t) => a + t.amount, 0);
  if (paid !== grand) throw businessRule(`Payments add up to ${paid} but the bill is ${grand}`, 'PAYMENT_MISMATCH', [{ path: 'tenders', message: `Must total ${grand}` }]);
  if (credit > 0) {
    if (!cust || cust.accountGroup !== 'B2B Trade') throw businessRule('Credit is only for B2B customers', 'CREDIT_NOT_ALLOWED');
    const used = await SalesBill.aggregate([{ $match: { customerId: cust._id, status: 'finalized' } }, { $group: { _id: null, c: { $sum: '$creditDue' } } }]).session(session);
    if (credit + (used[0]?.c ?? 0) > (cust.creditLimit ?? 0)) throw businessRule('This is above the customer credit limit', 'CREDIT_LIMIT_EXCEEDED');
  }
  const walletUse = tenders.filter((t) => t.mode === 'wallet').reduce((a, t) => a + t.amount, 0);
  if (walletUse > 0 && !input.walletPrepaid) {
    if (!plan.customerId) throw badRequest('Choose a customer to pay from the wallet', [{ path: 'tenders', message: 'Customer required' }]);
    if (walletUse > (await walletBalance(plan.customerId, session))) throw businessRule('The wallet does not have enough balance', 'INSUFFICIENT_WALLET');
  }

  // stock: SALE rows at the average cost at this moment; a short piece fails the whole finalize with 409
  const lines = [] as any[];
  const pendingToken = `pending-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; // unique per finalize
  for (const [i, l] of plan.lines.entries()) {
    const v: any = await Variant.findById(l.variantId, { baseCost: 1 }).session(session).lean();
    await postStock({ variantId: l.variantId, storeId: plan.storeId, type: 'SALE', qty: -l.qty, unitCost: v?.baseCost ?? 0, docType: plan.channel, docNumber: pendingToken, userId: user.id, at: date, allowNegative: settings.allowNegativeStock }, session);
    lines.push({ ...l, ...calc.lines[i]!, unitCostAtSale: v?.baseCost ?? 0, discountInput: l.discountInput });
  }
  const invoiceNumber = await nextNumber(SERIES[plan.channel], { date, session });
  const store: any = await Store.findById(plan.storeId, { name: 1 }).session(session).lean();
  const shift = await openShift(user, plan.storeId, session);
  const earn = settings.loyalty.enabled && plan.customerId ? Math.floor((grand / 10000) * settings.loyalty.pointsPer100) : 0;
  const snapshot = {
    title: gstOn ? 'TAX INVOICE' : 'BILL OF SUPPLY', invoiceNumber, date: date.toISOString(), channel: plan.channel, store: store?.name ?? '', cashier: user.name, gstMode: gstOn ? 'on' : 'off',
    business: { legalName: biz.legalName, brandName: biz.brandName, addressLines: biz.addressLines, city: biz.city, state: biz.state, stateCode: biz.stateCode, pincode: biz.pincode, phone: biz.phone, email: biz.email, gstin: gstOn ? biz.gstin : '', pan: biz.pan, termsText: biz.termsText, invoiceFooter: biz.invoiceFooter, brandColors: biz.brandColors },
    customer: plan.customer, placeOfSupply: plan.customer.stateCode || biz.stateCode, supply: gstOn ? supply : null,
    lines: lines.map((l) => ({ itemCode: l.itemCode, description: l.description, hsn: l.hsn, qty: l.qty, mrp: l.mrp, rate: l.unitPrice, discount: l.lineDiscount + l.billDiscountShare, net: l.net, gstRate: gstOn ? l.rate : null, taxable: gstOn ? l.taxable : null, cgst: gstOn ? l.cgst : null, sgst: gstOn ? l.sgst : null, igst: gstOn ? l.igst : null })),
    groups: calc.groups, totals: gstOn ? calc.totals : { gross: calc.totals.gross, discount: calc.totals.discount, grandTotal: grand }, tenders, creditDue: credit, barcode: invoiceNumber,
  };
  const fields: any = { invoiceNumber, status: 'finalized', channel: plan.channel, storeId: plan.storeId, cashierId: user.id, shiftId: shift?._id, customerId: plan.customerId, customer: plan.customer, placeOfSupply: snapshot.placeOfSupply, supply: gstOn ? supply : null, gstMode: gstOn ? 'on' : 'off',
    lines: lines.map((l) => ({ ...l, rate: l.rate })), billDiscountInput: plan.billDiscountInput, groups: calc.groups, totals: calc.totals, roundOff: calc.totals.roundOff, grandTotal: grand, tenders, creditDue: credit, dueDate: plan.dueDate,
    loyaltyEarned: earn, loyaltyRedeemed: input.redeemPoints ?? 0, notes: plan.notes, snapshot, orderNumber: plan.orderNumber, exchangeOfReturnId: plan.exchangeOfReturnId, finalizedAt: date };
  let id: string;
  if (input.draftId) {
    const r = await SalesBill.findOneAndUpdate({ _id: input.draftId, status: { $in: ['draft', 'hold'] } }, { $set: fields, $inc: { version: 1 } }, { new: true, session }).lean() as any;
    if (!r) throw businessRule('This bill is already finalized', 'ALREADY_FINALIZED');
    id = String(r._id);
  } else { const [d] = await SalesBill.create([{ ...fields, createdBy: user.id }], { session }); id = String(d!._id); }
  await (await import('../../models')).StockLedger.updateMany({ docNumber: pendingToken }, { $set: { docNumber: invoiceNumber, docId: id } }, { session });
  if (walletUse > 0 && !input.walletPrepaid) await WalletLedger.create([{ customerId: plan.customerId, amount: -walletUse, type: 'DEBIT', docType: 'INVOICE', docNumber: invoiceNumber }], { session });
  if (input.redeemPoints) await LoyaltyLedger.create([{ customerId: plan.customerId, points: -input.redeemPoints, type: 'REDEEM', docType: 'INVOICE', docNumber: invoiceNumber }], { session });
  if (earn > 0) await LoyaltyLedger.create([{ customerId: plan.customerId, points: earn, type: 'EARN', docType: 'INVOICE', docNumber: invoiceNumber }], { session });
  return id;
}

export async function finalizeBill(user: AuthUser, id: string, input: any, audit: Audit) {
  const out = await withTransaction(async (session) => {
    const b: any = await SalesBill.findById(id).session(session).lean();
    if (!b) throw notFound('Bill');
    if (!['draft', 'hold'].includes(b.status)) throw businessRule('This bill is already finalized', 'ALREADY_FINALIZED');
    const plan: Plan = { channel: b.channel, storeId: String(b.storeId), customerId: b.customerId ? String(b.customerId) : undefined, customer: b.customer, billDiscount: 0, billDiscountInput: b.billDiscountInput, notes: b.notes, dueDate: b.dueDate,
      lines: b.lines.map((l: any) => ({ variantId: String(l.variantId), itemCode: l.itemCode, description: l.description, hsn: l.hsn ?? '', size: l.size ?? null, qty: l.qty, mrp: l.mrp, unitPrice: l.unitPrice, lineDiscount: l.lineDiscount, discountInput: l.discountInput, rate: l.rate ?? null, unitCostAtSale: 0 })) };
    plan.billDiscount = (b.lines as any[]).reduce((a, l) => a + (l.billDiscountShare ?? 0), 0);
    // refresh the rates at the bill date; prices stay as saved on the draft
    const gstOn = await isGstEnabled(session);
    for (const l of plan.lines) { const it: any = await Item.findOne({ _id: (await Variant.findById(l.variantId, { itemId: 1 }).session(session).lean() as any).itemId }).session(session).lean(); if (it?.hsn) l.rate = (await resolveGstRate({ hsn: it.hsn, unitPricePaise: l.unitPrice, override: it.gstRateOverride }, session))?.rate ?? null; if (gstOn && l.rate === null) throw badRequest(`GST rate is not known for ${l.itemCode}`); }
    return finalizeCore(user, plan, { ...input, draftId: id }, audit, session);
  });
  const dto = await getBill(out);
  audit({ entity: 'invoice', entityId: out, action: 'finalize', after: { invoiceNumber: dto.invoiceNumber, grandTotal: dto.grandTotal, tenders: dto.tenders } });
  return dto;
}

export async function createB2bInvoice(user: AuthUser, input: any, audit: Audit) {
  const gstOn = await isGstEnabled(); const biz = await business();
  const cust = await resolveCustomer(input, biz); const lines = await prepareLines(input.lines, new Date(), gstOn);
  const base = lines.reduce((a, l) => a + l.qty * l.unitPrice - l.lineDiscount, 0);
  const plan = { ...planFromInput({ ...input, channel: 'CNT' }, user, lines, cust, discountToPaise(input.billDiscount, base)), channel: 'CNT' as const };
  const id = await withTransaction((session) => finalizeCore(user, plan, { tenders: input.tenders, approval: input.approval }, audit, session));
  const dto = await getBill(id);
  audit({ entity: 'invoice', entityId: id, action: 'finalize', after: { invoiceNumber: dto.invoiceNumber, grandTotal: dto.grandTotal } });
  return dto;
}

/** A paid online order comes in as an ECM invoice. The shipping charge is a priced line without stock. Safe to retry (order number is unique). */
export async function createInbound(user: AuthUser, input: any, audit: Audit, session?: Session) {
  const couponDiscount = input.couponDiscount ?? 0;
  const existing: any = await SalesBill.findOne({ orderNumber: input.orderNumber }).lean();
  if (existing) return billDto(existing);
  const gstOn = await isGstEnabled(); const biz = await business();
  const store: any = input.storeId ? { _id: input.storeId } : await Store.findOne({ type: 'online', active: true }).lean();
  if (!store) throw badRequest('No online store exists');
  const cust = await resolveCustomer({ customerId: input.customerId, customer: input.customer }, biz);
  const lines = await prepareLines(input.lines.map((l: any) => ({ variantId: l.variantId, qty: l.qty, size: l.size, unitPrice: l.unitPrice, discount: l.discountAmount ? { type: 'amount', value: l.discountAmount } : undefined })), new Date(), gstOn);
  const plan: Plan = { channel: 'ECM', storeId: String(store._id), customerId: cust.id, customer: { ...cust.snap, address: input.shipTo || cust.snap.address }, lines, billDiscount: 0, billDiscountInput: null, notes: `Online order ${input.orderNumber}`, orderNumber: input.orderNumber };
  let shippingNote = '';
  if (input.shippingCharge > 0) shippingNote = `Shipping ${input.shippingCharge}`;
  const run = (s: Session) => finalizeCore(user, { ...plan, notes: `${plan.notes}${shippingNote ? ` | ${shippingNote}` : ''}` }, { tenders: input.tenders, walletPrepaid: input.walletPrepaid, extraBillDiscount: couponDiscount }, audit, s);
  // The shipping charge is part of what the customer paid, so the tenders must cover goods + shipping.
  const goods = calcInvoice(lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, lineDiscount: l.lineDiscount, rate: l.rate, hsn: l.hsn })), couponDiscount, { gstOn, supply: 'intra' }).totals.grandTotal;
  const paid = input.tenders.reduce((a: number, t: any) => a + t.amount, 0);
  if (paid !== goods + input.shippingCharge) throw businessRule(`Payments (${paid}) must equal goods (${goods}) plus shipping (${input.shippingCharge})`, 'PAYMENT_MISMATCH');
  // Shipping was paid on top of the goods. Take it off the LAST tender (the wallet is used first, the gateway or cash last).
  const tenders = input.tenders.map((t: any) => ({ ...t })); let ship = input.shippingCharge;
  for (let i = tenders.length - 1; i >= 0 && ship > 0; i--) { const cut = Math.min(ship, tenders[i].amount); tenders[i].amount -= cut; ship -= cut; }
  const kept = tenders.filter((t: any) => t.amount > 0); tenders.length = 0; tenders.push(...kept); input.tenders = tenders;
  const id = session ? await run(session) : await withTransaction(run);
  await SalesBill.updateOne({ _id: id }, { $set: { 'snapshot.shippingCharge': input.shippingCharge, 'snapshot.shipTo': input.shipTo } }, session ? { session } : {});
  const dto = billDto((await SalesBill.findById(id).session(session ?? null).lean()) as any); // inside a transaction the new invoice is only visible to that session
  audit({ entity: 'invoice', entityId: id, action: 'inbound_order', after: { invoiceNumber: dto.invoiceNumber, orderNumber: input.orderNumber } });
  return { ...dto, shippingCharge: input.shippingCharge };
}

// ---------- returns, exchanges, cancellation ----------
async function damagedStoreId(session: Session) {
  const s: any = await Store.findOneAndUpdate({ code: 'DAMAGED' }, { $setOnInsert: { code: 'DAMAGED', name: 'Damaged Stock', type: 'warehouse', active: true } }, { upsert: true, new: true, session }).lean();
  return String(s._id);
}
const returnDtoOf = (r: any) => ({ id: String(r._id), creditNoteNumber: r.creditNoteNumber, invoiceId: String(r.invoiceId), invoiceNumber: r.invoiceNumber, reason: r.reason, lines: r.lines, totals: r.totals, refundTotal: r.refundTotal, refunds: r.refunds, refundTo: r.refundTo, exchangeInvoiceId: r.exchangeInvoiceId ? String(r.exchangeInvoiceId) : null, isCancellation: !!r.isCancellation, currency: 'INR' as const, createdAt: iso(r.createdAt)! });

async function doReturn(user: AuthUser, b: any, input: any, opts: { cancel?: boolean }, audit: Audit, session: Session) {
  const settings = await getOperationsSettings(session);
  const ageH = (Date.now() - new Date(b.finalizedAt).getTime()) / 3600000;
  if (!opts.cancel && !input.skipChecks) {
    if (ageH > settings.returnWindowDays * 24) throw businessRule(`The ${settings.returnWindowDays} day return window has passed`, 'RETURN_WINDOW_PASSED');
    if (input.reason === 'defect' && b.channel === 'ECM' && ageH > settings.defectReportHours) throw businessRule(`Defects on online orders must be reported within ${settings.defectReportHours} hours`, 'DEFECT_WINDOW_PASSED');
  }
  const gstOn = b.gstMode === 'on'; const supply = b.supply ?? 'intra';
  const rlines: any[] = []; const want = opts.cancel ? b.lines.map((l: any) => ({ variantId: String(l.variantId), qty: l.qty - (l.returnedQty ?? 0) })).filter((l: any) => l.qty > 0) : input.lines;
  if (!want.length) throw businessRule('Nothing is left to return on this invoice', 'NOTHING_TO_RETURN');
  for (const [i, w] of want.entries()) {
    const l = b.lines.find((x: any) => String(x.variantId) === w.variantId);
    if (!l) throw badRequest('This item is not on the invoice', [{ path: `lines.${i}.variantId`, message: 'Not on the invoice' }]);
    if (w.qty > l.qty - (l.returnedQty ?? 0)) throw businessRule(`Only ${l.qty - (l.returnedQty ?? 0)} of ${l.itemCode} can still be returned`, 'RETURN_EXCEEDS_SALE');
    // Items sold at a discount are not returnable unless the client allows it (invoice terms, point 3)
    if (!opts.cancel && !input.skipChecks && !settings.returnDiscountedItems && (l.lineDiscount > 0 || l.billDiscountShare > 0)) throw businessRule(`${l.itemCode} was sold at a discount and cannot be returned or refunded`, 'NOT_RETURNABLE', [{ path: `lines.${i}.variantId`, message: 'Discounted items cannot be returned' }]);
    const net = w.qty === l.qty ? l.net : divRoundHalfUp(l.net * w.qty, l.qty);
    const rate = gstOn ? l.rate : null; const taxable = rate ? taxableOf(net, rate) : net;
    const half = rate ? divRoundHalfUp(taxable * Math.round(rate * 100), 20000) : 0; const ig = rate ? divRoundHalfUp(taxable * Math.round(rate * 100), 10000) : 0;
    rlines.push({ variantId: l.variantId, itemCode: l.itemCode, description: l.description, hsn: l.hsn, qty: w.qty, unitPrice: l.unitPrice, net, rate, taxable, cgst: supply === 'inter' ? 0 : half, sgst: supply === 'inter' ? 0 : half, igst: supply === 'inter' ? ig : 0, unitCost: l.unitCostAtSale ?? 0 });
  }
  const refundTotal = rlines.reduce((a, l) => a + l.net, 0);
  const totals = { taxable: rlines.reduce((a, l) => a + l.taxable, 0), cgst: rlines.reduce((a, l) => a + l.cgst, 0), sgst: rlines.reduce((a, l) => a + l.sgst, 0), igst: rlines.reduce((a, l) => a + l.igst, 0), net: refundTotal };
  const date = new Date(); const cnNumber = await nextNumber('CN', { date, session });
  const damaged = input.reason === 'defect' ? await damagedStoreId(session) : null;
  for (const l of rlines) {
    await postStock({ variantId: String(l.variantId), storeId: damaged ?? String(b.storeId), type: 'SALE_RETURN', qty: l.qty, unitCost: l.unitCost, docType: 'CREDIT_NOTE', docNumber: cnNumber, userId: user.id, at: date }, session);
    l.restockStoreId = damaged ?? b.storeId; l.damaged = !!damaged;
  }
  for (const l of b.lines) { const r = rlines.find((x) => String(x.variantId) === String(l.variantId)); if (r) l.returnedQty = (l.returnedQty ?? 0) + r.qty; }

  // Exchange: a new bill linked to this return. The credit pays for it; the difference is collected or refunded.
  let exchangeId: string | undefined; let creditUsed = 0;
  const [ret] = await SalesReturn.create([{ creditNoteNumber: cnNumber, invoiceId: b._id, invoiceNumber: b.invoiceNumber, channel: b.channel, customerId: b.customerId, customer: b.customer, reason: input.reason ?? 'other', note: input.note ?? '', gstMode: b.gstMode, lines: rlines, totals, refundTotal, refundTo: input.refundTo ?? 'original', isCancellation: !!opts.cancel, createdBy: user.id }], { session });
  if (input.exchange) {
    const lines = await prepareLines(input.exchange.lines, date, gstOn, session);
    const calc = calcInvoice(lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, lineDiscount: l.lineDiscount, rate: l.rate, hsn: l.hsn })), 0, { gstOn, supply });
    creditUsed = Math.min(refundTotal, calc.totals.grandTotal);
    const tenders = [{ mode: 'credit_note', amount: creditUsed, reference: cnNumber }, ...(input.exchange.tenders ?? [])].filter((t) => t.amount > 0);
    const plan: Plan = { channel: b.channel === 'ECM' ? 'ECM' : 'POS', storeId: String(b.storeId), customerId: b.customerId ? String(b.customerId) : undefined, customer: b.customer, lines, billDiscount: 0, billDiscountInput: null, notes: `Exchange for ${b.invoiceNumber}`, exchangeOfReturnId: String(ret!._id) };
    exchangeId = await finalizeCore(user, plan, { tenders }, audit, session);
  }
  const refundNow = refundTotal - creditUsed;
  const refunds: any[] = [];
  if (refundNow > 0) {
    if ((input.refundTo ?? 'original') === 'wallet' && b.customerId) {
      await WalletLedger.create([{ customerId: b.customerId, amount: refundNow, type: 'REFUND', docType: 'CREDIT_NOTE', docNumber: cnNumber }], { session });
      refunds.push({ mode: 'wallet', amount: refundNow });
    } else {
      const paidTenders = (b.tenders as any[]).filter((t) => t.mode !== 'credit_note');
      const shares = allocateProportionally(refundNow, paidTenders.map((t) => t.amount));
      paidTenders.forEach((t, i) => { if (shares[i]! > 0) refunds.push({ mode: t.mode, amount: shares[i], reference: t.reference }); });
      // money that was paid from the wallet goes back to the wallet
      const toWallet = refunds.filter((r) => r.mode === 'wallet').reduce((a, r) => a + r.amount, 0);
      if (toWallet > 0 && b.customerId) await WalletLedger.create([{ customerId: b.customerId, amount: toWallet, type: 'REFUND', docType: 'CREDIT_NOTE', docNumber: cnNumber }], { session });
      const toCredit = refunds.filter((r) => r.mode === 'credit').reduce((a, r) => a + r.amount, 0);
      if (toCredit) b.creditDue = Math.max(0, (b.creditDue ?? 0) - toCredit);
    }
  }
  await SalesReturn.updateOne({ _id: ret!._id }, { $set: { refunds, exchangeInvoiceId: exchangeId } }, { session });
  const set: any = { lines: b.lines, creditDue: b.creditDue }; if (opts.cancel) { set.status = 'cancelled'; set.cancelledAt = date; }
  await SalesBill.updateOne({ _id: b._id }, { $set: set, $inc: { version: 1 } }, { session });
  return String(ret!._id);
}

export async function createReturn(user: AuthUser, input: any, audit: Audit) {
  const id = await withTransaction(async (session) => {
    const b: any = input.invoiceId ? await SalesBill.findById(input.invoiceId).session(session) : await SalesBill.findOne({ invoiceNumber: input.invoiceNumber }).session(session);
    if (!b) throw notFound('Invoice');
    if (b.status !== 'finalized') throw businessRule(`This invoice is ${b.status}`, 'BAD_STATUS');
    return doReturn(user, b.toObject(), input, {}, audit, session);
  });
  const r: any = await SalesReturn.findById(id).lean();
  audit({ entity: 'credit_note', entityId: id, action: r.exchangeInvoiceId ? 'exchange' : 'return', after: { creditNoteNumber: r.creditNoteNumber, refundTotal: r.refundTotal, refunds: r.refunds } });
  return returnDtoOf(r);
}
export async function cancelInvoice(user: AuthUser, id: string, note: string, audit: Audit, refundTo: 'original' | 'wallet' = 'original') {
  const rid = await withTransaction(async (session) => {
    const b: any = await SalesBill.findById(id).session(session);
    if (!b) throw notFound('Invoice');
    if (b.status !== 'finalized') throw businessRule(`This invoice is ${b.status}`, 'BAD_STATUS');
    return doReturn(user, b.toObject(), { reason: 'other', note, refundTo }, { cancel: true }, audit, session);
  });
  const r: any = await SalesReturn.findById(rid).lean();
  audit({ entity: 'invoice', entityId: id, action: 'cancel', after: { creditNoteNumber: r.creditNoteNumber } });
  return returnDtoOf(r);
}
export async function listReturns(q: ListQuery) {
  const res = await paginate(SalesReturn, {}, q, parseSort(q.sort, ['createdAt'], { createdAt: -1 }), returnDtoOf);
  return res;
}

// ---------- shifts ----------
const shiftDto = (s: any) => ({ id: String(s._id), storeId: String(s.storeId), status: s.status, openingCash: s.openingCash, openedAt: iso(s.openedAt)!, closedAt: iso(s.closedAt), expectedCash: s.expectedCash ?? null, countedCash: s.countedCash ?? null, difference: s.difference ?? 0 });
export async function openShiftFor(user: AuthUser, input: any, audit: Audit) {
  if (await openShift(user, input.storeId)) throw businessRule('You already have an open shift at this store', 'SHIFT_OPEN');
  const s: any = await Shift.create({ storeId: input.storeId, cashierId: user.id, openingCash: input.openingCash });
  audit({ entity: 'shift', entityId: String(s._id), action: 'open', after: { openingCash: input.openingCash } });
  return shiftDto(s.toObject());
}
/** Expected cash = opening + cash sales - cash refunds (cash expenses are taken off in B4). */
export async function closeShiftFor(user: AuthUser, id: string, input: any, audit: Audit) {
  const s: any = await Shift.findOne({ _id: id, status: 'open' });
  if (!s) throw notFound('Open shift');
  if (String(s.cashierId) !== user.id && !user.isAdmin) throw forbidden('This is another cashier\'s shift');
  const bills: any[] = await SalesBill.find({ shiftId: s._id, status: { $in: ['finalized', 'cancelled'] } }, { tenders: 1, invoiceNumber: 1 }).lean();
  const cashIn = bills.reduce((a, b) => a + b.tenders.filter((t: any) => t.mode === 'cash').reduce((x: number, t: any) => x + t.amount, 0), 0);
  const rets: any[] = await SalesReturn.find({ createdBy: user.id, createdAt: { $gte: s.openedAt } }, { refunds: 1 }).lean();
  const cashOut = rets.reduce((a, r) => a + (r.refunds ?? []).filter((x: any) => x.mode === 'cash').reduce((y: number, x: any) => y + x.amount, 0), 0);
  s.status = 'closed'; s.closedAt = new Date(); s.countedCash = input.countedCash; s.expectedCash = s.openingCash + cashIn - cashOut; s.difference = input.countedCash - s.expectedCash; s.note = input.note;
  await s.save();
  audit({ entity: 'shift', entityId: id, action: 'close', after: { expected: s.expectedCash, counted: s.countedCash, difference: s.difference } });
  return shiftDto(s.toObject());
}
export async function currentShift(user: AuthUser, storeId: string) { const s = await openShift(user, storeId); return s ? shiftDto(s) : null; }

// ---------- loyalty ----------
export async function redeemLoyalty(customerId: string, points: number, audit: Audit) {
  const settings = await getOperationsSettings();
  if (!settings.loyalty.enabled) throw businessRule('Loyalty is not switched on in Settings', 'LOYALTY_OFF');
  const c = await Customer.findById(customerId).lean(); if (!c) throw notFound('Customer');
  if (points < settings.loyalty.minRedeem) throw businessRule(`The minimum to redeem is ${settings.loyalty.minRedeem} points`, 'BELOW_MIN_REDEEM');
  const r = await withTransaction(async (session) => {
    if (points > (await loyaltyBalance(customerId, session))) throw businessRule('Not enough loyalty points', 'INSUFFICIENT_POINTS');
    const value = points * settings.loyalty.pointValuePaise;
    await LoyaltyLedger.create([{ customerId, points: -points, type: 'REDEEM', docType: 'WALLET' }], { session });
    await WalletLedger.create([{ customerId, amount: value, type: 'CREDIT', docType: 'LOYALTY' }], { session });
    return { points, value, loyaltyBalance: await loyaltyBalance(customerId, session), walletBalance: await walletBalance(customerId, session) };
  });
  audit({ entity: 'customer', entityId: customerId, action: 'loyalty_redeem', after: r });
  return r;
}
export const _user = User;
