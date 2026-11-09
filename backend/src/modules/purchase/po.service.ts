import mongoose from 'mongoose';
import { PurchaseOrder } from '../../models';
import type { ListQuery } from '@thunikart/shared';
import { AppError, badRequest, businessRule, notFound } from '../../lib/errors';
import { withTransaction } from '../../lib/transaction';
import { nextNumber } from '../../lib/numberSeries';
import { escapeRegex, paginate, parseSort } from '../../lib/list';
import { sumLines } from '../../lib/purchaseTax';
import { getOperationsSettings } from '../../lib/stock';
import type { AuditEntry } from '../../middleware/audit';
import { describe, iso, lineFields, loadStore, loadVendor, namesFor, rateFor, taxModeFor, totalsOf, variantContext } from './purchase.common';

type Audit = (e: AuditEntry) => void;

export function poDto(po: any, names: Awaited<ReturnType<typeof namesFor>>) {
  const vendor = names.vendor.get(String(po.vendorId)); const store = names.store.get(String(po.storeId));
  return {
    id: String(po._id), poNumber: po.poNumber, status: po.status, vendorId: String(po.vendorId), vendorName: vendor?.name ?? '', vendorStateCode: vendor?.stateCode ?? '',
    storeId: String(po.storeId), storeName: store?.name ?? '', date: iso(po.date)!, expectedDate: iso(po.expectedDate),
    lines: (po.lines ?? []).map((l: any) => ({
      id: String(l._id), variantId: String(l.variantId), itemCode: l.itemCode, description: l.description, qty: l.qty, receivedQty: l.receivedQty ?? 0, pendingQty: Math.max(0, l.qty - (l.receivedQty ?? 0)),
      unitCost: l.unitCost, discountPercent: l.discountPercent ?? 0, gstRate: l.gstRate ?? null, gross: l.gross, discount: l.discount, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, total: l.total,
    })),
    totals: totalsOf(po.totals), gstMode: po.gstMode, supply: po.supply ?? null, terms: po.terms ?? '', notes: po.notes ?? '',
    requiresApproval: !!po.requiresApproval, approvalLimit: po.approvalLimit ?? 0, approvedBy: po.approvedBy ? String(po.approvedBy) : null, approvedAt: iso(po.approvedAt), sentAt: iso(po.sentAt),
    version: po.version ?? 0, createdAt: iso(po.createdAt)!,
  };
}
const toDto = async (po: any) => poDto(po, await namesFor([String(po.vendorId)], [String(po.storeId)]));

async function buildLines(input: any, vendor: any, date: Date, session?: mongoose.ClientSession) {
  const mode = await taxModeFor(vendor, session);
  const ids = input.lines.map((l: any) => l.variantId);
  if (new Set(ids).size !== ids.length) throw badRequest('A variant is on this order twice', [{ path: 'lines', message: 'Combine duplicate variants into one line' }]);
  const ctx = await variantContext(ids, session);
  const lines = [];
  for (const [i, l] of input.lines.entries()) {
    const c = ctx.get(l.variantId);
    if (!c) throw badRequest('Variant not found', [{ path: `lines.${i}.variantId`, message: 'Choose an existing variant' }]);
    if (!c.v.active) throw businessRule(`${c.v.itemCode} is inactive`, 'VARIANT_INACTIVE', [{ path: `lines.${i}.variantId`, message: 'Inactive variant' }]);
    const rate = await rateFor(l.gstRate, c, l.unitCost, mode, date, `lines.${i}.gstRate`, session);
    const calc = lineFields({ qty: l.qty, unitCost: l.unitCost, discountPercent: l.discountPercent ?? 0, gstRate: rate }, mode);
    lines.push({ variantId: l.variantId, itemCode: c.v.itemCode, description: describe(c), receivedQty: 0, ...calc });
  }
  return { lines, mode, totals: sumLines(lines) };
}

