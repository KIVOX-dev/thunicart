import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextBatchNumber, noteBatchRef } from '../src/lib/batchNumber';
import { Variant } from '../src/models';
import { setupTest, type TestCtx } from './helpers';
import { api, fixtures, type Fx } from './b2.helpers';

let t: TestCtx; let fx: Fx; let h: ReturnType<typeof api>;
beforeAll(async () => { t = await setupTest(); fx = await fixtures(t); h = fx.h; });
afterAll(async () => { await t.close(); });

describe('batch numbers: automatic, in order, never repeated', () => {
  const year = new Date().getFullYear();
  it('carry on after the highest number already in use, and never go back', async () => {
    await Variant.updateOne({ _id: fx.tee.id }, { $set: { batchRef: `KO${year}1501` } });
    const a = await nextBatchNumber(); const b = await nextBatchNumber();
    expect(a).toBe(`KO${year}1502`); expect(b).toBe(`KO${year}1503`);
    await noteBatchRef(`KO${year}1600`); // a number typed or brought by a sheet
    expect(await nextBatchNumber()).toBe(`KO${year}1601`);
    await noteBatchRef(`KO${year}1200`); // an older number never moves the counter back
    expect(await nextBatchNumber()).toBe(`KO${year}1602`);
  });
  it('two receipts at the same moment never share a batch number', async () => {
    const all = await Promise.all(Array.from({ length: 12 }, () => nextBatchNumber()));
    expect(new Set(all).size).toBe(12);
  });
  it('a goods receipt takes a batch number for the lines that have none, and keeps a typed one', async () => {
    const mk = (extra: object) => h.post('/grn', { vendorId: fx.knit.id, storeId: fx.shop.id, vendorInvoiceNo: `B-${Math.random()}`, vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: fx.tee.id, receivedQty: 5, unitCost: 20000, ...extra }] });
    const auto = await mk({});
    expect(auto.status).toBe(201);
    expect(auto.body.lines[0].batchRef).toMatch(new RegExp(`^KO${year}\\d{4}$`));
    const typed = await mk({ batchRef: 'LOT-7' });
    expect(typed.body.lines[0].batchRef).toBe('LOT-7');
    expect(((await Variant.findById(fx.tee.id).lean()) as any).batchRef).toBe('LOT-7');
  });
  it('stock added by an adjustment gets a batch number, stock taken out does not', async () => {
    const up = await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Found stock', lines: [{ variantId: fx.dress.id, qty: 3 }] });
    expect(up.status).toBe(201);
    expect(((await Variant.findById(fx.dress.id).lean()) as any).batchRef).toMatch(new RegExp(`^KO${year}\\d{4}$`));
    const before = ((await Variant.findById(fx.dress.id).lean()) as any).batchRef;
    await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Damaged', lines: [{ variantId: fx.dress.id, qty: -1 }] });
    expect(((await Variant.findById(fx.dress.id).lean()) as any).batchRef).toBe(before);
  });
});
