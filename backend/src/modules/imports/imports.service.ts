import { storage } from '../../adapters/storage';
import { Brand, Category, Customer, ImportBatch, ImportEffect, ImportMapping, Item, LoyaltyLedger, ReviewItem, StockBalance, StockLedger, Store, Variant, Vendor } from '../../models';
import { AppError, badRequest, businessRule, forbidden, notFound } from '../../lib/errors';
import { readSheetRows, readWorkbook, type SheetMeta } from '../../lib/excel/read';
import { withTransaction } from '../../lib/transaction';
import { bumpSeriesTo } from '../../lib/numberSeries';
import { iso } from '../../lib/list';
import type { AuthUser } from '../../middleware/auth';
import type { AuditEntry } from '../../middleware/audit';
import { FIELDS, autoMap, suggestMapping, type Target } from './targets';
import { applyStockUnits, planStock, prepareStockRows, type Prepared, type Unit } from './stock';
import { applyParties, planParties, preparePartyRows, type PartyPrepared } from './partiesImport';

type Audit = (e: AuditEntry) => void;
export const IMPORT_BUCKET = 'backups' as const; // private bucket: import files can hold real stock and customer data
const BATCH_UNITS = 60;
const TARGET_PERMS: Record<Target, string[]> = { items: ['items.create'], opening_stock: ['items.create', 'stock.edit'], vendors: ['vendors.create'], customers: ['customers.create'] };

export function requireTargetPermission(user: AuthUser, target: Target) {
  const miss = TARGET_PERMS[target].filter((p) => !user.permissions.has(p));
  if (miss.length) throw forbidden(`You need the ${miss.join(' and ')} permission to import ${target.replace('_', ' ')}`);
}

const countsOf = (c: any) => ({ new: c.new ?? 0, updated: c.updated ?? 0, skipped: c.skipped ?? 0, failed: c.failed ?? 0, reviewFlagged: c.reviewFlagged ?? 0 });

async function suggestedFor(target: Target, sheets: SheetMeta[]) {
  const saved: any[] = await ImportMapping.find({ target, builtin: false }).lean();
  const sheet = pickSheet(sheets, target);
  if (!sheet) return null;
  const s = suggestMapping(target, sheet.name, sheet.headers, saved) ?? { name: 'Auto matched columns', mapping: autoMap(target, sheet.headers) };
  return { name: s.name, sheet: sheet.name, headerRow: sheet.headerRow, mapping: s.mapping, options: (s as any).options ?? {} };
}
function pickSheet(sheets: SheetMeta[], target: Target) {
  const hint = target === 'vendors' ? /vendor/i : target === 'customers' ? /customer/i : /stock/i;
  return sheets.find((s) => hint.test(s.name) && s.rows > 0) ?? [...sheets].sort((a, b) => b.rows - a.rows)[0] ?? null;
}

export function batchDto(b: any) {
  const counts = b.result?.counts ?? b.preview?.counts ?? null;
  return {
    id: String(b._id), target: b.target, filename: b.filename, status: b.status,
    sheets: (b.sheets ?? []).map((s: any) => ({ name: s.name, rows: s.rows, headers: s.headers })),
    sheet: b.sheet ?? null, mapping: b.mapping ?? {}, mappingName: b.mappingName ?? null,
    suggestedMapping: b.options?.suggested ? { name: b.options.suggested.name, sheet: b.options.suggested.sheet ?? null, mapping: b.options.suggested.mapping } : null,
    progress: { processed: b.progress?.processed ?? 0, total: b.progress?.total ?? 0 },
    counts: counts ? countsOf(counts) : null, createdAt: iso(b.createdAt)!, committedAt: iso(b.committedAt),
  };
}

async function loadBatch(id: string): Promise<any> {
  const b = await ImportBatch.findById(id);
  if (!b) throw notFound('Import');
  return b;
}
const fileOf = (b: any) => storage().getObject(IMPORT_BUCKET, b.fileKey).catch(() => { throw badRequest('The uploaded file could not be found. Upload it again.', [{ path: 'fileKey', message: 'File not found in storage' }]); });