export async function createPo(userId: string, input: any, audit: Audit) {
  const vendor = await loadVendor(input.vendorId); await loadStore(input.storeId);
  const date = input.date ? new Date(input.date) : new Date();
  const limit = (await getOperationsSettings()).poApprovalLimit;
  const id = await withTransaction(async (session) => {
    const b = await buildLines(input, vendor, date, session);
    const [po] = await PurchaseOrder.create([{
      poNumber: await nextNumber('PO', { date, session }), status: 'draft', vendorId: input.vendorId, storeId: input.storeId, date,
      expectedDate: input.expectedDate ? new Date(input.expectedDate) : null, lines: b.lines, totals: b.totals, gstMode: b.mode.gstMode, supply: b.mode.supply,
      terms: input.terms ?? '', notes: input.notes ?? '', requiresApproval: b.totals.total > limit, approvalLimit: limit, createdBy: userId,
    }], { session });
    return String(po!._id);
  });
  const dto = await getPo(id);
  audit({ entity: 'purchase_order', entityId: id, action: 'create', after: dto });
  return dto;
}

export async function getPo(id: string) {
  const po = await PurchaseOrder.findById(id).lean();
  if (!po) throw notFound('Purchase order');
  return toDto(po);
}

export async function listPos(q: ListQuery & { vendorId?: string; poStatus?: string }) {
  const f: any = {};
  if (q.vendorId) f.vendorId = q.vendorId;
  if (q.poStatus) f.status = q.poStatus;
  if (q.from || q.to) f.date = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  if (q.q) f.poNumber = new RegExp(escapeRegex(q.q), 'i');
  const res = await paginate(PurchaseOrder, f, q, parseSort(q.sort, ['date', 'poNumber', 'createdAt'], { date: -1 }), (p) => p);
  const names = await namesFor(res.items.map((p: any) => String(p.vendorId)), res.items.map((p: any) => String(p.storeId)));
  return { ...res, items: res.items.map((p: any) => poDto(p, names)) };
}

/** Only drafts can be edited, and only with the version you loaded (If-Match), so two people cannot overwrite each other. */
export async function updatePo(id: string, version: number, input: any, audit: Audit) {
  const cur: any = await PurchaseOrder.findById(id).lean();
  if (!cur) throw notFound('Purchase order');
  if (cur.status !== 'draft') throw businessRule('Only a draft purchase order can be edited', 'NOT_DRAFT');
  if (cur.version !== version) throw new AppError(409, 'STALE_EDIT', `This purchase order changed (now version ${cur.version}). Reload it and try again.`);
  const vendor = await loadVendor(input.vendorId ?? String(cur.vendorId));
  if (input.storeId) await loadStore(input.storeId);
  const date = input.date ? new Date(input.date) : cur.date;
  const limit = (await getOperationsSettings()).poApprovalLimit;
  const before = await toDto(cur);
  const set: any = { terms: input.terms ?? cur.terms, notes: input.notes ?? cur.notes, vendorId: input.vendorId ?? cur.vendorId, storeId: input.storeId ?? cur.storeId, date, approvalLimit: limit };
  if (input.expectedDate !== undefined) set.expectedDate = input.expectedDate ? new Date(input.expectedDate) : null;
  if (input.lines || input.vendorId) {
    const b = await buildLines({ lines: input.lines ?? cur.lines.map((l: any) => ({ variantId: String(l.variantId), qty: l.qty, unitCost: l.unitCost, discountPercent: l.discountPercent, gstRate: l.gstRate })) }, vendor, date);
    Object.assign(set, { lines: b.lines, totals: b.totals, gstMode: b.mode.gstMode, supply: b.mode.supply, requiresApproval: b.totals.total > limit });
  } else set.requiresApproval = cur.totals.total > limit;
  const r = await PurchaseOrder.findOneAndUpdate({ _id: id, status: 'draft', version }, { $set: set, $inc: { version: 1 } }, { new: true }).lean();
  if (!r) throw new AppError(409, 'STALE_EDIT', 'This purchase order changed while you were editing. Reload it and try again.');
  const after = await toDto(r);
  audit({ entity: 'purchase_order', entityId: id, action: 'update', before, after });
  return after;
}

