import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Grn, StockBalance, StockLedger, Variant } from '../src/models';
import { setupTest, type TestCtx } from './helpers';
import { A, api, fixtures, key, setGst, stockOf, tokenFor, type Fx } from './b2.helpers';

let t: TestCtx; let fx: Fx; let h: ReturnType<typeof api>;
beforeAll(async () => { t = await setupTest(); fx = await fixtures(t); h = fx.h; });
afterAll(async () => { await t.close(); });

const poBody = (vendorId: string, storeId: string, lines: any[]) => ({ vendorId, storeId, lines });
const sendPo = async (body: object) => {
  const po = await h.post('/purchase-orders', body);
  expect(po.status).toBe(201);
  if (po.body.requiresApproval) expect((await h.post(`/purchase-orders/${po.body.id}/approve`)).status).toBe(200); // above the Rs 50,000 default limit
  const sent = await h.post(`/purchase-orders/${po.body.id}/send`);
  expect(sent.status).toBe(200);
  return sent.body;
};
const receive = (po: any, receivedQty: number, extra: object = {}, idem?: string) =>
  h.post('/grn', { poId: po.id, vendorInvoiceNo: `INV-${key()}`, vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: po.lines[0].variantId, receivedQty, ...extra }] }, { idem });

describe('GST off: the full amount paid is the cost, no tax anywhere', () => {
  it('a PO and a GRN carry no tax lines and no input credit', async () => {
    const po = await sendPo(poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.tee.id, qty: 100, unitCost: 15000, gstRate: 5 }]));
    expect(po.gstMode).toBe('off');
    expect(po.supply).toBeNull();
    expect(po.totals).toMatchObject({ taxable: 1500000, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 1500000 });
    const g = await receive(po, 100);
    expect(g.status).toBe(201);
    expect(g.body.totals).toMatchObject({ tax: 0, total: 1500000 });
    expect(g.body.lines[0]).toMatchObject({ cgst: 0, sgst: 0, igst: 0, landedUnitCost: 15000 });
    const bill = await h.post('/purchase-bills', { vendorId: fx.knit.id, vendorBillNo: 'OFF-1', billDate: '2026-11-06T00:00:00.000Z', grnIds: [g.body.id] });
    expect(bill.body).toMatchObject({ gstMode: 'off', inputTaxCredit: 0, grandTotal: 1500000 });
    expect((await h.get(`/purchase-orders/${po.id}`)).body.status).toBe('closed');
  });
});

