import type { ListQuery } from '@thunikart/shared';
import { Grn, PurchaseBill, PurchaseReturn, Vendor, VendorPayment } from '../../models';
import { AppError, badRequest, businessRule, notFound } from '../../lib/errors';
import { withTransaction } from '../../lib/transaction';
import { nextNumber } from '../../lib/numberSeries';
import { calcPurchaseLine, sumLines, termDays } from '../../lib/purchaseTax';
import { postStock } from '../../lib/stock';
import { escapeRegex, paginate, parseSort } from '../../lib/list';
import type { AuthUser } from '../../middleware/auth';
import type { AuditEntry } from '../../middleware/audit';
import { iso, loadVendor, namesFor, taxModeFor, totalsOf } from './purchase.common';

type Audit = (e: AuditEntry) => void;
const DAY = 86400000;

// ---------- purchase bills ----------
const outstandingOf = (b: any) => b.grandTotal - (b.paid ?? 0) - (b.debitNotes ?? 0);

export function billDto(b: any, vendorName: string) {
  return {
    id: String(b._id), billNumber: b.billNumber, vendorBillNo: b.vendorBillNo, vendorId: String(b.vendorId), vendorName, billDate: iso(b.billDate)!, dueDate: iso(b.dueDate)!,
    paymentTerms: b.paymentTerms ?? '', grnIds: (b.grnIds ?? []).map(String), grnNumbers: b.grnNumbers ?? [],
    lines: b.lines.map((l: any) => ({ variantId: String(l.variantId), itemCode: l.itemCode, description: l.description, acceptedQty: l.acceptedQty, unitCost: l.unitCost, discountPercent: l.discountPercent ?? 0, gstRate: l.gstRate ?? null, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, total: l.total })),
    totals: totalsOf(b.totals), freight: b.freight ?? 0, otherCharges: b.otherCharges ?? 0, roundOff: b.roundOff ?? 0, grandTotal: b.grandTotal, gstMode: b.gstMode, supply: b.supply ?? null,
    inputTaxCredit: b.inputTaxCredit ?? 0, paid: b.paid ?? 0, debitNotes: b.debitNotes ?? 0, outstanding: outstandingOf(b), notes: b.notes ?? '', createdAt: iso(b.createdAt)!,
  };
}

export async function getBill(id: string) {
  const b: any = await PurchaseBill.findById(id).lean();
  if (!b) throw notFound('Purchase bill');
  const v: any = await Vendor.findById(b.vendorId, { name: 1 }).lean();
  return billDto(b, v?.name ?? '');
}

export async function listBills(q: ListQuery & { vendorId?: string; billStatus?: string }) {
  const f: any = {};
  if (q.vendorId) f.vendorId = q.vendorId;
  if (q.from || q.to) f.billDate = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  if (q.q) { const r = new RegExp(escapeRegex(q.q), 'i'); f.$or = [{ billNumber: r }, { vendorBillNo: r }]; }
  if (q.billStatus === 'open') f.$expr = { $gt: [{ $subtract: [{ $subtract: ['$grandTotal', '$paid'] }, '$debitNotes'] }, 0] };
  if (q.billStatus === 'paid') f.$expr = { $lte: [{ $subtract: [{ $subtract: ['$grandTotal', '$paid'] }, '$debitNotes'] }, 0] };
  const res = await paginate(PurchaseBill, f, q, parseSort(q.sort, ['billDate', 'billNumber', 'dueDate'], { billDate: -1 }), (b) => b);
  const names = await namesFor(res.items.map((b: any) => String(b.vendorId)), []);
  return { ...res, items: res.items.map((b: any) => billDto(b, names.vendor.get(String(b.vendorId))?.name ?? '')) };
}

/** Unbilled quantity of a GRN line: accepted, less what is billed, less what was returned before billing. */
const unbilledQty = (l: any) => Math.max(0, l.acceptedQty - (l.billedQty ?? 0) - (l.returnedQty ?? 0));