export async function deletePo(id: string, audit: Audit) {
  const po: any = await PurchaseOrder.findById(id).lean();
  if (!po) throw notFound('Purchase order');
  if (po.status !== 'draft') throw businessRule('Only a draft purchase order can be deleted. Cancel it instead.', 'NOT_DRAFT');
  await PurchaseOrder.deleteOne({ _id: id, status: 'draft' });
  audit({ entity: 'purchase_order', entityId: id, action: 'delete', before: { poNumber: po.poNumber } });
}

/** A PO above the limit needs an Admin (purchase.approve). Others can be sent straight from draft. */
export async function approvePo(id: string, userId: string, audit: Audit) {
  const r: any = await PurchaseOrder.findOneAndUpdate({ _id: id, status: 'draft' }, { $set: { status: 'approved', approvedBy: userId, approvedAt: new Date() }, $inc: { version: 1 } }, { new: true }).lean();
  if (!r) { const cur = await PurchaseOrder.findById(id).lean(); if (!cur) throw notFound('Purchase order'); throw businessRule(`Only a draft can be approved (this one is ${(cur as any).status})`, 'BAD_STATUS'); }
  audit({ entity: 'purchase_order', entityId: id, action: 'approve', after: { status: 'approved' } });
  return toDto(r);
}

export async function sendPo(id: string, audit: Audit) {
  const cur: any = await PurchaseOrder.findById(id).lean();
  if (!cur) throw notFound('Purchase order');
  if (cur.status === 'draft' && cur.requiresApproval) throw businessRule(`This order is above the approval limit and needs an Admin to approve it first`, 'PO_NEEDS_APPROVAL');
  if (!['draft', 'approved'].includes(cur.status)) throw businessRule(`A ${cur.status.replace('_', ' ')} order cannot be sent`, 'BAD_STATUS');
  const r: any = await PurchaseOrder.findOneAndUpdate({ _id: id, status: cur.status }, { $set: { status: 'sent', sentAt: new Date() }, $inc: { version: 1 } }, { new: true }).lean();
  if (!r) throw new AppError(409, 'STALE_EDIT', 'This purchase order changed. Reload it.');
  audit({ entity: 'purchase_order', entityId: id, action: 'send', after: { status: 'sent' } });
  return toDto(r);
}

export async function cancelPo(id: string, audit: Audit) {
  const cur: any = await PurchaseOrder.findById(id).lean();
  if (!cur) throw notFound('Purchase order');
  if (cur.lines.some((l: any) => (l.receivedQty ?? 0) > 0)) throw businessRule('Goods were already received against this order. Close it instead.', 'HAS_RECEIPTS');
  if (['closed', 'cancelled'].includes(cur.status)) throw businessRule(`This order is already ${cur.status}`, 'BAD_STATUS');
  const r: any = await PurchaseOrder.findOneAndUpdate({ _id: id, status: cur.status }, { $set: { status: 'cancelled', cancelledAt: new Date() }, $inc: { version: 1 } }, { new: true }).lean();
  audit({ entity: 'purchase_order', entityId: id, action: 'cancel', before: { status: cur.status }, after: { status: 'cancelled' } });
  return toDto(r);
}

/** Close a partly received order: the pending balance is abandoned. */
export async function closePo(id: string, audit: Audit) {
  const r: any = await PurchaseOrder.findOneAndUpdate({ _id: id, status: 'partly_received' }, { $set: { status: 'closed' }, $inc: { version: 1 } }, { new: true }).lean();
  if (!r) { if (!(await PurchaseOrder.exists({ _id: id }))) throw notFound('Purchase order'); throw businessRule('Only a partly received order can be closed', 'BAD_STATUS'); }
  audit({ entity: 'purchase_order', entityId: id, action: 'close', after: { status: 'closed' } });
  return toDto(r);
}

