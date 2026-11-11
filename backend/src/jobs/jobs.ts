import { ActivityLog, BackupRun, JobRun, Order, SalesBill, StockBalance, User, Role } from '../models';
import { pruneBackups, runBackup } from '../lib/backup';
import { ledgerOnHand } from '../lib/stock';
import { email as mailer, brandedMail } from '../adapters/email';
import { cleanupExports } from '../modules/reports/exports.service';
import { releaseExpiredHolds } from '../modules/store/orders.service';
import { reorderAlerts } from '../modules/stock/stock.service';

async function adminEmails(): Promise<string[]> {
  const role: any = await Role.findOne({ isAdmin: true }).lean();
  return ((await User.find({ roleId: role?._id, active: true, deletedAt: null }, { email: 1 }).lean()) as any[]).map((u) => u.email);
}
async function alert(subject: string, body: string) { for (const to of await adminEmails()) await mailer().send(brandedMail(to, subject, subject, body)).catch(() => undefined); }

/** Balances must equal the sum of ledger rows. Any difference is reported and alerted. */
export async function stockBalanceCheck() {
  const led = await ledgerOnHand(); const bals: any[] = await StockBalance.find().lean();
  const lm = new Map(led.map((l) => [`${l.variantId}:${l.storeId}`, l.qty])); const diffs: any[] = [];
  for (const b of bals) { const k = `${b.variantId}:${b.storeId}`; const l = lm.get(k) ?? 0; if (l !== b.onHand) diffs.push({ variantId: String(b.variantId), storeId: String(b.storeId), balance: b.onHand, ledger: l }); lm.delete(k); }
  for (const [k, qty] of lm) if (qty !== 0) { const [variantId, storeId] = k.split(':'); diffs.push({ variantId, storeId, balance: 0, ledger: qty }); }
  if (diffs.length) await alert('Stock balance mismatch', `<p>${diffs.length} variant/store balance(s) differ from the stock ledger. First: ${JSON.stringify(diffs[0])}</p>`);
  return { checked: bals.length, mismatches: diffs.length, diffs: diffs.slice(0, 50) };
}

/** Orders against gateway payments: things that need a person (paid but not confirmed, confirmed without an invoice, refunds that failed). */
export async function reconciliation() {
  const old = new Date(Date.now() - 30 * 60000); const issues: any[] = [];
  for (const o of (await Order.find({ status: 'payment_pending', 'clientReportedPayment.signatureOk': true, updatedAt: { $lt: old } }).lean()) as any[]) issues.push({ order: o.orderNumber, issue: 'Browser reported a payment but the webhook never confirmed it', amount: o.payable });
  for (const o of (await Order.find({ status: { $in: ['confirmed', 'packed', 'shipped', 'delivered'] }, paymentMethod: { $ne: 'cod' }, invoiceId: { $exists: false } }).lean()) as any[]) issues.push({ order: o.orderNumber, issue: 'Confirmed without an invoice' });
  for (const o of (await Order.find({ 'refund.status': 'needs_attention' }).lean()) as any[]) issues.push({ order: o.orderNumber, issue: 'Automatic refund failed', amount: o.refund.amount });
  for (const o of (await Order.find({ status: { $in: ['confirmed'] }, invoiceId: { $exists: true } }).lean()) as any[]) { if (!(await SalesBill.exists({ _id: o.invoiceId, status: 'finalized' }))) issues.push({ order: o.orderNumber, issue: 'Invoice is not finalized' }); }
  if (issues.length) await alert('Payment reconciliation: orders need attention', `<p>${issues.length} issue(s). First: ${JSON.stringify(issues[0])}</p>`);
  return { issues: issues.length, items: issues.slice(0, 50) };
}

export async function reorderDigest() {
  const a = await reorderAlerts(); if (!a.totalItems) return { sent: false, items: 0 };
  const rows = a.groups.map((g) => `<p><b>${g.vendorName}</b>: ${g.items.map((i: any) => `${i.itemCode} (${i.available} left, order ${i.suggestedQty})`).join(', ')}</p>`).join('');
  await alert(`Reorder digest: ${a.totalItems} item(s) at or below their reorder level`, rows);
  return { sent: true, items: a.totalItems };
}

/** The daily summary of failed jobs, sent to Admins. */
export async function failedJobsSummary() {
  const since = new Date(Date.now() - 86400000); const failed: any[] = await JobRun.find({ status: 'failed', at: { $gte: since } }).lean(); const failedBackups = await BackupRun.countDocuments({ status: 'failed', createdAt: { $gte: since } });
  if (failed.length || failedBackups) await alert('Failed jobs in the last 24 hours', `<p>${failed.map((f) => `${f.name}: ${f.error}`).join('<br>')}${failedBackups ? `<br>${failedBackups} backup(s) failed` : ''}</p>`);
  return { failedJobs: failed.length, failedBackups };
}

export const JOBS: Record<string, () => Promise<unknown>> = {
  backup: async () => { const r = await runBackup(); return { ...r, ...(await pruneBackups()) }; },
  stockBalanceCheck, reconciliation, reorderDigest, failedJobsSummary,
  exportCleanup: async () => ({ removed: await cleanupExports() }),
  releaseHolds: async () => ({ released: await releaseExpiredHolds() }),
  activityLogTrim: async () => ({ removed: (await ActivityLog.deleteMany({ at: { $lt: new Date(Date.now() - 400 * 86400000) } })).deletedCount }),
};

/** Runs a job and records the result, so a daily summary can report the ones that failed. */
export async function runJob(name: string) {
  const fn = JOBS[name]; if (!fn) throw new Error(`Unknown job ${name}`);
  const t0 = Date.now();
  try { const result = await fn(); await JobRun.create({ name, status: 'ok', result, durationMs: Date.now() - t0 }); return { name, status: 'ok' as const, result }; }
  catch (e: any) { await JobRun.create({ name, status: 'failed', error: String(e?.message ?? e).slice(0, 300), durationMs: Date.now() - t0 }); return { name, status: 'failed' as const, error: String(e?.message ?? e) }; }
}