// ---------- step 1: upload and detect sheets ----------
export async function createImport(user: AuthUser, input: { fileKey: string; filename: string; target: Target }, audit: Audit) {
  requireTargetPermission(user, input.target);
  if (!input.fileKey.startsWith('imports/')) throw badRequest('File key is not an import upload', [{ path: 'fileKey', message: 'Upload through /uploads/presign with purpose import' }]);
  const buf = await storage().getObject(IMPORT_BUCKET, input.fileKey).catch(() => { throw badRequest('File not found. Upload it first.', [{ path: 'fileKey', message: 'File not found in storage' }]); });
  let sheets: SheetMeta[];
  try { sheets = readWorkbook(buf).sheets; } catch { throw badRequest('This file could not be read as xlsx, xlsb or csv', [{ path: 'fileKey', message: 'Unreadable spreadsheet' }]); }
  const suggested = await suggestedFor(input.target, sheets);
  const b: any = await ImportBatch.create({
    target: input.target, fileKey: input.fileKey, filename: input.filename, sheets: sheets.map((s) => ({ name: s.name, rows: s.rows, headers: s.headers })),
    status: 'uploaded', options: { suggested }, createdBy: user.id, headerRow: suggested?.headerRow ?? 1,
  });
  audit({ entity: 'import', entityId: String(b._id), action: 'upload', after: { target: input.target, filename: input.filename, sheets: sheets.length } });
  return batchDto(b.toObject());
}

// ---------- step 2: choose sheet and map columns ----------
export async function setMapping(id: string, input: any, audit: Audit) {
  const b = await loadBatch(id);
  if (['committing', 'committed', 'rolled_back'].includes(b.status)) throw businessRule('This import has already been committed', 'IMPORT_LOCKED');
  const sheet: SheetMeta | undefined = b.sheets.find((s: any) => s.name === input.sheet);
  if (!sheet) throw badRequest('Sheet not found in this file', [{ path: 'sheet', message: `Choose one of: ${b.sheets.map((s: any) => s.name).join(', ')}` }]);
  const { headers } = readSheetRows(readWorkbook(await fileOf(b)).wb, input.sheet, input.headerRow);
  const have = new Set(headers.map((h) => h.trim()));
  const errs: { path: string; message: string }[] = [];
  for (const [field, col] of Object.entries<string>(input.mapping)) {
    if (!FIELDS[b.target as Target].some((f) => f.key === field)) errs.push({ path: `mapping.${field}`, message: 'Unknown target field' });
    else if (!have.has(col.trim())) errs.push({ path: `mapping.${field}`, message: `Column "${col}" is not in sheet ${input.sheet}` });
  }
  for (const f of FIELDS[b.target as Target]) if (f.required && !input.mapping[f.key]) errs.push({ path: `mapping.${f.key}`, message: `${f.label} must be mapped` });
  if (errs.length) throw badRequest('Column mapping is not valid', errs);
  b.sheet = input.sheet; b.headerRow = input.headerRow; b.mapping = input.mapping; b.status = 'mapped'; b.preview = null;
  // A saved mapping can carry options (the Krishnas Orchids stock sheet is dated 7 Nov 2026). Use them unless the caller gave their own.
  const sug = b.options?.suggested;
  const sameAsSuggested = sug && JSON.stringify(sug.mapping) === JSON.stringify(input.mapping);
  b.options = { ...(b.options ?? {}), storeId: input.storeId, asOf: input.asOf ?? (sameAsSuggested ? sug.options?.asOf : undefined) };
  b.mappingName = input.saveMappingAs ?? b.options?.suggested?.name ?? null;
  b.markModified('options'); b.markModified('mapping');
  await b.save();
  if (input.saveMappingAs) await ImportMapping.updateOne({ target: b.target, name: input.saveMappingAs }, { $set: { headers, mapping: input.mapping, builtin: false } }, { upsert: true });
  audit({ entity: 'import', entityId: id, action: 'map', after: { sheet: input.sheet, mapping: input.mapping } });
  return batchDto(b.toObject());
}

// ---------- shared: read, clean, plan ----------
interface Ready { kind: 'stock' | 'parties'; stock?: Prepared; parties?: PartyPrepared; units: Unit[] | any[]; plan: any; totalRows: number }

