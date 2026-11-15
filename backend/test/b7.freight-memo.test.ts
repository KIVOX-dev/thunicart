import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SalesBill, Variant, WalletLedger } from '../src/models';
import { setupTest, makeGstin, type TestCtx } from './helpers';
import { api, fixtures, setGst, type Fx } from './b2.helpers';

let t: TestCtx; let fx: Fx; let h: ReturnType<typeof api>;
beforeAll(async () => { t = await setupTest(); fx = await fixtures(t); h = fx.h; });
afterAll(async () => { await t.close(); });

const cost = async (id: string) => ((await Variant.findById(id).lean()) as any).baseCost as number;
const receive = (variantId: string, no: string, extra: object = {}) =>
  h.post('/grn', { vendorId: fx.knit.id, storeId: fx.shop.id, vendorInvoiceNo: no, vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId, receivedQty: 10, unitCost: 20000 }], ...extra });
const bill = (no: string, grnId: string, extra: object = {}) => h.post('/purchase-bills', { vendorId: fx.knit.id, vendorBillNo: no, billDate: '2026-11-06T00:00:00.000Z', grnIds: [grnId], ...extra });

describe('freight billed by the vendor on the same bill', () => {
  it('is added to the cost of the pieces in stock, shared by value', async () => {
    const g = await receive(fx.tee.id, 'F-1');
    expect(g.status).toBe(201);
    const before = await cost(fx.tee.id);
    const b = await bill('FB-1', g.body.id, { freight: 5000 });
    expect(b.status).toBe(201);
    expect(b.body.freightCostAdded).toBe(5000);
    expect(await cost(fx.tee.id)).toBe(before + 500); // 5,000 paise over 10 pieces
  });
  it('only the share for pieces still on hand is added when some were already sold', async () => {
    const g = await receive(fx.dress.id, 'F-2');
    await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Sold before the bill came', lines: [{ variantId: fx.dress.id, qty: -4 }] });
    const before = await cost(fx.dress.id);
    const b = await bill('FB-2', g.body.id, { freight: 5000 });
    expect(b.body.freightCostAdded).toBe(3000); // 6 of the 10 pieces are still here
    expect(b.body.freightNote).toMatch(/already sold/);
    expect(await cost(fx.dress.id)).toBe(before + 500); // 3,000 over the 6 on hand
  });
  it('can be left out of the cost, and is not added twice when the receipt already carried freight', async () => {
    const g = await receive(fx.kurti.id, 'F-3');
    const before = await cost(fx.kurti.id);
    const off = await bill('FB-3', g.body.id, { freight: 5000, addFreightToCost: false });
    expect(off.body).toMatchObject({ freightCostAdded: 0, grandTotal: off.body.totals.total + 5000 });
    expect(await cost(fx.kurti.id)).toBe(before);

    const g2 = await receive(fx.tee.id, 'F-4', { freight: 3000 });
    const mid = await cost(fx.tee.id);
    const twice = await bill('FB-4', g2.body.id, { freight: 1000 });
    expect(twice.body.freightCostAdded).toBe(0);
    expect(twice.body.freightNote).toMatch(/already carried freight/);
    expect(await cost(fx.tee.id)).toBe(mid);
  });
});

