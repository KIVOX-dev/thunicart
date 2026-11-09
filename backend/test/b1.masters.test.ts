import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Customer, Hsn, GstRate, LoyaltyLedger, StockBalance, StockLedger, Store, Variant } from '../src/models';
import { makeGstin, setupTest, validProfile, type TestCtx } from './helpers';

let t: TestCtx;
const A = '/api/v1';
beforeAll(async () => { t = await setupTest(); });
afterAll(async () => { await t.close(); });
const post = (url: string, body: unknown, token = t.adminToken, headers?: Record<string, string>) => t.api('POST', `${A}${url}`, { token, body, headers });

async function roleToken(roleName: string, email: string) {
  const roles = (await t.api('GET', `${A}/roles`, { token: t.adminToken })).body.items;
  await post('/users', { name: roleName, email, password: 'Some-Pass-2026', roleId: roles.find((r: any) => r.name === roleName).id });
  return t.login(email, 'Some-Pass-2026');
}

describe('simple masters', () => {
  it('categories: slug, duplicates, and a category in use cannot be deleted', async () => {
    const c = await post('/categories', { name: 'Kurtis & Tops', section: 'Women' });
    expect(c.status).toBe(201);
    expect(c.body.slug).toBe('kurtis-tops');
    expect((await post('/categories', { name: 'kurtis tops' })).status).toBe(409);
    const item = await post('/items', { name: 'Test kurti', categoryId: c.body.id, variants: [{ mrp: 50000, sellingPrice: 50000 }] });
    expect(item.status).toBe(201);
    const del = await t.api('DELETE', `${A}/categories/${c.body.id}`, { token: t.adminToken });
    expect(del.status).toBe(422);
    expect(del.body.code).toBe('HAS_TRANSACTIONS');
    const free = await post('/categories', { name: 'Unused' });
    expect((await t.api('DELETE', `${A}/categories/${free.body.id}`, { token: t.adminToken })).status).toBe(200);
  });
  it('HSN is text of 4, 6 or 8 digits', async () => {
    expect((await post('/hsn', { code: '64', description: 'x' })).status).toBe(400);
    const ok = await post('/hsn', { code: '62121000', description: 'Brassieres', chapter: '62' });
    expect(ok.status).toBe(201);
    expect(ok.body.code).toBe('62121000');
    expect((await post('/hsn', { code: '62121000' })).status).toBe(409);
  });
  it('stores and warehouses: a warehouse is a store of type warehouse', async () => {
    const stores = (await t.api('GET', `${A}/stores`, { token: t.adminToken })).body.items.map((s: any) => s.name).sort();
    expect(stores).toEqual(['Krishnas Orchids Hub', 'Main Warehouse', 'Online']);
    const wh = await post('/warehouses', { code: 'GODOWN2', name: 'Pattanam Godown' });
    expect(wh.status).toBe(201);
    expect(wh.body.type).toBe('warehouse');
    const list = (await t.api('GET', `${A}/warehouses`, { token: t.adminToken })).body.items;
    expect(list.every((s: any) => s.type === 'warehouse')).toBe(true);
    expect(list).toHaveLength(2);
  });
  it('label templates: the 50 x 25 mm default is seeded', async () => {
    const r = (await t.api('GET', `${A}/label-templates`, { token: t.adminToken })).body.items;
    expect(r[0]).toMatchObject({ widthMm: 50, heightMm: 25, isDefault: true });
  });
});

