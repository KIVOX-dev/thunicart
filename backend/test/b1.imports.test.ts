import { parseSizes } from '../src/lib/sizes';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Brand, Category, Customer, ImportEffect, Item, LoyaltyLedger, ReviewItem, StockBalance, StockLedger, Variant, Vendor } from '../src/models';
import { setupTest, type TestCtx } from './helpers';
import { sheetBuffer, startImport } from './b1.helpers';

let t: TestCtx;
const A = '/api/v1';
beforeAll(async () => { t = await setupTest(); });
afterAll(async () => { await t.close(); });
const get = (url: string, token = t.adminToken) => t.api('GET', `${A}${url}`, { token });
const post = (url: string, body: unknown = {}, token = t.adminToken) => t.api('POST', `${A}${url}`, { token, body });

const HEAD = ['Sno', 'Code', 'Item Name', 'Print Name', 'Bach No ', 'Group ', 'Cat', 'Model', 'Brand', 'Size', 'Group2', 'Group3', 'HSN', 'Qty', 'Unit', 'Purchase ', 'Purchase Amount', 'S.Rate', 'S.Value', 'Mrp', 'M.Value', 'Margin'];
// [code, name, cat, model, brand, size, hsn, qty, purchase, srate, mrp]
type R = [string | number, string, string, string, string, string | number, string | number | null, number, number, number, number];
const row = (n: number, r: R) => [n, r[0], r[1], r[1], `KO2026${n}`, null, r[2], r[3], r[4], r[5], 'Primary', 'Primary', r[6], r[7], 'Nos', r[8], r[7] * r[8], r[9], r[7] * r[9], r[10], r[7] * r[10], 50];
const DATA: R[] = [
  ['KO1000369', 'ADV -Kurties-M-10165      ', 'Primary', 'Primary', 'Primary', 'Primary', 61083100, 10, 173.33, 370, 370], // no cat/brand/model/size
  ['KO1000305', 'ARM DOTHI GOKUL - KAVI', 'DOTHI', 'ARM', 'Primary', 'Primary', 52082210, 5, 94, 188, 188],
  ['KO1000401', 'JIANA ANKLE 75', 'LEGGINS', 'ANKLE', 'JIANA', 75, 6108, 3, 100, 250, 250], // these two become ONE product
  ['KO1000402', 'JIANA ANKLE 80', 'LEGGINS', 'ANKLE', 'JIANA', 80, 6108, 4, 100, 250, 250],
  ['KO1000403', 'JIANA ANKLE 85', 'LEGGINS', 'ANKLE', 'JIANA', 85, 6108, 2, 100, 250, 250],
  ['KO1000404', 'NO HSN LEGGING', 'LEGGINS', 'PLAIN', 'JIANA', 90, null, 6, 80, 200, 200], // suggestion: 6108
  ['KO1000405', 'SHOE', 'SHOES', 'RUN', 'ZIP', 'Free Size', 64071000, 2, 300, 600, 600], // 6407 is not a heading
  ['KO1000406', 'MULTI SIZE KURTI', 'Kurti', 'MK', 'SV', 'MLXL2XL', 6104, 12, 150, 400, 400],
  ['KO1000407', 'SPACED SIZES', 'Kurti', 'MK2', 'SV', 'S M L XL XXL', 6104, 15, 150, 400, 400],
  [8905133052549, 'NUMERIC CODE ITEM', 'Panties', 'PN', 'RLK', 'Free Size', 6108, 7, 50, 120, 120],
  ['KO1000408', 'NO PRICE', 'Panties', 'PN2', 'RLK', 'Free Size', 6108, 0, 0, 0, 0], // NO_PRICE
  ['KO1000409', 'MRP BELOW RATE', 'Panties', 'PN3', 'RLK', 'Free Size', 6108, 1, 40, 150, 100], // MRP_RAISED
  ['KO1000410', 'NEGATIVE QTY', 'Panties', 'PN4', 'RLK', 'Free Size', 6108, -3, 40, 80, 80],
  ['l', 'WEIRD CODE', 'Panties', 'PN5', 'RLK', 2.7, 6108, 1, 40, 80, 80], // ODD_CODE and ODD_SIZE
];
const EXPECT_PIECES = 10 + 5 + 3 + 4 + 2 + 6 + 2 + 12 + 15 + 7 + 0 + 1 + 0 + 1; // negative and zero rows post nothing
const EXPECT_COST = Math.round(10 * 17333 + 5 * 9400 + 3 * 10000 + 4 * 10000 + 2 * 10000 + 6 * 8000 + 2 * 30000 + 12 * 15000 + 15 * 15000 + 7 * 5000 + 1 * 4000 + 1 * 4000);

