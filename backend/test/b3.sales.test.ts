import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SalesBill, StockLedger } from '../src/models';
import { calcInvoice } from '../src/lib/invoiceCalc';
import { setupTest, validProfile, type TestCtx } from './helpers';
import { A, api, fixtures, key, setGst, stockOf, tokenFor, type Fx } from './b2.helpers';

let t: TestCtx; let fx: Fx; let h: ReturnType<typeof api>;
beforeAll(async () => {
  t = await setupTest(); fx = await fixtures(t); h = fx.h;
  for (const [v, q] of [[fx.tee, 30], [fx.dress, 10], [fx.kurti, 1]] as const) await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Opening for tests', lines: [{ variantId: v.id, qty: q }] });
});
afterAll(async () => { await t.close(); });

const sampleLines = () => [
  { variantId: fx.dress.id, qty: 1, unitPrice: 149900, discount: { type: 'amount', value: 15000 } },
  { variantId: fx.tee.id, qty: 2, unitPrice: 45000, discount: { type: 'amount', value: 9000 } },
];
const draft = async (lines: any[], extra: object = {}) => { const r = await h.post('/pos/bills', { storeId: fx.shop.id, lines, ...extra }); if (r.status !== 201) console.log('DRAFTDEBUG', r.status, JSON.stringify(r.body)); return r.body; };
const fin = (id: string, tenders: any[], extra: object = {}, o: any = {}) => h.post(`/pos/bills/${id}/finalize`, { tenders, ...extra }, o);

describe('the engine: round half up, proportional discount, round off line', () => {
  it('splits a bill discount of 100 in proportion, leftover paisa to the largest line, total still right', () => {
    const r = calcInvoice([{ qty: 1, unitPrice: 134900, lineDiscount: 0, rate: 12, hsn: '6204' }, { qty: 1, unitPrice: 81000, lineDiscount: 0, rate: 5, hsn: '6109' }], 10000, { gstOn: true, supply: 'intra' });
    expect(r.lines.map((l) => l.billDiscountShare)).toEqual([6249, 3751]);
    expect(r.totals.grandTotal).toBe(215900 - 10000);
    expect(r.lines.reduce((a, l) => a + l.net, 0)).toBe(r.totals.grandTotal);
  });
  it('sample invoice POS-984322: grand 2,159.00, HSN groups, tax 183.12, round off -0.01 (the PDF printed 183.11)', () => {
    const r = calcInvoice([{ qty: 1, unitPrice: 149900, lineDiscount: 15000, rate: 12, hsn: '6204' }, { qty: 2, unitPrice: 45000, lineDiscount: 9000, rate: 5, hsn: '6109' }], 0, { gstOn: true, supply: 'intra' });
    expect(r.groups).toEqual([
      { hsn: '6109', rate: 5, net: 81000, taxable: 77143, cgst: 1929, sgst: 1929, igst: 0 },
      { hsn: '6204', rate: 12, net: 134900, taxable: 120446, cgst: 7227, sgst: 7227, igst: 0 },
    ]);
    expect(r.totals).toMatchObject({ gross: 239900, discount: 24000, grandTotal: 215900, tax: 18312, roundOff: -1 });
  });
  it('inter state is IGST; GST off has no tax lines', () => {
    const l = [{ qty: 1, unitPrice: 112000, lineDiscount: 0, rate: 12, hsn: '6204' }];
    expect(calcInvoice(l, 0, { gstOn: true, supply: 'inter' }).totals).toMatchObject({ igst: 12000, cgst: 0, taxable: 100000, roundOff: 0 });
    expect(calcInvoice(l, 0, { gstOn: false, supply: 'intra' }).totals).toMatchObject({ tax: 0, roundOff: 0, grandTotal: 112000, taxable: 112000 });
  });
});