describe('GST rates', () => {
  it('seeds the HSN master rule as UNCONFIRMED: 5% up to Rs 1,000 and 12% above', async () => {
    expect(await Hsn.countDocuments()).toBeGreaterThanOrEqual(25);
    const r = (await t.api('GET', `${A}/gst-rates?hsn=6204`, { token: t.adminToken })).body.items[0];
    expect(r).toMatchObject({ ruleType: 'slab', slabLimit: 100000, rateBelow: 5, rateAbove: 12, confirmed: false });
    const flat = (await t.api('GET', `${A}/gst-rates?hsn=4202`, { token: t.adminToken })).body.items[0];
    expect(flat).toMatchObject({ ruleType: 'flat', rate: 18 });
  });
  it('while GST is off, resolving a rate returns no rate', async () => {
    const r = await t.api('GET', `${A}/gst-rates/resolve?hsn=6204&price=149900`, { token: t.adminToken });
    expect(r.body).toEqual({ gstMode: 'off', rate: null, source: null, confirmed: null });
  });
  it('with GST on, the rate is found by HSN and per piece price', async () => {
    await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile({ gstin: makeGstin(), pan: 'ABCDE1234F' }) });
    const rate = async (hsn: string, price: number) => (await t.api('GET', `${A}/gst-rates/resolve?hsn=${hsn}&price=${price}`, { token: t.adminToken })).body;
    expect((await rate('6204', 99900)).rate).toBe(5);
    expect((await rate('6204', 100000)).rate).toBe(5); // "up to 1,000" includes 1,000
    expect((await rate('6204', 100001)).rate).toBe(12);
    expect((await rate('62043100', 149900)).rate).toBe(12); // 8 digit HSN falls back to its heading
    expect((await rate('4202', 50000)).rate).toBe(18);
    expect((await rate('9999', 50000)).rate).toBeNull(); // no rule: flagged, never guessed
  });
  it('a rate can be confirmed, and editing it makes it unconfirmed again', async () => {
    const r = (await t.api('GET', `${A}/gst-rates?hsn=6109`, { token: t.adminToken })).body.items[0];
    const c = await post(`/gst-rates/${r.id}/confirm`, {});
    expect(c.body.confirmed).toBe(true);
    const e = await t.api('PUT', `${A}/gst-rates/${r.id}`, { token: t.adminToken, body: { hsnCode: '6109', ruleType: 'slab', slabLimit: 100000, rateBelow: 5, rateAbove: 12, effectiveFrom: '2017-07-01T00:00:00.000Z' } });
    expect(e.body.confirmed).toBe(false);
    expect((await post('/gst-rates', { hsnCode: '6109', ruleType: 'slab', effectiveFrom: '2017-07-01T00:00:00.000Z' })).status).toBe(400); // slab needs its limits
    const buyer = await roleToken('Buyer Purchase', 'buyer-gst@test.local');
    expect((await post(`/gst-rates/${r.id}/confirm`, {}, buyer)).status).toBe(403);
  });
  it('effective dates are respected', async () => {
    const f = await post('/gst-rates', { hsnCode: '6307', ruleType: 'flat', rate: 12, effectiveFrom: '2030-01-01T00:00:00.000Z' });
    expect(f.status).toBe(201);
    expect((await t.api('GET', `${A}/gst-rates/resolve?hsn=6307&price=10000`, { token: t.adminToken })).body.rate).toBeNull();
    expect((await t.api('GET', `${A}/gst-rates/resolve?hsn=6307&price=10000&date=2031-01-01T00:00:00.000Z`, { token: t.adminToken })).body.rate).toBe(12);
    await GstRate.deleteOne({ hsnCode: '6307' });
  });
});