function stockSheet() {
  const rows: unknown[][] = [HEAD];
  DATA.forEach((r, i) => rows.push(row(i + 1, r)));
  rows.push(row(15, ['Code', 'Item Name', 'Group', 'Model', 'Brand', 'Size', 'HSN Code', 0, 0, 0, 0])); // header repeated inside the data
  rows.push([null, null, null, null, null, null, null, null, null, null, null, null, null, 99, null, null, 12345, null, null, null, null, 46.5]); // footer totals
  return sheetBuffer({ STOCKSUMMARYASON07112026_071120: rows, Sheet1: [] });
}

describe('stock sheet import: the Krishnas Orchids rules', () => {
  let id: string;
  it('detects the sheet, suggests the saved Krishnas Orchids mapping, and previews without writing', async () => {
    const r = await startImport(t, t.adminToken, 'opening_stock', 'Master Sheet.xlsx', stockSheet());
    id = r.id;
    expect(r.created.body.suggestedMapping.name).toBe('Krishnas Orchids stock sheet');
    expect(r.created.body.sheets.map((s: any) => s.name)).toContain('STOCKSUMMARYASON07112026_071120');
    expect(r.mapped.status).toBe(200);
    const p = await get(`/imports/${id}/preview`);
    expect(p.status).toBe(200);
    expect(p.body.counts).toMatchObject({ new: DATA.length, updated: 0, skipped: 2, failed: 0 });
    expect(p.body.totals).toMatchObject({ pieces: EXPECT_PIECES, costValue: EXPECT_COST, currency: 'INR' });
    const skips = p.body.errors.map((e: any) => e.message);
    expect(skips.some((m: string) => /Repeated header row/.test(m))).toBe(true);
    expect(skips.some((m: string) => /Totals or blank row/.test(m))).toBe(true);
    expect(p.body.notes.join(' | ')).toMatch(/no real size/);
    expect(await Variant.countDocuments()).toBe(0); // a dry run writes nothing
    const csv = await t.app.inject({ method: 'GET', url: `${A}/imports/${id}/errors`, headers: { authorization: `Bearer ${t.adminToken}` } });
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.body).toMatch(/^row,item_code,type,message/);
    expect(csv.body).toMatch(/\n16,/); // row numbers match the spreadsheet (header repeated on sheet row 16)
  });
  it('commits in one go and posts opening stock dated 7 Nov 2026', async () => {
    const c = await post(`/imports/${id}/commit`);
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ done: true, status: 'committed', processed: c.body.total });
    expect(c.body.counts).toMatchObject({ new: DATA.length, updated: 0, skipped: 2, failed: 0 });
    const led: any[] = await StockLedger.find({ docNumber: id }).lean();
    expect(led.every((l) => l.type === 'OPENING')).toBe(true);
    expect(led.reduce((a, l) => a + l.qty, 0)).toBe(EXPECT_PIECES);
    expect(led.reduce((a, l) => a + l.qty * l.unitCost, 0)).toBe(EXPECT_COST);
    expect(new Date(led[0].at).toISOString()).toBe('2026-11-06T18:30:00.000Z'); // 7 Nov 2026 00:00 IST
    const bal = await StockBalance.aggregate([{ $group: { _id: null, q: { $sum: '$onHand' } } }]);
    expect(bal[0].q).toBe(EXPECT_PIECES); // balances tie to the ledger
  });
  it('same brand, model and category become one product with several variants; no model means one product per row', async () => {
    const ankle: any = await Item.findOne({ model: 'ANKLE' }).lean();
    const vs: any[] = await Variant.find({ itemId: ankle._id }).sort({ size: 1 }).lean();
    expect(vs.map((v) => v.size)).toEqual(['75', '80', '85']);
    expect(vs.map((v) => v.itemCode)).toEqual(['KO1000401', 'KO1000402', 'KO1000403']);
    const noModel: any = await Variant.findOne({ itemCode: 'KO1000369' }).lean();
    expect(await Variant.countDocuments({ itemId: noModel.itemId })).toBe(1);
    expect(await Item.countDocuments()).toBe(DATA.length - 2); // the three ANKLE rows are one product
  });
  it('cleans the data: Primary means blank, HSN stays text, sizes like 80.0 become 80, numeric codes become text, names are trimmed', async () => {
    const v1: any = await Variant.findOne({ itemCode: 'KO1000369' }).lean();
    const item1: any = await Item.findById(v1.itemId).lean();
    expect(item1.name).toBe('ADV -Kurties-M-10165');
    expect(item1.hsn).toBe('61083100');
    expect(typeof item1.hsn).toBe('string');
    expect(item1.categoryId ?? null).toBeNull(); // "Primary" category means blank
    expect(v1.size ?? null).toBeNull();
    expect(v1.baseCost).toBe(17333);
    expect(v1.mrp).toBe(37000);
    expect(v1.barcode).toBe('KO1000369'); // the sheet has no barcode: Code-128 of the item code
    expect(await Variant.exists({ itemCode: '8905133052549' })).toBeTruthy();
    expect(await Category.exists({ name: /primary/i })).toBeNull();
    expect(await Brand.exists({ name: /primary/i })).toBeNull();
    const cats = (await Category.find().lean()).map((c: any) => c.name).sort();
    expect(cats).toEqual(['DOTHI', 'Kurti', 'LEGGINS', 'Panties', 'SHOES']);
  });
  it('repairs price problems and flags them: MRP below selling rate is raised, no price is flagged', async () => {
    const v: any = await Variant.findOne({ itemCode: 'KO1000409' }).lean();
    expect(v).toMatchObject({ mrp: 15000, sellingPrice: 15000 });
    const np: any = await Variant.findOne({ itemCode: 'KO1000408' }).lean();
    expect(np.priceMissing).toBe(true);
    expect(await StockLedger.countDocuments({ variantId: (await Variant.findOne({ itemCode: 'KO1000410' }).lean() as any)._id })).toBe(0); // negative quantity posts nothing
  });
  it('the review queue lists every row needing a decision, with reasons', async () => {
    const q = await get('/imports/review-queue?pageSize=100');
    const by = (code: string) => q.body.items.find((i: any) => i.itemCode === code);
    expect(by('KO1000369').reasons).toEqual(expect.arrayContaining(['MISSING_CATEGORY', 'MISSING_BRAND', 'MISSING_MODEL', 'MISSING_SIZE']));
    expect(by('KO1000404').reasons).toEqual(['MISSING_HSN']);
    expect(by('KO1000405').reasons).toContain('INVALID_HSN');
    expect(by('KO1000405').detail.hsnProblem).toMatch(/6407 is not a valid heading in Chapter 64/);
    // several sizes in one row is allowed: the row stays as it came and the size is chosen at billing
    expect(by('KO1000406')).toBeUndefined();
    expect(by('KO1000407')).toBeUndefined();
    expect(parseSizes(((await Variant.findOne({ itemCode: 'KO1000406' }).lean()) as any).size).sizes).toEqual(['M', 'L', 'XL', '2XL']);
    expect(parseSizes(((await Variant.findOne({ itemCode: 'KO1000407' }).lean()) as any).size).sizes).toEqual(['S', 'M', 'L', 'XL', 'XXL']);
    expect(by('KO1000408').reasons).toContain('NO_PRICE');
    expect(by('KO1000409').reasons).toEqual(['MRP_RAISED']);
    expect(by('KO1000410').reasons).toContain('NEGATIVE_QTY');
    expect(by('l').reasons).toEqual(expect.arrayContaining(['ODD_CODE', 'ODD_SIZE']));
    expect(by('KO1000401')).toBeUndefined(); // clean rows are not in the queue
    expect(by('KO1000404').rowNumber).toBe(7); // spreadsheet row number
    // each row carries the live MRP from the database; a row with no price shows 0 so the screen can ask for one
    expect(by('KO1000409').detail.mrp).toBeGreaterThan(0);
    expect(by('KO1000408').detail.mrp).toBe(0);
  });
  it('suggests an HSN from the same category with the count behind it, and never applies it silently', async () => {
    const q = await get('/imports/review-queue?reason=MISSING_HSN');
    const s = q.body.items[0].suggestion;
    expect(s).toMatchObject({ hsn: '6108', count: 3, total: 3 });
    expect(s.note).toMatch(/Used by 3 of 3 items.*LEGGINS.*100%/);
    const item: any = await Item.findOne({ model: 'PLAIN' }).lean();
    expect(item.hsn).toBeUndefined(); // still blank until someone approves
  });
  it('bulk fix: applying suggestions updates the items and closes those rows', async () => {
    const r = await t.api('PATCH', `${A}/imports/review-queue/bulk`, { token: t.adminToken, body: { reason: 'MISSING_HSN', action: 'apply_suggestion' } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ updated: 1, resolved: 1 });
    expect((await Item.findOne({ model: 'PLAIN' }).lean() as any).hsn).toBe('6108');
    expect((await get('/imports/review-queue?reason=MISSING_HSN')).body.items).toHaveLength(0);
  });
  it('bulk fix: set values, validate them, split combined sizes, dismiss', async () => {
    const q = (code: string) => ReviewItem.findOne({ itemCode: code }).lean() as Promise<any>;
    const shoe = await q('KO1000405');
    const badHsn = await t.api('PATCH', `${A}/imports/review-queue/bulk`, { token: t.adminToken, body: { ids: [String(shoe._id)], action: 'set', set: { hsn: '6403' } } });
    expect(badHsn.body).toMatchObject({ resolved: 1 }); // 6403 is a valid heading
    expect((await q('KO1000405')).status).toBe('resolved');
    const noSize = await q('KO1000369');
    const fix = await t.api('PATCH', `${A}/imports/review-queue/bulk`, { token: t.adminToken, body: { ids: [String(noSize._id)], action: 'set', set: { size: 'M', category: 'Kurties', brand: 'ADV', model: '10165' } } });
    expect(fix.body).toMatchObject({ updated: 1, resolved: 1 });
    const v: any = await Variant.findOne({ itemCode: 'KO1000369' }).lean();
    const item: any = await Item.findById(v.itemId).lean();
    expect(v.size).toBe('M');
    expect(item.model).toBe('10165');
    expect((await Category.findById(item.categoryId).lean() as any).name).toBe('Kurties');
    // a sticky review reason stays until dismissed
    const raised = await q('KO1000409');
    const keep = await t.api('PATCH', `${A}/imports/review-queue/bulk`, { token: t.adminToken, body: { ids: [String(raised._id)], action: 'set', set: { size: 'Free Size' } } });
    expect(keep.body.resolved).toBe(0);
    const dismiss = await t.api('PATCH', `${A}/imports/review-queue/bulk`, { token: t.adminToken, body: { ids: [String(raised._id)], action: 'dismiss' } });
    expect(dismiss.body.resolved).toBe(1);
    expect((await t.api('PATCH', `${A}/imports/review-queue/bulk`, { token: t.adminToken, body: { action: 'dismiss' } })).status).toBe(400);
  });
  it('the data quality report lists unresolved rows as JSON and CSV, with HSN codes that have no GST rate rule', async () => {
    const j = await get('/imports/data-quality');
    expect(j.body.summary.MISSING_SIZE).toBeGreaterThan(0);
    expect(j.body.rows.every((r: any) => r.status === 'open')).toBe(true);
    expect(j.body.hsnWithoutRate.map((h: any) => h.hsn)).toContain('5208'); // chapter 52 is not in the HSN Master sheet
    const csv = await t.app.inject({ method: 'GET', url: `${A}/imports/data-quality?format=csv`, headers: { authorization: `Bearer ${t.adminToken}` } });
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.body.split('\n')[0]).toBe('row,item_code,name,category,reasons,suggested_hsn,suggestion_note');
  });
  it('committing again is safe, and item codes continue after the highest imported KO code', async () => {
    const again = await post(`/imports/${id}/commit`);
    expect(again.body.done).toBe(true);
    expect(await Variant.countDocuments({ itemCode: 'KO1000369' })).toBe(1);
    const mk = await post('/items', { name: 'After import', variants: [{ mrp: 1000, sellingPrice: 1000 }] });
    expect(mk.body.variants[0].itemCode).toMatch(/^KO10004\d\d$/);
    const n = Number(mk.body.variants[0].itemCode.slice(2));
    expect(n).toBeGreaterThan(1000410);
  });
  it('rolling back removes everything the batch created, including opening stock, and its review rows', async () => {
    // A later stock movement blocks rollback so a real sale is never hidden.
    const v: any = await Variant.findOne({ itemCode: 'KO1000401' }).lean();
    const led: any = await StockLedger.findOne({ variantId: v._id }).lean();
    const extra = await StockLedger.create({ variantId: v._id, storeId: led.storeId, type: 'SALE', qty: -1, unitCost: 10000, docType: 'POS', docNumber: 'POS-1' });
    const blocked = await post(`/imports/${id}/rollback`);
    expect(blocked.status).toBe(422);
    expect(blocked.body.code).toBe('ROLLBACK_BLOCKED');
    await StockLedger.deleteOne({ _id: extra._id });
    const bad = await Variant.countDocuments(); expect(bad).toBeGreaterThan(0);

    const r = await post(`/imports/${id}/rollback`);
    expect(r.status).toBe(200);
    expect(r.body.removed.ledgerRows).toBe(DATA.length - 2);
    expect(await Variant.countDocuments({ importBatchId: id })).toBe(0);
    expect(await StockLedger.countDocuments({ docNumber: id })).toBe(0);
    expect(await StockBalance.countDocuments()).toBe(0);
    expect(await ReviewItem.countDocuments({ batchId: id })).toBe(0);
    expect(await Item.countDocuments({ importBatchId: id })).toBe(0);
    expect(await Category.countDocuments({ name: { $in: ['DOTHI', 'LEGGINS', 'Panties', 'SHOES'] } })).toBe(0);
    expect((await get(`/imports/${id}`)).body.status).toBe('rolled_back');
    expect((await post(`/imports/${id}/rollback`)).status).toBe(422);
  });
  it('the same file can be imported again after a rollback', async () => {
    const r = await startImport(t, t.adminToken, 'opening_stock', 'Master Sheet.xlsx', stockSheet());
    const c = await post(`/imports/${r.id}/commit`);
    expect(c.body.counts.new).toBe(DATA.length);
    // Importing it a third time updates instead of duplicating, and never posts a second opening balance.
    const r2 = await startImport(t, t.adminToken, 'opening_stock', 'Master Sheet.xlsx', stockSheet());
    const p = await get(`/imports/${r2.id}/preview`);
    expect(p.body.counts).toMatchObject({ new: 0, updated: DATA.length });
    expect(p.body.totals.pieces).toBe(0);
    await post(`/imports/${r2.id}/commit`);
    expect(await StockLedger.countDocuments({ type: 'OPENING' })).toBe(DATA.length - 2);
    const rb = await post(`/imports/${r2.id}/rollback`);
    expect(rb.status).toBe(200);
    expect(await Variant.countDocuments()).toBe(DATA.length + 1); // the re-import and the item added by hand are untouched
  });
  it('a failed row never sinks its batch: the rest is saved and the failure is reported', async () => {
    const dupBarcode = sheetBuffer({ Items: [['Item Code*', 'Barcode/UPC', 'Product Category*', 'Retail MRP*'], ['X-1', '123456789', 'Apparel', 100], ['X-2', '123456789', 'Apparel', 100], ['X-3', null, 'Apparel', 'abc']] });
    const r = await startImport(t, t.adminToken, 'items', 'items.xlsx', dupBarcode, undefined, { sheet: 'Items', map: { itemCode: 'Item Code*', barcode: 'Barcode/UPC', category: 'Product Category*', mrp: 'Retail MRP*', name: 'Item Code*' } });
    const p = await get(`/imports/${r.id}/preview`);
    expect(p.body.counts.failed).toBe(2); // duplicate barcode in the file, and a price that is not a number
    expect(p.body.errors.map((e: any) => e.row).sort()).toEqual([3, 4]);
    const c = await post(`/imports/${r.id}/commit`);
    expect(c.body.counts).toMatchObject({ new: 1, failed: 2 });
  });
});