async function prepare(b: any): Promise<Ready> {
  if (!b.sheet || !Object.keys(b.mapping ?? {}).length) throw badRequest('Choose the sheet and map the columns first', [{ path: 'mapping', message: 'Mapping is missing' }]);
  const { rows } = readSheetRows(readWorkbook(await fileOf(b)).wb, b.sheet, b.headerRow);
  if (b.target === 'items' || b.target === 'opening_stock') {
    const stock = prepareStockRows(rows, b.mapping);
    const plan = await planStock(stock.rows, b.target === 'opening_stock');
    return { kind: 'stock', stock, units: plan.units, plan, totalRows: rows.length };
  }
  const parties = await preparePartyRows(b.target, rows, b.mapping);
  const plan = await planParties(b.target, parties.rows);
  return { kind: 'parties', parties, units: parties.rows, plan, totalRows: rows.length };
}

const REASON_TEXT: Record<string, string> = {
  MISSING_SIZE: 'rows have no real size', MISSING_CATEGORY: 'rows have no category', MISSING_BRAND: 'rows have no brand', MISSING_MODEL: 'rows have no model',
  MISSING_HSN: 'rows have no HSN (suggestions are ready to approve in bulk)', INVALID_HSN: 'rows have an HSN that is not a valid heading', MULTI_SIZE: 'rows hold several sizes in one (flagged for splitting)',
  ODD_SIZE: 'rows have an unusual size', MRP_RAISED: 'rows had MRP below the selling price, MRP was raised to the selling price', NO_PRICE: 'rows have no price',
  NEGATIVE_QTY: 'rows have negative quantity (no opening stock posted)', NO_COST: 'rows with stock have no cost', ODD_CODE: 'rows have an unusual item code',
};

// ---------- step 3: dry run ----------
export async function previewImport(id: string, audit: Audit) {
  const b = await loadBatch(id);
  if (['committing', 'committed', 'rolled_back'].includes(b.status)) throw businessRule('This import has already been committed', 'IMPORT_LOCKED');
  const r = await prepare(b);
  const issues = r.kind === 'stock' ? [...r.stock!.errors.map((e) => ({ ...e, type: 'failed' })), ...r.stock!.skipped.map((e) => ({ ...e, type: 'skipped' }))] : [...r.parties!.errors.map((e) => ({ ...e, type: 'failed' })), ...r.parties!.skipped.map((e) => ({ ...e, type: 'skipped' }))];
  issues.sort((a, c) => a.row - c.row);
  const flagged = r.kind === 'stock' ? r.stock!.rows.filter((x) => x.flags.length).length : 0;
  const counts = {
    new: r.plan.newRows, updated: r.plan.updatedRows,
    skipped: (r.kind === 'stock' ? r.stock!.skipped : r.parties!.skipped).length, failed: (r.kind === 'stock' ? r.stock!.errors : r.parties!.errors).length, reviewFlagged: flagged,
  };
  const notes: string[] = [];
  if (r.kind === 'stock') {
    const tally = new Map<string, number>();
    for (const row of r.stock!.rows) for (const f of row.flags) tally.set(f, (tally.get(f) ?? 0) + 1);
    for (const [k, n] of [...tally.entries()].sort((a, c) => c[1] - a[1])) notes.push(`${n} ${REASON_TEXT[k] ?? k}`);
    const products = r.units.filter((u: Unit) => u.kind === 'new_item').length;
    notes.push(`${r.plan.newRows} new variants will form ${products} products (same brand, model and category become one product)`);
    // Source totals often include negative quantities (oversold in the old system). They are not posted, so say how the totals reconcile.
    const neg = r.stock!.rows.filter((x) => x.qty < 0);
    for (const x of neg) notes.push(`Row ${x.row} (${x.code}) has quantity ${x.qty} at cost ${(x.baseCost / 100).toFixed(2)}. It is not posted (no negative stock). The source file's own total includes it, so imported pieces differ from that total by ${x.qty} and cost value by ${((x.qty * x.baseCost) / 100).toFixed(2)}.`);
    if (b.target === 'items') notes.push('Opening stock is not posted for target "items". Use "opening_stock" to also post quantities.');
  }
  const totals = { rows: counts.new + counts.updated, pieces: r.plan.pieces ?? 0, costValue: r.plan.costValue ?? 0, currency: 'INR' as const };
  const sample = r.kind === 'stock'
    ? r.stock!.rows.slice(0, 5).map((x) => ({ row: x.row, itemCode: x.code, name: x.name, category: x.category, brand: x.brand, size: x.size, hsn: x.hsn, qty: x.qty, baseCost: x.baseCost, sellingPrice: x.selling, mrp: x.mrp, flags: x.flags }))
    : r.parties!.rows.slice(0, 5).map((x) => ({ row: x.row, ...x.data, existing: !!x.existing }));
  b.preview = { counts, totals, sample, notes, errorCount: issues.length, allErrors: issues.slice(0, 5000) };
  b.status = 'previewed'; b.progress = { processed: 0, total: r.units.length, nextRow: 0 };
  await b.save();
  audit({ entity: 'import', entityId: id, action: 'preview', after: { counts, totals } });
  return { importId: id, counts, totals, sample, errors: issues.slice(0, 200).map((e) => ({ row: e.row, code: e.code, message: `${e.type === 'skipped' ? 'Skipped: ' : ''}${e.message}` })), errorCount: issues.length, notes };
}

