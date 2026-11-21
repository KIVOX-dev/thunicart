import { Brand, Category, GstRate, Item, ReviewItem, StockBalance, Variant } from '../../models';
import { withTransaction } from '../../lib/transaction';
import { isGstEnabled } from '../../lib/gst';
import { postStock } from '../../lib/stock';
import type { ListQuery } from '@thunikart/shared';
import { badRequest } from '../../lib/errors';
import { checkHsn } from '../../lib/hsn';
import { parseSizes } from '../../lib/sizes';
import { slugify } from '../../lib/crud';
import { nextNumber } from '../../lib/numberSeries';
import { escapeRegex, paginate, parseSort } from '../../lib/list';
import { assertPrices } from '../items/items.service';
import type { AuditEntry } from '../../middleware/audit';
import { STICKY_REASONS } from './stock';

type Audit = (e: AuditEntry) => void;

export const reviewDto = (r: any) => ({
  id: String(r._id), batchId: String(r.batchId), rowNumber: r.rowNumber ?? null, itemCode: r.itemCode, itemId: r.itemId ? String(r.itemId) : null,
  variantId: r.variantId ? String(r.variantId) : null, name: r.name ?? '', category: r.category ?? null, reasons: r.reasons ?? [], detail: r.detail ?? {},
  suggestion: r.suggestion ?? null, status: r.status,
});

/** HSN only matters for GST invoices. While GST is off these problems are not shown, and they come back the day GST is switched on. */
const HSN_REASONS = ['MISSING_HSN', 'INVALID_HSN', 'HSN_NO_RATE'];
const withoutHsn = (r: any) => ({ ...r, reasons: (r.reasons ?? []).filter((x: string) => !HSN_REASONS.includes(x)), suggestion: null });

export async function listReview(q: ListQuery & { reason?: string; batchId?: string; reviewStatus?: string }) {
  const f: any = { status: q.reviewStatus ?? 'open' };
  const gstOn = await isGstEnabled();
  if (q.reason) f.reasons = q.reason;
  else if (!gstOn) f.reasons = { $elemMatch: { $nin: HSN_REASONS } };
  if (q.batchId) f.batchId = q.batchId;
  if (q.q) { const r = new RegExp(escapeRegex(q.q), 'i'); f.$or = [{ itemCode: r }, { name: r }, { category: r }]; }
  const res0 = await paginate(ReviewItem, f, q, parseSort(q.sort, ['rowNumber', 'itemCode', 'name'], { rowNumber: 1 }), reviewDto);
  const res = gstOn ? res0 : { ...res0, items: res0.items.map(withoutHsn) };
  // The import only remembers what was wrong. The price, size and HSN to show come from the live records, so a fix made elsewhere shows too.
  const vids = res.items.map((i: any) => i.variantId).filter(Boolean);
  if (!vids.length) return res;
  const vs: any[] = await Variant.find({ _id: { $in: vids } }, { itemId: 1, size: 1, mrp: 1, sellingPrice: 1, batchRef: 1 }).lean();
  const its: any[] = await Item.find({ _id: { $in: vs.map((v) => v.itemId) } }, { hsn: 1 }).lean();
  const stock: any[] = await StockBalance.aggregate([{ $match: { variantId: { $in: vs.map((v) => v._id) } } }, { $group: { _id: '$variantId', onHand: { $sum: '$onHand' }, reserved: { $sum: '$reserved' } } }]);
  const sm = new Map(stock.map((x) => [String(x._id), x.onHand - x.reserved]));
  const vm = new Map(vs.map((v) => [String(v._id), v])); const im = new Map(its.map((i) => [String(i._id), i]));
  return {
    ...res,
    items: res.items.map((i: any) => {
      const v = vm.get(i.variantId); if (!v) return i;
      return { ...i, detail: { ...i.detail, mrp: v.mrp ?? 0, sellingPrice: v.sellingPrice ?? 0, size: i.detail?.size ?? v.size ?? '', hsn: i.detail?.hsn ?? im.get(String(v.itemId))?.hsn ?? '', onHand: sm.get(String(v._id)) ?? 0, batchRef: v.batchRef ?? '' } };
    }),
  };
}

/** Reasons that come from the data itself, so fixing the data clears them. */
function dataReasons(item: any, v: any): string[] {
  const out: string[] = [];
  if (!v.size) out.push('MISSING_SIZE');
  else { const p = parseSizes(v.size); if (!p.multi && p.weird) out.push('ODD_SIZE'); } // several sizes in one row is allowed: the size is chosen at billing
  if (!item.categoryId) out.push('MISSING_CATEGORY');
  if (!item.brandId) out.push('MISSING_BRAND');
  if (!item.model) out.push('MISSING_MODEL');
  if (!item.hsn) out.push('MISSING_HSN'); else if (!checkHsn(item.hsn).ok) out.push('INVALID_HSN');
  if (!(v.mrp > 0)) out.push('NO_PRICE');
  return out;
}

