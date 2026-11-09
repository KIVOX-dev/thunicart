import mongoose, { type ClientSession } from 'mongoose';
import type { ListQuery } from '@thunikart/shared';
import { Brand, Category, Item, StockBalance, StockLedger, Store, Variant } from '../../models';
import { badRequest, businessRule, notFound } from '../../lib/errors';
import { withTransaction } from '../../lib/transaction';
import { escapeRegex, paginate, parseSort } from '../../lib/list';
import { slugify } from '../../lib/crud';
import { nextNumber } from '../../lib/numberSeries';
import { barcodeKind, generateEan13 } from '../../lib/barcode';
import { effectivePrice, stockStatusOf } from '../../lib/stockStatus';
import { checkHsn } from '../../lib/hsn';
import { getGstStatus } from '../../lib/gst';
import { resolveGstRate } from '../../lib/gstRate';
import { registerUsageCheck } from '../../lib/usage';
import type { AuditEntry } from '../../middleware/audit';

type Audit = (e: AuditEntry) => void;
const oid = (id: string) => new mongoose.Types.ObjectId(id);

// ---------- stock lookups (balances are the fast read of the ledger) ----------
export async function stockTotals(variantIds: string[], session?: ClientSession) {
  const map = new Map<string, { onHand: number; reserved: number }>();
  if (!variantIds.length) return map;
  const rows = await StockBalance.aggregate([
    { $match: { variantId: { $in: variantIds.map(oid) } } },
    { $group: { _id: '$variantId', onHand: { $sum: '$onHand' }, reserved: { $sum: '$reserved' } } },
  ]).session(session ?? null);
  for (const r of rows) map.set(String(r._id), { onHand: r.onHand, reserved: r.reserved });
  return map;
}

export const variantDto = (v: any, stock?: { onHand: number; reserved: number }) => {
  const onHand = stock?.onHand ?? 0;
  const reserved = stock?.reserved ?? 0;
  const available = onHand - reserved;
  return {
    id: String(v._id), itemId: String(v.itemId), itemCode: v.itemCode, sku: v.sku, barcode: v.barcode, barcodeKind: barcodeKind(v.barcode),
    size: v.size ?? null, color: v.color ?? null, mrp: v.mrp ?? 0, sellingPrice: v.sellingPrice ?? 0, offerPrice: v.offerPrice ?? null,
    effectivePrice: effectivePrice(v), baseCost: v.baseCost ?? 0, currency: 'INR' as const, reorderLevel: v.reorderLevel ?? 0,
    binLocation: v.binLocation ?? null, batchRef: v.batchRef ?? null, active: !!v.active, priceMissing: !!v.priceMissing,
    onHand, reserved, available, stockStatus: stockStatusOf(available, v.reorderLevel ?? 0),
  };
};

async function namesFor(items: any[]) {
  const catIds = [...new Set(items.map((i) => i.categoryId && String(i.categoryId)).filter(Boolean))];
  const brandIds = [...new Set(items.map((i) => i.brandId && String(i.brandId)).filter(Boolean))];
  const [cats, brands]: any[] = await Promise.all([Category.find({ _id: { $in: catIds } }).lean(), Brand.find({ _id: { $in: brandIds } }).lean()]);
  return { cat: new Map<string, string>(cats.map((c: any) => [String(c._id), String(c.name)] as [string, string])), brand: new Map<string, string>(brands.map((b: any) => [String(b._id), String(b.name)] as [string, string])) };
}

function itemDto(i: any, names: Awaited<ReturnType<typeof namesFor>>, variants?: any[], stock?: Map<string, { onHand: number; reserved: number }>, counts?: { variantCount: number; onHand: number }) {
  const vs = variants?.map((v) => variantDto(v, stock?.get(String(v._id))));
  return {
    id: String(i._id), name: i.name, printName: i.printName ?? null,
    categoryId: i.categoryId ? String(i.categoryId) : null, categoryName: i.categoryId ? (names.cat.get(String(i.categoryId)) ?? null) : null,
    brandId: i.brandId ? String(i.brandId) : null, brandName: i.brandId ? (names.brand.get(String(i.brandId)) ?? null) : null,
    model: i.model ?? null, type: i.type ?? null, fabric: i.fabric ?? null, description: i.description ?? null, occasion: i.occasion ?? null,
    section: i.section ?? null, hsn: i.hsn ?? null, gstRateOverride: i.gstRateOverride ?? null, gstOverrideReason: i.gstOverrideReason ?? null,
    images: i.images ?? [], video: i.video ?? null, sizeChart: i.sizeChart ?? null, showOnWebsite: !!i.showOnWebsite, slug: i.slug ?? null, active: !!i.active,
    variantCount: counts?.variantCount ?? vs?.length ?? 0, onHand: counts?.onHand ?? vs?.reduce((a, v) => a + v.onHand, 0) ?? 0,
    ...(vs ? { variants: vs } : {}),
  };
}