/**
 * A purchase bill is made from one or more GRNs. Its lines are the unbilled accepted quantities of those GRNs.
 * The vendor's bill number is unique per vendor, so a bill cannot be entered twice.
 */
export async function createBill(user: AuthUser, input: any, audit: Audit) {
  // Duplicate vendor bill numbers are blocked up front (the unique index also guards against two at the same moment).
  if (await PurchaseBill.exists({ vendorId: input.vendorId, vendorBillKey: input.vendorBillNo.trim().toLowerCase() })) {
    throw new AppError(409, 'DUPLICATE', `Bill ${input.vendorBillNo} was already entered for this vendor`, [{ path: 'vendorBillNo', message: 'Already entered for this vendor' }]);
  }
  const id = await withTransaction(async (session) => {
    const vendor = await loadVendor(input.vendorId, session);
    const grns: any[] = await Grn.find({ _id: { $in: input.grnIds } }).session(session);
    if (grns.length !== new Set(input.grnIds).size) throw badRequest('A GRN was not found', [{ path: 'grnIds', message: 'Choose existing GRNs' }]);
    for (const g of grns) if (String(g.vendorId) !== input.vendorId) throw badRequest(`${g.grnNumber} belongs to a different vendor`, [{ path: 'grnIds', message: 'All GRNs must be from this vendor' }]);
    const mode = await taxModeFor(vendor, session);
    const lines: any[] = [];
    for (const g of grns) {
      for (const l of g.lines) {
        const qty = unbilledQty(l);
        if (qty <= 0) continue;
        lines.push({ variantId: l.variantId, itemCode: l.itemCode, description: l.description, acceptedQty: qty, ...{ qty, unitCost: l.unitCost, discountPercent: l.discountPercent, gstRate: l.gstRate }, ...calcPurchaseLine({ qty, unitCost: l.unitCost, discountPercent: l.discountPercent ?? 0, gstRate: l.gstRate ?? null }, { gstOn: g.gstMode === 'on', supply: g.supply }) });
        l.billedQty = (l.billedQty ?? 0) + qty;
      }
    }
    if (!lines.length) throw businessRule('Everything on these GRNs is already billed', 'NOTHING_TO_BILL');
    for (const g of grns) {
      g.status = g.lines.every((l: any) => unbilledQty(l) === 0) ? 'billed' : 'partly_billed';
      g.markModified('lines');
      await g.save({ session });
    }
    const totals = sumLines(lines);
    const billDate = new Date(input.billDate);
    const grandTotal = totals.total + (input.freight ?? 0) + (input.otherCharges ?? 0) + (input.roundOff ?? 0);
    const [bill] = await PurchaseBill.create([{
      billNumber: await nextNumber('PB', { date: billDate, session }), vendorBillNo: input.vendorBillNo, vendorBillKey: input.vendorBillNo.trim().toLowerCase(), vendorId: input.vendorId,
      billDate, dueDate: new Date(billDate.getTime() + termDays(vendor.paymentTerms) * DAY), paymentTerms: vendor.paymentTerms, grnIds: grns.map((g) => g._id), grnNumbers: grns.map((g) => g.grnNumber),
      lines, totals, freight: input.freight ?? 0, otherCharges: input.otherCharges ?? 0, roundOff: input.roundOff ?? 0, grandTotal, gstMode: mode.gstMode, supply: mode.supply,
      // Input tax credit is kept only while GST is on. With GST off the full amount is cost and no credit exists.
      inputTaxCredit: mode.gstOn ? totals.tax : 0, notes: input.notes ?? '', createdBy: user.id,
    }], { session });
    return String(bill!._id);
  });
  const dto = await getBill(id);
  audit({ entity: 'purchase_bill', entityId: id, action: 'create', after: { billNumber: dto.billNumber, vendorBillNo: dto.vendorBillNo, grandTotal: dto.grandTotal } });
  return dto;
}

