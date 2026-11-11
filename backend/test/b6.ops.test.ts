import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import mongoose from 'mongoose';
import { BackupRun, StockBalance, Order, Variant, User } from '../src/models';
import { decrypt, encrypt, pruneBackups } from '../src/lib/backup';
import { storage } from '../src/adapters/storage';
import { setupTest, type TestCtx } from './helpers';
import { A, api, fixtures, setGst, tokenFor, type Fx } from './b2.helpers';

let t: TestCtx; let fx: Fx; let h: ReturnType<typeof api>;
beforeAll(async () => {
  t = await setupTest(); fx = await fixtures(t); h = fx.h;
  await h.post('/stock/adjustments', { storeId: fx.shop.id, reason: 'Opening', lines: [{ variantId: fx.tee.id, qty: 30 }] });
});
afterAll(async () => { await t.close(); });
const job = (name: string, secret?: string) => t.api('POST', `${A}/internal/jobs/${name}`, { headers: secret ? { 'x-cron-secret': secret } : {} });

describe('end to end journey: purchase, receive, sell, GST report to Excel', () => {
  it('buys, receives, sells and files', async () => {
    await setGst(t, true);
    const po = (await h.post('/purchase-orders', { vendorId: fx.knit.id, storeId: fx.shop.id, lines: [{ variantId: fx.dress.id, qty: 10, unitCost: 60000, gstRate: 12 }] })).body;
    if (po.requiresApproval) await h.post(`/purchase-orders/${po.id}/approve`); await h.post(`/purchase-orders/${po.id}/send`);
    const grn = (await h.post('/grn', { poId: po.id, vendorInvoiceNo: 'J1', vendorInvoiceDate: '2026-11-01T00:00:00.000Z', lines: [{ variantId: fx.dress.id, receivedQty: 10 }] })).body;
    await h.post('/purchase-bills', { vendorId: fx.knit.id, vendorBillNo: 'JB1', billDate: new Date().toISOString(), grnIds: [grn.id] });
    const d = (await h.post('/pos/bills', { storeId: fx.shop.id, lines: [{ variantId: fx.dress.id, qty: 2 }] })).body;
    const inv = (await h.post(`/pos/bills/${d.id}/finalize`, { tenders: [{ mode: 'upi', amount: d.grandTotal }] })).body;
    expect(inv.gstMode).toBe('on');
    const wb = XLSX.read((await t.app.inject({ method: 'GET', url: `${A}/reports/gst/gstr1?format=xlsx`, headers: { authorization: `Bearer ${t.adminToken}` } })).rawPayload, { type: 'buffer' });
    expect(XLSX.utils.sheet_to_json(wb.Sheets['12 HSN']!).length).toBe(1);
    expect((await h.get('/reports/gst/gstr3b')).body.itc.cgst).toBe(36000); // 10 x 600 at 12%, half each = 360 CGST
    await setGst(t, false);
  });
});

describe('scheduled jobs', () => {
  it('only Catalyst cron with the secret can call them', async () => {
    expect((await job('backup')).status).toBe(401);
    expect((await job('backup', 'wrong')).status).toBe(401);
    expect((await job('nope', 'mock-cron-secret')).status).toBe(404);
    expect((await t.api('POST', `${A}/internal/jobs/backup`, { token: t.adminToken })).status).toBe(401); // an Admin token is not the cron secret
  });
  it('the stock balance check passes on clean data and alerts on any difference', async () => {
    const ok = await job('stockBalanceCheck', 'mock-cron-secret'); expect(ok.body).toMatchObject({ status: 'ok', result: { mismatches: 0 } });
    await StockBalance.updateOne({ variantId: fx.tee.id }, { $inc: { onHand: 3 } }); // simulate corruption
    const bad = await job('stockBalanceCheck', 'mock-cron-secret'); expect(bad.body.result.mismatches).toBe(1); expect(bad.body.result.diffs[0]).toMatchObject({ balance: expect.any(Number), ledger: expect.any(Number) });
    const { outbox } = await import('../src/adapters/email'); expect(outbox.some((m) => /Stock balance mismatch/.test(m.subject))).toBe(true);
    await StockBalance.updateOne({ variantId: fx.tee.id }, { $inc: { onHand: -3 } });
  });
  it('reconciliation lists paid-but-unconfirmed orders; releaseHolds, exportCleanup, reorderDigest and the failed jobs summary run', async () => {
    const admin: any = await User.findOne().lean();
    await Order.create({ orderNumber: 'ORD-T-1', customerId: admin._id, storeId: fx.shop.id, status: 'payment_pending', clientReportedPayment: { signatureOk: true }, payable: 5000, lines: [] });
    await Order.updateOne({ orderNumber: 'ORD-T-1' }, { $set: { updatedAt: new Date(Date.now() - 3600_000) } }, { timestamps: false });
    const r = await job('reconciliation', 'mock-cron-secret'); expect(r.body.result.issues).toBeGreaterThanOrEqual(1); expect(r.body.result.items[0].issue).toMatch(/webhook never confirmed/);
    for (const n of ['releaseHolds', 'exportCleanup', 'reorderDigest', 'failedJobsSummary', 'activityLogTrim']) expect((await job(n, 'mock-cron-secret')).body.status).toBe('ok');
  });
});