export async function errorsCsv(id: string) {
  const b = await loadBatch(id);
  if (!b.preview) throw businessRule('Run the preview first', 'PREVIEW_REQUIRED');
  const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  return ['row,item_code,type,message', ...(b.preview.allErrors as any[]).map((e) => [e.row, esc(e.code), e.type, esc(e.message)].join(','))].join('\n') + '\n';
}

// ---------- step 4: commit (chunked and resumable) ----------
async function defaultStoreId(): Promise<string> {
  const s: any = (await Store.findOne({ type: 'shop', active: true }).sort({ createdAt: 1 }).lean()) ?? (await Store.findOne({ active: true }).lean());
  if (!s) throw badRequest('No store exists to post opening stock to');
  return String(s._id);
}

/**
 * Each call works for up to maxSeconds (AppSail requests time out at 30s) and saves progress after every batch.
 * Call again until done is true. Every batch of units is ONE transaction: it fully saves or fully fails.
 */
export async function commitImport(id: string, user: AuthUser, maxSeconds: number, audit: Audit) {
  requireTargetPermission(user, (await loadBatch(id)).target);
  const now = new Date();
  const b: any = await ImportBatch.findOneAndUpdate(
    { _id: id, status: { $in: ['mapped', 'previewed', 'committing'] }, $or: [{ lockUntil: null }, { lockUntil: { $lt: now } }] },
    { $set: { lockUntil: new Date(now.getTime() + 35_000) } }, { new: true });
  if (!b) {
    const cur = await loadBatch(id);
    if (cur.status === 'committed') return commitResponse(cur, true);
    if (cur.status === 'rolled_back') throw businessRule('This import was rolled back', 'IMPORT_LOCKED');
    if (cur.status === 'committing') throw new AppError(409, 'COMMIT_IN_PROGRESS', 'Another commit call is still working on this import');
    throw businessRule('Choose the sheet and map the columns first', 'MAPPING_REQUIRED');
  }
  try {
    const r = await prepare(b);
    const first = (b.progress?.processed ?? 0) === 0;
    if (first) { b.status = 'committing'; b.result = { new: 0, updated: 0, failed: 0, reviewFlagged: 0, pieces: 0, costValue: 0, failures: [] }; b.markModified('result'); await b.save(); }
    const total = r.units.length;
    const deadline = Date.now() + maxSeconds * 1000;
    let i = b.progress?.processed ?? 0;
    const post = b.target === 'opening_stock';
    const storeId = post ? (b.options?.storeId ?? (await defaultStoreId())) : undefined;
    const asOf = b.options?.asOf ? new Date(`${String(b.options.asOf).slice(0, 10)}T00:00:00+05:30`) : new Date();

    while (i < total && Date.now() < deadline) {
      const slice = r.units.slice(i, i + BATCH_UNITS);
      const run = (units: any[]) => withTransaction((session) => r.kind === 'stock'
        ? applyStockUnits(units as Unit[], { batchId: id, userId: user.id, session, post, storeId, asOf, prepared: r.stock! })
        : applyParties(b.target, units, { batchId: id, session }));
      let res;
      try { res = [await run(slice)]; } catch {
        // One bad unit must not sink the whole batch: retry them one at a time and record the failures.
        res = [];
        for (const u of slice) {
          try { res.push(await run([u])); } catch (e: any) {
            const rows = r.kind === 'stock' ? (u as Unit).rows.map((x) => x.row) : [(u as any).row];
            await ImportBatch.updateOne({ _id: id }, { $inc: { 'result.failed': rows.length }, $push: { 'result.failures': { rows, message: String(e?.message ?? e).slice(0, 300) } } });
          }
        }
      }
      const inc: any = {};
      for (const x of res) for (const k of ['new', 'updated', 'reviewFlagged', 'pieces', 'costValue'] as const) inc[`result.${k}`] = (inc[`result.${k}`] ?? 0) + x[k];
      i += slice.length;
      await ImportBatch.updateOne({ _id: id }, { $inc: inc, $set: { 'progress.processed': i, 'progress.total': total, lockUntil: new Date(Date.now() + 35_000) } });
    }
    const done = i >= total;
    if (done) {
      const fresh: any = await ImportBatch.findById(id).lean();
      const prepSkipped = (r.kind === 'stock' ? r.stock!.skipped : r.parties!.skipped).length;
      const prepFailed = (r.kind === 'stock' ? r.stock!.errors : r.parties!.errors).length;
      const counts = { new: fresh.result.new, updated: fresh.result.updated, skipped: prepSkipped, failed: prepFailed + fresh.result.failed, reviewFlagged: fresh.result.reviewFlagged };
      if (r.kind === 'stock') {
        const nums = r.stock!.rows.map((x) => /^KO(\d+)$/i.exec(x.code)).filter(Boolean).map((m) => Number(m![1]));
        if (nums.length) await bumpSeriesTo('ITEM', Math.max(...nums)); // new codes continue after the highest imported KO code
      }
      await ImportBatch.updateOne({ _id: id }, { $set: { status: 'committed', committedAt: new Date(), lockUntil: null, 'result.counts': counts } });
      audit({ entity: 'import', entityId: id, action: 'commit', after: { counts, pieces: fresh.result.pieces, costValue: fresh.result.costValue } });
    } else {
      await ImportBatch.updateOne({ _id: id }, { $set: { lockUntil: null } });
    }
    return commitResponse(await loadBatch(id), done);
  } catch (e) {
    await ImportBatch.updateOne({ _id: id }, { $set: { lockUntil: null } });
    throw e;
  }
}

