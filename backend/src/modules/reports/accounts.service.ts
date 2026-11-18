import { Customer, Expense, PaymentVoucher, PurchaseBill, Receipt, SalesBill, SalesReturn, StockBalance, StockLedger, Variant, VendorPayment } from '../../models';
import { badRequest, notFound } from '../../lib/errors';
import { nextNumber } from '../../lib/numberSeries';
import type { AuditEntry } from '../../middleware/audit';
import { REPORTS, customerOutstanding, dateFilter, invoicesIn, returnsIn, variantMeta, type RQ } from './reports.service';

type Audit = (e: AuditEntry) => void;
const iso = (d: unknown) => (d ? new Date(d as any).toISOString() : null);
const DAY = 86400000; const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

export async function createReceipt(userId: string, input: any, audit: Audit) {
  const c: any = await Customer.findById(input.customerId).lean(); if (!c) throw badRequest('Customer not found', [{ path: 'customerId', message: 'Choose an existing customer' }]);
  const date = new Date(input.date);
  const r: any = await Receipt.create({ ...input, date, receiptNumber: await nextNumber('RCT', { date }), createdBy: userId });
  audit({ entity: 'receipt', entityId: String(r._id), action: 'create', after: { receiptNumber: r.receiptNumber, amount: r.amount } });
  return { id: String(r._id), receiptNumber: r.receiptNumber, customerId: input.customerId, customerName: c.name, date: iso(date)!, mode: r.mode, amount: r.amount, reference: r.reference, currency: 'INR' as const };
}
export async function createVoucher(userId: string, input: any, audit: Audit) {
  const date = new Date(input.date);
  const r: any = await PaymentVoucher.create({ ...input, date, voucherNumber: await nextNumber('PV', { date }), createdBy: userId });
  audit({ entity: 'payment', entityId: String(r._id), action: 'create', after: { voucherNumber: r.voucherNumber, amount: r.amount } });
  return { id: String(r._id), voucherNumber: r.voucherNumber, payee: r.payee, date: iso(date)!, mode: r.mode, amount: r.amount, purpose: r.purpose, currency: 'INR' as const };
}
export async function customerOutstandingFor(id: string) {
  const c: any = await Customer.findById(id).lean(); if (!c) throw notFound('Customer');
  return { customerId: id, customerName: c.name, ...(await customerOutstanding(id)), currency: 'INR' as const };
}

/** Every money in and out by mode. Wallet and credit are not cash movements, so they are left out. */
export async function daybook(q: RQ) {
  const d = dateFilter(q); const rows: any[] = []; const cashModes = new Set(['cash', 'upi', 'card', 'bank_transfer', 'bank', 'cheque']);
  for (const b of await invoicesIn(q, ['finalized', 'cancelled'])) for (const t of b.tenders ?? []) if (cashModes.has(t.mode)) rows.push({ date: b.finalizedAt, type: 'Sale', ref: b.invoiceNumber, mode: t.mode === 'bank_transfer' ? 'bank' : t.mode, in: t.amount, out: 0 });
  for (const r of await returnsIn(q)) for (const x of r.refunds ?? []) if (cashModes.has(x.mode)) rows.push({ date: r.createdAt, type: 'Refund', ref: r.creditNoteNumber, mode: x.mode, in: 0, out: x.amount });
  for (const r of (await Receipt.find(d ? { date: d } : {}).lean()) as any[]) rows.push({ date: r.date, type: 'Receipt', ref: r.receiptNumber, mode: r.mode, in: r.amount, out: 0 });
  for (const p of (await VendorPayment.find(d ? { date: d } : {}).lean()) as any[]) rows.push({ date: p.date, type: 'Vendor payment', ref: p.paymentNumber, mode: p.mode, in: 0, out: p.amount });
  for (const e of (await Expense.find(d ? { date: d } : {}).lean()) as any[]) rows.push({ date: e.date, type: `${e.kind === 'charge' ? 'Charge' : 'Expense'}: ${e.category}`, ref: e.payee, mode: e.mode, in: 0, out: e.amount });
  for (const v of (await PaymentVoucher.find(d ? { date: d } : {}).lean()) as any[]) rows.push({ date: v.date, type: 'Payment', ref: v.voucherNumber, mode: v.mode, in: 0, out: v.amount });
  rows.sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const byMode: Record<string, { in: number; out: number; net: number }> = {};
  for (const r of rows) { const m = (byMode[r.mode] ??= { in: 0, out: 0, net: 0 }); m.in += r.in; m.out += r.out; m.net = m.in - m.out; }
  const tot = rows.reduce((a, r) => ({ in: a.in + r.in, out: a.out + r.out }), { in: 0, out: 0 });
  return { rows: rows.map((r) => ({ ...r, date: iso(r.date) })), byMode, totals: { ...tot, net: tot.in - tot.out, currency: 'INR' as const } };
}

