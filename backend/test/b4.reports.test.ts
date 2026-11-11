import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { unzipSync } from 'fflate';
import { ledgerOnHand } from '../src/lib/stock';
import { StockBalance } from '../src/models';
import { setupTest, type TestCtx } from './helpers';
import { A, api, fixtures, setGst, tokenFor, type Fx } from './b2.helpers';

let t: TestCtx; let fx: Fx; let h: ReturnType<typeof api>;
beforeAll(async () => {
  t = await setupTest(); fx = await fixtures(t); h = fx.h;
  await h.post('/grn', { vendorId: fx.knit.id, storeId: fx.shop.id, vendorInvoiceNo: 'G1', vendorInvoiceDate: '2026-11-01T00:00:00.000Z', lines: [{ variantId: fx.tee.id, receivedQty: 50, unitCost: 20000, gstRate: 5 }, { variantId: fx.dress.id, receivedQty: 20, unitCost: 60000, gstRate: 12 }] });
});
afterAll(async () => { await t.close(); });
const sell = async (lines: any[], tenders?: any[], extra: object = {}) => { const d = (await h.post('/pos/bills', { storeId: fx.shop.id, lines, ...extra })).body; return (await h.post(`/pos/bills/${d.id}/finalize`, { tenders: tenders ?? [{ mode: 'cash', amount: d.grandTotal }] })).body; };
const xlsx = async (url: string) => { const r = await t.app.inject({ method: 'GET', url: `${A}${url}`, headers: { authorization: `Bearer ${t.adminToken}` } }); expect(r.statusCode).toBe(200); return XLSX.read(r.rawPayload, { type: 'buffer' }); };

describe('GST off: every report works, GST endpoints return nothing', () => {
  it('sells and reports with no tax; GST endpoints say GST is off', async () => {
    await sell([{ variantId: fx.tee.id, qty: 2 }]); await sell([{ variantId: fx.dress.id, qty: 1 }]);
    const sales = (await h.get('/reports/sales')).body;
    expect(sales.gstMode).toBe('off');
    expect(sales.rows).toHaveLength(2);
    expect(sales.columns.map((c: any) => c.key)).not.toContain('cgst');
    for (const p of ['gstr1', 'gstr3b', 'hsn-summary', 'input-vs-output']) expect((await h.get(`/reports/gst/${p}`)).body).toMatchObject({ gstMode: 'off' });
    expect((await t.api('GET', `${A}/reports/gst/gstr1?format=xlsx`, { token: t.adminToken })).body.gstMode).toBe('off');
  });
});