describe('GST off first: a plain Bill of Supply', () => {
  let off: any;
  it('the same bill has a grand total of 2,159.00 and no tax lines', async () => {
    const d = await draft(sampleLines());
    expect(d.gstMode).toBe('off');
    const r = await fin(d.id, [{ mode: 'cash', amount: 215900 }]);
    expect(r.status).toBe(200);
    off = r.body;
    expect(off).toMatchObject({ status: 'finalized', grandTotal: 215900, roundOff: 0, gstMode: 'off' });
    expect(off.invoiceNumber).toMatch(/^POS-\d{4}-\d{2}-000001$/);
    expect(off.groups).toEqual([]);
    expect(off.snapshot.title).toBe('BILL OF SUPPLY');
    expect(off.snapshot.lines[0].cgst).toBeNull();
    const html = (await t.api('GET', `${A}/sales/invoices/${off.id}/print?size=4x6&format=html`, { token: t.adminToken })).body as string;
    expect(html).not.toMatch(/GST|CGST|SGST|IGST|HSN|TAX INVOICE/);
    expect(html).toMatch(/BILL OF SUPPLY/);
  });
  it('stock moved by the finalize, SALE rows carry the number and the average cost', async () => {
    expect((await stockOf(h, fx.dress.id, fx.shop.id)).onHand).toBe(9);
    const row: any = await StockLedger.findOne({ type: 'SALE', docNumber: off.invoiceNumber, variantId: fx.dress.id }).lean();
    expect(row).toMatchObject({ qty: -1, docType: 'POS' });
  });
});

describe('GST on: the sample invoice', () => {
  let inv: any;
  beforeAll(async () => { await setGst(t, true); });
  it('reproduces POS-984322: taxable, CGST, SGST by HSN, tax 183.12, round off -0.01, grand 2,159.00', async () => {
    const d = await draft(sampleLines());
    const r = await fin(d.id, [{ mode: 'upi', amount: 215900, reference: 'UPI123' }]);
    expect(r.status).toBe(200);
    inv = r.body;
    expect(inv.gstMode).toBe('on');
    expect(inv.groups.map((g: any) => [g.hsn, g.taxable, g.cgst, g.sgst])).toEqual([['6109', 77143, 1929, 1929], ['6204', 120446, 7227, 7227]]);
    expect(inv.totals).toMatchObject({ gross: 239900, discount: 24000, tax: 18312, roundOff: -1, grandTotal: 215900 });
    expect(inv.invoiceNumber).toMatch(/^POS-\d{4}-\d{2}-000002$/);
    expect(inv.snapshot.title).toBe('TAX INVOICE');
  });
  it('a reprint a month later is identical, even after the item and the business details change', async () => {
    const before = (await t.api('GET', `${A}/sales/invoices/${inv.id}/print?size=3in&format=html`, { token: t.adminToken })).body;
    await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile({ gstin: inv.snapshot.business.gstin, pan: 'ABCDE1234F', brandName: 'Renamed Brand', termsText: 'New terms' }) });
    await h.put(`/items/${fx.dress.itemId}`, { name: 'Totally different name', hsn: '6104' });
    const after = (await t.api('GET', `${A}/sales/invoices/${inv.id}/print?size=3in&format=html`, { token: t.adminToken })).body;
    expect(after).toBe(before);
    expect(before).toMatch(/THUNIKART/);
    await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile({ gstin: inv.snapshot.business.gstin, pan: 'ABCDE1234F' }) });
  });
  it('prints correctly at all four sizes (PDF), and the HTML view carries the GST summary', async () => {
    for (const size of ['a4', '2in', '3in', '4x6']) {
      const res = await t.app.inject({ method: 'GET', url: `${A}/sales/invoices/${inv.id}/print?size=${size}`, headers: { authorization: `Bearer ${t.adminToken}` } });
      expect(res.statusCode, size).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.rawPayload.toString('latin1').startsWith('%PDF')).toBe(true);
    }
    const four = (await t.app.inject({ method: 'GET', url: `${A}/sales/invoices/${inv.id}/print?size=4x6`, headers: { authorization: `Bearer ${t.adminToken}` } })).rawPayload.toString('latin1');
    expect(four).toMatch(/\/MediaBox \[0 0 288 432\]/);
    const html = (await t.api('GET', `${A}/sales/invoices/${inv.id}/print?size=4x6&format=html`, { token: t.adminToken })).body as string;
    expect(html).toMatch(/GST Tax Summary/);
    expect(html).toMatch(/H:6109 \(5%\): Taxable 771\.43/);
    expect(html).toMatch(/H:6204 \(12%\): Taxable 1204\.46/);
    expect(html).toMatch(/Round off:\s+-0\.01/);
  });
  it('a finalized invoice cannot be edited, finalized twice, or printed while still a draft', async () => {
    expect((await h.put(`/pos/bills/${inv.id}`, { notes: 'x' }, { headers: { 'if-match': String(inv.version) } })).status).toBe(422);
    expect((await fin(inv.id, [{ mode: 'cash', amount: 215900 }])).body.code).toBe('ALREADY_FINALIZED');
    const d = await draft([{ variantId: fx.tee.id, qty: 1 }]);
    expect((await t.api('GET', `${A}/sales/invoices/${d.id}/print`, { token: t.adminToken })).status).toBe(422);
  });
});

