import type { ClientSession } from 'mongoose';
import { Brand, Category, Item, ImportEffect, ReviewItem, StockBalance, StockLedger, Variant } from '../../models';
import type { SheetRow } from '../../lib/excel/read';
import { checkHsn, normalizeHsn } from '../../lib/hsn';
import { isBlankWord, parseSizes } from '../../lib/sizes';
import { rupeesToPaise } from '../../lib/money';
import { slugify } from '../../lib/crud';

/** Reasons that need a human decision. Computed from data, so fixing the data clears them. */
export const DATA_REASONS = ['MISSING_SIZE', 'MISSING_CATEGORY', 'MISSING_BRAND', 'MISSING_MODEL', 'MISSING_HSN', 'INVALID_HSN', 'MULTI_SIZE', 'ODD_SIZE', 'NO_PRICE'] as const;
/** Reasons that stay until someone dismisses them. */
export const STICKY_REASONS = ['MRP_RAISED', 'NEGATIVE_QTY', 'NO_COST', 'ODD_CODE'] as const;

export interface StockRow {
  row: number; code: string; name: string; printName: string; batchRef: string; category: string; model: string; brand: string;
  size: string; sizeSplit: string[]; hsn: string; qty: number; baseCost: number; selling: number; mrp: number; barcode: string; color: string;
  bin: string; type: string; reorderLevel: number; flags: string[]; detail: Record<string, unknown>; priceMissing: boolean;
}
export interface RowIssue { row: number; code: string | null; message: string }
export interface Prepared {
  rows: StockRow[]; errors: RowIssue[]; skipped: RowIssue[]; notes: string[];
  suggestions: Map<string, { hsn: string; count: number; total: number; note: string }>; // by category key
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const cleanWord = (v: unknown) => (isBlankWord(v) ? '' : str(v).replace(/\s+/g, ' '));
function money(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? rupeesToPaise(String(Math.round(v * 10000) / 10000)) : 0;
  const s = str(v);
  if (!s) return 0;
  try { return rupeesToPaise(s); } catch { return NaN; }
}
function codeText(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return str(v);
}

/** Rows that are really headers repeated inside the data (row 57 of the stock sheet). */
const looksLikeHeader = (code: string, name: string) => /^code$/i.test(code) || /^item name$/i.test(name);

export function prepareStockRows(raw: SheetRow[], mapping: Record<string, string>): Prepared {
  const get = (r: SheetRow, f: string) => (mapping[f] ? r.values[mapping[f]!] : undefined);
  const rows: StockRow[] = []; const errors: RowIssue[] = []; const skipped: RowIssue[] = []; const notes: string[] = [];
  const seenCodes = new Set<string>(); const seenBarcodes = new Set<string>();

  for (const r of raw) {
    const code = codeText(get(r, 'itemCode'));
    const name = str(get(r, 'name'));
    const printName = str(get(r, 'printName'));
    if (!code && !name) { skipped.push({ row: r.row, code: null, message: 'Totals or blank row (no item code)' }); continue; }
    if (looksLikeHeader(code, name)) { skipped.push({ row: r.row, code, message: 'Repeated header row inside the data' }); continue; }
    if (!code) { errors.push({ row: r.row, code: null, message: 'Item code is missing' }); continue; }
    if (seenCodes.has(code)) { skipped.push({ row: r.row, code, message: `Duplicate item code ${code} in the file (first one kept)` }); continue; }
    const itemName = name || printName;
    if (!itemName) { errors.push({ row: r.row, code, message: 'Item name is missing' }); continue; }

    const flags: string[] = []; const detail: Record<string, unknown> = {};
    const category = cleanWord(get(r, 'category')); const brand = cleanWord(get(r, 'brand')); const model = cleanWord(get(r, 'model'));
    if (!category) flags.push('MISSING_CATEGORY');
    if (!brand) flags.push('MISSING_BRAND');
    if (!model) flags.push('MISSING_MODEL');

    const sz = parseSizes(get(r, 'size'));
    let size = '';
    if (sz.blank) flags.push('MISSING_SIZE');
    else if (sz.multi) { size = str(get(r, 'size')); flags.push('MULTI_SIZE'); detail.sizes = sz.sizes; }
    else { size = sz.sizes[0] ?? ''; if (sz.weird) { flags.push('ODD_SIZE'); detail.rawSize = str(get(r, 'size')); } }

    const hsn = normalizeHsn(get(r, 'hsn'));
    if (!hsn) flags.push('MISSING_HSN');
    else { const c = checkHsn(hsn); if (!c.ok) { flags.push('INVALID_HSN'); detail.hsnProblem = c.reason === 'NOT_A_HEADING' ? `${hsn.slice(0, 4)} is not a valid heading in Chapter ${hsn.slice(0, 2)}` : 'HSN must be 4, 6 or 8 digits'; } }

    let selling = money(get(r, 'sellingPrice')); let mrp = money(get(r, 'mrp')); const baseCost = money(get(r, 'baseCost'));
    if ([selling, mrp, baseCost].some(Number.isNaN)) { errors.push({ row: r.row, code, message: 'A price or cost is not a number' }); continue; }
    let priceMissing = false;
    if (!mapping.sellingPrice && mrp > 0) selling = mrp; // sheets without a selling price column: sell at MRP
    if (mrp === 0 && selling === 0) { priceMissing = true; flags.push('NO_PRICE'); }
    else if (mrp < selling) { detail.originalMrp = mrp; mrp = selling; flags.push('MRP_RAISED'); }
    else if (selling === 0) selling = mrp;

    const qtyRaw = get(r, 'openingQty');
    const qty = typeof qtyRaw === 'number' ? qtyRaw : Number(str(qtyRaw)) || 0;
    if (qty < 0) { flags.push('NEGATIVE_QTY'); detail.qty = qty; }
    if (qty > 0 && baseCost === 0) flags.push('NO_COST');
    if (code.length < 3 || /\s/.test(code)) flags.push('ODD_CODE');

    const barcode = str(get(r, 'barcode'));
    if (barcode && seenBarcodes.has(barcode)) { errors.push({ row: r.row, code, message: `Barcode ${barcode} is used by another row in the file` }); continue; }
    if (barcode) seenBarcodes.add(barcode);
    seenCodes.add(code);

    rows.push({
      row: r.row, code, name: itemName.replace(/\s+/g, ' '), printName: printName.replace(/\s+/g, ' '), batchRef: str(get(r, 'batchRef')), category, model, brand,
      size, sizeSplit: sz.multi ? sz.sizes : [], hsn, qty: Number.isFinite(qty) ? qty : 0, baseCost, selling, mrp, barcode, color: cleanWord(get(r, 'color')),
      bin: str(get(r, 'binLocation')), type: str(get(r, 'type')), reorderLevel: Number(str(get(r, 'reorderLevel'))) || 0, flags, detail, priceMissing,
    });
  }

  // Suggest an HSN for rows without one: the most common valid HSN already used in the same category. Never applied silently.
  const byCat = new Map<string, Map<string, number>>(); const totals = new Map<string, number>();
  for (const r of rows) {
    if (!r.category || !r.hsn || !checkHsn(r.hsn).ok) continue;
    const k = r.category.toLowerCase();
    const m = byCat.get(k) ?? new Map<string, number>(); m.set(r.hsn, (m.get(r.hsn) ?? 0) + 1); byCat.set(k, m); totals.set(k, (totals.get(k) ?? 0) + 1);
  }
  const suggestions = new Map<string, { hsn: string; count: number; total: number; note: string }>();
  for (const [k, m] of byCat) {
    const [hsn, count] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const total = totals.get(k)!;
    const cat = rows.find((r) => r.category.toLowerCase() === k)!.category;
    suggestions.set(k, { hsn, count, total, note: `Used by ${count} of ${total} items with a valid HSN in category "${cat}" (${Math.round((count / total) * 100)}%)${count / total < 0.6 ? ' - low confidence, please check' : ''}` });
  }
  return { rows, errors, skipped, notes, suggestions };
}

export const suggestionFor = (p: Prepared, r: StockRow) => (r.category ? (p.suggestions.get(r.category.toLowerCase()) ?? null) : null);

// ---------- planning (needs the database) ----------
export interface Unit { kind: 'new_item' | 'update_variant'; rows: StockRow[]; itemId?: string; existing?: any; hasHistory?: boolean }
export interface Plan { units: Unit[]; newRows: number; updatedRows: number; pieces: number; costValue: number; postedRows: number }

const groupKey = (r: StockRow) => (r.brand && r.model && r.category ? `${r.brand}|${r.model}|${r.category}`.toLowerCase() : null);

/** Rows with the same brand, model and category become one product with several variants. No model means each row is its own product. */
export async function planStock(rows: StockRow[], post: boolean): Promise<Plan> {
  const codes = rows.map((r) => r.code);
  const existingVariants: any[] = await Variant.find({ itemCode: { $in: codes } }).lean();
  const existing = new Map(existingVariants.map((v) => [v.itemCode, v]));
  const withHistory = new Set<string>(
    (await StockLedger.distinct('variantId', { variantId: { $in: existingVariants.map((v) => v._id) } })).map(String));

  const units: Unit[] = []; const groups = new Map<string, StockRow[]>();
  for (const r of rows) {
    const ex = existing.get(r.code);
    if (ex) { units.push({ kind: 'update_variant', rows: [r], itemId: String(ex.itemId), existing: ex, hasHistory: withHistory.has(String(ex._id)) }); continue; }
    const k = groupKey(r);
    if (!k) { units.push({ kind: 'new_item', rows: [r] }); continue; }
    const g = groups.get(k) ?? []; g.push(r); groups.set(k, g);
  }
  // A group that already has a sibling in the database adds its new rows as variants of that product.
  const siblingByGroup = new Map<string, string>();
  for (const r of rows) { const ex = existing.get(r.code); const k = groupKey(r); if (ex && k) siblingByGroup.set(k, String(ex.itemId)); }
  for (const [k, g] of groups) units.push({ kind: 'new_item', rows: g, itemId: siblingByGroup.get(k) });

  let newRows = 0, updatedRows = 0, pieces = 0, costValue = 0, postedRows = 0;
  for (const u of units) for (const r of u.rows) {
    if (u.kind === 'update_variant') updatedRows++; else newRows++;
    const willPost = post && r.qty > 0 && !(u.kind === 'update_variant' && u.hasHistory);
    if (willPost) { pieces += r.qty; costValue += r.qty * r.baseCost; postedRows++; }
  }
  return { units, newRows, updatedRows, pieces, costValue, postedRows };
}

// ---------- applying (inside a transaction) ----------
export interface ApplyCtx {
  batchId: string; userId: string; session: ClientSession; post: boolean; storeId?: string; asOf: Date;
  prepared: Prepared;
}

async function findOrCreateRef(model: typeof Category | typeof Brand, kind: 'categories' | 'brands', name: string, ctx: ApplyCtx, cache: Map<string, string>, effects: any[]) {
  if (!name) return null;
  const key = slugify(name);
  if (cache.has(key)) return cache.get(key)!;
  const found: any = await model.findOne({ slug: key }).session(ctx.session).lean();
  if (found) { cache.set(key, String(found._id)); return String(found._id); }
  const [doc] = await model.create([{ name, slug: key, active: true }], { session: ctx.session });
  effects.push({ batchId: ctx.batchId, coll: kind, docId: String(doc!._id), action: 'created' });
  cache.set(key, String(doc!._id));
  return String(doc!._id);
}

export interface ApplyResult { new: number; updated: number; reviewFlagged: number; pieces: number; costValue: number }

export async function applyStockUnits(units: Unit[], ctx: ApplyCtx): Promise<ApplyResult> {
  const res: ApplyResult = { new: 0, updated: 0, reviewFlagged: 0, pieces: 0, costValue: 0 };
  const effects: any[] = []; const reviews: any[] = [];
  const catCache = new Map<string, string>(); const brandCache = new Map<string, string>();
  const s = { session: ctx.session };

  const queueReview = (r: StockRow, itemId: string, variantId: string, extra: string[] = []) => {
    const reasons = [...new Set([...r.flags, ...extra])];
    if (!reasons.length) return;
    res.reviewFlagged++;
    reviews.push({
      batchId: ctx.batchId, rowNumber: r.row, itemCode: r.code, itemId, variantId, name: r.name, category: r.category || null, reasons,
      detail: r.detail, suggestion: reasons.some((x) => x === 'MISSING_HSN' || x === 'INVALID_HSN') ? suggestionFor(ctx.prepared, r) : null, status: 'open',
    });
  };

  const postOpening = async (variantId: string, r: StockRow) => {
    if (!ctx.post || r.qty <= 0 || !ctx.storeId) return;
    const [led] = await StockLedger.create([{ variantId, storeId: ctx.storeId, type: 'OPENING', qty: r.qty, unitCost: r.baseCost, docType: 'IMPORT', docNumber: ctx.batchId, userId: ctx.userId, at: ctx.asOf, note: r.batchRef ? `Batch ${r.batchRef}` : undefined }], s);
    effects.push({ batchId: ctx.batchId, coll: 'stock_ledger', docId: String(led!._id), action: 'created' });
    const bal: any = await StockBalance.findOneAndUpdate({ variantId, storeId: ctx.storeId }, { $inc: { onHand: r.qty } }, { upsert: true, new: true, includeResultMetadata: true, ...s });
    if (!bal.lastErrorObject?.updatedExisting) effects.push({ batchId: ctx.batchId, coll: 'stock_balances', docId: String(bal.value._id), action: 'created' });
    else effects.push({ batchId: ctx.batchId, coll: 'stock_balances_inc', docId: String(bal.value._id), action: 'updated', before: { qty: r.qty } });
    await Variant.updateOne({ _id: variantId }, { $set: { hasStockHistory: true } }, s);
    res.pieces += r.qty; res.costValue += r.qty * r.baseCost;
  };

  for (const u of units) {
    if (u.kind === 'update_variant') {
      const r = u.rows[0]!; const ex = u.existing;
      const before: any = { size: ex.size, color: ex.color, mrp: ex.mrp, sellingPrice: ex.sellingPrice, batchRef: ex.batchRef, binLocation: ex.binLocation, baseCost: ex.baseCost, priceMissing: ex.priceMissing };
      const set: any = { mrp: r.mrp, sellingPrice: r.selling, priceMissing: r.priceMissing };
      if (r.size) set.size = r.size;
      if (r.color) set.color = r.color;
      if (r.batchRef) set.batchRef = r.batchRef;
      if (r.bin) set.binLocation = r.bin;
      if (!u.hasHistory) set.baseCost = r.baseCost; // a cost with stock history is a weighted average: never overwritten by an import
      await Variant.updateOne({ _id: ex._id }, { $set: set }, s);
      effects.push({ batchId: ctx.batchId, coll: 'variants', docId: String(ex._id), action: 'updated', before });
      // Fill blanks on the product, never overwrite what someone already set.
      const item: any = await Item.findById(ex.itemId).session(ctx.session).lean();
      const fill: any = {}; const itemBefore: any = {};
      if (!item.hsn && r.hsn) { fill.hsn = r.hsn; itemBefore.hsn = item.hsn ?? null; }
      if (!item.categoryId && r.category) { fill.categoryId = await findOrCreateRef(Category, 'categories', r.category, ctx, catCache, effects); itemBefore.categoryId = null; }
      if (!item.brandId && r.brand) { fill.brandId = await findOrCreateRef(Brand, 'brands', r.brand, ctx, brandCache, effects); itemBefore.brandId = null; }
      if (!item.model && r.model) { fill.model = r.model; itemBefore.model = null; }
      if (Object.keys(fill).length) {
        await Item.updateOne({ _id: item._id }, { $set: fill }, s);
        effects.push({ batchId: ctx.batchId, coll: 'items', docId: String(item._id), action: 'updated', before: itemBefore });
      }
      if (!u.hasHistory) await postOpening(String(ex._id), r); // a variant that already has stock history never gets a second opening balance
      queueReview(r, String(ex.itemId), String(ex._id));
      res.updated++;
      continue;
    }

    // new product (or new variants on an existing product)
    const first = u.rows[0]!;
    let itemId = u.itemId;
    if (!itemId) {
      const hsns = u.rows.map((r) => r.hsn).filter(Boolean);
      const hsn = [...new Set(hsns)].sort((a, b) => hsns.filter((x) => x === b).length - hsns.filter((x) => x === a).length)[0] ?? '';
      const [item] = await Item.create([{
        name: first.name, printName: first.printName || first.name, categoryId: await findOrCreateRef(Category, 'categories', first.category, ctx, catCache, effects),
        brandId: await findOrCreateRef(Brand, 'brands', first.brand, ctx, brandCache, effects), model: first.model || undefined, type: first.type || undefined,
        hsn: hsn || undefined, active: true, showOnWebsite: false, importBatchId: ctx.batchId,
        slug: slugify(`${first.name}-${first.code}`),
      }], s);
      itemId = String(item!._id);
      effects.push({ batchId: ctx.batchId, coll: 'items', docId: itemId, action: 'created' });
    }
    const docs = u.rows.map((r) => ({
      itemId, itemCode: r.code, sku: r.code, barcode: r.barcode || r.code, size: r.size || undefined, color: r.color || undefined, mrp: r.mrp, sellingPrice: r.selling,
      offerPrice: null, baseCost: r.baseCost, reorderLevel: r.reorderLevel, binLocation: r.bin || undefined, batchRef: r.batchRef || undefined, active: true,
      priceMissing: r.priceMissing, importBatchId: ctx.batchId,
    }));
    const created: any[] = await Variant.insertMany(docs, s);
    for (let i = 0; i < created.length; i++) {
      const v = created[i]; const r = u.rows[i]!;
      effects.push({ batchId: ctx.batchId, coll: 'variants', docId: String(v._id), action: 'created' });
      await postOpening(String(v._id), r);
      // Rows of a group can have an HSN that differs from the product HSN. Keep the row's own value in the review detail.
      queueReview(r, itemId, String(v._id));
      res.new++;
    }
  }
  if (effects.length) await ImportEffect.insertMany(effects, s);
  if (reviews.length) await ReviewItem.insertMany(reviews, s);
  return res;
}