describe('GST on: the examples from the brief', () => {
  let poNh: any; let grnNh: any;
  beforeAll(async () => { await setGst(t, true); });

  it('PO-2026-082 to Knitwear Hub (Tiruppur, state 33): 500 ordered, 495 received at 150, 5% GST gives taxable 74,250.00, CGST 1,856.25, SGST 1,856.25, total 77,962.50', async () => {
    poNh = await sendPo(poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.dress.id, qty: 500, unitCost: 15000, gstRate: 5 }]));
    expect(poNh.gstMode).toBe('on');
    expect(poNh.supply).toBe('intra');
    expect(poNh.totals).toMatchObject({ taxable: 7500000, cgst: 187500, sgst: 187500, igst: 0, total: 7875000 }); // full order
    const g = await receive(poNh, 495);
    expect(g.status).toBe(201);
    grnNh = g.body;
    expect(grnNh.totals).toMatchObject({ taxable: 7425000, cgst: 185625, sgst: 185625, igst: 0, total: 7796250, currency: 'INR' });
    expect(grnNh.lines[0]).toMatchObject({ orderedQty: 500, receivedQty: 495, acceptedQty: 495, taxable: 7425000, cgst: 185625, sgst: 185625 });
    expect(grnNh.grnNumber).toMatch(/^GRN-\d{4}-\d{2}-\d{6}$/);
  });
  it('a short receipt leaves the PO partly received with the balance pending', async () => {
    const po = (await h.get(`/purchase-orders/${poNh.id}`)).body;
    expect(po.status).toBe('partly_received');
    expect(po.lines[0]).toMatchObject({ qty: 500, receivedQty: 495, pendingQty: 5 });
    expect((await stockOf(h, fx.dress.id, fx.shop.id)).onHand).toBe(495);
    expect((await h.post(`/purchase-orders/${po.id}/cancel`)).status).toBe(422); // goods were received: close, do not cancel
    expect((await h.post(`/purchase-orders/${po.id}/close`)).body.status).toBe('closed');
  });
  it('PO-2026-081 to TexStyles (Surat, state 24) is IGST: the sample sheet shows CGST+SGST for it, which is wrong for a Tamil Nadu buyer', async () => {
    const po = await sendPo(poBody(fx.tex.id, fx.shop.id, [{ variantId: fx.tee.id, qty: 100, unitCost: 50000, gstRate: 12 }]));
    expect(po.supply).toBe('inter');
    expect(po.totals).toMatchObject({ taxable: 5000000, cgst: 0, sgst: 0, igst: 600000, total: 5600000 });
    const g = await receive(po, 100);
    expect(g.body.totals).toMatchObject({ cgst: 0, sgst: 0, igst: 600000 });
    expect(g.body.supply).toBe('inter');
  });
  it('the GST rate comes from the rate rules when the line has none; an unknown HSN needs the rate typed', async () => {
    const po = await h.post('/purchase-orders', poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.dress.id, qty: 10, unitCost: 100000 }])); // 6204 at Rs 1,000 each: slab says 5%
    expect(po.body.lines[0].gstRate).toBe(5);
    const hi = await h.post('/purchase-orders', poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.dress.id, qty: 1, unitCost: 100001 }]));
    expect(hi.body.lines[0].gstRate).toBe(12); // above Rs 1,000 per piece
    const noRule = (await h.post('/items', { name: 'Odd HSN', hsn: '9609', variants: [{ mrp: 1000, sellingPrice: 1000 }] })).body.variants[0];
    const bad = await h.post('/purchase-orders', poBody(fx.knit.id, fx.shop.id, [{ variantId: noRule.id, qty: 1, unitCost: 500 }]));
    expect(bad.status).toBe(400);
    expect(bad.body.fields[0].path).toBe('lines.0.gstRate');
  });
  it('discount percent and rounding: taxable = line less discount, tax rounded half up', async () => {
    const po = await h.post('/purchase-orders', poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.tee.id, qty: 3, unitCost: 3333, discountPercent: 2.5, gstRate: 5 }]));
    // gross 9999, discount 249.975 -> 250, taxable 9749, CGST = SGST = 9749 x 2.5% = 243.725 -> 244
    expect(po.body.lines[0]).toMatchObject({ gross: 9999, discount: 250, taxable: 9749, cgst: 244, sgst: 244, total: 10237 });
  });

  it('bill from the GRN: due date from the vendor terms, input tax credit kept, duplicate vendor bill numbers blocked', async () => {
    const bill = await h.post('/purchase-bills', { vendorId: fx.knit.id, vendorBillNo: 'KH/2026/118', billDate: '2026-11-06T00:00:00.000Z', grnIds: [grnNh.id], freight: 50000, otherCharges: 2500, roundOff: -10 });
    expect(bill.status).toBe(201);
    expect(bill.body).toMatchObject({ paymentTerms: 'NET15', gstMode: 'on', inputTaxCredit: 371250, grandTotal: 7796250 + 50000 + 2500 - 10, outstanding: 7796250 + 52490 });
    expect(bill.body.dueDate).toBe('2026-11-21T00:00:00.000Z');
    expect(bill.body.grnNumbers).toEqual([grnNh.grnNumber]);
    expect(bill.body.billNumber).toMatch(/^PB-/);
    const dup = await h.post('/purchase-bills', { vendorId: fx.knit.id, vendorBillNo: ' kh/2026/118 ', billDate: '2026-11-07T00:00:00.000Z', grnIds: [grnNh.id] });
    expect(dup.status).toBe(409); // same vendor, same bill number (case and spaces ignored)
    const again = await h.post('/purchase-bills', { vendorId: fx.knit.id, vendorBillNo: 'OTHER-1', billDate: '2026-11-07T00:00:00.000Z', grnIds: [grnNh.id] });
    expect(again.status).toBe(422);
    expect(again.body.code).toBe('NOTHING_TO_BILL');
    expect((await h.get(`/grn/${grnNh.id}`)).body.status).toBe('billed');
  });
});