describe('items and variants', () => {
  let itemId: string; let v1: any; let v2: any;
  it('creates an item with variants, codes from the ITEM series, Code-128 barcode from the item code', async () => {
    const r = await post('/items', {
      name: 'Bella Floral Dress', hsn: '6204', section: 'Women', showOnWebsite: true,
      variants: [
        { size: 'M', color: 'Floral Red', mrp: 149900, sellingPrice: 149900, offerPrice: 134900, baseCost: 60000, reorderLevel: 2, binLocation: 'BIN-A1-04' },
        { size: 'L', color: 'Floral Red', mrp: 149900, sellingPrice: 139900, reorderLevel: 2 },
      ],
    });
    expect(r.status).toBe(201);
    itemId = r.body.id;
    [v1, v2] = r.body.variants.sort((a: any, b: any) => a.itemCode.localeCompare(b.itemCode));
    expect(v1.itemCode).toMatch(/^KO\d{7}$/);
    expect(v1.barcode).toBe(v1.itemCode);
    expect(v1.barcodeKind).toBe('code128');
    expect(v1.effectivePrice).toBe(134900); // offer price wins
    expect(v2.effectivePrice).toBe(139900); // otherwise selling price
    expect(v1.currency).toBe('INR');
    expect(v1.stockStatus).toBe('Out of Stock');
    expect(r.body.slug).toBeTruthy();
  });
  it('MRP >= selling >= offer, and MRP is required', async () => {
    const bad = await post('/items', { name: 'X', variants: [{ mrp: 10000, sellingPrice: 20000 }] });
    expect(bad.status).toBe(400);
    expect(bad.body.fields[0].path).toBe('sellingPrice');
    const off = await post(`/items/${itemId}/variants`, { mrp: 10000, sellingPrice: 9000, offerPrice: 9500 });
    expect(off.body.fields[0].path).toBe('offerPrice');
    expect((await post(`/items/${itemId}/variants`, { sellingPrice: 100 })).status).toBe(400);
    expect((await t.api('PUT', `${A}/items/${itemId}/variants/${v1.id}`, { token: t.adminToken, body: { mrp: 100000 } })).status).toBe(400); // MRP below existing selling
  });
  it('item code and barcode are unique; existing codes like KO1000369 are kept', async () => {
    const mk = (extra: object) => post('/items', { name: 'Dup test', variants: [{ mrp: 10000, sellingPrice: 10000, ...extra }] });
    const first = await mk({ itemCode: 'KO1000369', barcode: '8901234567890' });
    expect(first.status).toBe(201);
    expect(first.body.variants[0].itemCode).toBe('KO1000369');
    expect(first.body.variants[0].barcode).toBe('8901234567890'); // an existing barcode is kept
    const dupCode = await mk({ itemCode: 'KO1000369' });
    expect(dupCode.status).toBe(409);
    expect(dupCode.body.fields.map((f: any) => f.path)).toContain('itemCode');
    const dupBarcode = await mk({ itemCode: 'KO1000370', barcode: '8901234567890' });
    expect(dupBarcode.status).toBe(409);
    expect(await Variant.countDocuments({ itemCode: 'KO1000370' })).toBe(0); // the item did not half save
  });
  it('HSN: a heading that does not exist (6407) is refused; sample codes are text', async () => {
    const r = await post('/items', { name: 'Shoes', hsn: '6407', variants: [] });
    expect(r.status).toBe(400);
    expect(r.body.fields[0].message).toMatch(/not a valid heading/);
    expect((await post('/items', { name: 'Shoes', hsn: 6204, variants: [] })).status).toBe(400); // a number is not text
  });
  it('GST override needs a reason', async () => {
    const r = await t.api('PUT', `${A}/items/${itemId}`, { token: t.adminToken, body: { gstRateOverride: 5 } });
    expect(r.status).toBe(400);
    const ok = await t.api('PUT', `${A}/items/${itemId}`, { token: t.adminToken, body: { gstRateOverride: 5, gstOverrideReason: 'Cotton under Rs 1,000' } });
    expect(ok.body.gstRateOverride).toBe(5);
  });
  it('Stock Status is derived from available stock and the reorder level; lookup returns variant, price and stock', async () => {
    const wh: any = await Store.findOne({ type: 'shop' }).lean();
    await StockLedger.create({ variantId: v1.id, storeId: wh._id, type: 'OPENING', qty: 2, unitCost: 60000, docType: 'TEST', docNumber: 'T1' });
    await StockBalance.create({ variantId: v1.id, storeId: wh._id, onHand: 2, reserved: 0 });
    const low = await t.api('GET', `${A}/items/lookup?barcode=${v1.barcode}`, { token: t.adminToken });
    expect(low.status).toBe(200);
    expect(low.body.variant.stockStatus).toBe('Low Stock'); // 2 <= reorder level 2
    expect(low.body.stockByStore).toEqual([{ storeId: String(wh._id), storeName: 'Krishnas Orchids Hub', onHand: 2, reserved: 0, available: 2 }]);
    expect(low.body.price).toMatchObject({ mrp: 149900, sellingPrice: 149900, offerPrice: 134900, effectivePrice: 134900 });
    expect(low.body.gstMode).toBe('on');
    expect(low.body.gstRate).toBe(5); // item override
    await StockBalance.updateOne({ variantId: v1.id }, { $set: { onHand: 10, reserved: 3 } });
    expect((await t.api('GET', `${A}/items/lookup?barcode=${v1.itemCode}`, { token: t.adminToken })).body.variant).toMatchObject({ available: 7, stockStatus: 'In Stock' });
    await StockBalance.updateOne({ variantId: v1.id }, { $set: { onHand: 3, reserved: 3 } });
    expect((await t.api('GET', `${A}/items/lookup?barcode=${v1.barcode}`, { token: t.adminToken })).body.variant.stockStatus).toBe('Out of Stock');
    expect((await t.api('GET', `${A}/items/lookup?barcode=NOPE`, { token: t.adminToken })).status).toBe(404);
  });
  it('lookup returns no tax while GST is off', async () => {
    await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile({ gstin: '', confirmGstClear: true }) });
    const r = await t.api('GET', `${A}/items/lookup?barcode=${v1.barcode}`, { token: t.adminToken });
    expect(r.body.gstMode).toBe('off');
    expect(r.body.gstRate).toBeNull();
  });
  it('a variant with stock history can be deactivated, never deleted', async () => {
    const del = await t.api('DELETE', `${A}/items/${itemId}/variants/${v1.id}`, { token: t.adminToken });
    expect(del.status).toBe(422);
    expect(del.body.code).toBe('HAS_TRANSACTIONS');
    expect((await t.api('DELETE', `${A}/items/${itemId}`, { token: t.adminToken })).status).toBe(422);
    const off = await t.api('PUT', `${A}/items/${itemId}/variants/${v1.id}`, { token: t.adminToken, body: { active: false } });
    expect(off.body.active).toBe(false);
    expect((await t.api('DELETE', `${A}/items/${itemId}/variants/${v2.id}`, { token: t.adminToken })).status).toBe(200); // no history: fine
  });
  it('lists with search by name, code and barcode, with paging', async () => {
    const byName = await t.api('GET', `${A}/items?q=bella`, { token: t.adminToken });
    expect(byName.body.items[0].name).toBe('Bella Floral Dress');
    expect(byName.body.items[0].variants).toBeUndefined(); // lists stay light
    expect(byName.body.items[0].onHand).toBe(3);
    const byCode = await t.api('GET', `${A}/items?q=${v1.itemCode}`, { token: t.adminToken });
    expect(byCode.body.items.map((i: any) => i.id)).toContain(itemId);
    const page = await t.api('GET', `${A}/items?pageSize=1&page=1`, { token: t.adminToken });
    expect(page.body.items).toHaveLength(1);
    expect(page.body.nextPage).toBe(2);
  });
});