// ---------- purchase returns and debit notes ----------
export function returnDto(r: any, vendorName: string) {
  return {
    id: String(r._id), returnNumber: r.returnNumber, debitNoteNumber: r.debitNoteNumber, vendorId: String(r.vendorId), vendorName, billId: r.billId ? String(r.billId) : null,
    billNumber: r.billNumber ?? null, grnId: r.grnId ? String(r.grnId) : null, storeId: String(r.storeId), reason: r.reason,
    lines: r.lines.map((l: any) => ({ variantId: String(l.variantId), itemCode: l.itemCode, qty: l.qty, unitCost: l.unitCost, gstRate: l.gstRate ?? null, gross: l.gross, discount: l.discount, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, total: l.total })),
    totals: totalsOf(r.totals), gstMode: r.gstMode, createdAt: iso(r.createdAt)!,
  };
}
export async function getReturn(id: string) {
  const r: any = await PurchaseReturn.findById(id).lean();
  if (!r) throw notFound('Purchase return');
  const v: any = await Vendor.findById(r.vendorId, { name: 1 }).lean();
  return returnDto(r, v?.name ?? '');
}
export async function listReturns(q: ListQuery & { vendorId?: string }) {
  const f: any = q.vendorId ? { vendorId: q.vendorId } : {};
  if (q.q) { const r = new RegExp(escapeRegex(q.q), 'i'); f.$or = [{ returnNumber: r }, { debitNoteNumber: r }]; }
  const res = await paginate(PurchaseReturn, f, q, parseSort(q.sort, ['createdAt', 'returnNumber'], { createdAt: -1 }), (r) => r);
  const names = await namesFor(res.items.map((r: any) => String(r.vendorId)), []);
  return { ...res, items: res.items.map((r: any) => returnDto(r, names.vendor.get(String(r.vendorId))?.name ?? '')) };
}

/**
 * Return goods to a vendor, against a bill (already billed) or a GRN (not billed yet), with a reason.
 * It removes the stock (PURCHASE_RETURN rows), makes a debit note, and cuts the vendor's outstanding.
 */
export async function createReturn(user: AuthUser, input: any, audit: Audit) {
  if (!!input.billId === !!input.grnId) throw badRequest('Choose either a bill or a GRN to return against', [{ path: 'billId', message: 'Send billId or grnId, not both' }]);
  const id = await withTransaction(async (session) => {
    const bill: any = input.billId ? await PurchaseBill.findById(input.billId).session(session) : null;
    if (input.billId && !bill) throw notFound('Purchase bill');
    const grns: any[] = await Grn.find({ _id: { $in: bill ? bill.grnIds : [input.grnId] } }).session(session);
    if (!grns.length) throw notFound('GRN');
    const vendorId = String(grns[0].vendorId);
    const storeId = input.storeId ?? String(grns[0].storeId);
    const lines: any[] = [];
    for (const [i, rl] of input.lines.entries()) {
      let remaining = rl.qty; const parts: any[] = [];
      for (const g of grns) {
        const gl = g.lines.find((x: any) => String(x.variantId) === rl.variantId);
        if (!gl || remaining <= 0) continue;
        const room = bill ? (gl.billedQty ?? 0) - (gl.returnedBilledQty ?? 0) : unbilledQty(gl);
        const take = Math.min(room, remaining);
        if (take <= 0) continue;
        if (bill) gl.returnedBilledQty = (gl.returnedBilledQty ?? 0) + take; else gl.returnedQty = (gl.returnedQty ?? 0) + take;
        remaining -= take;
        parts.push({ g, gl, take });
        g.markModified('lines');
      }
      if (remaining > 0) throw businessRule(`Cannot return ${rl.qty} of this item: only ${rl.qty - remaining} can be returned against this ${bill ? 'bill' : 'GRN'}`, 'RETURN_EXCEEDS_RECEIPT', [{ path: `lines.${i}.qty`, message: 'More than was received and not yet returned' }]);
      for (const { g, gl, take } of parts) {
        lines.push({ variantId: gl.variantId, itemCode: gl.itemCode, landedUnitCost: gl.landedUnitCost, qty: take, unitCost: gl.unitCost, discountPercent: gl.discountPercent, gstRate: gl.gstRate,
          ...calcPurchaseLine({ qty: take, unitCost: gl.unitCost, discountPercent: gl.discountPercent ?? 0, gstRate: gl.gstRate ?? null }, { gstOn: g.gstMode === 'on', supply: g.supply }) });
      }
    }
    for (const g of grns) await g.save({ session });
    const date = new Date();
    const returnNumber = await nextNumber('PR', { date, session }); const debitNoteNumber = await nextNumber('DN', { date, session });
    const totals = sumLines(lines);
    const [ret] = await PurchaseReturn.create([{
      returnNumber, debitNoteNumber, vendorId, billId: bill?._id, billNumber: bill?.billNumber, grnId: input.grnId, storeId, reason: input.reason,
      lines: lines.map(({ landedUnitCost: _l, discountPercent: _d, ...rest }) => ({ ...rest })), totals, gstMode: grns[0].gstMode, createdBy: user.id,
    }], { session });
    for (const l of lines) {
      await postStock({ variantId: String(l.variantId), storeId, type: 'PURCHASE_RETURN', qty: -l.qty, unitCost: l.landedUnitCost, docType: 'PURCHASE_RETURN', docNumber: returnNumber, docId: String(ret!._id), userId: user.id, at: date }, session);
    }
    if (bill) { bill.debitNotes = (bill.debitNotes ?? 0) + totals.total; await bill.save({ session }); }
    return String(ret!._id);
  });
  const dto = await getReturn(id);
  audit({ entity: 'purchase_return', entityId: id, action: 'create', after: { returnNumber: dto.returnNumber, debitNoteNumber: dto.debitNoteNumber, total: dto.totals.total } });
  return dto;
}

