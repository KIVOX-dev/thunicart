import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StockBalance, StockLedger } from '../src/models';
import { ledgerOnHand, postStock } from '../src/lib/stock';
import { withTransaction } from '../src/lib/transaction';
import { routeRegistry } from '../src/lib/route';
import { setupTest, type TestCtx } from './helpers';
import { api, fixtures, key, stockOf, tokenFor, type Fx } from './b2.helpers';

let t: TestCtx; let fx: Fx; let h: ReturnType<typeof api>;
beforeAll(async () => {
  t = await setupTest(); fx = await fixtures(t); h = fx.h;
  // 100 tees and 50 dresses in the shop to start with
  for (const [v, q] of [[fx.tee, 100], [fx.dress, 50]] as const) {
    await h.post('/grn', { vendorId: fx.knit.id, storeId: fx.shop.id, vendorInvoiceNo: `S-${v.itemCode}`, vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: v.id, receivedQty: q, unitCost: 10000, gstRate: 0 }] });
  }
});
afterAll(async () => { await t.close(); });

/** The invariant: for every variant and store, on hand equals the sum of ledger rows, and no row was ever edited. */
async function expectLedgerTies() {
  const led = await ledgerOnHand();
  const bals: any[] = await StockBalance.find().lean();
  const lm = new Map(led.map((l) => [`${l.variantId}:${l.storeId}`, l.qty]));
  for (const b of bals) expect(lm.get(`${b.variantId}:${b.storeId}`) ?? 0).toBe(b.onHand);
  for (const l of led) expect(bals.find((b) => `${b.variantId}:${b.storeId}` === `${l.variantId}:${l.storeId}`)?.onHand ?? 0).toBe(l.qty);
}

describe('stock and ledger endpoints', () => {
  it('the stock endpoint ties to the ledger to the piece', async () => {
    const s = (await h.get('/stock?pageSize=100')).body;
    expect(s.totals.onHand).toBe(150);
    expect(s.totals.costValue).toBe(150 * 10000);
    const row = s.items.find((i: any) => i.variantId === fx.tee.id);
    expect(row).toMatchObject({ onHand: 100, reserved: 0, available: 100, stockStatus: 'In Stock', baseCost: 10000, costValue: 1000000 });
    await expectLedgerTies();
    const led = (await h.get(`/stock/ledger?variantId=${fx.tee.id}`)).body;
    expect(led.items[0]).toMatchObject({ type: 'GRN', qty: 100, itemCode: fx.tee.itemCode, docType: 'GRN' });
  });
  it('the ledger is append only: there is no route that edits or deletes a ledger row', () => {
    const ledgerRoutes = routeRegistry.filter((r) => r.path.startsWith('/stock/ledger'));
    expect(ledgerRoutes.map((r) => r.method)).toEqual(['GET']);
  });
  it('filters by store, status and search', async () => {
    expect((await h.get(`/stock?storeId=${fx.wh.id}`)).body.items).toHaveLength(0);
    expect((await h.get(`/stock?storeId=${fx.shop.id}&q=dress`)).body.items.map((i: any) => i.name)).toEqual(['Floral Dress']);
    expect((await h.get('/stock?stockStatus=Out%20of%20Stock&includeZero=true')).body.items.every((i: any) => i.available <= 0)).toBe(true);
  });
});

