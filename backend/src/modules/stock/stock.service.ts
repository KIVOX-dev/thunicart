import mongoose from 'mongoose';
import type { ListQuery } from '@thunikart/shared';
import { AppSettings, Grn, Item, StockBalance, StockLedger, Store, Variant, Vendor } from '../../models';
import { badRequest, businessRule } from '../../lib/errors';
import { withTransaction } from '../../lib/transaction';
import { nextNumber } from '../../lib/numberSeries';
import { escapeRegex } from '../../lib/list';
import { stockStatusOf } from '../../lib/stockStatus';
import { getOperationsSettings, postStock } from '../../lib/stock';
import type { AuthUser } from '../../middleware/auth';
import type { AuditEntry } from '../../middleware/audit';
import { createPo } from '../purchase/po.service';

type Audit = (e: AuditEntry) => void;
const oid = (id: string) => new mongoose.Types.ObjectId(id);
const iso = (d: unknown) => (d ? new Date(d as any).toISOString() : null);

// ---------- stock on hand ----------
export async function listStock(q: ListQuery & { storeId?: string; stockStatus?: string; size?: string; includeZero?: string }) {
  const vf: any = {};
  if (q.size) vf.size = q.size;
  if (q.q) { const r = new RegExp(escapeRegex(q.q), 'i'); const items: any[] = await Item.find({ $or: [{ name: r }, { printName: r }] }, { _id: 1 }).lean(); vf.$or = [{ itemCode: r }, { barcode: r }, { itemId: { $in: items.map((i) => i._id) } }]; }
  if (q.category || q.brand) { const f: any = {}; if (q.category) f.categoryId = q.category; if (q.brand) f.brandId = q.brand; const items: any[] = await Item.find(f, { _id: 1 }).lean(); vf.itemId = { $in: items.map((i) => i._id) }; }
  const bf: any = q.storeId ? { storeId: oid(q.storeId) } : {};
  if (q.includeZero !== 'true') {
    const ids = await StockBalance.distinct('variantId', { ...bf, $or: [{ onHand: { $ne: 0 } }, { reserved: { $ne: 0 } }] });
    vf._id = { $in: ids };
  }
  const variants: any[] = await Variant.find(vf).sort({ itemCode: 1 }).lean();
  const bals: any[] = await StockBalance.find({ ...bf, variantId: { $in: variants.map((v) => v._id) } }).lean();
  const by = new Map<string, any[]>(); for (const b of bals) { const k = String(b.variantId); by.set(k, [...(by.get(k) ?? []), b]); }
  const items: any[] = await Item.find({ _id: { $in: variants.map((v) => v.itemId) } }, { name: 1 }).lean();
  const names = new Map(items.map((i) => [String(i._id), i.name]));
  const stores: any[] = await Store.find().lean(); const sn = new Map(stores.map((s) => [String(s._id), s.name]));

  let rows = variants.map((v) => {
    const bs = by.get(String(v._id)) ?? [];
    const onHand = bs.reduce((a, b) => a + b.onHand, 0); const reserved = bs.reduce((a, b) => a + b.reserved, 0); const available = onHand - reserved;
    return {
      variantId: String(v._id), itemId: String(v.itemId), itemCode: v.itemCode, name: names.get(String(v.itemId)) ?? v.itemCode, size: v.size ?? null, color: v.color ?? null,
      storeId: q.storeId ?? null, storeName: q.storeId ? (sn.get(q.storeId) ?? null) : null, onHand, reserved, available, reorderLevel: v.reorderLevel ?? 0,
      stockStatus: stockStatusOf(available, v.reorderLevel ?? 0), baseCost: v.baseCost ?? 0, costValue: onHand * (v.baseCost ?? 0), mrp: v.mrp ?? 0, mrpValue: onHand * (v.mrp ?? 0),
    };
  });
  if (q.stockStatus) rows = rows.filter((r) => r.stockStatus === q.stockStatus);
  const totals = { onHand: rows.reduce((a, r) => a + r.onHand, 0), costValue: rows.reduce((a, r) => a + r.costValue, 0), mrpValue: rows.reduce((a, r) => a + r.mrpValue, 0), currency: 'INR' as const };
  const skip = (q.page - 1) * q.pageSize;
  return { items: rows.slice(skip, skip + q.pageSize), total: rows.length, nextPage: skip + q.pageSize < rows.length ? q.page + 1 : null, totals };
}