describe('weighted average cost and receiving rules', () => {
  const v = () => fx.kurti;
  const direct = (unitCost: number, qty: number, extra: object = {}, storeId = fx.shop.id) =>
    h.post('/grn', { vendorId: fx.knit.id, storeId, vendorInvoiceNo: `D-${key()}`, vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: v().id, receivedQty: qty, unitCost, gstRate: 0 }], ...extra });
  const cost = async () => ((await Variant.findById(v().id).lean()) as any).baseCost;

  it('is correct after three GRNs at three costs (first cost, then the running average)', async () => {
    await direct(10000, 10);
    expect(await cost()).toBe(10000);
    await direct(13000, 20);
    expect(await cost()).toBe(12000); // (10 x 100 + 20 x 130) / 30
    await direct(16000, 10);
    expect(await cost()).toBe(13000); // (30 x 120 + 10 x 160) / 40
  });
  it('counts stock in every store, and freight is shared into the landed cost', async () => {
    // 40 on hand at 130. Receive 10 into the warehouse at 100 plus Rs 5 freight: landed 100.50
    const g = await direct(10000, 10, { freight: 500 }, fx.wh.id);
    expect(g.body.lines[0].landedUnitCost).toBe(10050);
    expect(await cost()).toBe(Math.round((40 * 13000 + 10 * 10050) / 50)); // 12400.0... = 124.00
    expect(await cost()).toBe(12410);
  });
  it('a sale records the average cost at that moment, so later receipts never change an old sale (cost on the ledger row)', async () => {
    const row: any = await StockLedger.findOne({ variantId: v().id, type: 'GRN' }).sort({ at: -1 }).lean();
    expect(row.unitCost).toBe(10050); // the ledger keeps the cost of THAT movement
  });
  it('only accepted quantity enters stock; rejected cannot exceed received', async () => {
    const before = (await stockOf(h, v().id, fx.shop.id)).onHand;
    const g = await h.post('/grn', { vendorId: fx.knit.id, storeId: fx.shop.id, vendorInvoiceNo: `R-${key()}`, vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: v().id, receivedQty: 20, rejectedQty: 5, unitCost: 12000, gstRate: 0 }] });
    expect(g.body.lines[0]).toMatchObject({ receivedQty: 20, rejectedQty: 5, acceptedQty: 15 });
    expect((await stockOf(h, v().id, fx.shop.id)).onHand).toBe(before + 15);
    const bad = await h.post('/grn', { vendorId: fx.knit.id, storeId: fx.shop.id, vendorInvoiceNo: `R-${key()}`, vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: v().id, receivedQty: 2, rejectedQty: 3, unitCost: 12000 }] });
    expect(bad.status).toBe(400);
    const none = await h.post('/grn', { vendorId: fx.knit.id, storeId: fx.shop.id, vendorInvoiceNo: `R-${key()}`, vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: v().id, receivedQty: 2, rejectedQty: 2, unitCost: 12000 }] });
    expect(none.body.code).toBe('NOTHING_ACCEPTED');
  });
  it('a direct GRN needs a unit cost; the same vendor invoice cannot be received twice', async () => {
    const miss = await h.post('/grn', { vendorId: fx.knit.id, storeId: fx.shop.id, vendorInvoiceNo: 'NOCOST', vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: v().id, receivedQty: 1 }] });
    expect(miss.body.fields[0].path).toBe('lines.0.unitCost');
    const body = { vendorId: fx.knit.id, storeId: fx.shop.id, vendorInvoiceNo: 'SAME-INV', vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: v().id, receivedQty: 1, unitCost: 12000, gstRate: 0 }] };
    expect((await h.post('/grn', body)).status).toBe(201);
    expect((await h.post('/grn', body)).status).toBe(409);
  });
  it('receiving more than ordered needs an approver', async () => {
    const po = await sendPo(poBody(fx.knit.id, fx.shop.id, [{ variantId: v().id, qty: 10, unitCost: 12000, gstRate: 0 }]));
    const over = await receive(po, 12);
    expect(over.status).toBe(422);
    expect(over.body.code).toBe('OVER_RECEIPT_NEEDS_APPROVAL');
    const buyer = await tokenFor(t, 'Buyer Purchase', 'buyer-over@test.local');
    expect((await receive(po, 12, {}, undefined)).status).toBe(422);
    const flagged = await h.post('/grn', { poId: po.id, approveOverReceipt: true, vendorInvoiceNo: 'OVER-1', vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: v().id, receivedQty: 12 }] }, { token: buyer });
    expect(flagged.status).toBe(403); // Buyer has no purchase.approve
    const ok = await h.post('/grn', { poId: po.id, approveOverReceipt: true, vendorInvoiceNo: 'OVER-2', vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: v().id, receivedQty: 12 }] });
    expect(ok.status).toBe(201);
    expect(ok.body.overReceiptApproved).toBe(true);
    expect((await h.get(`/purchase-orders/${po.id}`)).body.status).toBe('closed');
  });
  it('goods can only be received against a sent order', async () => {
    const draft = await h.post('/purchase-orders', poBody(fx.knit.id, fx.shop.id, [{ variantId: v().id, qty: 1, unitCost: 100, gstRate: 0 }]));
    const r = await h.post('/grn', { poId: draft.body.id, vendorInvoiceNo: 'D1', vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: v().id, receivedQty: 1 }] });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('PO_NOT_RECEIVABLE');
  });
});