// ---------- rules ----------
export function assertPrices(mrp: number, selling: number, offer: number | null | undefined) {
  const fields: { path: string; message: string }[] = [];
  if (!(mrp > 0)) fields.push({ path: 'mrp', message: 'MRP is required' });
  if (selling > mrp) fields.push({ path: 'sellingPrice', message: 'Selling price cannot be above the MRP' });
  if (offer != null && offer > selling) fields.push({ path: 'offerPrice', message: 'Offer price cannot be above the selling price' });
  if (fields.length) throw badRequest('Prices are not valid: MRP >= selling price >= offer price', fields);
}

function assertHsn(hsn?: string) {
  if (!hsn) return;
  const c = checkHsn(hsn);
  if (!c.ok) {
    throw badRequest('HSN is not valid', [{ path: 'hsn', message: c.reason === 'NOT_A_HEADING' ? `${hsn.slice(0, 4)} is not a valid heading in Chapter ${hsn.slice(0, 2)}` : 'HSN must be 4, 6 or 8 digits' }]);
  }
}

async function assertRefs(input: { categoryId?: string | null; brandId?: string | null }) {
  if (input.categoryId && !(await Category.exists({ _id: input.categoryId }))) throw badRequest('Category not found', [{ path: 'categoryId', message: 'Choose an existing category' }]);
  if (input.brandId && !(await Brand.exists({ _id: input.brandId }))) throw badRequest('Brand not found', [{ path: 'brandId', message: 'Choose an existing brand' }]);
}

async function newItemCode(session: ClientSession): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const code = await nextNumber('ITEM', { session });
    if (!(await Variant.exists({ itemCode: code }).session(session))) return code;
  }
  throw new Error('Could not find a free item code');
}

async function buildVariantDoc(itemId: unknown, v: any, session: ClientSession) {
  assertPrices(v.mrp, v.sellingPrice, v.offerPrice);
  const itemCode = v.itemCode ?? (await newItemCode(session));
  return {
    itemId, itemCode, sku: v.sku ?? itemCode, barcode: v.barcode ?? itemCode, // Code-128 of the item code unless a barcode is given
    size: v.size, color: v.color, mrp: v.mrp, sellingPrice: v.sellingPrice, offerPrice: v.offerPrice ?? null, baseCost: v.baseCost ?? 0,
    reorderLevel: v.reorderLevel ?? 0, binLocation: v.binLocation, batchRef: v.batchRef, active: v.active ?? true,
  };
}

// ---------- items ----------
export async function listItems(q: ListQuery & { section?: string; active?: string; showOnWebsite?: string }) {
  const f: any = {};
  if (q.q) {
    const r = new RegExp(escapeRegex(q.q), 'i');
    const byCode: any[] = await Variant.find({ $or: [{ itemCode: r }, { barcode: r }, { sku: r }] }, { itemId: 1 }).limit(200).lean();
    f.$or = [{ name: r }, { printName: r }, { model: r }, { _id: { $in: byCode.map((v) => v.itemId) } }];
  }
  if (q.category) f.categoryId = q.category;
  if (q.brand) f.brandId = q.brand;
  if (q.section) f.section = q.section;
  if (q.active) f.active = q.active === 'true';
  else if (q.status === 'active') f.active = true;
  if (q.showOnWebsite) f.showOnWebsite = q.showOnWebsite === 'true';
  const res = await paginate(Item, f, q, parseSort(q.sort, ['name', 'createdAt', 'hsn'], { name: 1 }), (i) => i);
  const ids = res.items.map((i: any) => i._id);
  const variants: any[] = await Variant.find({ itemId: { $in: ids } }, { itemId: 1 }).lean();
  const stock = await stockTotals(variants.map((v) => String(v._id)));
  const per = new Map<string, { variantCount: number; onHand: number }>();
  for (const v of variants) {
    const k = String(v.itemId); const cur = per.get(k) ?? { variantCount: 0, onHand: 0 };
    cur.variantCount++; cur.onHand += stock.get(String(v._id))?.onHand ?? 0; per.set(k, cur);
  }
  const names = await namesFor(res.items);
  return { ...res, items: res.items.map((i: any) => itemDto(i, names, undefined, undefined, per.get(String(i._id)) ?? { variantCount: 0, onHand: 0 })) };
}