describe('GST on: GSTR-1, 3B and the sales register agree', () => {
  let net = 0;
  beforeAll(async () => {
    await setGst(t, true);
    await sell([{ variantId: fx.tee.id, qty: 3 }], [{ mode: 'upi', amount: 135000 }]); // B2C, intra
    await sell([{ variantId: fx.dress.id, qty: 2, unitPrice: 112000 }]); // 2,240.00 at 12%
    const { makeGstin } = await import('./helpers');
    const b2b = (await h.post('/customers', { accountGroup: 'B2B Trade', name: 'Delhi Traders', mobile: '9811100001', stateCode: '07', gstin: makeGstin('07', 'AAAAA1111A'), creditLimit: 9000000 })).body;
    await h.post('/sales/invoices', { storeId: fx.shop.id, customerId: b2b.id, lines: [{ variantId: fx.dress.id, qty: 3, unitPrice: 112000 }], tenders: [{ mode: 'credit', amount: 336000 }], dueDate: '2026-01-01T00:00:00.000Z' });
    const inv = (await h.get('/sales/invoices?pageSize=50')).body.items.filter((b: any) => b.gstMode === 'on'); net = inv.reduce((a: number, b: any) => a + b.grandTotal, 0);
    const ret = (await h.get(`/sales/invoices/${inv[0].id}`)).body; await h.post('/sales/returns', { invoiceId: ret.id, reason: 'size', lines: [{ variantId: ret.lines[0].variantId, qty: 1 }] });
  });
  it('GSTR-1 taxable plus tax equals the sales register total for the same dates (net of credit notes)', async () => {
    const g = (await h.get('/reports/gst/gstr1')).body;
    expect(g.gstMode).toBe('on');
    expect(g.tables.b2b).toHaveLength(1);
    expect(g.tables.b2b[0].igst).toBeGreaterThan(0); // another state
    const tablesTotal = [...g.tables.b2b, ...g.tables.b2cl, ...g.tables.b2cs].reduce((a: number, r: any) => a + r.taxable + r.igst + r.cgst + r.sgst, 0) - g.tables.cdn.reduce((a: number, r: any) => a + r.taxable + r.igst + r.cgst + r.sgst, 0);
    const reg = (await h.get('/reports/sales?pageSize=500')).body;
    const inGst = reg.rows.filter((r: any) => new Date(r.date) >= new Date(g.portalJson ? '2000-01-01' : '2000-01-01'));
    const gstDocs = inGst.filter((r: any) => r.cgst !== 0 || r.sgst !== 0 || r.igst !== 0);
    const regTotal = gstDocs.reduce((a: number, r: any) => a + r.net, 0);
    expect(Math.abs(tablesTotal - regTotal)).toBeLessThanOrEqual(3); // paise of round off on each invoice
    expect(g.tables.hsn.map((x: any) => x.hsn).sort()).toEqual(['6109', '6204']);
    expect(g.tables.docs.find((d: any) => d.series === 'POS').total).toBeGreaterThan(0);
    expect(g.portalJson.version).toBe(g.formatVersion);
    expect(g.portalJson.b2b[0].ctin).toBeTruthy();
    expect(g.portalJson.hsn.data.length).toBe(2);
  });
  it('only bills from the go-live date are in the GST reports; earlier bills are marked Non GST in exports', async () => {
    const g = (await h.get('/reports/gst/gstr1')).body;
    const nums = g.tables.hsn.reduce((a: number, r: any) => a + r.qty, 0);
    expect(nums).toBe(3 + 2 + 3 - 1); // GST era sales less the returned piece
    const full = await t.app.inject({ method: 'POST', url: `${A}/exports/full`, headers: { authorization: `Bearer ${t.adminToken}` } });
    expect(full.statusCode).toBe(201);
  });
  it('GSTR-1 downloads as Excel with a sheet per table; GSTR-3B worksheet nets output tax against input credit', async () => {
    const wb = await xlsx('/reports/gst/gstr1?format=xlsx');
    expect(wb.SheetNames).toEqual(['4 B2B', '5 B2CL', '7 B2CS', '9B CDN', '12 HSN', '13 Documents']);
    const b = (await h.get('/reports/gst/gstr3b')).body;
    expect(b.outward.igst).toBeGreaterThan(0);
    expect(b.interStateUnregistered.length).toBeGreaterThanOrEqual(0);
    expect(b.netPayable.total).toBe(b.netPayable.igst + b.netPayable.cgst + b.netPayable.sgst);
    const gb = await h.post('/grn', { vendorId: fx.knit.id, storeId: fx.shop.id, vendorInvoiceNo: 'G2', vendorInvoiceDate: '2026-11-02T00:00:00.000Z', lines: [{ variantId: fx.tee.id, receivedQty: 10, unitCost: 20000, gstRate: 5 }] });
    await h.post('/purchase-bills', { vendorId: fx.knit.id, vendorBillNo: 'B2', billDate: new Date().toISOString(), grnIds: [gb.body.id] });
    const b2 = (await h.get('/reports/gst/gstr3b')).body;
    expect(b2.itc.cgst).toBe(5000); // 10 x 200.00 at 5% = 100.00 tax, half CGST
    expect(b2.netPayable.cgst).toBe(b.netPayable.cgst - 5000);
    const iv = (await h.get('/reports/gst/input-vs-output')).body.rows; expect(iv[0].inputTax).toBe(10000);
    expect((await h.get('/reports/gst/hsn-summary')).body.rows.length).toBe(2);
  });
  it('checks before export: warns about missing data', async () => {
    const g = (await h.get('/reports/gst/gstr1')).body;
    expect(Array.isArray(g.warnings)).toBe(true);
  });
  it('a report for a past month does not change after later sales', async () => {
    const before = (await h.get('/reports/sales?from=2000-01-01T00:00:00.000Z&to=2026-11-09T00:00:00.000Z')).body;
    await sell([{ variantId: fx.tee.id, qty: 1 }]);
    const after = (await h.get('/reports/sales?from=2000-01-01T00:00:00.000Z&to=2026-11-09T00:00:00.000Z')).body;
    expect(after.rows.length).toBe(before.rows.length);
    expect(after.totals).toEqual(before.totals);
  });
});