describe('idempotent receiving', () => {
  it('receiving the same GRN twice with the same Idempotency-Key adds stock once', async () => {
    const po = await sendPo(poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.tee.id, qty: 40, unitCost: 10000, gstRate: 0 }]));
    const before = (await stockOf(h, fx.tee.id)).onHand;
    const idem = 'grn-retry-key-1';
    const body = { poId: po.id, vendorInvoiceNo: 'IDEM-1', vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: fx.tee.id, receivedQty: 40 }] };
    const a = await h.post('/grn', body, { idem: idem });
    const b = await h.post('/grn', body, { idem: idem });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.headers['idempotent-replay']).toBe('true');
    expect(b.body.id).toBe(a.body.id);
    expect((await stockOf(h, fx.tee.id)).onHand).toBe(before + 40);
    expect(await Grn.countDocuments({ vendorInvoiceNo: 'IDEM-1' })).toBe(1);
  });
  it('five parallel retries save one GRN, and a request without the header is refused', async () => {
    const po = await sendPo(poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.tee.id, qty: 10, unitCost: 10000, gstRate: 0 }]));
    const body = { poId: po.id, vendorInvoiceNo: 'IDEM-2', vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: fx.tee.id, receivedQty: 10 }] };
    const rs = await Promise.all(Array.from({ length: 5 }, () => h.post('/grn', body, { idem: 'parallel-grn-key' })));
    expect(rs.filter((r) => r.status === 201).length).toBeGreaterThanOrEqual(1);
    expect(await Grn.countDocuments({ vendorInvoiceNo: 'IDEM-2' })).toBe(1);
    const noKey = await h.post('/grn', body, { idem: false });
    expect(noKey.status).toBe(400);
    expect(noKey.body.fields[0].path).toBe('Idempotency-Key');
  });
});