async function refId(model: typeof Category | typeof Brand, name: string) {
  const slug = slugify(name);
  const f: any = await model.findOne({ slug }).lean();
  return f ? String(f._id) : String((await model.create({ name, slug, active: true }))._id);
}

export async function bulkReview(input: any, userId: string, audit: Audit) {
  const f: any = { status: 'open' };
  if (input.ids?.length) f._id = { $in: input.ids };
  else if (input.reason) { f.reasons = input.reason; if (input.batchId) f.batchId = input.batchId; }
  else throw badRequest('Send ids, or a reason to select every open row with it', [{ path: 'ids', message: 'Nothing selected' }]);
  const docs: any[] = await ReviewItem.find(f).limit(2000);
  const items = new Map((await Item.find({ _id: { $in: docs.map((d) => d.itemId) } })).map((i: any) => [String(i._id), i]));
  const variants = new Map((await Variant.find({ _id: { $in: docs.map((d) => d.variantId) } })).map((v: any) => [String(v._id), v]));
  let updated = 0, skipped = 0; const touchedItems = new Set<string>(); const dismissed = new Set<string>();
  const set = input.set ?? {};

  for (const d of docs) {
    const item: any = items.get(String(d.itemId)); const v: any = variants.get(String(d.variantId));
    if (!item || !v) { skipped++; continue; }
    const before = { hsn: item.hsn, size: v.size, mrp: v.mrp, sellingPrice: v.sellingPrice };
    try {
      if (input.action === 'dismiss') { dismissed.add(String(d._id)); updated++; continue; }
      if (input.action === 'apply_suggestion') {
        if (!d.suggestion?.hsn) { skipped++; continue; }
        item.hsn = d.suggestion.hsn; await item.save();
      } else if (input.action === 'set') {
        if (set.hsn !== undefined) { if (!checkHsn(set.hsn).ok) { skipped++; continue; } item.hsn = set.hsn; }
        if (set.category) item.categoryId = await refId(Category, set.category);
        if (set.brand) item.brandId = await refId(Brand, set.brand);
        if (set.model) item.model = set.model;
        await item.save();
        if (set.size !== undefined) v.size = set.size;
        if (set.mrp !== undefined || set.sellingPrice !== undefined) {
          const mrp = set.mrp ?? v.mrp, sell = set.sellingPrice ?? v.sellingPrice;
          assertPrices(mrp, sell, v.offerPrice); v.mrp = mrp; v.sellingPrice = sell; v.priceMissing = false;
          d.reasons = d.reasons.filter((x: string) => x !== 'MRP_RAISED');
        }
        await v.save();
      } else if (input.action === 'split_sizes') {
        const sizes: string[] = input.sizes ?? d.detail?.sizes ?? parseSizes(v.size).sizes;
        if (sizes.length < 2) { skipped++; continue; }
        const quantities: number[] | undefined = input.quantities;
        if (quantities && quantities.length !== sizes.length) throw badRequest('Give a quantity for every size', [{ path: 'quantities', message: 'One number for each size' }]);
        const [firstSize, ...rest] = sizes;
        const give = quantities ? quantities.slice(1) : rest.map(() => 0);
        const move = give.reduce((a2, b2) => a2 + b2, 0);
        // Pieces for the new sizes come off the original row, from the store that holds the most of it.
        const bal: any = move > 0 ? (await StockBalance.find({ variantId: v._id }).sort({ onHand: -1 }).limit(1).lean())[0] : null;
        if (move > 0 && (!bal || bal.onHand - bal.reserved < move)) {
          throw badRequest('Not enough stock to split', [{ path: 'quantities', message: `Only ${Math.max(0, (bal?.onHand ?? 0) - (bal?.reserved ?? 0))} in stock to give to the other sizes` }]);
        }
        // The new size rows and the stock moving onto them are saved together or not at all.
        await withTransaction(async (session) => {
          v.size = firstSize; await v.save({ session });
          for (const [i, sz] of rest.entries()) {
            let code = await nextNumber('ITEM', { session });
            while (await Variant.exists({ itemCode: code }).session(session)) code = await nextNumber('ITEM', { session });
            const [nv]: any[] = await Variant.create([{ itemId: v.itemId, itemCode: code, sku: code, barcode: code, size: sz, color: v.color, mrp: v.mrp, sellingPrice: v.sellingPrice, offerPrice: v.offerPrice, baseCost: v.baseCost, reorderLevel: v.reorderLevel, binLocation: v.binLocation, batchRef: v.batchRef, active: true }], { session });
            const q = give[i] ?? 0;
            if (q > 0 && bal) {
              await postStock({ variantId: String(v._id), storeId: String(bal.storeId), type: 'ADJUSTMENT', qty: -q, unitCost: v.baseCost ?? 0, docType: 'SIZE_SPLIT', docNumber: v.itemCode, userId, note: `Split: ${q} moved to size ${sz}` }, session);
              await postStock({ variantId: String(nv._id), storeId: String(bal.storeId), type: 'ADJUSTMENT', qty: q, unitCost: v.baseCost ?? 0, docType: 'SIZE_SPLIT', docNumber: code, userId, note: `Split from ${v.itemCode}: size ${sz}` }, session);
            }
          }
        });
      }
      touchedItems.add(String(item._id));
      if (JSON.stringify(before) !== JSON.stringify({ hsn: item.hsn, size: v.size, mrp: v.mrp, sellingPrice: v.sellingPrice }) || input.action === 'split_sizes') updated++;
      else skipped++;
    } catch (e: any) { if (e?.status === 400 && input.action !== 'split_sizes') { skipped++; continue; } throw e; } // a split that cannot be done says why, so the screen can show it
  }
  // Recalculate the open rows of every touched product, and apply dismissals.
  let resolved = 0, stillOpen = 0;
  const all: any[] = await ReviewItem.find({ status: 'open', $or: [{ itemId: { $in: [...touchedItems] } }, { _id: { $in: [...dismissed] } }] });
  const ivars = new Map((await Variant.find({ _id: { $in: all.map((d) => d.variantId) } })).map((v: any) => [String(v._id), v]));
  const iitems = new Map((await Item.find({ _id: { $in: all.map((d) => d.itemId) } })).map((i: any) => [String(i._id), i]));
  for (const d of all) {
    if (dismissed.has(String(d._id))) { d.reasons = []; }
    else {
      const sticky = (d.reasons as string[]).filter((r) => (STICKY_REASONS as readonly string[]).includes(r));
      d.reasons = [...new Set([...dataReasons(iitems.get(String(d.itemId)), ivars.get(String(d.variantId))), ...sticky])];
    }
    if (!d.reasons.some((r: string) => r === 'MISSING_HSN' || r === 'INVALID_HSN')) d.suggestion = null;
    if (!d.reasons.length) { d.status = 'resolved'; d.resolvedAt = new Date(); d.resolvedBy = userId; resolved++; } else stillOpen++;
    d.markModified('reasons');
    await d.save();
  }
  audit({ entity: 'import_review', action: `bulk_${input.action}`, after: { selected: docs.length, updated, resolved, skipped, set: input.set ?? null } });
  return { updated, resolved, stillOpen, skipped };
}

