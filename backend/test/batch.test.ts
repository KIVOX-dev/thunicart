import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { batchDate, isDateBatch, nextBatchNumber } from '../src/lib/batchNumber';
import { Variant } from '../src/models';
import { setupTest, type TestCtx } from './helpers';
import { api, fixtures, type Fx } from './b2.helpers';

let t: TestCtx; let fx: Fx; let h: ReturnType<typeof api>;
beforeAll(async () => { t = await setupTest(); fx = await fixtures(t); h = fx.h; });
afterAll(async () => { await t.close(); });

describe('batch numbers: TK plus the date the stock came in', () => {
  const ist = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/-/g, '');
  const today = `TK${ist(new Date())}`;
  it('is TK and the date of the stock in India time, so an older date is older stock', async () => {
    expect(await nextBatchNumber()).toBe(today);
    expect(await nextBatchNumber({ date: new Date('2026-11-08T10:00:00+05:30') })).toBe('TK20261108');
    expect(await nextBatchNumber({ date: new Date('2026-11-08T23:59:00+05:30') })).toBe('TK20261108'); // late evening is still that day
    expect(await nextBatchNumber({ date: new Date('2026-11-08T19:00:00Z') })).toBe('TK20261109'); // 00:30 the next morning in India
    expect(batchDate('TK20261121')).toBe('2026-11-21');
    expect(batchDate('KO20261108')).toBeNull(); // an older style number is left alone
    expect(isDateBatch('TK20261121')).toBe(true);
  });
  it('stock that comes in on the same day shares one batch, at any moment, with no clash', async () => {
    const all = await Promise.all(Array.from({ length: 12 }, () => nextBatchNumber()));
    expect(new Set(all)).toEqual(new Set([today]));
  });
  it('a goods receipt takes a batch number for the lines that have none, and keeps a typed one', async () => {
    const mk = (extra: object) => h.post('/grn', { vendorId: fx.knit.id, storeId: fx.shop.id, vendorInvoiceNo: `B-${Math.random()}`, vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: fx.tee.id, receivedQty: 5, unitCost: 20000, ...extra }] });
    const auto = await mk({});
    expect(auto.status).toBe(201);
    expect(auto.body.lines[0].batchRef).toBe(today);
    const typed = await mk({ batchRef: 'LOT-7' });
    expect(typed.body.lines[0].batchRef).toBe('LOT-7');
    expect(((await Variant.findById(fx.tee.id).lean()) as any).batchRef).toBe('LOT-7');
  });
  it('stock added by an adjustment gets a batch number, stock taken out does not', async () => {
    const up = await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Found stock', lines: [{ variantId: fx.dress.id, qty: 3 }] });
    expect(up.status).toBe(201);
    expect(((await Variant.findById(fx.dress.id).lean()) as any).batchRef).toBe(today);
    const before = ((await Variant.findById(fx.dress.id).lean()) as any).batchRef;
    await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Damaged', lines: [{ variantId: fx.dress.id, qty: -1 }] });
    expect(((await Variant.findById(fx.dress.id).lean()) as any).batchRef).toBe(before);
  });
});