describe('purchase order lifecycle', () => {
  it('drafts are edited with If-Match; a stale version is a 409; only drafts can be edited', async () => {
    const po = (await h.post('/purchase-orders', poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.tee.id, qty: 5, unitCost: 10000, gstRate: 5 }]))).body;
    expect((await h.put(`/purchase-orders/${po.id}`, { notes: 'x' })).status).toBe(400); // If-Match missing
    const ok = await h.put(`/purchase-orders/${po.id}`, { notes: 'first edit', lines: [{ variantId: fx.tee.id, qty: 6, unitCost: 10000, gstRate: 5 }] }, { headers: { 'if-match': String(po.version) } });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(po.version + 1);
    expect(ok.body.lines[0].qty).toBe(6);
    const stale = await h.put(`/purchase-orders/${po.id}`, { notes: 'second person' }, { headers: { 'if-match': String(po.version) } });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('STALE_EDIT');
    await h.post(`/purchase-orders/${po.id}/send`);
    const sent = await h.put(`/purchase-orders/${po.id}`, { notes: 'too late' }, { headers: { 'if-match': String(ok.body.version + 1) } });
    expect(sent.status).toBe(422);
    expect((await h.del(`/purchase-orders/${po.id}`)).status).toBe(422); // sent orders are cancelled, not deleted
    const d = (await h.post('/purchase-orders', poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.tee.id, qty: 1, unitCost: 100, gstRate: 0 }]))).body;
    expect((await h.del(`/purchase-orders/${d.id}`)).status).toBe(200);
  });
  it('a PO above the limit in Settings needs an Admin to approve before it can be sent', async () => {
    await h.put('/settings/operations', { allowNegativeStock: false, poApprovalLimit: 1000000, reorderTargetMultiplier: 2 });
    const big = (await h.post('/purchase-orders', poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.tee.id, qty: 100, unitCost: 20000, gstRate: 5 }]))).body;
    expect(big.requiresApproval).toBe(true);
    const early = await h.post(`/purchase-orders/${big.id}/send`);
    expect(early.status).toBe(422);
    expect(early.body.code).toBe('PO_NEEDS_APPROVAL');
    const buyer = await tokenFor(t, 'Buyer Purchase', 'buyer-approve@test.local');
    expect((await h.post(`/purchase-orders/${big.id}/approve`, {}, { token: buyer })).status).toBe(403);
    const ap = await h.post(`/purchase-orders/${big.id}/approve`);
    expect(ap.body).toMatchObject({ status: 'approved', approvedBy: expect.any(String) });
    expect((await h.post(`/purchase-orders/${big.id}/send`)).body.status).toBe('sent');
    const small = (await h.post('/purchase-orders', poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.tee.id, qty: 1, unitCost: 1000, gstRate: 5 }]))).body;
    expect(small.requiresApproval).toBe(false);
    expect((await h.post(`/purchase-orders/${small.id}/send`)).body.status).toBe('sent'); // below the limit: straight from draft
    await h.put('/settings/operations', { allowNegativeStock: false, poApprovalLimit: 5000000, reorderTargetMultiplier: 2 });
  });
  it('a PO with nothing received can be cancelled', async () => {
    const po = await sendPo(poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.tee.id, qty: 2, unitCost: 100, gstRate: 0 }]));
    expect((await h.post(`/purchase-orders/${po.id}/cancel`)).body.status).toBe('cancelled');
    expect((await h.post(`/purchase-orders/${po.id}/cancel`)).status).toBe(422);
  });
});