export async function listLedger(q: ListQuery & { variantId?: string; storeId?: string; type?: string; docNumber?: string }) {
  const f: any = {};
  if (q.variantId) f.variantId = q.variantId;
  if (q.storeId) f.storeId = q.storeId;
  if (q.type) f.type = q.type;
  if (q.docNumber) f.docNumber = q.docNumber;
  if (q.from || q.to) f.at = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  const skip = (q.page - 1) * q.pageSize;
  const dir = q.sort?.startsWith('-') === false && q.sort ? 1 : -1;
  const [rows, total]: any = await Promise.all([StockLedger.find(f).sort({ at: dir, _id: dir }).skip(skip).limit(q.pageSize).lean(), StockLedger.countDocuments(f)]);
  const vs: any[] = await Variant.find({ _id: { $in: rows.map((r: any) => r.variantId) } }, { itemCode: 1 }).lean();
  const ss: any[] = await Store.find({ _id: { $in: rows.map((r: any) => r.storeId) } }, { name: 1 }).lean();
  const vm = new Map(vs.map((v) => [String(v._id), v.itemCode])); const sm = new Map(ss.map((s) => [String(s._id), s.name]));
  return {
    items: rows.map((r: any) => ({ id: String(r._id), at: iso(r.at)!, type: r.type, variantId: String(r.variantId), itemCode: vm.get(String(r.variantId)) ?? null, storeId: String(r.storeId), storeName: sm.get(String(r.storeId)) ?? null, qty: r.qty, unitCost: r.unitCost ?? 0, docType: r.docType ?? null, docNumber: r.docNumber ?? null, userId: r.userId ? String(r.userId) : null, note: r.note ?? null })),
    total, nextPage: skip + rows.length < total ? q.page + 1 : null,
  };
}

// ---------- adjustments ----------
export async function createAdjustment(user: AuthUser, input: any, audit: Audit) {
  const out = await withTransaction(async (session) => {
    const store: any = await Store.findById(input.storeId).session(session).lean();
    if (!store || !store.active) throw badRequest('Store not found', [{ path: 'storeId', message: 'Choose an active store' }]);
    const settings = await getOperationsSettings(session);
    const ids = input.lines.map((l: any) => l.variantId);
    if (new Set(ids).size !== ids.length) throw badRequest('A variant is listed twice', [{ path: 'lines', message: 'Combine duplicate variants into one line' }]);
    const vs: any[] = await Variant.find({ _id: { $in: ids } }).session(session).lean(); const vm = new Map(vs.map((v) => [String(v._id), v]));
    const docNumber = await nextNumber('ADJ', { session });
    const lines = [];
    for (const [i, l] of input.lines.entries()) {
      const v = vm.get(l.variantId);
      if (!v) throw badRequest('Variant not found', [{ path: `lines.${i}.variantId`, message: 'Choose an existing variant' }]);
      const r = await postStock({ variantId: l.variantId, storeId: input.storeId, type: 'ADJUSTMENT', qty: l.qty, unitCost: v.baseCost ?? 0, docType: 'ADJUSTMENT', docNumber, userId: user.id, note: [input.reason, l.note].filter(Boolean).join(': '), allowNegative: settings.allowNegativeStock }, session);
      lines.push({ variantId: l.variantId, itemCode: v.itemCode, qty: l.qty, unitCost: v.baseCost ?? 0, onHandAfter: r.onHandAfter });
    }
    return { docNumber, storeId: input.storeId, reason: input.reason, lines };
  });
  audit({ entity: 'stock_adjustment', entityId: out.docNumber, action: 'adjust', after: out });
  return out;
}

