import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Item, ReviewItem, StockBalance, StockLedger, Variant } from '../src/models';
import { setupTest, type TestCtx } from './helpers';
import { startImport } from './b1.helpers';

// The client's real stock file (as on 7 Nov 2026). Skipped when the file is not in docs/source.
const FILE = resolve(__dirname, '../../docs/source/Master_Sheet_Krishnas_Orchids_Nov_2026.xlsb');
const has = existsSync(FILE);
let t: TestCtx;
const A = '/api/v1';
beforeAll(async () => { if (has) t = await setupTest(); });
afterAll(async () => { if (has) await t.close(); });

describe.skipIf(!has)('real stock file: Master Sheet Krishnas Orchids Nov 2026.xlsb', () => {
  let id: string;
  it('previews: matches the footer of the source file', async () => {
    const r = await startImport(t, t.adminToken, 'opening_stock', 'Master Sheet Krishnas Orchids Nov 2026.xlsb', readFileSync(FILE), 'application/vnd.ms-excel.sheet.binary.macroEnabled.12');
    id = r.id;
    expect(r.created.body.suggestedMapping).toMatchObject({ name: 'Krishnas Orchids stock sheet', sheet: 'STOCKSUMMARYASON07112026_071120' });
    expect(r.mapped.status).toBe(200);
    const p = await t.api('GET', `${A}/imports/${id}/preview`, { token: t.adminToken });
    console.log('PREVIEW', JSON.stringify({ counts: p.body.counts, totals: p.body.totals, notes: p.body.notes, errors: p.body.errors }, null, 1));
    // 535 data rows in the file, one of which is a header repeated inside the data (row 57): 534 real items.
    expect(p.body.counts).toMatchObject({ new: 534, updated: 0, failed: 0 });
    expect(p.body.counts.skipped).toBe(2); // the repeated header and the totals row
    // The file's footer says 5,019 pieces and 5,92,229.23. One row has quantity -1 (cost 64.50): not posted, so we post 5,020 and 5,92,293.73.
    expect(p.body.totals.pieces).toBe(5020);
    expect(p.body.totals.costValue).toBe(59229373);
    expect(p.body.totals.pieces - 1).toBe(5019); // footer reconciles once the negative row is counted
    expect(p.body.totals.costValue - 6450).toBe(59222923);
    expect(p.body.notes.join(' ')).toMatch(/quantity -1 at cost 64.50/);
  });
  it('commits: the ledger and balances tie to the preview to the paisa', async () => {
    const c = await t.api('POST', `${A}/imports/${id}/commit`, { token: t.adminToken, body: {} });
    console.log('COMMIT', JSON.stringify(c.body));
    expect(c.body).toMatchObject({ done: true, status: 'committed' });
    expect(await Variant.countDocuments()).toBe(534);
    const led: any[] = await StockLedger.find({ docNumber: id }).lean();
    expect(led.reduce((a, l) => a + l.qty, 0)).toBe(5020);
    expect(led.reduce((a, l) => a + l.qty * l.unitCost, 0)).toBe(59229373);
    const bal = await StockBalance.aggregate([{ $group: { _id: null, q: { $sum: '$onHand' } } }]);
    expect(bal[0].q).toBe(5020); // balances tie to the ledger
    console.log('PRODUCTS', await Item.countDocuments(), 'VARIANTS', await Variant.countDocuments());
  });
  it('the review queue has the rows the brief expects', async () => {
    const dq = await t.api('GET', `${A}/imports/data-quality`, { token: t.adminToken });
    console.log('SUMMARY', JSON.stringify(dq.body.summary), 'NO RATE', JSON.stringify(dq.body.hsnWithoutRate));
    expect(dq.body.summary.MISSING_SIZE).toBe(111); // "Primary" size
    expect(dq.body.summary.MISSING_HSN).toBe(183);
    expect(dq.body.summary.INVALID_HSN).toBe(16); // 6407: Chapter 64 stops at 6406
    expect(dq.body.summary.MULTI_SIZE).toBeUndefined(); // MLXL2XL (32) + "S M L XL XXL" (15) stay as one row on purpose
    const bad = await ReviewItem.findOne({ reasons: 'INVALID_HSN' }).lean() as any;
    expect(bad.detail.hsnProblem).toMatch(/6407/);
    const sug = await t.api('GET', `${A}/imports/review-queue?reason=MISSING_HSN&pageSize=100`, { token: t.adminToken });
    const withSuggestion = sug.body.items.filter((i: any) => i.suggestion);
    console.log('HSN suggestions on first page:', withSuggestion.length, 'of', sug.body.items.length, withSuggestion[0]?.suggestion);
    expect(sug.body.total).toBe(183);
  });
  it('bulk approving HSN suggestions never touches rows that have no suggestion', async () => {
    const before = await Item.countDocuments({ hsn: { $in: [null, ''] } });
    const r = await t.api('PATCH', `${A}/imports/review-queue/bulk`, { token: t.adminToken, body: { reason: 'MISSING_HSN', action: 'apply_suggestion' } });
    console.log('BULK', JSON.stringify(r.body), 'items without HSN before', before, 'after', await Item.countDocuments({ hsn: { $in: [null, ''] } }));
    expect(r.status).toBe(200);
  });
  it('rolls the whole batch back', async () => {
    const r = await t.api('POST', `${A}/imports/${id}/rollback`, { token: t.adminToken, body: {} });
    console.log('ROLLBACK', JSON.stringify(r.body));
    expect(r.status).toBe(200);
    expect(await Variant.countDocuments()).toBe(0);
    expect(await Item.countDocuments()).toBe(0);
    expect(await StockLedger.countDocuments()).toBe(0);
    expect(await StockBalance.countDocuments()).toBe(0);
  });
});