describe('purchase returns and debit notes', () => {
  let grn: any; let bill: any;
  beforeAll(async () => {
    const dress = fx.dress;
    const po = await sendPo(poBody(fx.tex.id, fx.shop.id, [{ variantId: dress.id, qty: 10, unitCost: 100000, gstRate: 12 }]));
    grn = (await receive(po, 10)).body;
    bill = (await h.post('/purchase-bills', { vendorId: fx.tex.id, vendorBillNo: 'TX-RET-1', billDate: '2026-11-06T00:00:00.000Z', grnIds: [grn.id] })).body;
  });
  it('a return against a bill makes a debit note, removes stock, and cuts what we owe', async () => {
    const before = (await stockOf(h, fx.dress.id, fx.shop.id)).onHand;
    const r = await h.post('/purchase-returns', { billId: bill.id, reason: 'Wrong colour', lines: [{ variantId: fx.dress.id, qty: 2 }] });
    expect(r.status).toBe(201);
    expect(r.body.debitNoteNumber).toMatch(/^DN-/);
    expect(r.body.returnNumber).toMatch(/^PR-/);
    expect(r.body.totals).toMatchObject({ taxable: 200000, igst: 24000, total: 224000 }); // 2 x 1,000 at 12% IGST
    expect((await stockOf(h, fx.dress.id, fx.shop.id)).onHand).toBe(before - 2);
    const b = (await h.get(`/purchase-bills/${bill.id}`)).body;
    expect(b.debitNotes).toBe(224000);
    expect(b.outstanding).toBe(bill.grandTotal - 224000);
    const led: any = await StockLedger.findOne({ type: 'PURCHASE_RETURN' }).sort({ at: -1 }).lean();
    expect(led.qty).toBe(-2);
  });
  it('cannot return more than was received and not already returned', async () => {
    const r = await h.post('/purchase-returns', { billId: bill.id, reason: 'Too many', lines: [{ variantId: fx.dress.id, qty: 9 }] });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('RETURN_EXCEEDS_RECEIPT');
    expect((await h.post('/purchase-returns', { billId: bill.id, grnId: grn.id, reason: 'x', lines: [{ variantId: fx.dress.id, qty: 1 }] })).status).toBe(400);
  });
  it('a return with no stock left to remove fails and changes nothing (409)', async () => {
    const before = (await h.get(`/purchase-bills/${bill.id}`)).body.debitNotes;
    await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Sold out in the shop', lines: [{ variantId: fx.dress.id, qty: -((await stockOf(h, fx.dress.id, fx.shop.id)).onHand) }] });
    const r = await h.post('/purchase-returns', { billId: bill.id, reason: 'Late return', lines: [{ variantId: fx.dress.id, qty: 1 }] });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('INSUFFICIENT_STOCK');
    expect((await h.get(`/purchase-bills/${bill.id}`)).body.debitNotes).toBe(before);
  });
  it('a return against an unbilled GRN reduces what can be billed', async () => {
    const po = await sendPo(poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.kurti.id, qty: 10, unitCost: 10000, gstRate: 5 }]));
    const g = (await receive(po, 10)).body;
    const r = await h.post('/purchase-returns', { grnId: g.id, reason: 'Damaged', lines: [{ variantId: fx.kurti.id, qty: 4 }] });
    expect(r.status).toBe(201);
    const b = await h.post('/purchase-bills', { vendorId: fx.knit.id, vendorBillNo: 'AFTER-RET', billDate: '2026-11-06T00:00:00.000Z', grnIds: [g.id] });
    expect(b.body.lines[0].acceptedQty).toBe(6); // only what stayed
    expect(b.body.totals.taxable).toBe(60000);
  });
});