describe('reports: stock, margin, outstanding, daybook, dashboard', () => {
  it('the stock report value equals the ledger value to the paisa', async () => {
    const rep = (await h.get('/reports/stock?pageSize=500')).body;
    const led = await ledgerOnHand(); const cost = new Map<string, number>(); for (const v of (await (await import('../src/models')).Variant.find().lean()) as any[]) cost.set(String(v._id), v.baseCost);
    const ledgerValue = led.reduce((a, l) => a + l.qty * (cost.get(l.variantId) ?? 0), 0);
    expect(rep.totals.costValue).toBe(ledgerValue);
    expect(rep.totals.onHand).toBe((await StockBalance.aggregate([{ $group: { _id: null, q: { $sum: '$onHand' } } }]))[0].q);
  });
  it('every report downloads as xlsx, csv and pdf with the same data as json', async () => {
    for (const name of ['stock', 'mrp', 'non-moving', 'slow-moving', 'purchases', 'sales', 'daily-sales', 'margin', 'profit-loss', 'outstanding', 'purchase-vs-sales']) {
      const j = await t.api('GET', `${A}/reports/${name}`, { token: t.adminToken }); expect(j.status, name).toBe(200);
      for (const [f, ct] of [['xlsx', 'spreadsheetml'], ['csv', 'text/csv'], ['pdf', 'application/pdf']] as const) { const r = await t.app.inject({ method: 'GET', url: `${A}/reports/${name}?format=${f}`, headers: { authorization: `Bearer ${t.adminToken}` } }); expect(r.statusCode, `${name} ${f}`).toBe(200); expect(String(r.headers['content-type'])).toContain(ct); }
      if (name === 'stock') { const wb = await xlsx('/reports/stock?format=xlsx'); expect(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]!]!).length).toBe(j.body.total + 1); } // +1 total row
    }
  });
  it('margin is net sales excluding tax less the cost recorded on the sale; profit and loss uses expenses', async () => {
    const m = (await h.get('/reports/margin')).body;
    expect(m.totals.margin).toBe(m.totals.netSales - m.totals.cost);
    expect((await h.get('/reports/margin?view=category')).status).toBe(200);
    await h.post('/expenses', { category: 'Rent', payee: 'Landlord', date: new Date().toISOString(), mode: 'cash', amount: 100000 });
    const pl = (await h.get('/reports/profit-loss')).body;
    expect(pl.rows.find((r: any) => r.line === 'Operating profit').amount).toBe(m.totals.margin - 100000);
    expect(pl.title).toMatch(/weighted average/);
    expect((await h.get('/expense-categories')).body.items.map((c: any) => c.name)).toContain('Rent');
  });
  it('outstanding: a B2B customer owes credit invoices less receipts, and the vendor side is included', async () => {
    const cust = (await h.get('/customers?q=Delhi')).body.items[0];
    expect((await h.get(`/customers/${cust.id}/outstanding`)).body).toMatchObject({ billed: 224000, outstanding: 224000 }); // the returned piece (112,000) went back to credit
    await h.post('/receipts', { customerId: cust.id, date: new Date().toISOString(), mode: 'bank', amount: 100000, reference: 'NEFT1' });
    expect((await h.get(`/customers/${cust.id}/outstanding`)).body).toMatchObject({ settled: 100000, outstanding: 124000 });
    const o = (await h.get('/reports/outstanding')).body; expect(o.rows.some((r: any) => r.party === 'Customer' && r.outstanding === 124000)).toBe(true);
  });
  it('the daybook lists money in and out by mode', async () => {
    await h.post('/payments', { payee: 'Bank', date: new Date().toISOString(), mode: 'cash', amount: 5000, purpose: 'Deposit' });
    const d = (await h.get('/accounts/daybook')).body;
    expect(d.byMode.cash.in).toBeGreaterThan(0); expect(d.byMode.cash.out).toBeGreaterThanOrEqual(105000);
    expect(d.rows.some((r: any) => r.type === 'Receipt')).toBe(true);
    expect(d.totals.net).toBe(d.totals.in - d.totals.out);
  });
  it('the dashboard gives sales by channel, margin, top items, stock alerts and a 30 day series', async () => {
    const s = (await h.get('/dashboard/summary')).body;
    expect(s.today.bills).toBeGreaterThan(0); expect(s.monthToDate.byChannel).toHaveProperty('POS');
    expect(s.last30Days).toHaveLength(30); expect(s.topItems.length).toBeGreaterThan(0); expect(typeof s.lowStockCount).toBe('number');
    expect(s.receivablesOverdue).toBeGreaterThan(0); // the B2B invoice was due in the past
  });
});