// ---------- vendor payments ----------
export function paymentDto(p: any, vendorName: string) {
  const allocated = (p.allocations ?? []).reduce((a: number, x: any) => a + x.amount, 0);
  return {
    id: String(p._id), paymentNumber: p.paymentNumber, vendorId: String(p.vendorId), vendorName, date: iso(p.date)!, mode: p.mode, reference: p.reference ?? '',
    amount: p.amount, allocated, advance: p.amount - allocated, allocations: (p.allocations ?? []).map((a: any) => ({ billId: String(a.billId), billNumber: a.billNumber, amount: a.amount })), currency: 'INR' as const, createdAt: iso(p.createdAt)!,
  };
}

/** Part payment and advance payment are allowed. Anything not allocated to a bill stays as the vendor's advance. */
export async function createPayment(user: AuthUser, input: any, audit: Audit) {
  const id = await withTransaction(async (session) => {
    await loadVendor(input.vendorId, session);
    const total = input.allocations.reduce((a: number, x: any) => a + x.amount, 0);
    if (total > input.amount) throw badRequest('Allocations are more than the amount paid', [{ path: 'allocations', message: `Allocated ${total} but paid ${input.amount}` }]);
    const billIds = input.allocations.map((a: any) => a.billId);
    if (new Set(billIds).size !== billIds.length) throw badRequest('A bill is listed twice', [{ path: 'allocations', message: 'List each bill once' }]);
    const allocations = [];
    for (const [i, a] of input.allocations.entries()) {
      // Conditional update: two payments at the same moment cannot both settle the same balance.
      const b: any = await PurchaseBill.findOneAndUpdate(
        { _id: a.billId, vendorId: input.vendorId, $expr: { $gte: [{ $subtract: [{ $subtract: ['$grandTotal', '$paid'] }, '$debitNotes'] }, a.amount] } },
        { $inc: { paid: a.amount } }, { new: true, session }).lean();
      if (!b) {
        const cur: any = await PurchaseBill.findOne({ _id: a.billId, vendorId: input.vendorId }).session(session).lean();
        if (!cur) throw badRequest('Bill not found for this vendor', [{ path: `allocations.${i}.billId`, message: 'Not a bill of this vendor' }]);
        throw businessRule(`${cur.billNumber} has only ${outstandingOf(cur)} outstanding`, 'OVER_PAYMENT', [{ path: `allocations.${i}.amount`, message: `Outstanding is ${outstandingOf(cur)}` }]);
      }
      allocations.push({ billId: b._id, billNumber: b.billNumber, amount: a.amount });
    }
    const date = new Date(input.date);
    const [p] = await VendorPayment.create([{ paymentNumber: await nextNumber('VP', { date, session }), vendorId: input.vendorId, date, mode: input.mode, reference: input.reference ?? '', amount: input.amount, allocations, notes: input.notes ?? '', createdBy: user.id }], { session });
    return String(p!._id);
  });
  const p: any = await VendorPayment.findById(id).lean();
  const v: any = await Vendor.findById(p.vendorId, { name: 1 }).lean();
  const dto = paymentDto(p, v?.name ?? '');
  audit({ entity: 'vendor_payment', entityId: id, action: 'create', after: dto });
  return dto;
}

