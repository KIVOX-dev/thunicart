import type { ListQuery } from '@thunikart/shared';
import { Grn, PurchaseOrder, Variant } from '../../models';
import { badRequest, businessRule, forbidden, notFound } from '../../lib/errors';
import { withTransaction } from '../../lib/transaction';
import { nextBatchNumber, noteBatchRef, prepareBatchSeries } from '../../lib/batchNumber';
import { nextNumber } from '../../lib/numberSeries';
import { allocateProportionally, divRoundHalfUp } from '../../lib/money';
import { sumLines } from '../../lib/purchaseTax';
import { postStock, totalOnHand, weightedAverageCost } from '../../lib/stock';
import { escapeRegex, paginate, parseSort } from '../../lib/list';
import type { AuthUser } from '../../middleware/auth';
import type { AuditEntry } from '../../middleware/audit';
import { describe, iso, lineFields, loadStore, loadVendor, namesFor, rateFor, taxModeFor, totalsOf, variantContext } from './purchase.common';

type Audit = (e: AuditEntry) => void;

export function grnDto(g: any, names: Awaited<ReturnType<typeof namesFor>>, poNumber: string | null = null) {
  const vendor = names.vendor.get(String(g.vendorId)); const store = names.store.get(String(g.storeId));
  return {
    id: String(g._id), grnNumber: g.grnNumber, status: g.status, poId: g.poId ? String(g.poId) : null, poNumber,
    vendorId: String(g.vendorId), vendorName: vendor?.name ?? '', vendorStateCode: vendor?.stateCode ?? '', storeId: String(g.storeId), storeName: store?.name ?? '',
    vendorInvoiceNo: g.vendorInvoiceNo, vendorInvoiceDate: iso(g.vendorInvoiceDate)!, date: iso(g.date)!,
    lines: g.lines.map((l: any) => ({
      id: String(l._id), poLineId: l.poLineId ? String(l.poLineId) : null, variantId: String(l.variantId), itemCode: l.itemCode, description: l.description,
      orderedQty: l.orderedQty ?? null, receivedQty: l.receivedQty, rejectedQty: l.rejectedQty ?? 0, acceptedQty: l.acceptedQty, unitCost: l.unitCost, discountPercent: l.discountPercent ?? 0,
      gstRate: l.gstRate ?? null, gross: l.gross, discount: l.discount, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, total: l.total, landedUnitCost: l.landedUnitCost,
      batchRef: l.batchRef ?? null, binLocation: l.binLocation ?? null, billedQty: l.billedQty ?? 0, returnedQty: (l.returnedQty ?? 0) + (l.returnedBilledQty ?? 0),
    })),
    freight: g.freight ?? 0, totals: totalsOf(g.totals), gstMode: g.gstMode, supply: g.supply ?? null, overReceiptApproved: !!g.overReceiptApproved, notes: g.notes ?? '', createdAt: iso(g.createdAt)!,
  };
}

export async function getGrn(id: string) {
  const g: any = await Grn.findById(id).lean();
  if (!g) throw notFound('GRN');
  const po: any = g.poId ? await PurchaseOrder.findById(g.poId, { poNumber: 1 }).lean() : null;
  return grnDto(g, await namesFor([String(g.vendorId)], [String(g.storeId)]), po?.poNumber ?? null);
}

export async function listGrns(q: ListQuery & { vendorId?: string; grnStatus?: string }) {
  const f: any = {};
  if (q.vendorId) f.vendorId = q.vendorId;
  if (q.grnStatus) f.status = q.grnStatus;
  if (q.from || q.to) f.date = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  if (q.q) { const r = new RegExp(escapeRegex(q.q), 'i'); f.$or = [{ grnNumber: r }, { vendorInvoiceNo: r }]; }
  const res = await paginate(Grn, f, q, parseSort(q.sort, ['date', 'grnNumber', 'createdAt'], { date: -1 }), (g) => g);
  const names = await namesFor(res.items.map((g: any) => String(g.vendorId)), res.items.map((g: any) => String(g.storeId)));
  return { ...res, items: res.items.map((g: any) => grnDto(g, names)) };
}