// ---------- data quality report ----------
export async function dataQuality(batchId?: string) {
  const f: any = { status: 'open' }; if (batchId) f.batchId = batchId;
  const gstOn = await isGstEnabled();
  if (!gstOn) f.reasons = { $elemMatch: { $nin: HSN_REASONS } }; // rows whose only problem is the HSN are left out while GST is off
  const rows: any[] = await ReviewItem.find(f).sort({ rowNumber: 1 }).limit(5000).lean();
  const summary: Record<string, number> = {};
  for (const r of rows) for (const reason of r.reasons) { if (!gstOn && HSN_REASONS.includes(reason)) continue; summary[reason] = (summary[reason] ?? 0) + 1; }
  // HSN codes in use that no GST rate rule covers (the HSN master only lists some headings).
  const hsns: any[] = await Item.aggregate([{ $match: { hsn: { $nin: [null, ''] } } }, { $group: { _id: { $substrBytes: ['$hsn', 0, 4] }, items: { $sum: 1 } } }]);
  const rated = new Set<string>((await GstRate.distinct('hsnCode')).map((c: string) => c.slice(0, 4)));
  const hsnWithoutRate = !gstOn ? [] : hsns.filter((h) => checkHsn(String(h._id).padEnd(4, '0')).ok && !rated.has(String(h._id))).map((h) => ({ hsn: String(h._id), items: h.items })).sort((a, b) => b.items - a.items);
  const [totalVariants, flagged] = await Promise.all([Variant.countDocuments(), ReviewItem.countDocuments(f)]);
  return { generatedAt: new Date().toISOString(), summary, rows: rows.map(reviewDto).map((r: any) => (gstOn ? r : withoutHsn(r))), hsnWithoutRate, totalVariants, flagged };
}

export function dataQualityCsv(rep: Awaited<ReturnType<typeof dataQuality>>) {
  const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = ['row,item_code,name,category,reasons,suggested_hsn,suggestion_note'];
  for (const r of rep.rows) lines.push([r.rowNumber ?? '', esc(r.itemCode), esc(r.name), esc(r.category), esc(r.reasons.join('|')), esc(r.suggestion?.hsn), esc(r.suggestion?.note)].join(','));
  lines.push('', 'HSN without a GST rate rule,items');
  for (const h of rep.hsnWithoutRate) lines.push(`${h.hsn},${h.items}`);
  return lines.join('\n') + '\n';
}