export async function listPayments(q: ListQuery & { vendorId?: string }) {
  const f: any = q.vendorId ? { vendorId: q.vendorId } : {};
  if (q.from || q.to) f.date = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  const res = await paginate(VendorPayment, f, q, parseSort(q.sort, ['date', 'paymentNumber'], { date: -1 }), (p) => p);
  const names = await namesFor(res.items.map((p: any) => String(p.vendorId)), []);
  return { ...res, items: res.items.map((p: any) => paymentDto(p, names.vendor.get(String(p.vendorId))?.name ?? '')) };
}

// ---------- outstanding and ageing ----------
const istDay = (d: Date) => Math.floor((d.getTime() + 5.5 * 3600 * 1000) / DAY);

/** Vendor outstanding = bills - debit notes - payments, with ageing from the DUE date (current, 0-30, 31-60, 61-90, over 90). */
export async function vendorOutstanding(vendorId: string, asOf = new Date()) {
  const v: any = await Vendor.findById(vendorId).lean();
  if (!v) throw notFound('Vendor');
  const bills: any[] = await PurchaseBill.find({ vendorId }).sort({ dueDate: 1 }).lean();
  const payments: any[] = await VendorPayment.find({ vendorId }, { amount: 1, allocations: 1 }).lean();
  const ageing = { current: 0, d0_30: 0, d31_60: 0, d61_90: 0, over90: 0 };
  const rows = [];
  let billed = 0, debit = 0, paidOnBills = 0, outstanding = 0;
  for (const b of bills) {
    const out = outstandingOf(b);
    billed += b.grandTotal; debit += b.debitNotes ?? 0; paidOnBills += b.paid ?? 0;
    const over = istDay(asOf) - istDay(b.dueDate);
    if (out > 0) {
      outstanding += out;
      if (over < 0) ageing.current += out; else if (over <= 30) ageing.d0_30 += out; else if (over <= 60) ageing.d31_60 += out; else if (over <= 90) ageing.d61_90 += out; else ageing.over90 += out;
    }
    rows.push({ billId: String(b._id), billNumber: b.billNumber, vendorBillNo: b.vendorBillNo, billDate: iso(b.billDate)!, dueDate: iso(b.dueDate)!, total: b.grandTotal, debitNotes: b.debitNotes ?? 0, paid: b.paid ?? 0, outstanding: out, daysOverdue: Math.max(0, over) });
  }
  const advance = payments.reduce((a, p) => a + p.amount - (p.allocations ?? []).reduce((x: number, y: any) => x + y.amount, 0), 0);
  return {
    vendorId, vendorName: v.name, paymentTerms: v.paymentTerms ?? '', billed, debitNotes: debit, paid: paidOnBills, outstanding, advance, netPayable: outstanding - advance, currency: 'INR' as const,
    ageing, bills: rows.filter((r) => r.outstanding > 0),
  };
}