describe('bills, holds and payments', () => {
  it('hold reserves nothing; drafts edit with If-Match; payments must match the total', async () => {
    const before = (await stockOf(h, fx.tee.id, fx.shop.id)).onHand;
    const d = await draft([{ variantId: fx.tee.id, qty: 3 }], { hold: true });
    expect(d.status).toBe('hold');
    expect((await stockOf(h, fx.tee.id, fx.shop.id)).onHand).toBe(before);
    expect((await h.get('/pos/bills?status=hold')).body.items.some((b: any) => b.id === d.id)).toBe(true);
    const e = await h.put(`/pos/bills/${d.id}`, { lines: [{ variantId: fx.tee.id, qty: 4 }], hold: false }, { headers: { 'if-match': String(d.version) } });
    expect(e.status).toBe(200);
    expect(e.body.status).toBe('draft');
    expect((await h.put(`/pos/bills/${d.id}`, { notes: 'stale' }, { headers: { 'if-match': String(d.version) } })).body.code).toBe('STALE_EDIT');
    const bad = await fin(d.id, [{ mode: 'cash', amount: 1000 }]);
    expect(bad.body.code).toBe('PAYMENT_MISMATCH');
    const split = await fin(d.id, [{ mode: 'cash', amount: 100000 }, { mode: 'card', amount: e.body.grandTotal - 100000, reference: 'RRN1' }]);
    expect(split.status).toBe(200);
    expect(split.body.tenders).toHaveLength(2);
  });
  it('a finalize retry with the same Idempotency-Key sells once', async () => {
    const d = await draft([{ variantId: fx.tee.id, qty: 1 }]); const before = (await stockOf(h, fx.tee.id, fx.shop.id)).onHand;
    const a = await fin(d.id, [{ mode: 'cash', amount: d.grandTotal }], {}, { idem: 'fin-retry-12345' }); const b = await fin(d.id, [{ mode: 'cash', amount: d.grandTotal }], {}, { idem: 'fin-retry-12345' });
    expect(b.body.invoiceNumber).toBe(a.body.invoiceNumber);
    expect((await stockOf(h, fx.tee.id, fx.shop.id)).onHand).toBe(before - 1);
    expect(await SalesBill.countDocuments({ invoiceNumber: a.body.invoiceNumber })).toBe(1);
  });
  it('the last piece: two cashiers racing, one succeeds and the other gets 409, nothing half saved', async () => {
    const d1 = await draft([{ variantId: fx.kurti.id, qty: 1 }]); const d2 = await draft([{ variantId: fx.kurti.id, qty: 1 }]);
    const numbersBefore = await SalesBill.countDocuments({ status: 'finalized' });
    const rs = await Promise.all([fin(d1.id, [{ mode: 'cash', amount: d1.grandTotal }]), fin(d2.id, [{ mode: 'cash', amount: d2.grandTotal }])]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(rs.find((r) => r.status === 409)!.body.code).toBe('INSUFFICIENT_STOCK');
    expect((await stockOf(h, fx.kurti.id, fx.shop.id)).onHand).toBe(0);
    expect(await SalesBill.countDocuments({ status: 'finalized' })).toBe(numbersBefore + 1);
  });
  it('invoice numbers have no gaps', async () => {
    const nums = (await SalesBill.find({ channel: 'POS', status: 'finalized' }).sort({ invoiceNumber: 1 }).lean() as any[]).map((b) => Number(b.invoiceNumber.split('-').pop()));
    nums.forEach((n, i) => expect(n).toBe(i + 1));
  });
});

describe('discount limits and manager approval', () => {
  it('above the role maximum a manager PIN is needed, a wrong PIN is refused, and the approval is logged', async () => {
    await h.put('/settings/operations', { allowNegativeStock: false, poApprovalLimit: 5000000, reorderTargetMultiplier: 2, managerPin: '4821', maxDiscountPct: { Admin: 100, Sales: 10, 'Buyer Purchase': 0, Accounts: 0 } });
    const sales = await tokenFor(t, 'Sales', 'cashier@test.local');
    const mk = () => h.post('/pos/bills', { storeId: fx.shop.id, lines: [{ variantId: fx.tee.id, qty: 1, discount: { type: 'percent', value: 20 } }] }, { token: sales });
    const d = (await mk()).body; const pay = [{ mode: 'cash', amount: d.grandTotal }];
    const no = await h.post(`/pos/bills/${d.id}/finalize`, { tenders: pay }, { token: sales });
    expect(no.status).toBe(422);
    expect(no.body.code).toBe('DISCOUNT_APPROVAL_REQUIRED');
    expect((await h.post(`/pos/bills/${d.id}/finalize`, { tenders: pay, approval: { pin: '0000' } }, { token: sales })).status).toBe(403);
    const ok = await h.post(`/pos/bills/${d.id}/finalize`, { tenders: pay, approval: { pin: '4821' } }, { token: sales });
    expect(ok.status).toBe(200);
    const log = (await h.get('/activity-log?entity=discount_approval')).body.items;
    expect(log[0].after.discountPct).toBe(20);
    const small = (await h.post('/pos/bills', { storeId: fx.shop.id, lines: [{ variantId: fx.tee.id, qty: 1, discount: { type: 'percent', value: 5 } }] }, { token: sales })).body;
    expect((await h.post(`/pos/bills/${small.id}/finalize`, { tenders: [{ mode: 'cash', amount: small.grandTotal }] }, { token: sales })).status).toBe(200);
  });
});

describe('returns, exchanges and cancellation', () => {
  it('a discounted item cannot be returned (client terms); the window and quantities are enforced', async () => {
    const d = await draft([{ variantId: fx.tee.id, qty: 2, discount: { type: 'amount', value: 5000 } }]);
    const inv = (await fin(d.id, [{ mode: 'cash', amount: d.grandTotal }])).body;
    const r = await h.post('/sales/returns', { invoiceId: inv.id, reason: 'size', lines: [{ variantId: fx.tee.id, qty: 1 }] });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('NOT_RETURNABLE');
    await h.put('/settings/operations', { allowNegativeStock: false, poApprovalLimit: 5000000, reorderTargetMultiplier: 2, returnWindowDays: 0 });
    const clean = await draft([{ variantId: fx.tee.id, qty: 1 }]); const ci = (await fin(clean.id, [{ mode: 'cash', amount: clean.grandTotal }])).body;
    await SalesBill.updateOne({ _id: ci.id }, { $set: { finalizedAt: new Date(Date.now() - 3 * 86400000) } });
    expect((await h.post('/sales/returns', { invoiceId: ci.id, reason: 'size', lines: [{ variantId: fx.tee.id, qty: 1 }] })).body.code).toBe('RETURN_WINDOW_PASSED');
    await h.put('/settings/operations', { allowNegativeStock: false, poApprovalLimit: 5000000, reorderTargetMultiplier: 2, returnWindowDays: 7 });
    expect((await h.post('/sales/returns', { invoiceId: ci.id, reason: 'size', lines: [{ variantId: fx.tee.id, qty: 2 }] })).body.code).toBe('RETURN_EXCEEDS_SALE');
  });
  it('a return makes a credit note, restocks, and refunds to the original tender or the wallet', async () => {
    const cust = (await h.post('/customers', { accountGroup: 'Retail Walk-in', name: 'Ananya', mobile: '9876500001', stateCode: '33' })).body;
    const d = await draft([{ variantId: fx.tee.id, qty: 2 }], { customerId: cust.id }); const inv = (await fin(d.id, [{ mode: 'upi', amount: d.grandTotal }])).body;
    const before = (await stockOf(h, fx.tee.id, fx.shop.id)).onHand;
    const r = await h.post('/sales/returns', { invoiceNumber: inv.invoiceNumber, reason: 'size', lines: [{ variantId: fx.tee.id, qty: 1 }], refundTo: 'wallet' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ refundTotal: 45000, refunds: [{ mode: 'wallet', amount: 45000 }] });
    expect(r.body.creditNoteNumber).toMatch(/^CN-/);
    expect((await stockOf(h, fx.tee.id, fx.shop.id)).onHand).toBe(before + 1);
    expect((await h.get(`/customers/${cust.id}`)).body.walletBalance).toBe(45000);
    const r2 = await h.post('/sales/returns', { invoiceId: inv.id, reason: 'size', lines: [{ variantId: fx.tee.id, qty: 1 }], refundTo: 'original' });
    expect(r2.body.refunds).toEqual([{ mode: 'upi', amount: 45000 }]);
    expect((await h.get(`/sales/invoices/${inv.id}`)).body.lines[0].returnedQty).toBe(2);
  });
  it('a defect goes to Damaged Stock instead of back on the shelf', async () => {
    const d = await draft([{ variantId: fx.tee.id, qty: 1 }]); const inv = (await fin(d.id, [{ mode: 'cash', amount: d.grandTotal }])).body;
    const shelf = (await stockOf(h, fx.tee.id, fx.shop.id)).onHand;
    await h.post('/sales/returns', { invoiceId: inv.id, reason: 'defect', lines: [{ variantId: fx.tee.id, qty: 1 }] });
    expect((await stockOf(h, fx.tee.id, fx.shop.id)).onHand).toBe(shelf);
    const stores = (await h.get('/stores')).body.items; const dmg = stores.find((s: any) => s.code === 'DAMAGED');
    expect((await stockOf(h, fx.tee.id, dmg.id)).onHand).toBe(1);
  });
  it('exchanging a 1,499 item for a 450 item refunds the difference to the original tender, linked together', async () => {
    const d = await draft([{ variantId: fx.dress.id, qty: 1 }]); const inv = (await fin(d.id, [{ mode: 'upi', amount: d.grandTotal }])).body;
    const r = await h.post('/sales/returns', { invoiceId: inv.id, reason: 'size', lines: [{ variantId: fx.dress.id, qty: 1 }], exchange: { lines: [{ variantId: fx.tee.id, qty: 1 }] } });
    expect(r.status).toBe(201);
    expect(r.body.refundTotal).toBe(inv.grandTotal);
    expect(r.body.refunds).toEqual([{ mode: 'upi', amount: inv.grandTotal - 45000 }]); // 1,049.00 back
    const ex = (await h.get(`/sales/invoices/${r.body.exchangeInvoiceId}`)).body;
    expect(ex.grandTotal).toBe(45000);
    expect(ex.tenders).toEqual([{ mode: 'credit_note', amount: 45000, reference: r.body.creditNoteNumber }]);
  });
  it('cancelling an invoice reverses it with a full credit note; the invoice stays on file', async () => {
    const d = await draft([{ variantId: fx.tee.id, qty: 2 }]); const inv = (await fin(d.id, [{ mode: 'cash', amount: d.grandTotal }])).body;
    const before = (await stockOf(h, fx.tee.id, fx.shop.id)).onHand;
    const c = await h.post(`/sales/invoices/${inv.id}/cancel`, { note: 'Customer changed mind' });
    expect(c.status).toBe(200);
    expect(c.body.isCancellation).toBe(true);
    expect((await stockOf(h, fx.tee.id, fx.shop.id)).onHand).toBe(before + 2);
    expect((await h.get(`/sales/invoices/${inv.id}`)).body).toMatchObject({ status: 'cancelled', invoiceNumber: inv.invoiceNumber });
    expect((await h.post(`/sales/invoices/${inv.id}/cancel`, {})).status).toBe(422);
    const sales = await tokenFor(t, 'Sales', 'cancel-sales@test.local');
    expect((await h.post(`/sales/invoices/${inv.id}/cancel`, {}, { token: sales })).status).toBe(403); // cancel is Accounts/Admin (sales.delete)
  });
});

describe('B2B counter, shifts, loyalty and inbound orders', () => {
  it('a B2B counter bill needs a GSTIN customer, uses IGST for another state, and can use credit within the limit', async () => {
    const b2b = await (async () => { const { makeGstin } = await import('./helpers'); return h.post('/customers', { accountGroup: 'B2B Trade', name: 'Delhi Traders', mobile: '9811100001', stateCode: '07', gstin: makeGstin('07', 'AAAAA1111A'), creditLimit: 5000000 }); })();
    expect(b2b.status).toBe(201);
    const body = { storeId: fx.shop.id, customerId: b2b.body.id, lines: [{ variantId: fx.dress.id, qty: 2, unitPrice: 112000 }], dueDate: '2026-12-10T00:00:00.000Z' };
    const walk = await h.post('/sales/invoices', { ...body, customerId: (await h.post('/customers', { accountGroup: 'Retail Walk-in', name: 'W', mobile: '9811100002', stateCode: '33' })).body.id, tenders: [] });
    expect(walk.status).toBe(400);
    const inv = await h.post('/sales/invoices', { ...body, tenders: [{ mode: 'credit', amount: 224000 }] });
    expect(inv.status).toBe(201);
    expect(inv.body).toMatchObject({ channel: 'CNT', supply: 'inter', creditDue: 224000, grandTotal: 224000 });
    expect(inv.body.totals.igst).toBe(24000); // 2,000.00 taxable x 12%
    expect(inv.body.invoiceNumber).toMatch(/^CNT-/);
    const over = await h.post('/sales/invoices', { ...body, lines: [{ variantId: fx.dress.id, qty: 5, unitPrice: 2000000 }], tenders: [{ mode: 'credit', amount: 10000000 }] });
    expect(over.body.code).toBe('CREDIT_LIMIT_EXCEEDED');
  });
  it('shifts: expected cash is opening + cash sales - cash refunds against counted cash', async () => {
    const cashier = await tokenFor(t, 'Sales', 'shift@test.local');
    const s = await h.post('/pos/shifts/open', { storeId: fx.shop.id, openingCash: 100000 }, { token: cashier, idem: false });
    expect(s.status).toBe(201);
    expect((await h.post('/pos/shifts/open', { storeId: fx.shop.id, openingCash: 1 }, { token: cashier, idem: false })).status).toBe(422);
    const d = (await h.post('/pos/bills', { storeId: fx.shop.id, lines: [{ variantId: fx.tee.id, qty: 2 }] }, { token: cashier })).body;
    await h.post(`/pos/bills/${d.id}/finalize`, { tenders: [{ mode: 'cash', amount: 50000 }, { mode: 'upi', amount: d.grandTotal - 50000 }] }, { token: cashier });
    const c = await h.post(`/pos/shifts/${s.body.id}/close`, { countedCash: 149000 }, { token: cashier, idem: false });
    expect(c.body).toMatchObject({ status: 'closed', expectedCash: 150000, countedCash: 149000, difference: -1000 });
    await h.put('/settings/operations', { allowNegativeStock: false, poApprovalLimit: 5000000, reorderTargetMultiplier: 2, requireOpenShift: true });
    const d2 = (await h.post('/pos/bills', { storeId: fx.shop.id, lines: [{ variantId: fx.tee.id, qty: 1 }] }, { token: cashier })).body;
    expect((await h.post(`/pos/bills/${d2.id}/finalize`, { tenders: [{ mode: 'cash', amount: d2.grandTotal }] }, { token: cashier })).body.code).toBe('SHIFT_REQUIRED');
    await h.put('/settings/operations', { allowNegativeStock: false, poApprovalLimit: 5000000, reorderTargetMultiplier: 2, requireOpenShift: false });
  });
  it('loyalty is off by default; when on, points are earned, redeemed into the wallet, and never negative', async () => {
    const c = (await h.post('/customers', { accountGroup: 'Retail Walk-in', name: 'Loyal', mobile: '9811100003', stateCode: '33' })).body;
    expect((await h.post(`/customers/${c.id}/loyalty/redeem`, { points: 10 })).body.code).toBe('LOYALTY_OFF');
    await h.put('/settings/operations', { allowNegativeStock: false, poApprovalLimit: 5000000, reorderTargetMultiplier: 2, loyalty: { enabled: true, pointsPer100: 1, pointValuePaise: 100, minRedeem: 5, expiryDays: 0 } });
    const d = await draft([{ variantId: fx.tee.id, qty: 2 }], { customerId: c.id });
    const inv = (await fin(d.id, [{ mode: 'cash', amount: d.grandTotal }])).body;
    expect(inv.loyaltyEarned).toBe(9); // Rs 900 at 1 point per Rs 100
    expect((await h.get(`/customers/${c.id}`)).body.loyaltyPoints).toBe(9);
    const red = await h.post(`/customers/${c.id}/loyalty/redeem`, { points: 5 });
    expect(red.body).toMatchObject({ points: 5, value: 500, loyaltyBalance: 4, walletBalance: 500 });
    expect((await h.post(`/customers/${c.id}/loyalty/redeem`, { points: 50 })).body.code).toBe('INSUFFICIENT_POINTS');
    expect((await h.post(`/customers/${c.id}/loyalty/redeem`, { points: 2 })).body.code).toBe('BELOW_MIN_REDEEM');
    const d2 = await draft([{ variantId: fx.tee.id, qty: 1 }], { customerId: c.id });
    const w = await fin(d2.id, [{ mode: 'wallet', amount: d2.grandTotal }]);
    expect(w.body.code).toBe('INSUFFICIENT_WALLET'); // wallet holds 5.00 only
    await h.put('/settings/operations', { allowNegativeStock: false, poApprovalLimit: 5000000, reorderTargetMultiplier: 2, loyalty: { enabled: false, pointsPer100: 0, pointValuePaise: 0, minRedeem: 0, expiryDays: 0 } });
  });
  it('an inbound online order becomes one ECM invoice; calling twice is safe; shipping is part of the payment', async () => {
    await h.post('/stock/adjustments', { storeId: (await h.get('/stores')).body.items.find((x: any) => x.type === 'online').id, reason: 'Online stock', lines: [{ variantId: fx.tee.id, qty: 10 }] });
    const body = { orderNumber: 'WEB-1001', customer: { name: 'Rahul', mobile: '9812345678', stateCode: '29' }, lines: [{ variantId: fx.tee.id, qty: 1, unitPrice: 45000 }], shippingCharge: 5000, tenders: [{ mode: 'upi', amount: 50000, reference: 'pay_1' }], shipTo: 'Bangalore' };
    const before = (await stockOf(h, fx.tee.id)).onHand;
    const a = await h.post('/orders/inbound', body, { idem: 'inbound-key-123' }); const b = await h.post('/orders/inbound', body, { idem: 'inbound-key-123' });
    expect(a.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(a.body).toMatchObject({ channel: 'ECM', supply: 'inter' });
    expect(a.body.invoiceNumber).toMatch(/^ECM-/);
    expect((await h.post('/orders/inbound', body, { idem: 'different-key-1' })).body.id).toBe(a.body.id); // same order number, still one invoice
    expect((await stockOf(h, fx.tee.id)).onHand).toBe(before - 1);
    expect((await h.post('/orders/inbound', { ...body, orderNumber: 'WEB-1002', tenders: [{ mode: 'upi', amount: 10 }] })).body.code).toBe('PAYMENT_MISMATCH');
  });
  it('permissions: Sales can bill but not cancel; Accounts can view invoices but not bill; Buyer cannot bill', async () => {
    const acc = await tokenFor(t, 'Accounts', 'acc-sales@test.local'); const buyer = await tokenFor(t, 'Buyer Purchase', 'buyer-sales@test.local');
    expect((await h.get('/sales/invoices', acc)).status).toBe(200);
    expect((await h.post('/pos/bills', { storeId: fx.shop.id, lines: [{ variantId: fx.tee.id, qty: 1 }] }, { token: acc })).status).toBe(403);
    expect((await h.post('/pos/bills', { storeId: fx.shop.id, lines: [{ variantId: fx.tee.id, qty: 1 }] }, { token: buyer })).status).toBe(403);
    expect((await h.post('/orders/inbound', {}, { token: buyer })).status).toBe(403);
  });
  it('the stock ledger still ties to the balances after all the sales and returns', async () => {
    const { ledgerOnHand } = await import('../src/lib/stock'); const { StockBalance } = await import('../src/models');
    const led = await ledgerOnHand(); const bals: any[] = await StockBalance.find().lean(); const lm = new Map(led.map((l) => [`${l.variantId}:${l.storeId}`, l.qty]));
    for (const b of bals) expect(lm.get(`${b.variantId}:${b.storeId}`) ?? 0).toBe(b.onHand);
    expect(await StockLedger.countDocuments({ docNumber: /^pending-/ })).toBe(0);
  });
  void key;
});

describe('several sizes in one row: the size is chosen at billing, stock is one count', () => {
  it('needs a size from the row, puts it on the bill, and takes the pieces off the one count', async () => {
    const item = (await h.post('/items', { name: 'Babita Kurtis 300', hsn: '6104', variants: [{ size: 'S, M, L, XL, XXL', color: '', mrp: 30000, sellingPrice: 30000 }] })).body;
    const v = item.variants[0];
    await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Opening for tests', lines: [{ variantId: v.id, qty: 10 }] });
    const noSize = await h.post('/pos/bills', { storeId: fx.shop.id, lines: [{ variantId: v.id, qty: 1 }] });
    expect(noSize.status).toBe(400);
    const wrong = await h.post('/pos/bills', { storeId: fx.shop.id, lines: [{ variantId: v.id, qty: 1, size: '3XL' }] });
    expect(wrong.status).toBe(400);
    const d = await h.post('/pos/bills', { storeId: fx.shop.id, lines: [{ variantId: v.id, qty: 2, size: 'xl', color: 'Blue' }] });
    expect(d.status).toBe(201);
    expect(d.body.lines[0].size).toBe('XL');
    expect(d.body.lines[0].description).toMatch(/XL Blue$/);
    const r = await fin(d.body.id, [{ mode: 'cash', amount: d.body.grandTotal }]);
    expect(r.status).toBe(200);
    expect(r.body.lines[0].size).toBe('XL');
    expect((await stockOf(h, v.id, fx.shop.id)).onHand).toBe(8);
  });
});