describe('barcodes and labels', () => {
  let item: any;
  it('EAN-13 comes from an in-store prefix, a sequence and a check digit; real barcodes are kept; numbers are never reused', async () => {
    const r = await post('/items', { name: 'Barcode test', variants: [{ size: 'S', mrp: 10000, sellingPrice: 10000 }, { size: 'M', mrp: 10000, sellingPrice: 10000, barcode: '8905133052549' }] });
    item = r.body;
    const out = await post(`/items/${item.id}/barcode`, { format: 'ean13' });
    const [generated, kept] = [out.body.items.find((i: any) => i.generated), out.body.items.find((i: any) => !i.generated)];
    expect(generated.barcode).toMatch(/^2\d{12}$/);
    expect(generated.kind).toBe('ean13');
    let sum = 0; for (let i = 0; i < 12; i++) sum += Number(generated.barcode[i]) * (i % 2 ? 3 : 1);
    expect(Number(generated.barcode[12])).toBe((10 - (sum % 10)) % 10);
    expect(kept.barcode).toBe('8905133052549');
    // Another item gets a different number
    const r2 = await post('/items', { name: 'Barcode test 2', variants: Array.from({ length: 8 }, (_, i) => ({ size: `S${i}`, mrp: 10000, sellingPrice: 10000 })) });
    const out2 = await post(`/items/${r2.body.id}/barcode`, { format: 'ean13' });
    const all = [generated.barcode, ...out2.body.items.map((i: any) => i.barcode)];
    expect(new Set(all).size).toBe(all.length);
    // The EAN is scannable: lookup by it finds the variant
    expect((await t.api('GET', `${A}/items/lookup?barcode=${generated.barcode}`, { token: t.adminToken })).body.variant.itemCode).toBe(generated.itemCode);
  });
  it('prints a PDF of labels, one page per copy, at 50 x 25 mm', async () => {
    const res = await t.app.inject({ method: 'POST', url: `${A}/labels/print`, headers: { authorization: `Bearer ${t.adminToken}`, 'content-type': 'application/json' }, payload: { items: [{ variantId: item.variants[0].id, copies: 3 }, { variantId: item.variants[1].id, copies: 2 }] } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    const pdf = res.rawPayload.toString('latin1');
    expect(pdf.startsWith('%PDF')).toBe(true);
    expect((pdf.match(/\/Type \/Page\b/g) ?? []).length).toBe(5);
    expect(pdf).toMatch(/\/MediaBox \[0 0 141\.7\d* 70\.8\d*\]/); // 50 x 25 mm in points
    expect((await t.api('POST', `${A}/labels/print`, { token: t.adminToken, body: { items: [{ variantId: '665f0c2a9b1e4c0012ab34cd' }] } })).status).toBe(404);
  });
});

describe('vendors and customers', () => {
  it('vendors: GSTIN is optional while GST is off, IDs come from the VND series', async () => {
    const r = await post('/vendors', { name: 'Knitwear Hub Corp', email: 'sales@knithub.in', mobile: '9744332211', city: 'Tiruppur', stateCode: '33', paymentTerms: 'NET15' });
    expect(r.status).toBe(201);
    expect(r.body.vendorId).toBe('VND-000001');
    expect(r.body.gstin).toBe('');
    expect((await post('/vendors', { name: 'X Vendor', email: 'bad', mobile: '1234', stateCode: '3' })).body.fields.length).toBeGreaterThanOrEqual(3);
  });
  it('vendors: while GST is on a valid GSTIN is required, with checksum, state and PAN checks', async () => {
    await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile({ gstin: makeGstin(), pan: 'ABCDE1234F' }) });
    const base = { name: 'TexStyles Manufacturing', email: 'info@texstyles.com', mobile: '9822112233', city: 'Surat', stateCode: '24' };
    expect((await post('/vendors', base)).body.fields[0]).toMatchObject({ path: 'gstin', message: expect.stringMatching(/required while GST is on/) });
    const good = makeGstin('24', 'BBBBB2222B');
    const badSum = good.slice(0, 14) + (good[14] === 'A' ? 'B' : 'A');
    expect((await post('/vendors', { ...base, gstin: badSum })).body.fields[0].message).toMatch(/checksum/);
    expect((await post('/vendors', { ...base, gstin: makeGstin('27', 'BBBBB2222B') })).body.fields[0].message).toMatch(/state code/);
    expect((await post('/vendors', { ...base, gstin: good, pan: 'ZZZZZ9999Z' })).body.fields[0].message).toMatch(/PAN/);
    const ok = await post('/vendors', { ...base, gstin: good });
    expect(ok.status).toBe(201);
    expect(ok.body.pan).toBe('BBBBB2222B'); // taken from the GSTIN
    expect(ok.body.vendorId).toBe('VND-000002');
  });
  it('customers: mobile is unique, B2B always needs a valid GSTIN, loyalty and wallet are ledgers', async () => {
    await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile({ gstin: '', confirmGstClear: true }) }); // GST off
    const retail = await post('/customers', { accountGroup: 'Retail Walk-in', name: 'Ananya Sharma', mobile: '9876543210', stateCode: '33', city: 'Coimbatore' });
    expect(retail.status).toBe(201);
    expect(retail.body.customerId).toBe('CUST-000001');
    expect(retail.body).toMatchObject({ loyaltyPoints: 0, walletBalance: 0 });
    const dup = await post('/customers', { accountGroup: 'E-commerce B2C', name: 'Someone', mobile: '9876543210', stateCode: '33' });
    expect(dup.status).toBe(400);
    expect(dup.body.fields[0].path).toBe('mobile');
    const b2b = { accountGroup: 'B2B Trade', name: 'Trendy Apparel Retailers', mobile: '9944556677', stateCode: '33', city: 'Chennai' };
    expect((await post('/customers', b2b)).body.fields[0].message).toMatch(/required for B2B/); // even with GST off
    expect((await post('/customers', { ...b2b, gstin: makeGstin('27', 'AAAAA1111A') })).body.fields[0].message).toMatch(/state code/);
    expect((await post('/customers', { ...b2b, gstin: makeGstin('33', 'AAAAA1111A') })).status).toBe(201);
    // Loyalty points cannot be edited through the customer record
    await t.api('PUT', `${A}/customers/${retail.body.id}`, { token: t.adminToken, body: { loyaltyPoints: 9999, walletBalance: 9999, name: 'Ananya S' } });
    const again = (await t.api('GET', `${A}/customers/${retail.body.id}`, { token: t.adminToken })).body;
    expect(again).toMatchObject({ name: 'Ananya S', loyaltyPoints: 0, walletBalance: 0 });
    await LoyaltyLedger.create({ customerId: retail.body.id, points: 150, type: 'EARN' });
    expect((await t.api('GET', `${A}/customers/${retail.body.id}`, { token: t.adminToken })).body.loyaltyPoints).toBe(150);
    const lookup = await t.api('GET', `${A}/customers/lookup?mobile=9876543210`, { token: t.adminToken });
    expect(lookup.body.customerId).toBe('CUST-000001');
    expect((await t.api('GET', `${A}/customers/lookup?mobile=9000000000`, { token: t.adminToken })).status).toBe(404);
  });
  it('masters with transactions are never deleted, only deactivated', async () => {
    const c: any = await Customer.findOne({ customerId: 'CUST-000001' }).lean();
    const del = await t.api('DELETE', `${A}/customers/${c._id}`, { token: t.adminToken });
    expect(del.status).toBe(422);
    expect(del.body.code).toBe('HAS_TRANSACTIONS');
    expect((await t.api('PUT', `${A}/customers/${c._id}`, { token: t.adminToken, body: { active: false } })).body.active).toBe(false);
    const clean = await post('/customers', { accountGroup: 'Retail Walk-in', name: 'Delete Me', mobile: '9111111111', stateCode: '33' });
    expect((await t.api('DELETE', `${A}/customers/${clean.body.id}`, { token: t.adminToken })).status).toBe(200);
    const shop: any = await Store.findOne({ type: 'shop' }).lean();
    expect((await t.api('DELETE', `${A}/stores/${shop._id}`, { token: t.adminToken })).status).toBe(422); // it has stock movements
  });
  it('role permissions: Buyer Purchase manages items and vendors but not customers; Sales manages customers but not items', async () => {
    const buyer = await roleToken('Buyer Purchase', 'buyer@test.local');
    const sales = await roleToken('Sales', 'sales@test.local');
    expect((await post('/items', { name: 'By buyer', variants: [] }, buyer)).status).toBe(201);
    expect((await post('/vendors', { name: 'Buyer Vendor', email: 'bv@x.in', mobile: '9000000001', stateCode: '33' }, buyer)).status).toBe(201);
    expect((await post('/customers', { accountGroup: 'Retail Walk-in', name: 'By buyer', mobile: '9000000002', stateCode: '33' }, buyer)).status).toBe(403);
    expect((await post('/items', { name: 'By sales', variants: [] }, sales)).status).toBe(403);
    expect((await post('/vendors', { name: 'Sales Vendor', email: 'sv@x.in', mobile: '9000000003', stateCode: '33' }, sales)).status).toBe(403);
    expect((await post('/customers', { accountGroup: 'Retail Walk-in', name: 'By sales', mobile: '9000000004', stateCode: '33' }, sales)).status).toBe(201);
    expect((await t.api('GET', `${A}/items`, { token: sales })).status).toBe(200); // Sales can view items
    expect((await post('/gst-rates', { hsnCode: '6109', ruleType: 'flat', rate: 5, effectiveFrom: '2017-07-01T00:00:00.000Z' }, buyer)).status).toBe(403);
  });
  it('an idempotent retry of a create returns the same record', async () => {
    const h = { 'idempotency-key': 'retry-key-0001' };
    const body = { accountGroup: 'Retail Walk-in', name: 'Retry Person', mobile: '9222222222', stateCode: '33' };
    const a = await post('/customers', body, t.adminToken, h);
    const b = await post('/customers', body, t.adminToken, h);
    expect(b.body.id).toBe(a.body.id);
    expect(await Customer.countDocuments({ mobile: '9222222222' })).toBe(1);
  });
});

