import mongoose from 'mongoose';
import type { ListQuery } from '@thunikart/shared';
import { Item, StockAudit, StockBalance, StockLedger, Store, Variant } from '../../models';
import { badRequest, businessRule, notFound } from '../../lib/errors';
import { withTransaction } from '../../lib/transaction';
import { nextNumber } from '../../lib/numberSeries';
import { ON_HAND_TYPES, postStock } from '../../lib/stock';
import { paginate, parseSort } from '../../lib/list';
import type { AuthUser } from '../../middleware/auth';
import type { AuditEntry } from '../../middleware/audit';

type Audit = (e: AuditEntry) => void;
const oid = (id: string) => new mongoose.Types.ObjectId(id);
const iso = (d: unknown) => (d ? new Date(d as any).toISOString() : null);

/** Movements at the store since the audit started (stock is not frozen), by variant. Rows of this audit's own approval are ignored. */
async function movementSince(a: any, variantIds: string[]) {
  const rows = await StockLedger.aggregate([
    { $match: { storeId: a.storeId, variantId: { $in: variantIds.map(oid) }, at: { $gt: a.startedAt }, type: { $in: [...ON_HAND_TYPES] }, docNumber: { $ne: a.auditNumber } } },
    { $group: { _id: '$variantId', qty: { $sum: '$qty' }, n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { qty: r.qty as number, n: r.n as number }]));
}

async function toDto(a: any, withLines = true): Promise<any> {
  const store: any = await Store.findById(a.storeId, { name: 1 }).lean();
  const mv = await movementSince(a, a.lines.map((l: any) => String(l.variantId)));
  const lines = a.lines.map((l: any) => {
    const counted = l.countedQty ?? null; const variance = counted === null ? 0 : counted - l.systemQty; const m = mv.get(String(l.variantId));
    return { variantId: String(l.variantId), itemCode: l.itemCode, name: l.name, size: l.size ?? null, binLocation: l.binLocation ?? null, systemQty: l.systemQty, countedQty: counted, variance, varianceValue: variance * (l.unitCost ?? 0), movedDuringAudit: !!m && m.n > 0, movementSinceStart: m?.qty ?? 0, unitCost: l.unitCost ?? 0 };
  });
  const countedLines = lines.filter((l: any) => l.countedQty !== null);
  const base = {
    id: String(a._id), auditNumber: a.auditNumber, name: a.name ?? '', storeId: String(a.storeId), storeName: store?.name ?? '', categoryId: a.categoryId ? String(a.categoryId) : null, binLocation: a.binLocation ?? null,
    status: a.status, startedAt: iso(a.startedAt)!, approvedAt: iso(a.approvedAt),
    summary: { lines: lines.length, counted: countedLines.length, uncounted: lines.length - countedLines.length, withVariance: countedLines.filter((l: any) => l.variance !== 0).length, movedDuringAudit: lines.filter((l: any) => l.movedDuringAudit).length, varianceValue: countedLines.reduce((x: number, l: any) => x + l.varianceValue, 0), varianceQty: countedLines.reduce((x: number, l: any) => x + l.variance, 0), currency: 'INR' as const },
  };
  return withLines ? { ...base, lines } : base;
}

/** Start an audit for a store, optionally one category or bin. System quantity is a snapshot as at the start. */
export async function startAudit(user: AuthUser, input: any, audit: Audit) {
  const store: any = await Store.findById(input.storeId).lean();
  if (!store || !store.active) throw badRequest('Store not found', [{ path: 'storeId', message: 'Choose an active store' }]);
  const id = await withTransaction(async (session) => {
    const bals: any[] = await StockBalance.find({ storeId: input.storeId, onHand: { $ne: 0 } }).session(session).lean();
    const vf: any = { _id: { $in: bals.map((b) => b.variantId) } };
    if (input.binLocation) vf.binLocation = input.binLocation;
    let variants: any[] = await Variant.find(vf).sort({ itemCode: 1 }).session(session).lean();
    const items: any[] = await Item.find({ _id: { $in: variants.map((v) => v.itemId) } }, { name: 1, categoryId: 1 }).session(session).lean(); const im = new Map(items.map((i) => [String(i._id), i]));
    if (input.categoryId) variants = variants.filter((v) => String(im.get(String(v.itemId))?.categoryId) === input.categoryId);
    const bm = new Map(bals.map((b) => [String(b.variantId), b.onHand]));
    const [a] = await StockAudit.create([{
      auditNumber: await nextNumber('AUD', { session }), name: input.name ?? '', storeId: input.storeId, categoryId: input.categoryId, binLocation: input.binLocation ?? null, status: 'in_progress', startedAt: new Date(), createdBy: user.id,
      lines: variants.map((v) => ({ variantId: v._id, itemCode: v.itemCode, name: im.get(String(v.itemId))?.name ?? v.itemCode, size: v.size, binLocation: v.binLocation, systemQty: bm.get(String(v._id)) ?? 0, countedQty: null, unitCost: v.baseCost ?? 0 })),
    }], { session });
    return String(a!._id);
  });
  const a: any = await StockAudit.findById(id).lean();
  audit({ entity: 'stock_audit', entityId: id, action: 'start', after: { auditNumber: a.auditNumber, storeId: input.storeId, lines: a.lines.length } });
  return toDto(a);
}

export async function getAudit(id: string) {
  const a: any = await StockAudit.findById(id).lean();
  if (!a) throw notFound('Stock audit');
  return toDto(a);
}

export async function listAudits(q: ListQuery & { storeId?: string }) {
  const f: any = q.storeId ? { storeId: q.storeId } : {};
  if (q.status) f.status = q.status;
  const res = await paginate(StockAudit, f, q, parseSort(q.sort, ['startedAt', 'auditNumber'], { startedAt: -1 }), (a) => a);
  return { ...res, items: await Promise.all(res.items.map((a: any) => toDto(a, false))) };
}

/** Scans add counts. A scan of an item that was not in the snapshot adds it with its current quantity. */
export async function scanAudit(id: string, input: { barcode: string; qty: number; set: boolean }, audit: Audit) {
  const v: any = (await Variant.findOne({ barcode: input.barcode }).lean()) ?? (await Variant.findOne({ itemCode: input.barcode }).lean());
  if (!v) throw notFound('Item for this barcode');
  const a: any = await StockAudit.findById(id);
  if (!a) throw notFound('Stock audit');
  if (a.status !== 'in_progress') throw businessRule('This audit is already approved', 'AUDIT_CLOSED');
  let line = a.lines.find((l: any) => String(l.variantId) === String(v._id));
  if (!line) {
    const item: any = await Item.findById(v.itemId, { name: 1 }).lean(); const bal: any = await StockBalance.findOne({ variantId: v._id, storeId: a.storeId }).lean();
    a.lines.push({ variantId: v._id, itemCode: v.itemCode, name: item?.name ?? v.itemCode, size: v.size, binLocation: v.binLocation, systemQty: bal?.onHand ?? 0, countedQty: null, unitCost: v.baseCost ?? 0 });
    line = a.lines[a.lines.length - 1];
  }
  line.countedQty = input.set ? input.qty : (line.countedQty ?? 0) + input.qty;
  a.markModified('lines');
  await a.save();
  audit({ entity: 'stock_audit', entityId: id, action: 'scan', after: { itemCode: v.itemCode, countedQty: line.countedQty } });
  return { itemCode: v.itemCode, name: line.name, size: line.size ?? null, countedQty: line.countedQty, systemQty: line.systemQty };
}

/** Approval posts every variance as an AUDIT entry. Physical count is the truth, so it may correct stock even below zero. */
export async function approveAudit(id: string, user: AuthUser, input: { uncounted: 'skip' | 'zero' }, audit: Audit) {
  const posted = await withTransaction(async (session) => {
    const a: any = await StockAudit.findOneAndUpdate({ _id: id, status: 'in_progress' }, { $set: { status: 'approved', approvedAt: new Date(), approvedBy: user.id } }, { new: true, session });
    if (!a) { const cur = await StockAudit.exists({ _id: id }).session(session); if (!cur) throw notFound('Stock audit'); throw businessRule('This audit is already approved', 'AUDIT_CLOSED'); }
    const out: { variantId: string; itemCode: string; variance: number }[] = [];
    for (const l of a.lines) {
      const counted = l.countedQty ?? (input.uncounted === 'zero' ? 0 : null);
      if (counted === null) continue;
      const variance = counted - l.systemQty;
      if (variance === 0) continue;
      await postStock({ variantId: String(l.variantId), storeId: String(a.storeId), type: 'AUDIT', qty: variance, unitCost: l.unitCost ?? 0, docType: 'AUDIT', docNumber: a.auditNumber, docId: String(a._id), userId: user.id, note: `Count ${counted} vs system ${l.systemQty}`, allowNegative: true }, session);
      out.push({ variantId: String(l.variantId), itemCode: l.itemCode, variance });
    }
    return out;
  });
  const dto = await getAudit(id);
  audit({ entity: 'stock_audit', entityId: id, action: 'approve', after: { auditNumber: dto.auditNumber, posted: posted.length, varianceValue: dto.summary.varianceValue } });
  return { ...dto, postedLines: posted.length };
}