describe('adjustments', () => {
  it('adds and removes stock with a reason; each adjustment is a numbered ledger entry', async () => {
    const r = await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Found in the godown', lines: [{ variantId: fx.tee.id, qty: 5, note: 'bin B2' }] });
    expect(r.status).toBe(201);
    expect(r.body.docNumber).toMatch(/^ADJ-/);
    expect(r.body.lines[0]).toMatchObject({ qty: 5, onHandAfter: 105 });
    const d = await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Damaged', lines: [{ variantId: fx.tee.id, qty: -5 }] });
    expect(d.body.lines[0].onHandAfter).toBe(100);
    expect((await h.get(`/stock/ledger?type=ADJUSTMENT&variantId=${fx.tee.id}`)).body.total).toBe(2);
    await expectLedgerTies();
  });
  it('validates input: a reason, a non zero quantity, no duplicate variants', async () => {
    expect((await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'x', lines: [{ variantId: fx.tee.id, qty: 1 }] })).status).toBe(400);
    expect((await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Count fix', lines: [{ variantId: fx.tee.id, qty: 0 }] })).status).toBe(400);
    expect((await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Count fix', lines: [{ variantId: fx.tee.id, qty: 1 }, { variantId: fx.tee.id, qty: 2 }] })).status).toBe(400);
  });
  it('no negative stock unless an Admin allows it; a failed line leaves nothing behind', async () => {
    const before = (await stockOf(h, fx.dress.id, fx.shop.id)).onHand;
    const r = await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Two lines, one too big', lines: [{ variantId: fx.tee.id, qty: -1 }, { variantId: fx.dress.id, qty: -(before + 1) }] });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('INSUFFICIENT_STOCK');
    expect((await stockOf(h, fx.tee.id, fx.shop.id)).onHand).toBe(100); // the first line rolled back too
    await h.put('/settings/operations', { allowNegativeStock: true, poApprovalLimit: 5000000, reorderTargetMultiplier: 2 });
    const ok = await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Admin allowed negative', lines: [{ variantId: fx.dress.id, qty: -(before + 1) }] });
    expect(ok.status).toBe(201);
    expect(ok.body.lines[0].onHandAfter).toBe(-1);
    await h.put('/settings/operations', { allowNegativeStock: false, poApprovalLimit: 5000000, reorderTargetMultiplier: 2 });
    await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Back to normal', lines: [{ variantId: fx.dress.id, qty: before + 1 }] });
    await expectLedgerTies();
  });
  it('a retry with the same Idempotency-Key adjusts once', async () => {
    const body = { storeId: fx.shop.id, reason: 'Retry test', lines: [{ variantId: fx.tee.id, qty: 3 }] };
    const a = await h.post('/stock/adjustments', body, { idem: 'adj-key-1234' }); const b = await h.post('/stock/adjustments', body, { idem: 'adj-key-1234' });
    expect(b.body.docNumber).toBe(a.body.docNumber);
    expect((await stockOf(h, fx.tee.id, fx.shop.id)).onHand).toBe(103);
    await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Undo retry test', lines: [{ variantId: fx.tee.id, qty: -3 }] });
  });
  it('concurrent removals can never take stock below zero', async () => {
    const on = (await stockOf(h, fx.dress.id, fx.shop.id)).onHand;
    const rs = await Promise.all(Array.from({ length: 6 }, () => h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Race', lines: [{ variantId: fx.dress.id, qty: -Math.ceil(on / 3) }] })));
    const fits = Math.floor(on / Math.ceil(on / 3)); // 50 pieces, 17 at a time: exactly 2 fit
    expect(rs.filter((r) => r.status === 201).length).toBe(fits);
    expect(rs.filter((r) => r.status === 409).length).toBe(6 - fits);
    expect((await stockOf(h, fx.dress.id, fx.shop.id)).onHand).toBeGreaterThanOrEqual(0);
    await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Restore', lines: [{ variantId: fx.dress.id, qty: on - (await stockOf(h, fx.dress.id, fx.shop.id)).onHand }] });
    await expectLedgerTies();
  });
  it('permissions: Buyer can adjust, Sales and Accounts cannot', async () => {
    const buyer = await tokenFor(t, 'Buyer Purchase', 'b-adj@test.local'); const sales = await tokenFor(t, 'Sales', 's-adj@test.local'); const acc = await tokenFor(t, 'Accounts', 'a-adj@test.local');
    const body = { storeId: fx.shop.id, reason: 'Permission test', lines: [{ variantId: fx.tee.id, qty: 1 }] };
    expect((await h.post('/stock/adjustments', body, { token: sales })).status).toBe(403);
    expect((await h.post('/stock/adjustments', body, { token: acc })).status).toBe(403);
    expect((await h.post('/stock/adjustments', body, { token: buyer })).status).toBe(201);
    expect((await h.get('/stock', sales)).status).toBe(200);
    await h.post('/stock/adjustments', { ...body, lines: [{ variantId: fx.tee.id, qty: -1 }] });
  });
});

describe('transfers', () => {
  let tr: any;
  it('Sales can request a transfer; nothing moves until it is dispatched', async () => {
    const sales = await tokenFor(t, 'Sales', 's-tr@test.local');
    const r = await h.post('/stock/transfers', { fromStoreId: fx.shop.id, toStoreId: fx.wh.id, lines: [{ variantId: fx.tee.id, qty: 30 }, { variantId: fx.dress.id, qty: 10 }] }, { token: sales });
    expect(r.status).toBe(201);
    tr = r.body;
    expect(tr).toMatchObject({ status: 'requested', inTransitTotal: 0, transferNumber: expect.stringMatching(/^TRF-/) });
    expect((await stockOf(h, fx.tee.id, fx.shop.id)).onHand).toBe(100);
    expect((await h.post(`/stock/transfers/${tr.id}/dispatch`, {}, { token: sales })).status).toBe(403); // dispatch needs stock.edit
    expect((await h.post('/stock/transfers', { fromStoreId: fx.shop.id, toStoreId: fx.shop.id, lines: [{ variantId: fx.tee.id, qty: 1 }] })).status).toBe(400);
  });
  it('dispatch reduces the source store and puts the quantity in the transit pool', async () => {
    const d = await h.post(`/stock/transfers/${tr.id}/dispatch`);
    expect(d.status).toBe(200);
    expect(d.body).toMatchObject({ status: 'dispatched', inTransitTotal: 40 });
    expect((await stockOf(h, fx.tee.id, fx.shop.id)).onHand).toBe(70);
    expect((await stockOf(h, fx.tee.id, fx.wh.id)).onHand).toBe(0);
    expect((await h.post(`/stock/transfers/${tr.id}/dispatch`)).status).toBe(422); // already dispatched
    expect((await h.post(`/stock/transfers/${tr.id}/cancel`)).status).toBe(422);
    await expectLedgerTies();
  });
  it('a part receipt leaves it partly received; receiving more than is in transit is refused', async () => {
    const over = await h.post(`/stock/transfers/${tr.id}/receive`, { lines: [{ variantId: fx.tee.id, receivedQty: 31 }] });
    expect(over.status).toBe(422);
    expect(over.body.code).toBe('RECEIVE_EXCEEDS_TRANSIT');
    const r = await h.post(`/stock/transfers/${tr.id}/receive`, { lines: [{ variantId: fx.tee.id, receivedQty: 25 }, { variantId: fx.dress.id, receivedQty: 10 }] });
    expect(r.body.status).toBe('partly_received');
    expect(r.body.inTransitTotal).toBe(5);
    expect((await stockOf(h, fx.tee.id, fx.wh.id)).onHand).toBe(25);
    await expectLedgerTies();
  });
  it('a shortfall goes to the discrepancy list and never disappears; resolving it can put the stock back', async () => {
    const f = await h.post(`/stock/transfers/${tr.id}/receive`, { lines: [{ variantId: fx.tee.id, receivedQty: 3 }], final: true });
    expect(f.body.status).toBe('received');
    expect(f.body.lines.find((l: any) => l.itemCode === fx.tee.itemCode)).toMatchObject({ receivedQty: 28, shortQty: 2, inTransit: 0 });
    const disc = (await h.get('/stock/transfers/discrepancies')).body.items;
    expect(disc).toHaveLength(1);
    expect(disc[0]).toMatchObject({ itemCode: fx.tee.itemCode, qty: 2, status: 'open', fromStoreName: 'Krishnas Orchids Hub', toStoreName: 'Main Warehouse' });
    // the shortfall left the shop and did not arrive: total stock is 2 down until someone resolves it
    expect((await h.get('/stock')).body.totals.onHand).toBe(148);
    await expectLedgerTies();
    const res = await h.post(`/stock/transfers/discrepancies/${disc[0].id}/resolve`, { action: 'found_at_destination', note: 'Counted again' });
    expect(res.body.status).toBe('resolved');
    expect((await stockOf(h, fx.tee.id, fx.wh.id)).onHand).toBe(30);
    expect((await h.get('/stock')).body.totals.onHand).toBe(150);
    expect((await h.post(`/stock/transfers/discrepancies/${disc[0].id}/resolve`, { action: 'write_off' })).status).toBe(422);
    await expectLedgerTies();
  });
  it('a dispatch that cannot be filled fails as a whole (409) and the transfer stays requested', async () => {
    const big = (await h.post('/stock/transfers', { fromStoreId: fx.shop.id, toStoreId: fx.wh.id, lines: [{ variantId: fx.tee.id, qty: 10 }, { variantId: fx.dress.id, qty: 999 }] })).body;
    const d = await h.post(`/stock/transfers/${big.id}/dispatch`);
    expect(d.status).toBe(409);
    expect(d.body.code).toBe('INSUFFICIENT_STOCK');
    expect((await h.get(`/stock/transfers/${big.id}`)).body.status).toBe('requested');
    expect((await stockOf(h, fx.tee.id, fx.shop.id)).onHand).toBe(70); // the tee line was rolled back too
    expect((await h.post(`/stock/transfers/${big.id}/cancel`)).body.status).toBe('cancelled');
    await expectLedgerTies();
  });
  it('dispatching twice with the same key moves stock once', async () => {
    const x = (await h.post('/stock/transfers', { fromStoreId: fx.wh.id, toStoreId: fx.shop.id, lines: [{ variantId: fx.tee.id, qty: 5 }] })).body;
    const a = await h.post(`/stock/transfers/${x.id}/dispatch`, {}, { idem: 'dispatch-key-1' }); const b = await h.post(`/stock/transfers/${x.id}/dispatch`, {}, { idem: 'dispatch-key-1' });
    expect(b.headers['idempotent-replay']).toBe('true');
    expect(a.body.inTransitTotal).toBe(5);
    expect((await stockOf(h, fx.tee.id, fx.wh.id)).onHand).toBe(25);
    await h.post(`/stock/transfers/${x.id}/receive`, { lines: [{ variantId: fx.tee.id, receivedQty: 5 }] });
    await expectLedgerTies();
  });
});

describe('audits', () => {
  let audit: any;
  it('starts for a store with a snapshot of system quantities; Buyer can count but not approve', async () => {
    const buyer = await tokenFor(t, 'Buyer Purchase', 'b-aud@test.local');
    const a = await h.post('/stock/audits', { storeId: fx.shop.id }, { token: buyer, idem: false });
    expect(a.status).toBe(201);
    audit = a.body;
    expect(audit).toMatchObject({ status: 'in_progress', auditNumber: expect.stringMatching(/^AUD-/), storeName: 'Krishnas Orchids Hub' });
    expect(audit.lines.map((l: any) => [l.itemCode, l.systemQty]).sort()).toEqual([[fx.dress.itemCode, 40], [fx.tee.itemCode, 75]].sort());
    expect((await h.post(`/stock/audits/${audit.id}/approve`, {}, { token: buyer })).status).toBe(403);
  });
  it('scans add counts; an item not in the snapshot is added; stock sold during the audit is flagged', async () => {
    for (let i = 0; i < 72; i++) if (i % 12 === 0) await h.post(`/stock/audits/${audit.id}/scan`, { barcode: fx.tee.barcode, qty: 12 }, { idem: false });
    const s = await h.post(`/stock/audits/${audit.id}/scan`, { barcode: fx.dress.itemCode, qty: 38, set: true }, { idem: false });
    expect(s.body).toMatchObject({ countedQty: 38, systemQty: 40 });
    expect((await h.post(`/stock/audits/${audit.id}/scan`, { barcode: 'NOPE' }, { idem: false })).status).toBe(404);
    // a sale happens during the audit: stock is not frozen
    await withTransaction((session) => postStock({ variantId: fx.tee.id, storeId: fx.shop.id, type: 'SALE', qty: -2, unitCost: 10000, docType: 'POS', docNumber: 'POS-TEST-1' }, session));
    const sheet = (await h.get(`/stock/audits/${audit.id}`)).body;
    const tee = sheet.lines.find((l: any) => l.itemCode === fx.tee.itemCode);
    expect(tee).toMatchObject({ systemQty: 75, countedQty: 72, variance: -3, varianceValue: -30000, movedDuringAudit: true, movementSinceStart: -2 });
    expect(sheet.lines.find((l: any) => l.itemCode === fx.dress.itemCode)).toMatchObject({ variance: -2, movedDuringAudit: false });
    expect(sheet.summary).toMatchObject({ lines: 2, counted: 2, withVariance: 2, movedDuringAudit: 1, varianceQty: -5, varianceValue: -50000 });
  });
  it('approval posts each variance as an AUDIT entry and leaves the ledger balanced; it cannot be approved twice', async () => {
    const a = await h.post(`/stock/audits/${audit.id}/approve`, {});
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ status: 'approved', postedLines: 2 });
    const rows: any[] = await StockLedger.find({ type: 'AUDIT' }).lean();
    expect(rows.map((r) => r.qty).sort((a, b) => a - b)).toEqual([-3, -2]);
    expect((await stockOf(h, fx.tee.id, fx.shop.id)).onHand).toBe(75 - 2 - 3); // 75 at the start, a sale of 2 during the audit, then the -3 variance
    expect((await stockOf(h, fx.dress.id, fx.shop.id)).onHand).toBe(38);
    expect((await h.post(`/stock/audits/${audit.id}/approve`, {}, { idem: key() })).status).toBe(422);
    expect((await h.post(`/stock/audits/${audit.id}/scan`, { barcode: fx.tee.barcode }, { idem: false })).status).toBe(422);
    await expectLedgerTies();
  });
  it('scoped audits and uncounted items: skip by default, or treat as zero', async () => {
    const a = (await h.post('/stock/audits', { storeId: fx.shop.id, name: 'Zero test' }, { idem: false })).body;
    await h.post(`/stock/audits/${a.id}/scan`, { barcode: fx.tee.barcode, qty: 10, set: true }, { idem: false });
    const r = await h.post(`/stock/audits/${a.id}/approve`, { uncounted: 'zero' });
    expect(r.body.postedLines).toBe(2);
    expect((await stockOf(h, fx.dress.id, fx.shop.id)).onHand).toBe(0); // never counted, so treated as zero
    expect((await stockOf(h, fx.tee.id, fx.shop.id)).onHand).toBe(10);
    await expectLedgerTies();
    const none = (await h.post('/stock/audits', { storeId: fx.shop.id, binLocation: 'NO-SUCH-BIN' }, { idem: false })).body;
    expect(none.lines).toHaveLength(0);
  });
  it('lists audits', async () => {
    const l = (await h.get(`/stock/audits?storeId=${fx.shop.id}`)).body;
    expect(l.total).toBeGreaterThanOrEqual(3);
    expect(l.items[0].lines).toBeUndefined();
  });
});

describe('the whole ledger at the end', () => {
  it('every ledger row has a type and a document, none was edited, and balances equal the ledger', async () => {
    const rows: any[] = await StockLedger.find().lean();
    expect(rows.length).toBeGreaterThan(15);
    for (const r of rows) { expect(r.type).toBeTruthy(); expect(r.docType).toBeTruthy(); expect(r.docNumber).toBeTruthy(); expect(r.updatedAt).toBeUndefined(); }
    await expectLedgerTies();
    const types = new Set(rows.map((r) => r.type));
    for (const x of ['GRN', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'AUDIT', 'SALE']) expect(types.has(x)).toBe(true);
  });
});