// ---------- reorder alerts ----------
async function alertRows(variantFilter?: string[]) {
  const mult = (await getOperationsSettings()).reorderTargetMultiplier;
  const vf: any = { active: true, reorderLevel: { $gt: 0 } };
  if (variantFilter) vf._id = { $in: variantFilter };
  const variants: any[] = await Variant.find(vf).lean();
  const bals = await StockBalance.aggregate([{ $match: { variantId: { $in: variants.map((v) => v._id) } } }, { $group: { _id: '$variantId', onHand: { $sum: '$onHand' }, reserved: { $sum: '$reserved' } } }]);
  const bm = new Map(bals.map((b) => [String(b._id), b.onHand - b.reserved]));
  const low = variants.filter((v) => (bm.get(String(v._id)) ?? 0) <= v.reorderLevel);
  const items: any[] = await Item.find({ _id: { $in: low.map((v) => v.itemId) } }, { name: 1 }).lean(); const im = new Map(items.map((i) => [String(i._id), i.name]));
  // The vendor is whoever supplied it last, found from the most recent GRN that holds the variant.
  const last = new Map<string, { vendorId: string; cost: number }>();
  const grns: any[] = await Grn.find({ 'lines.variantId': { $in: low.map((v) => v._id) } }).sort({ date: -1 }).limit(2000).lean();
  for (const g of grns) for (const l of g.lines) { const k = String(l.variantId); if (!last.has(k)) last.set(k, { vendorId: String(g.vendorId), cost: l.landedUnitCost }); }
  return low.map((v) => {
    const available = bm.get(String(v._id)) ?? 0; const l = last.get(String(v._id));
    return { v, name: im.get(String(v.itemId)) ?? v.itemCode, available, suggestedQty: Math.max(Math.ceil(v.reorderLevel * mult) - available, 1), vendorId: l?.vendorId ?? null, lastUnitCost: l?.cost ?? v.baseCost ?? 0 };
  });
}

export async function reorderAlerts() {
  const rows = await alertRows();
  const vendors: any[] = await Vendor.find({ _id: { $in: rows.map((r) => r.vendorId).filter(Boolean) } }, { name: 1 }).lean(); const vn = new Map(vendors.map((v) => [String(v._id), v.name]));
  const groups = new Map<string, any>();
  for (const r of rows) {
    const k = r.vendorId ?? 'none';
    const g = groups.get(k) ?? { vendorId: r.vendorId, vendorName: r.vendorId ? (vn.get(r.vendorId) ?? 'Vendor') : 'No vendor yet', items: [] };
    g.items.push({ variantId: String(r.v._id), itemCode: r.v.itemCode, name: r.name, size: r.v.size ?? null, available: r.available, reorderLevel: r.v.reorderLevel, suggestedQty: r.suggestedQty, lastUnitCost: r.lastUnitCost });
    groups.set(k, g);
  }
  return { generatedAt: new Date().toISOString(), groups: [...groups.values()].sort((a, b) => a.vendorName.localeCompare(b.vendorName)), totalItems: rows.length };
}

/** Draft a PO from the alerts for one vendor. The buyer reviews it, then sends it. */
export async function poFromAlerts(user: AuthUser, input: { vendorId: string; storeId: string; variantIds?: string[] }, audit: Audit) {
  const rows = (await alertRows(input.variantIds)).filter((r) => r.vendorId === input.vendorId || (input.variantIds && !r.vendorId));
  if (!rows.length) throw businessRule('No items at or below their reorder level for this vendor', 'NOTHING_TO_ORDER');
  return createPo(user.id, { vendorId: input.vendorId, storeId: input.storeId, notes: 'Drafted from reorder alerts', terms: '', lines: rows.map((r) => ({ variantId: String(r.v._id), qty: r.suggestedQty, unitCost: r.lastUnitCost, discountPercent: 0 })) }, audit);
}

// ---------- operations settings ----------
export async function saveOperationsSettings(input: any, audit: Audit) {
  const before = await getOperationsSettings();
  await AppSettings.updateOne({ singleKey: 'main' }, { $set: input, $inc: { version: 1 }, $setOnInsert: { singleKey: 'main' } }, { upsert: true });
  const after = await getOperationsSettings();
  audit({ entity: 'settings', entityId: 'operations', action: 'update', before, after });
  return { ...after, updatedAt: iso(after.updatedAt) ?? new Date().toISOString() };
}
export async function readOperationsSettings() {
  const s = await getOperationsSettings();
  return { allowNegativeStock: s.allowNegativeStock, poApprovalLimit: s.poApprovalLimit, reorderTargetMultiplier: s.reorderTargetMultiplier, version: s.version, updatedAt: iso(s.updatedAt) ?? new Date(0).toISOString() };
}