export async function dashboard() {
  const now = new Date(); const today = ist(now); const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00+05:30`);
  const invs = await invoicesIn({ from: monthStart.toISOString() }); const rets = await returnsIn({ from: monthStart.toISOString() });
  const sales = (list: any[]) => { const ch: Record<string, number> = { POS: 0, ECM: 0, CNT: 0 }; let total = 0; for (const b of list) { ch[b.channel] = (ch[b.channel] ?? 0) + b.grandTotal; total += b.grandTotal; } return { byChannel: ch, total, bills: list.length, averageBill: list.length ? Math.round(total / list.length) : 0 }; };
  const todays = invs.filter((b) => ist(b.finalizedAt) === today);
  const margin = await REPORTS.margin!.run({ from: monthStart.toISOString() }); const top = await REPORTS.margin!.run({ from: monthStart.toISOString(), view: 'item' });
  const meta = await variantMeta(); const bals = await StockBalance.aggregate([{ $group: { _id: '$variantId', on: { $sum: '$onHand' }, res: { $sum: '$reserved' } } }]);
  const low = bals.filter((b) => { const m = meta.get(String(b._id)); return m && m.reorderLevel > 0 && b.on - b.res <= m.reorderLevel; }).length;
  const nm = await REPORTS['non-moving']!.run({ days: 60 });
  const weekEnd = new Date(Date.now() + 7 * DAY); const bills: any[] = await PurchaseBill.find({ dueDate: { $lte: weekEnd } }).lean();
  const payables = bills.reduce((a, b) => a + Math.max(0, b.grandTotal - b.paid - b.debitNotes - (b.settled ?? 0)), 0);
  let receivables = 0; for (const c of (await Customer.find({ accountGroup: 'B2B Trade' }).lean()) as any[]) receivables += (await customerOutstanding(String(c._id))).overdue;
  const series: any[] = []; for (let i = 29; i >= 0; i--) { const day = ist(new Date(Date.now() - i * DAY)); series.push({ date: day, sales: 0 }); }
  for (const b of await invoicesIn({ from: new Date(Date.now() - 30 * DAY).toISOString() })) { const s = series.find((x) => x.date === ist(b.finalizedAt)); if (s) s.sales += b.grandTotal; }
  void SalesBill; void SalesReturn; void StockLedger; void Variant;
  return {
    today: sales(todays), monthToDate: { ...sales(invs), returns: rets.reduce((a, r) => a + r.refundTotal, 0) }, grossMargin: { amount: margin.totals!.margin, percent: margin.totals!.marginPct },
    topItems: top.rows.slice(0, 10).map((r: any) => ({ itemCode: r.key, name: r.name, qty: r.qty, netSales: r.netSales })), lowStockCount: low, nonMovingStockValue: nm.totals!.costValue,
    payablesDueThisWeek: payables, receivablesOverdue: receivables, last30Days: series, currency: 'INR' as const,
  };
}