export async function getItem(id: string) {
  const item: any = await Item.findById(id).lean();
  if (!item) throw notFound('Item');
  const variants: any[] = await Variant.find({ itemId: id }).sort({ size: 1, itemCode: 1 }).lean();
  const stock = await stockTotals(variants.map((v) => String(v._id)));
  return itemDto(item, await namesFor([item]), variants, stock);
}

export async function createItem(input: any, audit: Audit) {
  assertHsn(input.hsn);
  await assertRefs(input);
  const { variants, ...fields } = input;
  const id = await withTransaction(async (session) => {
    const [item] = await Item.create([{ ...fields }], { session });
    const docs = [];
    for (const v of variants) docs.push(await buildVariantDoc(item!._id, v, session));
    if (docs.length) await Variant.insertMany(docs, { session });
    await Item.updateOne({ _id: item!._id }, { $set: { slug: slugify(`${fields.name}-${docs[0]?.itemCode ?? String(item!._id).slice(-6)}`) } }, { session });
    return String(item!._id);
  });
  const dto = await getItem(id);
  audit({ entity: 'item', entityId: id, action: 'create', after: dto });
  return dto;
}

export async function updateItem(id: string, input: any, audit: Audit) {
  const item: any = await Item.findById(id);
  if (!item) throw notFound('Item');
  assertHsn(input.hsn);
  await assertRefs(input);
  const before = await getItem(id);
  if (input.gstRateOverride != null && !(input.gstOverrideReason ?? item.gstOverrideReason)) {
    throw badRequest('A GST rate override needs a reason', [{ path: 'gstOverrideReason', message: 'Required when overriding the GST rate' }]);
  }
  item.set(input);
  await item.save();
  const after = await getItem(id);
  audit({ entity: 'item', entityId: id, action: 'update', before, after });
  return after;
}

async function variantHasHistory(variantId: string) {
  return !!(await StockLedger.exists({ variantId })) || !!(await StockBalance.exists({ variantId, $or: [{ onHand: { $ne: 0 } }, { reserved: { $ne: 0 } }] }));
}

/** A variant with stock history can be deactivated, never deleted. */
export async function deleteItem(id: string, audit: Audit) {
  const item: any = await Item.findById(id).lean();
  if (!item) throw notFound('Item');
  const variants: any[] = await Variant.find({ itemId: id }, { _id: 1 }).lean();
  for (const v of variants) {
    if (await variantHasHistory(String(v._id))) throw businessRule('This item has stock history. Deactivate it instead of deleting.', 'HAS_TRANSACTIONS');
  }
  const before = await getItem(id);
  await withTransaction(async (session) => {
    await Variant.deleteMany({ itemId: id }, { session });
    await Item.deleteOne({ _id: id }, { session });
  });
  audit({ entity: 'item', entityId: id, action: 'delete', before });
}

// ---------- variants ----------
export async function createVariant(itemId: string, input: any, audit: Audit) {
  if (!(await Item.exists({ _id: itemId }))) throw notFound('Item');
  const vid = await withTransaction(async (session) => {
    const doc = await buildVariantDoc(itemId, input, session);
    const [v] = await Variant.create([doc], { session });
    return String(v!._id);
  });
  const v: any = await Variant.findById(vid).lean();
  const dto = variantDto(v);
  audit({ entity: 'variant', entityId: vid, action: 'create', after: dto });
  return dto;
}

export async function updateVariant(itemId: string, variantId: string, input: any, audit: Audit) {
  const v: any = await Variant.findOne({ _id: variantId, itemId });
  if (!v) throw notFound('Variant');
  const before = variantDto(v.toObject(), (await stockTotals([variantId])).get(variantId));
  const mrp = input.mrp ?? v.mrp, selling = input.sellingPrice ?? v.sellingPrice;
  const offer = input.offerPrice !== undefined ? input.offerPrice : v.offerPrice;
  assertPrices(mrp, selling, offer);
  v.set(input);
  if (input.mrp || input.sellingPrice) v.priceMissing = false;
  await v.save();
  const after = variantDto(v.toObject(), (await stockTotals([variantId])).get(variantId));
  audit({ entity: 'variant', entityId: variantId, action: 'update', before, after });
  return after;
}