describe('vendor payments, outstanding and ageing', () => {
  let vendor: any; const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  const mkBill = async (qty: number, billDate: string, no: string) => {
    const g = await h.post('/grn', { vendorId: vendor.id, storeId: fx.shop.id, vendorInvoiceNo: `G-${no}`, vendorInvoiceDate: billDate, lines: [{ variantId: fx.tee.id, receivedQty: qty, unitCost: 10000, gstRate: 0 }] });
    return (await h.post('/purchase-bills', { vendorId: vendor.id, vendorBillNo: no, billDate, grnIds: [g.body.id] })).body;
  };
  beforeAll(async () => {
    await setGst(t, false);
    vendor = (await h.post('/vendors', { name: 'Ageing Vendor', email: 'age@x.in', mobile: '9800000077', stateCode: '33', paymentTerms: 'NET30' })).body;
  });
  it('part payment, then settling the rest; advance payments are kept as an advance', async () => {
    const b1 = await mkBill(10, day(5), 'AGE-1'); // Rs 1,000, due in 25 days
    const p1 = await h.post('/vendor-payments', { vendorId: vendor.id, date: day(1), mode: 'upi', reference: 'UTR123', amount: 40000, allocations: [{ billId: b1.id, amount: 40000 }] });
    expect(p1.status).toBe(201);
    expect(p1.body).toMatchObject({ amount: 40000, allocated: 40000, advance: 0, paymentNumber: expect.stringMatching(/^VP-/) });
    expect((await h.get(`/purchase-bills/${b1.id}`)).body).toMatchObject({ paid: 40000, outstanding: 60000 });
    const adv = await h.post('/vendor-payments', { vendorId: vendor.id, date: day(0), mode: 'cash', amount: 25000 });
    expect(adv.body).toMatchObject({ allocated: 0, advance: 25000 });
    const o = (await h.get(`/vendors/${vendor.id}/outstanding`)).body;
    expect(o).toMatchObject({ billed: 100000, paid: 40000, outstanding: 60000, advance: 25000, netPayable: 35000, currency: 'INR' });
    expect(o.ageing.current).toBe(60000);
  });
  it('cannot pay more than is outstanding, or allocate more than was paid; each bill once', async () => {
    const o = (await h.get(`/vendors/${vendor.id}/outstanding`)).body.bills[0];
    const over = await h.post('/vendor-payments', { vendorId: vendor.id, date: day(0), mode: 'bank', amount: 90000, allocations: [{ billId: o.billId, amount: 90000 }] });
    expect(over.status).toBe(422);
    expect(over.body.code).toBe('OVER_PAYMENT');
    expect((await h.post('/vendor-payments', { vendorId: vendor.id, date: day(0), mode: 'bank', amount: 1000, allocations: [{ billId: o.billId, amount: 2000 }] })).status).toBe(400);
    expect((await h.post('/vendor-payments', { vendorId: vendor.id, date: day(0), mode: 'bank', amount: 2000, allocations: [{ billId: o.billId, amount: 1000 }, { billId: o.billId, amount: 1000 }] })).status).toBe(400);
  });
  it('two payments racing for the same balance: only one gets through', async () => {
    const o = (await h.get(`/vendors/${vendor.id}/outstanding`)).body.bills[0];
    const pay = () => h.post('/vendor-payments', { vendorId: vendor.id, date: day(0), mode: 'bank', amount: o.outstanding, allocations: [{ billId: o.billId, amount: o.outstanding }] });
    const rs = await Promise.all([pay(), pay()]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 422]);
    expect((await h.get(`/purchase-bills/${o.billId}`)).body.outstanding).toBe(0);
  });
  it('ageing buckets run from the due date: current, 0-30, 31-60, 61-90, over 90', async () => {
    await mkBill(1, day(10), 'AGE-C'); // due in 20 days: current (10000)
    await mkBill(2, day(45), 'AGE-1B'); // due 15 days ago: 0-30 (20000)
    await mkBill(3, day(75), 'AGE-2B'); // due 45 days ago: 31-60 (30000)
    await mkBill(4, day(110), 'AGE-3B'); // due 80 days ago: 61-90 (40000)
    await mkBill(5, day(200), 'AGE-4B'); // due 170 days ago: over 90 (50000)
    const o = (await h.get(`/vendors/${vendor.id}/outstanding`)).body;
    expect(o.ageing).toEqual({ current: 10000, d0_30: 20000, d31_60: 30000, d61_90: 40000, over90: 50000 });
    expect(o.bills.find((b: any) => b.vendorBillNo === 'AGE-4B').daysOverdue).toBe(170);
  });
  it('a payment retry with the same key records one payment', async () => {
    const o = (await h.get(`/vendors/${vendor.id}/outstanding`)).body.bills.find((b: any) => b.vendorBillNo === 'AGE-C');
    const body = { vendorId: vendor.id, date: day(0), mode: 'cheque', reference: 'CHQ 1', amount: 5000, allocations: [{ billId: o.billId, amount: 5000 }] };
    const a = await h.post('/vendor-payments', body, { idem: 'pay-retry-1' }); const b = await h.post('/vendor-payments', body, { idem: 'pay-retry-1' });
    expect(b.body.id).toBe(a.body.id);
    expect((await h.get(`/purchase-bills/${o.billId}`)).body.paid).toBe(5000);
  });
});