/**
 * Receive goods. Only ACCEPTED quantity (received minus rejected) enters stock. One transaction:
 * GRN number, GRN document, GRN ledger rows, balances, weighted average cost, bin, and the PO update all save together or not at all.
 */
export async function createGrn(user: AuthUser, input: any, audit: Audit) {
  await prepareBatchSeries();
  const id = await withTransaction(async (session) => {
    const po: any = input.poId ? await PurchaseOrder.findById(input.poId).session(session) : null;
    if (input.poId) {
      if (!po) throw notFound('Purchase order');
      if (!['sent', 'partly_received'].includes(po.status)) throw businessRule(`Goods can only be received against a sent or partly received order (this one is ${po.status.replace('_', ' ')})`, 'PO_NOT_RECEIVABLE');
      if (input.vendorId && input.vendorId !== String(po.vendorId)) throw badRequest('This vendor is not the vendor on the order', [{ path: 'vendorId', message: 'Does not match the purchase order' }]);
    }
    const vendorId = po ? String(po.vendorId) : input.vendorId;
    if (!vendorId) throw badRequest('A vendor or a purchase order is required', [{ path: 'vendorId', message: 'Required for a direct receipt' }]);
    const vendor = await loadVendor(vendorId, session);
    const storeId = input.storeId ?? (po ? String(po.storeId) : undefined);
    if (!storeId) throw badRequest('Store is required', [{ path: 'storeId', message: 'Required for a direct receipt' }]);
    await loadStore(storeId, session);
    const mode = await taxModeFor(vendor, session);
    const date = new Date();

    const ids = input.lines.map((l: any) => l.variantId);
    if (new Set(ids).size !== ids.length) throw badRequest('A variant is on this receipt twice', [{ path: 'lines', message: 'Combine duplicate variants into one line' }]);
    const ctx = await variantContext(ids, session);
    const built: any[] = []; let over = false;
    for (const [i, l] of input.lines.entries()) {
      const c = ctx.get(l.variantId);
      if (!c) throw badRequest('Variant not found', [{ path: `lines.${i}.variantId`, message: 'Choose an existing variant' }]);
      if (l.rejectedQty > l.receivedQty) throw badRequest('Rejected quantity is more than received', [{ path: `lines.${i}.rejectedQty`, message: 'Cannot exceed received quantity' }]);
      const accepted = l.receivedQty - l.rejectedQty;
      let poLine: any = null;
      if (po) {
        poLine = po.lines.find((x: any) => (l.poLineId ? String(x._id) === l.poLineId : String(x.variantId) === l.variantId));
        if (!poLine) throw badRequest(`${c.v.itemCode} is not on this purchase order`, [{ path: `lines.${i}.variantId`, message: 'Not on the order' }]);
        if ((poLine.receivedQty ?? 0) + accepted > poLine.qty) over = true;
      } else if (l.unitCost === undefined) throw badRequest('Unit cost is required for a direct receipt', [{ path: `lines.${i}.unitCost`, message: 'Required without a purchase order' }]);
      const unitCost = l.unitCost ?? poLine.unitCost;
      const discountPercent = l.discountPercent ?? poLine?.discountPercent ?? 0;
      const rate = await rateFor(l.gstRate ?? poLine?.gstRate, c, unitCost, mode, date, `lines.${i}.gstRate`, session);
      const calc = lineFields({ qty: accepted, unitCost, discountPercent, gstRate: rate }, mode);
      built.push({ l, c, poLine, accepted, ...calc, unitCost, discountPercent, gstRate: rate });
    }
    if (over) {
      if (!input.approveOverReceipt) throw businessRule('More was received than ordered. An approver must confirm it (approveOverReceipt).', 'OVER_RECEIPT_NEEDS_APPROVAL');
      if (!user.permissions.has('purchase.approve')) throw forbidden('You need the purchase.approve permission to accept more than was ordered');
    }
    if (built.every((b) => b.accepted === 0)) throw businessRule('Nothing was accepted, so nothing can be received', 'NOTHING_ACCEPTED');

    // Freight (ex GST) is shared across the accepted lines by value and becomes part of the landed cost.
    const share = allocateProportionally(input.freight ?? 0, built.map((b) => b.taxable));
    const grnNumber = await nextNumber('GRN', { date, session });
    // Every receipt gets a batch number automatically for the lines that do not carry one. A number typed by the person is kept and the series moves past it.
    for (const b of built) await noteBatchRef(b.l.batchRef);
    const autoBatch = built.some((b) => !b.l.batchRef) ? await nextBatchNumber({ date, session }) : null;
    const lines = built.map((b, i) => ({
      poLineId: b.poLine?._id, variantId: b.l.variantId, itemCode: b.c.v.itemCode, description: describe(b.c), orderedQty: b.poLine ? b.poLine.qty : null,
      receivedQty: b.l.receivedQty, rejectedQty: b.l.rejectedQty, acceptedQty: b.accepted, qty: b.accepted, unitCost: b.unitCost, discountPercent: b.discountPercent, gstRate: b.gstRate,
      gross: b.gross, discount: b.discount, taxable: b.taxable, cgst: b.cgst, sgst: b.sgst, igst: b.igst, total: b.total,
      landedUnitCost: b.accepted > 0 ? divRoundHalfUp(b.taxable + share[i]!, b.accepted) : b.unitCost, batchRef: b.l.batchRef ?? autoBatch ?? undefined, binLocation: b.l.binLocation,
    }));
    const [grn] = await Grn.create([{
      grnNumber, status: 'open', poId: po?._id, vendorId, storeId, vendorInvoiceNo: input.vendorInvoiceNo, vendorInvoiceDate: new Date(input.vendorInvoiceDate), date, lines,
      freight: input.freight ?? 0, totals: sumLines(lines), gstMode: mode.gstMode, supply: mode.supply, overReceiptApproved: over, notes: input.notes ?? '', createdBy: user.id,
    }], { session });

    for (const l of lines) {
      if (l.acceptedQty <= 0) continue;
      // Weighted average cost over everything on hand in every store, BEFORE this receipt lands.
      const existingQty = await totalOnHand(l.variantId, session);
      const v: any = await Variant.findById(l.variantId, { baseCost: 1 }).session(session).lean();
      const baseCost = weightedAverageCost(existingQty, v.baseCost ?? 0, l.acceptedQty, l.landedUnitCost);
      await postStock({ variantId: l.variantId, storeId, type: 'GRN', qty: l.acceptedQty, unitCost: l.landedUnitCost, docType: 'GRN', docNumber: grnNumber, docId: String(grn!._id), userId: user.id, at: date }, session);
      const set: any = { baseCost };
      if (l.binLocation) set.binLocation = l.binLocation;
      if (l.batchRef) set.batchRef = l.batchRef;
      await Variant.updateOne({ _id: l.variantId }, { $set: set }, { session });
    }
    if (po) {
      for (const b of built) { if (b.accepted > 0) b.poLine.receivedQty = (b.poLine.receivedQty ?? 0) + b.accepted; }
      const status = po.lines.every((x: any) => (x.receivedQty ?? 0) >= x.qty) ? 'closed' : 'partly_received';
      await PurchaseOrder.updateOne({ _id: po._id }, { $set: { lines: po.toObject().lines, status }, $inc: { version: 1 } }, { session });
    }
    return String(grn!._id);
  });
  const dto = await getGrn(id);
  audit({ entity: 'grn', entityId: id, action: 'receive', after: { grnNumber: dto.grnNumber, vendorId: dto.vendorId, totals: dto.totals, lines: dto.lines.map((l: any) => ({ itemCode: l.itemCode, acceptedQty: l.acceptedQty, landedUnitCost: l.landedUnitCost })) } });
  return dto;
}