export async function deleteVariant(itemId: string, variantId: string, audit: Audit) {
  const v: any = await Variant.findOne({ _id: variantId, itemId }).lean();
  if (!v) throw notFound('Variant');
  if (await variantHasHistory(variantId)) throw businessRule('This variant has stock history. Deactivate it instead of deleting.', 'HAS_TRANSACTIONS');
  await Variant.deleteOne({ _id: variantId });
  audit({ entity: 'variant', entityId: variantId, action: 'delete', before: variantDto(v) });
}

export async function listVariants(itemId: string) {
  if (!(await Item.exists({ _id: itemId }))) throw notFound('Item');
  const vs: any[] = await Variant.find({ itemId }).sort({ size: 1 }).lean();
  const stock = await stockTotals(vs.map((v) => String(v._id)));
  return { items: vs.map((v) => variantDto(v, stock.get(String(v._id)))) };
}

// ---------- barcodes ----------
/**
 * Existing real barcodes are kept. A variant whose barcode is just its item code (Code-128 by default)
 * can be given an in-store EAN-13. Numbers are never reused (the EAN series only moves forward).
 */
export async function generateBarcodes(itemId: string, input: { variantId?: string; format: 'code128' | 'ean13'; replace: boolean }, audit: Audit) {
  const q: any = { itemId };
  if (input.variantId) q._id = input.variantId;
  const variants: any[] = await Variant.find(q).lean();
  if (!variants.length) throw notFound('Variant');
  const out: { variantId: string; itemCode: string; barcode: string; kind: 'ean13' | 'code128'; generated: boolean }[] = [];
  await withTransaction(async (session) => {
    out.length = 0;
    for (const v of variants) {
      const hasReal = v.barcode !== v.itemCode;
      if (hasReal && !input.replace) { out.push({ variantId: String(v._id), itemCode: v.itemCode, barcode: v.barcode, kind: barcodeKind(v.barcode), generated: false }); continue; }
      const barcode = input.format === 'ean13' ? await generateEan13(session) : v.itemCode;
      if (barcode !== v.barcode) await Variant.updateOne({ _id: v._id }, { $set: { barcode } }, { session });
      out.push({ variantId: String(v._id), itemCode: v.itemCode, barcode, kind: barcodeKind(barcode), generated: barcode !== v.barcode });
      audit({ entity: 'variant', entityId: String(v._id), action: 'barcode', before: { barcode: v.barcode }, after: { barcode } });
    }
  });
  return { items: out };
}

// ---------- lookup (POS scan) ----------
export async function lookupByBarcode(code: string) {
  const v: any = (await Variant.findOne({ barcode: code }).lean()) ?? (await Variant.findOne({ itemCode: code }).lean()) ?? (await Variant.findOne({ sku: code }).lean());
  if (!v) throw notFound('Item for this barcode');
  const item: any = await Item.findById(v.itemId).lean();
  const names = await namesFor([item]);
  const balances: any[] = await StockBalance.find({ variantId: v._id }).lean();
  const stores: any[] = await Store.find({ _id: { $in: balances.map((b) => b.storeId) } }).lean();
  const sn = new Map(stores.map((s) => [String(s._id), s.name]));
  const total = balances.reduce((a, b) => ({ onHand: a.onHand + b.onHand, reserved: a.reserved + b.reserved }), { onHand: 0, reserved: 0 });
  const dto = variantDto(v, total);
  const gst = await getGstStatus();
  let gstRate: number | null = null;
  if (gst.gstMode === 'on' && item.hsn) gstRate = (await resolveGstRate({ hsn: item.hsn, unitPricePaise: dto.effectivePrice, override: item.gstRateOverride }))?.rate ?? null;
  return {
    gstMode: gst.gstMode, variant: dto,
    item: { id: String(item._id), name: item.name, printName: item.printName ?? null, hsn: item.hsn ?? null, categoryName: names.cat.get(String(item.categoryId)) ?? null, brandName: names.brand.get(String(item.brandId)) ?? null },
    price: { mrp: dto.mrp, sellingPrice: dto.sellingPrice, offerPrice: dto.offerPrice, effectivePrice: dto.effectivePrice, currency: 'INR' as const },
    gstRate,
    stockByStore: balances.map((b) => ({ storeId: String(b.storeId), storeName: sn.get(String(b.storeId)) ?? '', onHand: b.onHand, reserved: b.reserved, available: b.onHand - b.reserved })),
  };
}

registerUsageCheck('store', async (id) => ((await StockLedger.exists({ storeId: id })) ? 'This store has stock movements' : null));