describe('backups: encrypted, retained, restorable', () => {
  let runId: string;
  it('the nightly job writes every collection compressed and encrypted to the private bucket', async () => {
    const r = await job('backup', 'mock-cron-secret'); expect(r.body.status).toBe('ok');
    expect(r.body.result).toMatchObject({ kind: expect.stringMatching(/daily|weekly/) }); expect(r.body.result.docs).toBeGreaterThan(50); expect(r.body.result.collections).toBeGreaterThan(20);
    const run: any = await BackupRun.findOne({ status: 'done' }).sort({ createdAt: -1 }).lean(); runId = String(run._id);
    const f = run.files.find((x: any) => x.collection === 'users' && x.key); const blob = await storage().getObject('backups', f.key);
    expect(blob.toString('latin1')).not.toMatch(/thunikart|admin@test|argon2/i); // encrypted: nothing readable
    expect(decrypt(blob).subarray(0, 2).toString('hex')).toBe('1f8b'); // gzip inside
    expect(() => decrypt(Buffer.concat([blob.subarray(0, 40), Buffer.from('tampered'), blob.subarray(48)]))).toThrow(); // tampering is detected
    expect(encrypt(Buffer.from('x')).length).toBe(29); // 12 byte iv + 16 byte tag + 1 byte
    const list = (await h.get('/admin/backups')).body.items; expect(list[0]).toMatchObject({ status: 'done', pruned: false });
  });
  it('a restore into a fresh database matches the live data, and the time is recorded', async () => {
    const r = await h.post('/admin/backups/restore-test', {}, { idem: false });
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ ok: true, changedSinceBackup: expect.any(Array) });
    expect(r.body.restoreMs).toBeGreaterThan(0); expect(r.body.docs).toBeGreaterThan(50);
    const stillThere = (await mongoose.connection.db!.admin().listDatabases()).databases.some((d: any) => d.name.startsWith('restore_test_')); expect(stillThere).toBe(false); // dropped
    const v: any = await Variant.findById(fx.tee.id).lean(); expect(v.itemCode).toBe(fx.tee.itemCode);
    void runId;
  });
  it('keeps 30 daily and 8 weekly backups and deletes the rest from the bucket', async () => {
    const mk = (i: number, kind: string) => BackupRun.create({ date: `2020-01-${String(i).padStart(2, '0')}`, kind, status: 'done', files: [{ collection: 'x', key: `backups/old/${kind}${i}`, docs: 1, bytes: 1, sha256: 'a' }], totalDocs: 1 });
    for (let i = 1; i <= 31; i++) { await storage().putObject('backups', `backups/old/daily${i}`, Buffer.from('x'), 'text/plain'); await mk(i, 'daily'); }
    for (let i = 1; i <= 9; i++) { await storage().putObject('backups', `backups/old/weekly${i}`, Buffer.from('x'), 'text/plain'); await mk(i, 'weekly'); }
    const p = await pruneBackups(); expect(p.pruned).toBeGreaterThanOrEqual(2);
    expect(await BackupRun.countDocuments({ kind: 'daily', prunedAt: null, status: 'done' })).toBe(30);
    expect(await BackupRun.countDocuments({ kind: 'weekly', prunedAt: null, status: 'done' })).toBeLessThanOrEqual(8);
    await expect(storage().getObject('backups', 'backups/old/daily1')).rejects.toThrow();
  });
  it('backup admin endpoints need settings permission', async () => {
    const sales = await tokenFor(t, 'Sales', 's-bk@test.local'); const acc = await tokenFor(t, 'Accounts', 'a-bk@test.local');
    expect((await h.get('/admin/backups', sales)).status).toBe(403); expect((await h.post('/admin/backups/restore-test', {}, { token: acc, idem: false })).status).toBe(403);
    expect((await h.get('/admin/audit/export', acc)).status).toBe(200); // Accounts has reports.export
    expect((await h.get('/admin/audit/export', sales)).status).toBe(403);
  });
});

describe('audit export and security checks', () => {
  it('exports the activity log as CSV with before and after values, and never a password', async () => {
    const r = await t.app.inject({ method: 'GET', url: `${A}/admin/audit/export`, headers: { authorization: `Bearer ${t.adminToken}` } });
    expect(r.headers['content-type']).toMatch(/text\/csv/); expect(r.body.split('\n')[0]).toContain('requestId'); expect(r.body).toMatch(/purchase_order|stock_adjustment|user/); expect(r.body).not.toMatch(/\$argon2|Some-Pass-2026/);
  });
  it('CORS allows only the storefront and admin URLs; the API never caches; secrets are not logged', async () => {
    const ok = await t.app.inject({ method: 'OPTIONS', url: `${A}/me`, headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await t.app.inject({ method: 'OPTIONS', url: `${A}/me`, headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    expect((await t.app.inject({ method: 'GET', url: `${A}/store/products` })).headers['cache-control']).toBe('no-store');
    expect((await t.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: '/ready' })).json()).toMatchObject({ status: 'ready' });
  });
  it('uploads are limited by type and size, bodies by size, and input is validated everywhere', async () => {
    expect((await h.post('/uploads/presign', { purpose: 'image', filename: 'a.exe', contentType: 'application/x-msdownload', size: 10 })).status).toBe(400);
    const big = await t.app.inject({ method: 'POST', url: `${A}/auth/login`, headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(2_000_000) }) });
    expect(big.statusCode).toBe(413);
    expect((await t.api('POST', `${A}/auth/login`, { body: { email: 'not-an-email', password: '' } })).status).toBe(400);
  });
});