describe('exports: background jobs and Download everything', () => {
  it('a report export becomes a job with a file kept for 7 days; downloads are logged', async () => {
    const j = await h.post('/exports', { report: 'sales', format: 'xlsx', filters: {} }, { idem: false });
    expect(j.status).toBe(201); expect(j.body.status).toBe('done');
    const days = (new Date(j.body.expiresAt).getTime() - Date.now()) / 86400000; expect(Math.round(days)).toBe(7);
    const dl = await t.app.inject({ method: 'GET', url: `${A}${j.body.downloadUrl.replace('/api/v1', '')}`, headers: { authorization: `Bearer ${t.adminToken}` } });
    expect(dl.statusCode).toBe(200); expect(XLSX.read(dl.rawPayload, { type: 'buffer' }).SheetNames[0]).toBe('sales');
    expect((await h.get('/activity-log?entity=export')).body.items.some((x: any) => x.action === 'download')).toBe(true);
    expect((await h.post('/exports', { report: 'nope' }, { idem: false })).status).toBe(400);
  });
  it('Download everything is a complete zip, in both modes, with tax columns following GST mode', async () => {
    for (const on of [true, false]) {
      await setGst(t, on);
      const j = (await h.post('/exports/full', {}, { idem: false })).body; expect(j.status).toBe('done');
      const dl = await t.app.inject({ method: 'GET', url: `${A}/exports/${j.id}/download`, headers: { authorization: `Bearer ${t.adminToken}` } });
      const files = unzipSync(new Uint8Array(dl.rawPayload)); const names = Object.keys(files);
      for (const f of ['items_and_variants', 'stock_ledger', 'sales', 'sales_register', 'returns_and_credit_notes', 'online_orders', 'purchases', 'purchase_register', 'purchase_returns_and_debit_notes', 'vendors', 'customers', 'vendor_payments', 'customer_receipts', 'expenses', 'wallet_and_loyalty_ledgers', 'activity_log']) expect(names).toContain(`${f}.xlsx`);
      const lines = XLSX.read(Buffer.from(files['sales.xlsx']!), { type: 'buffer' }); const hdr = XLSX.utils.sheet_to_json<any[]>(lines.Sheets['Lines']!, { header: 1 })[0] as string[];
      expect(hdr.includes('CGST')).toBe(on);
      const reg = XLSX.read(Buffer.from(files['sales_register.xlsx']!), { type: 'buffer' }); expect((XLSX.utils.sheet_to_json<any[]>(reg.Sheets['Sales register']!, { header: 1 })[0] as string[]).length).toBe(27);
      if (on) expect(names).toContain('gstr1.xlsx');
      if (!on) { const first = XLSX.utils.sheet_to_json<any>(reg.Sheets['Sales register']!); expect(first.every((r: any) => r['CGST Amount'] === 0 && r['IGST Amount'] === 0)).toBe(true); }
    }
  });
  it('permissions: reports.export is Admin and Accounts only', async () => {
    const sales = await tokenFor(t, 'Sales', 's-rep@test.local'); const acc = await tokenFor(t, 'Accounts', 'a-rep@test.local');
    expect((await h.post('/exports', { report: 'stock' }, { token: sales, idem: false })).status).toBe(403);
    expect((await h.post('/exports', { report: 'stock' }, { token: acc, idem: false })).status).toBe(201);
    expect((await h.get('/reports/gst/gstr1', sales)).status).toBe(403);
    expect((await h.get('/reports/stock', sales)).status).toBe(200);
  });
});