describe('customer credit memos', () => {
  let cust: any;
  beforeAll(async () => { await setGst(t, false); cust = (await h.post('/customers', { accountGroup: 'Retail Walk-in', name: 'Ananya Sharma', mobile: '9876543210', stateCode: '33' })).body; });

  it('credits the wallet and takes the next credit note number', async () => {
    const m = await h.post('/credit-memos', { customerId: cust.id, amount: 15000, reason: 'Price correction', settle: 'wallet' });
    expect(m.status).toBe(201);
    expect(m.body).toMatchObject({ amount: 15000, settle: 'wallet', taxable: 15000, gstMode: 'off', customerName: 'Ananya Sharma' });
    expect(m.body.creditNoteNumber).toMatch(/^CN-/);
    const sum = await WalletLedger.aggregate([{ $match: { customerId: (await import('mongoose')).default.Types.ObjectId.createFromHexString(cust.id) } }, { $group: { _id: null, v: { $sum: '$amount' } } }]);
    expect(sum[0].v).toBe(15000);
    const m2 = await h.post('/credit-memos', { customerId: cust.id, amount: 100, reason: 'Goodwill', settle: 'wallet' });
    expect(m2.body.creditNoteNumber).not.toBe(m.body.creditNoteNumber);
    expect((await h.get('/credit-memos')).body.total).toBe(2);
  });
  it('a refund needs to say how it was paid, and a memo needs a real customer', async () => {
    expect((await h.post('/credit-memos', { customerId: cust.id, amount: 5000, reason: 'Refund', settle: 'refund' })).status).toBe(400);
    expect((await h.post('/credit-memos', { customerId: cust.id, amount: 5000, reason: 'Refund', settle: 'refund', refundMode: 'upi' })).status).toBe(201);
    expect((await h.post('/credit-memos', { customerId: '665f0c2a9b1e4c0012ab34cd', amount: 5000, reason: 'x1', settle: 'wallet' })).status).toBe(404);
  });
  it('a retry with the same key makes one memo, not two', async () => {
    const body = { customerId: cust.id, amount: 700, reason: 'Retry check', settle: 'wallet' };
    const k = 'memo-retry-1';
    const a = await t.api('POST', '/api/v1/credit-memos', { token: t.adminToken, body, headers: { 'idempotency-key': k } });
    const b = await t.api('POST', '/api/v1/credit-memos', { token: t.adminToken, body, headers: { 'idempotency-key': k } });
    expect(a.body.creditNoteNumber).toBe(b.body.creditNoteNumber);
  });
  it('can reduce what the customer owes on an invoice, never more than is due, and never more than the invoice', async () => {
    await setGst(t, true);
    await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Opening for tests', lines: [{ variantId: fx.dress.id, qty: 10 }] });
    const b2b = (await h.post('/customers', { accountGroup: 'B2B Trade', name: 'Delhi Traders', mobile: '9811100001', stateCode: '07', gstin: makeGstin('07', 'AAAAA1111A'), creditLimit: 5000000 })).body;
    const inv = (await h.post('/sales/invoices', { storeId: fx.shop.id, customerId: b2b.id, lines: [{ variantId: fx.dress.id, qty: 2, unitPrice: 112000 }], dueDate: '2026-12-10T00:00:00.000Z', tenders: [{ mode: 'credit', amount: 224000 }] })).body;
    expect(inv.creditDue).toBe(224000);
    // GST is on: the memo needs a rate, and another state means IGST
    expect((await h.post('/credit-memos', { customerId: b2b.id, invoiceId: inv.id, amount: 24000, reason: 'Late discount', settle: 'reduce_due' })).status).toBe(400);
    const m = await h.post('/credit-memos', { customerId: b2b.id, invoiceId: inv.id, amount: 24000, reason: 'Late discount', settle: 'reduce_due', gstRate: 12 });
    expect(m.status).toBe(201);
    expect(m.body).toMatchObject({ taxable: 21429, igst: 2571, cgst: 0, sgst: 0, gstRate: 12, invoiceNumber: inv.invoiceNumber });
    expect(((await SalesBill.findById(inv.id).lean()) as any).creditDue).toBe(200000);
    expect((await h.post('/credit-memos', { customerId: b2b.id, invoiceId: inv.id, amount: 300000, reason: 'Too much', settle: 'reduce_due', gstRate: 12 })).status).toBe(422);
    expect((await h.post('/credit-memos', { customerId: b2b.id, invoiceId: inv.id, amount: 210000, reason: 'More than the invoice', settle: 'wallet', gstRate: 12 })).status).toBe(422);
    expect((await h.post('/credit-memos', { customerId: cust.id, invoiceId: inv.id, amount: 1000, reason: 'Wrong customer', settle: 'wallet', gstRate: 12 })).status).toBe(400);
  });
});