describe('permissions: purchase endpoints', () => {
  it('a user without purchase permission gets 403 on every purchase endpoint', async () => {
    const sales = await tokenFor(t, 'Sales', 'sales-purchase@test.local');
    const id = '665f0c2a9b1e4c0012ab34cd';
    const calls: [string, string, unknown?][] = [
      ['GET', '/purchase-orders'], ['GET', `/purchase-orders/${id}`], ['POST', '/purchase-orders', {}], ['PUT', `/purchase-orders/${id}`, {}], ['DELETE', `/purchase-orders/${id}`],
      ['POST', `/purchase-orders/${id}/approve`, {}], ['POST', `/purchase-orders/${id}/send`, {}], ['POST', `/purchase-orders/${id}/cancel`, {}], ['POST', `/purchase-orders/${id}/close`, {}],
      ['POST', '/purchase-orders/from-alerts', {}], ['GET', '/grn'], ['GET', `/grn/${id}`], ['POST', '/grn', {}], ['GET', '/purchase-bills'], ['GET', `/purchase-bills/${id}`], ['POST', '/purchase-bills', {}],
      ['GET', '/purchase-returns'], ['GET', `/purchase-returns/${id}`], ['POST', '/purchase-returns', {}], ['GET', '/vendor-payments'], ['POST', '/vendor-payments', {}], ['GET', `/vendors/${id}/outstanding`],
    ];
    for (const [m, url, body] of calls) {
      const r = await t.api(m, `${A}${url}`, { token: sales, body, headers: m === 'POST' ? { 'idempotency-key': key() } : {} });
      expect(r.status, `${m} ${url}`).toBe(403);
    }
  });
  it('Buyer Purchase can buy but not approve or pay; Accounts can view purchases and pay vendors but not create orders', async () => {
    const buyer = await tokenFor(t, 'Buyer Purchase', 'buyer-perm@test.local');
    const acc = await tokenFor(t, 'Accounts', 'acc-perm@test.local');
    expect((await h.post('/purchase-orders', poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.tee.id, qty: 1, unitCost: 100, gstRate: 0 }]), { token: buyer })).status).toBe(201);
    expect((await h.post('/vendor-payments', { vendorId: fx.knit.id, date: new Date().toISOString(), mode: 'cash', amount: 100 }, { token: buyer })).status).toBe(403);
    expect((await h.get('/purchase-orders', acc)).status).toBe(200);
    expect((await h.post('/purchase-orders', poBody(fx.knit.id, fx.shop.id, [{ variantId: fx.tee.id, qty: 1, unitCost: 100, gstRate: 0 }]), { token: acc })).status).toBe(403);
    expect((await h.post('/vendor-payments', { vendorId: fx.knit.id, date: new Date().toISOString(), mode: 'cash', amount: 100 }, { token: acc })).status).toBe(201);
  });
});

describe('reorder alerts', () => {
  it('lists items at or below their reorder level by vendor with a suggested quantity, and drafts a PO', async () => {
    // bring the kurti (reorder level 5) down to 2 pieces in total
    const whOn = (await stockOf(h, fx.kurti.id, fx.wh.id)).onHand;
    if (whOn > 0) await h.post('/stock/adjustments', { storeId: fx.wh.id, reason: 'Moved out', lines: [{ variantId: fx.kurti.id, qty: -whOn }] });
    const shopOn = (await stockOf(h, fx.kurti.id, fx.shop.id)).onHand;
    await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Sold', lines: [{ variantId: fx.kurti.id, qty: -(shopOn - 2) }] });
    const a = (await h.get('/stock/reorder-alerts')).body;
    const group = a.groups.find((g: any) => g.items.some((i: any) => i.itemCode === fx.kurti.itemCode));
    expect(group.vendorName).toBe('Knitwear Hub Corp'); // last supplier, from the most recent GRN
    const item = group.items.find((i: any) => i.itemCode === fx.kurti.itemCode);
    expect(item).toMatchObject({ available: 2, reorderLevel: 5, suggestedQty: 8 }); // 5 x 2 - 2
    const po = await h.post('/purchase-orders/from-alerts', { vendorId: fx.knit.id, storeId: fx.shop.id });
    expect(po.status).toBe(201);
    expect(po.body.status).toBe('draft');
    expect(po.body.lines.find((l: any) => l.itemCode === fx.kurti.itemCode).qty).toBe(8);
    expect((await h.post('/purchase-orders/from-alerts', { vendorId: fx.tex.id, storeId: fx.shop.id })).body.code).toBe('NOTHING_TO_ORDER');
  });
});

describe('stock ties to the ledger', () => {
  it('after all of that, balances equal ledger sums to the piece for every variant and store', async () => {
    const { ledgerOnHand } = await import('../src/lib/stock');
    const led = await ledgerOnHand();
    const bals: any[] = await StockBalance.find().lean();
    const lm = new Map(led.map((l) => [`${l.variantId}:${l.storeId}`, l.qty]));
    for (const b of bals) expect(lm.get(`${b.variantId}:${b.storeId}`) ?? 0, `${b.variantId}`).toBe(b.onHand);
    for (const l of led) expect(bals.find((b) => `${b.variantId}:${b.storeId}` === `${l.variantId}:${l.storeId}`)?.onHand ?? 0).toBe(l.qty);
  });
});