function commitResponse(b: any, done: boolean) {
  const r = b.result ?? {};
  const counts = r.counts ?? { new: r.new ?? 0, updated: r.updated ?? 0, skipped: 0, failed: r.failed ?? 0, reviewFlagged: r.reviewFlagged ?? 0 };
  return { importId: String(b._id), status: (done ? 'committed' : 'committing') as 'committed' | 'committing', processed: b.progress?.processed ?? 0, total: b.progress?.total ?? 0, counts: countsOf(counts), done };
}

// ---------- rollback ----------
const MODELS: Record<string, any> = { variants: Variant, items: Item, stock_ledger: StockLedger, stock_balances: StockBalance, categories: Category, brands: Brand, vendors: Vendor, customers: Customer, loyalty_ledger: LoyaltyLedger };

/**
 * Removes everything a batch created and puts back what it changed. Blocked once any of the imported items has
 * later stock movements, so a rollback can never hide a real sale or purchase.
 */
export async function rollbackImport(id: string, user: AuthUser, audit: Audit) {
  const b = await loadBatch(id);
  requireTargetPermission(user, b.target);
  if (b.status === 'rolled_back') throw businessRule('This import was already rolled back', 'IMPORT_LOCKED');
  if (!['committed', 'committing', 'failed'].includes(b.status)) throw businessRule('Nothing was committed, so there is nothing to roll back', 'NOTHING_TO_ROLL_BACK');
  const effects: any[] = await ImportEffect.find({ batchId: id }).lean();
  const created = (c: string) => effects.filter((e) => e.coll === c && e.action === 'created').map((e) => e.docId);
  const variantIds = created('variants');
  const ledgerIds = created('stock_ledger');
  const touched: any[] = ledgerIds.length ? await StockLedger.find({ _id: { $in: ledgerIds } }, { variantId: 1 }).lean() : [];
  const touchedVariants = [...new Set(touched.map((l) => String(l.variantId)))];
  if (touchedVariants.length) {
    const later = await StockLedger.countDocuments({ variantId: { $in: touchedVariants }, docNumber: { $ne: id } });
    if (later) throw businessRule(`Rollback is blocked: ${later} stock movement(s) happened after this import. Reverse those first.`, 'ROLLBACK_BLOCKED');
  }
  // Variants added later to an imported product (for example by splitting sizes) go with the product, unless they have stock history.
  const createdItems = created('items');
  const children: any[] = createdItems.length ? await Variant.find({ itemId: { $in: createdItems }, _id: { $nin: variantIds } }, { _id: 1 }).lean() : [];
  if (children.length && (await StockLedger.countDocuments({ variantId: { $in: children.map((c) => c._id) } }))) {
    throw businessRule('Rollback is blocked: variants added to the imported products later have stock movements', 'ROLLBACK_BLOCKED');
  }
  const removed = { items: 0, variants: 0, ledgerRows: 0, others: 0 }; let reverted = 0;
  await withTransaction(async (session) => {
    const s = { session };
    for (const e of effects.filter((x) => x.action === 'updated')) {
      if (e.coll === 'stock_balances_inc') { await StockBalance.updateOne({ _id: e.docId }, { $inc: { onHand: -(e.before?.qty ?? 0) } }, s); reverted++; continue; }
      const M = MODELS[e.coll]; if (!M) continue;
      await M.updateOne({ _id: e.docId }, { $set: e.before ?? {} }, s); reverted++;
    }
    if (children.length) removed.variants += (await Variant.deleteMany({ _id: { $in: children.map((c) => c._id) } }, s)).deletedCount;
    for (const c of ['stock_ledger', 'stock_balances', 'loyalty_ledger', 'variants', 'items', 'vendors', 'customers']) {
      const ids = created(c); if (!ids.length) continue;
      const r = await MODELS[c].deleteMany({ _id: { $in: ids } }, s);
      if (c === 'variants') removed.variants += r.deletedCount; else if (c === 'items') removed.items += r.deletedCount; else if (c === 'stock_ledger') removed.ledgerRows += r.deletedCount; else removed.others += r.deletedCount;
    }
    // Categories and brands the import created are removed only if nothing uses them now.
    for (const [c, field] of [['categories', 'categoryId'], ['brands', 'brandId']] as const) {
      for (const docId of created(c)) if (!(await Item.exists({ [field]: docId }).session(session))) { await MODELS[c].deleteOne({ _id: docId }, s); removed.others++; }
    }
    // Updated variants that got an opening balance from this batch no longer have stock history.
    for (const vid of touchedVariants) if (!variantIds.includes(vid) && !(await StockLedger.exists({ variantId: vid }).session(session))) await Variant.updateOne({ _id: vid }, { $set: { hasStockHistory: false } }, s);
    await ReviewItem.deleteMany({ batchId: id }, s);
    await ImportBatch.updateOne({ _id: id }, { $set: { status: 'rolled_back', rolledBackAt: new Date(), lockUntil: null } }, s);
  });
  audit({ entity: 'import', entityId: id, action: 'rollback', after: { removed, reverted } });
  return { importId: id, removed, reverted };
}

export async function listImports(q: { page: number; pageSize: number }) {
  const skip = (q.page - 1) * q.pageSize;
  const [rows, total]: any = await Promise.all([ImportBatch.find().sort({ createdAt: -1 }).skip(skip).limit(q.pageSize).lean(), ImportBatch.countDocuments()]);
  return { items: rows.map(batchDto), total, nextPage: skip + rows.length < total ? q.page + 1 : null };
}
/** The route is 'authenticated'; the real permission depends on what is being imported. */
export async function assertBatchPermission(user: AuthUser, id: string) { requireTargetPermission(user, (await loadBatch(id)).target); }
export const getImport = async (id: string) => batchDto((await loadBatch(id)).toObject());
export const listMappings = async () => {
  const saved: any[] = await ImportMapping.find().lean();
  return { items: saved.map((m) => ({ id: String(m._id), name: m.name, target: m.target, mapping: m.mapping, builtin: !!m.builtin })) };
};