describe('workbook samples and other targets', () => {
  it('the three Stock Master sample rows import without errors (items target, saved Workbook mapping)', async () => {
    const buf = sheetBuffer({
      'Stock Master': [
        ['Item Code*', 'Barcode/UPC', 'Brand', 'Product Category*', 'Model/Style No*', 'Type*', 'Size*', 'Color', 'HSN Code*', 'Retail MRP*', 'Base Cost', 'Bin Location', 'Stock Status'],
        ['APP-FL-DRS-023', '8901234567890', 'Thunikart', 'Apparel', 'Bella-023', 'Woven/Not Knitted', 'M', 'Floral Red', '6204', 1499, 600, 'BIN-A1-04', 'In-Stock'],
        ['APP-KN-TSH-088', '8901234567891', 'Thunikart', 'Apparel', 'Classic-088', 'Knitted', 'L', 'Navy Blue', '6109', 450, 180, 'BIN-B2-11', 'In-Stock'],
        ['ACC-LT-WLT-005', '8901234567892', 'Thunikart', 'Accessories', 'Sleek-005', 'Leather Goods', 'OS', 'Tan Brown', '4202', 1200, 480, 'BIN-C1-02', 'Low Stock'],
      ],
    });
    const r = await startImport(t, t.adminToken, 'items', 'Workbook.xlsx', buf, undefined, { sheet: 'Stock Master', map: {
      itemCode: 'Item Code*', name: 'Model/Style No*', barcode: 'Barcode/UPC', brand: 'Brand', category: 'Product Category*', model: 'Model/Style No*', type: 'Type*', size: 'Size*', color: 'Color', hsn: 'HSN Code*', mrp: 'Retail MRP*', baseCost: 'Base Cost', binLocation: 'Bin Location' } });
    expect(r.created.body.suggestedMapping.name).toBe('Workbook: Stock Master');
    const p = await get(`/imports/${r.id}/preview`);
    expect(p.body.counts).toMatchObject({ new: 3, failed: 0, skipped: 0 });
    expect((await post(`/imports/${r.id}/commit`)).body.counts.new).toBe(3);
    const v: any = await Variant.findOne({ itemCode: 'APP-FL-DRS-023' }).lean();
    expect(v).toMatchObject({ barcode: '8901234567890', mrp: 149900, sellingPrice: 149900, baseCost: 60000, size: 'M', color: 'Floral Red', binLocation: 'BIN-A1-04' });
    expect(await StockLedger.countDocuments({ docNumber: r.id })).toBe(0); // target "items" posts no stock
    expect((await get('/items/lookup?barcode=8901234567891')).body.price.mrp).toBe(45000);
  });
  it('customers: loyalty points become an opening ledger entry; a sample B2B row with a placeholder GSTIN is rejected, not trusted', async () => {
    const buf = sheetBuffer({
      'Customer Master': [
        ['Customer ID*', 'Account Group*', 'Full Name*', 'Email', 'Mobile Phone*', 'Street Address', 'City', 'State Region Code*', 'Country', 'GSTIN (If B2B)', 'PAN', 'Reconciliation GL Account*', 'Loyalty Points Balance'],
        ['CUST-9082', 'Retail Walk-in', 'Ananya Sharma', null, '9876543210', 'Krishnas Orchids Mall', 'Mumbai', '27', 'IN', null, null, 121001, 150],
        ['CUST-1044', 'E-commerce B2C', 'Rahul Verma', 'rahul.v@email.com', '9812345678', '45, Green Glen Layout', 'Bangalore', '29', 'IN', null, null, 121002, 45],
        ['CUST-5001', 'B2B Trade Customer', 'Trendy Apparel Retailers', 'orders@trendyapparel.in', '9944556677', '102, Textile Market', 'Chennai', '33', 'IN', '33AAAAA1111A1Z1', 'AAAAA1111A', 121003, 0],
      ],
    });
    const r = await startImport(t, t.adminToken, 'customers', 'customers.xlsx', buf);
    const p = await get(`/imports/${r.id}/preview`);
    expect(p.body.counts).toMatchObject({ new: 2, failed: 1 });
    expect(p.body.errors[0]).toMatchObject({ row: 4, code: 'CUST-5001', message: expect.stringMatching(/checksum/) });
    await post(`/imports/${r.id}/commit`);
    const c: any = await Customer.findOne({ mobile: '9876543210' }).lean();
    expect(c.customerId).toBe('CUST-9082');
    expect((await get(`/customers/${c._id}`)).body.loyaltyPoints).toBe(150);
    expect(await LoyaltyLedger.countDocuments({ type: 'OPENING' })).toBe(2);
    const rb = await post(`/imports/${r.id}/rollback`);
    expect(rb.body.removed.others).toBe(4); // 2 customers + 2 loyalty rows
    expect(await Customer.countDocuments()).toBe(0);
  });
  it('vendors: sample rows with placeholder GSTINs fail with a clear message while GST is off', async () => {
    const buf = sheetBuffer({
      'Vendor Master': [
        ['Vendor ID*', 'Vendor Name*', 'Contact Person', 'Email*', 'Mobile Phone*', 'Street Address', 'City', 'State Region Code*', 'Country', 'GSTIN*', 'PAN*', 'Payment Terms (ZTERM)*', 'Reconciliation GL Account*'],
        ['VND-401', 'TexStyles Manufacturing', 'Mr. Rajesh Mehta', 'info@texstyles.com', '9822112233', 'A-40', 'Surat', '24', 'IN', '24BBBBB2222B2Z2', 'BBBBB2222B', 'NET30', '211001'],
        ['VND-402', 'Knitwear Hub Corp', 'Ms. Priya Nair', 'sales@knithub.in', '9744332211', '88, Knitwear Zone', 'Tiruppur', '33', 'IN', null, null, 'NET15', '211001'],
      ],
    });
    const r = await startImport(t, t.adminToken, 'vendors', 'vendors.xlsx', buf);
    const p = await get(`/imports/${r.id}/preview`);
    expect(p.body.counts).toMatchObject({ new: 1, failed: 1 });
    await post(`/imports/${r.id}/commit`);
    const v: any = await Vendor.findOne({ vendorId: 'VND-402' }).lean();
    expect(v).toMatchObject({ name: 'Knitwear Hub Corp', paymentTerms: 'NET15', stateCode: '33' });
  });
  it('import permissions follow the target: Sales cannot import items, Buyer cannot import customers', async () => {
    const roles = (await t.api('GET', `${A}/roles`, { token: t.adminToken })).body.items;
    const mk = async (role: string, email: string) => {
      await post('/users', { name: role, email, password: 'Some-Pass-2026', roleId: roles.find((r: any) => r.name === role).id });
      return t.login(email, 'Some-Pass-2026');
    };
    const buyer = await mk('Buyer Purchase', 'imp-buyer@test.local');
    const buf = sheetBuffer({ 'Customer Master': [['Full Name*', 'Mobile Phone*', 'State Region Code*', 'Account Group*'], ['A B', '9000011111', '33', 'Retail Walk-in']] });
    const up = await t.api('POST', `${A}/uploads/presign`, { token: buyer, body: { purpose: 'import', filename: 'c.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: buf.length } });
    expect(up.status).toBe(201); // may upload (items.create)
    const made = await t.api('POST', `${A}/imports`, { token: buyer, body: { fileKey: up.body.key, filename: 'c.xlsx', target: 'customers' } });
    expect(made.status).toBe(403);
    expect(made.body.message).toMatch(/customers.create/);
  });
  it('import effects exist for every created document so a rollback is exact', async () => {
    expect(await ImportEffect.countDocuments()).toBeGreaterThan(0);
  });
});