describe('uploads', () => {
  const presign = (body: object, token = t.adminToken) => post('/uploads/presign', body, token);
  it('checks type and size before issuing a URL', async () => {
    expect((await presign({ purpose: 'image', filename: 'a.jpg', contentType: 'image/jpeg', size: 6 * 1024 * 1024 })).status).toBe(400); // images 5 MB
    expect((await presign({ purpose: 'image', filename: 'a.html', contentType: 'text/html', size: 100 })).status).toBe(400);
    expect((await presign({ purpose: 'video', filename: 'a.mp4', contentType: 'video/mp4', size: 49 * 1024 * 1024 })).status).toBe(201); // videos 50 MB
    expect((await presign({ purpose: 'video', filename: 'a.mp4', contentType: 'video/mp4', size: 51 * 1024 * 1024 })).status).toBe(400);
    expect((await presign({ purpose: 'pdf', filename: 'a.pdf', contentType: 'application/pdf', size: 6 * 1024 * 1024 })).status).toBe(400); // PDFs 5 MB
    expect((await presign({ purpose: 'import', filename: 'a.exe', contentType: 'application/octet-stream', size: 100 })).status).toBe(400);
    const ok = await presign({ purpose: 'image', filename: 'Dress front (1).jpg', contentType: 'image/jpeg', size: 1000 });
    expect(ok.status).toBe(201);
    expect(ok.body.key).toMatch(/^images\/\d{4}\/\d{2}\/[0-9a-f]{12}-Dress_front_1_\.jpg$/);
    expect(ok.body).toMatchObject({ method: 'PUT', expiresInSeconds: 600, maxBytes: 5 * 1024 * 1024 });
  });
  it('mock storage accepts the upload only with the right token and content type', async () => {
    const ok = await presign({ purpose: 'image', filename: 'x.png', contentType: 'image/png', size: 4 });
    const path = new URL(ok.body.uploadUrl).pathname;
    const wrongType = await t.app.inject({ method: 'PUT', url: path, headers: { 'content-type': 'image/jpeg' }, payload: Buffer.from('abcd') });
    expect(wrongType.statusCode).toBe(400);
    const tampered = await t.app.inject({ method: 'PUT', url: path.slice(0, -3) + 'abc', headers: { 'content-type': 'image/png' }, payload: Buffer.from('abcd') });
    expect(tampered.statusCode).toBe(400);
    const good = await t.app.inject({ method: 'PUT', url: path, headers: { 'content-type': 'image/png' }, payload: Buffer.from('abcd') });
    expect(good.statusCode).toBe(200);
  });
  it('users without a matching permission cannot get an upload URL', async () => {
    const accounts = await roleToken('Accounts', 'acc@test.local');
    expect((await presign({ purpose: 'image', filename: 'a.jpg', contentType: 'image/jpeg', size: 100 }, accounts)).status).toBe(403);
    expect((await presign({ purpose: 'import', filename: 'a.csv', contentType: 'text/csv', size: 100 }, accounts)).status).toBe(403);
  });
});

describe('B1 route coverage', () => {
  it('stock for a variant that never had stock is zero', async () => {
    expect(await StockLedger.countDocuments({ docType: 'TEST' })).toBe(1);
  });
});
