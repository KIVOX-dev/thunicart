import * as XLSX from 'xlsx';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StockLedger, Variant } from '../src/models';
import { setupTest, type TestCtx } from './helpers';
import { sheetBuffer, startImport } from './b1.helpers';

let t: TestCtx;
const A = '/api/v1';
beforeAll(async () => { t = await setupTest(); });
afterAll(async () => { await t.close(); });
const get = (url: string) => t.api('GET', `${A}${url}`, { token: t.adminToken });
const post = (url: string, body: unknown = {}) => t.api('POST', `${A}${url}`, { token: t.adminToken, body });

// Columns deliberately shuffled, with a header that is not in the usual place and an extra "Fabric" column.
const HEAD = ['Colour', 'Price', 'Fabric', 'Quantity', 'Product Name', 'Size', 'Category', 'MRP', 'Cost'];
const ROWS: unknown[][] = [
  ['Red', 499, 'Cotton', 5, 'Floral Kurti', 'M', 'Kurti', 799, 250],
  ['Red', 499, 'Cotton', 7, 'Floral Kurti', 'L', 'Kurti', 799, 250],
  ['Navy Blue', 499, 'Cotton', 3, 'Floral Kurti', 'XXL', 'Kurti', 799, 250],
  ['Teal', 299, 'Linen', 4, 'Scarf', 'Free Size', 'Accessories', 399, 100],
  ['Red', 499, 'Cotton', 1, 'Floral Kurti', 'M', 'Kurti', 799, 250], // same name + size + colour again
  [null, null, null, null, null, null, null, null, null], // blank row
];

describe('flexible stock import: shuffled columns, generated codes, attributes, review and download', () => {
  let id: string;
  it('maps by header name, not position, and keeps the extra column as an attribute', async () => {
    const r = await startImport(t, t.adminToken, 'opening_stock', 'shuffled.xlsx', sheetBuffer({ Stock: [HEAD, ...ROWS] }), undefined, {
      sheet: 'Stock', map: { name: 'Product Name', size: 'Size', color: 'Colour', openingQty: 'Quantity', sellingPrice: 'Price', mrp: 'MRP', baseCost: 'Cost', category: 'Category', 'attr:Fabric': 'Fabric' },
    });
    id = r.id;
    expect(r.mapped.status).toBe(200);
  });
  it('auto-maps unusual column order from header names alone', async () => {
    const r = await startImport(t, t.adminToken, 'opening_stock', 'auto.xlsx', sheetBuffer({ Stock: [HEAD, ...ROWS] }));
    expect(r.created.body.suggestedMapping.name).toBe('Auto matched columns');
    const m = await t.api('GET', `${A}/imports/${r.id}`, { token: t.adminToken });
    expect(m.status).toBe(200);
  });
  it('dry run writes nothing and gives every row a placeholder code', async () => {
    const p = await get(`/imports/${id}/processed?pageSize=100`);
    expect(p.status).toBe(200);
    expect(p.body.total).toBe(5);
    expect(p.body.items.filter((i: any) => i.status === 'new')).toHaveLength(5);
    expect(p.body.items.every((i: any) => i.codeGenerated || i.status !== 'new')).toBe(true);
    expect(p.body.items[0]).toMatchObject({ size: 'M', color: 'Red', qty: 5, attributes: { Fabric: 'Cotton' } });
    expect(p.body.items[4].itemCode).not.toBe(p.body.items[0].itemCode); // a repeat by look still gets its own code
    expect(await Variant.countDocuments()).toBe(0);
  });
  it('commit generates unique product codes and one batch number, and stores attributes', async () => {
    const c = await post(`/imports/${id}/commit`);
    expect(c.body.done).toBe(true);
    const vs: any[] = await Variant.find().lean();
    expect(vs).toHaveLength(5);
    expect(new Set(vs.map((v) => v.itemCode)).size).toBe(5);
    expect(vs.every((v) => /^KO\d{7}$/.test(v.itemCode))).toBe(true);
    expect(vs.find((v) => v.size === 'XXL').attributes).toEqual({ Fabric: 'Cotton' });
    const led: any[] = await StockLedger.find({ docNumber: id }).lean();
    expect(led.reduce((a, l) => a + l.qty, 0)).toBe(20);
    expect(new Set(vs.map((v) => v.batchRef)).size).toBe(1);
    expect(vs[0].batchRef).toMatch(/^TK\d{8}$/);
  });
  it('the downloaded Excel has the original columns plus the same codes that were saved', async () => {
    const res = await t.app.inject({ method: 'GET', url: `${A}/imports/${id}/export`, headers: { authorization: `Bearer ${t.adminToken}` } });
    expect(res.statusCode).toBe(200);
    const wb = XLSX.read(res.rawPayload, { type: 'buffer' });
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets['Processed stock']!);
    expect(Object.keys(rows[0])).toEqual(expect.arrayContaining([...HEAD, 'Product Code', 'Batch No', 'Barcode', 'Import Status']));
    const saved = new Set((await Variant.find().lean()).map((v: any) => v.itemCode));
    expect(rows.filter((r) => r['Product Code']).every((r) => saved.has(r['Product Code']))).toBe(true);
    expect(rows.filter((r) => r['Product Code'])).toHaveLength(5);
  });
  it('re-uploading the downloaded file updates the same products instead of duplicating them', async () => {
    const res = await t.app.inject({ method: 'GET', url: `${A}/imports/${id}/export`, headers: { authorization: `Bearer ${t.adminToken}` } });
    const r = await startImport(t, t.adminToken, 'opening_stock', 'again.xlsx', Buffer.from(res.rawPayload), undefined, {
      sheet: 'Processed stock', map: { itemCode: 'Product Code', name: 'Product Name', size: 'Size', color: 'Colour', openingQty: 'Quantity', sellingPrice: 'Price', mrp: 'MRP', baseCost: 'Cost' },
    });
    const p = await get(`/imports/${r.id}/processed?pageSize=100`);
    expect(p.body.summary).toMatchObject({ new: 0, updated: 5 });
    await post(`/imports/${r.id}/commit`);
    expect(await Variant.countDocuments()).toBe(5);
  });
});
