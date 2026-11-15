import { Customer, CreditMemo, SalesBill, WalletLedger } from '../../models';
import { badRequest, businessRule, notFound } from '../../lib/errors';
import { withTransaction } from '../../lib/transaction';
import { nextNumber } from '../../lib/numberSeries';
import { isGstEnabled } from '../../lib/gst';
import { iso } from '../../lib/list';
import { escapeRegex, paginate, parseSort } from '../../lib/list';
import type { ListQuery } from '@thunikart/shared';
import type { AuthUser } from '../../middleware/auth';
import type { AuditEntry } from '../../middleware/audit';

type Audit = (e: AuditEntry) => void;

export const memoDto = (m: any) => ({
  id: String(m._id), creditNoteNumber: m.creditNoteNumber, customerId: String(m.customerId), customerName: m.customer?.name ?? '', invoiceNumber: m.invoiceNumber ?? null, reason: m.reason ?? '',
  amount: m.amount, taxable: m.taxable ?? 0, cgst: m.cgst ?? 0, sgst: m.sgst ?? 0, igst: m.igst ?? 0, settle: m.settle, refundMode: m.refundMode ?? null,
  gstMode: (m.gstMode ?? 'off') as 'on' | 'off', gstRate: m.gstRate ?? null, createdAt: iso(m.createdAt)!, currency: 'INR' as const, note: m.note ?? '',
});

/**
 * A credit to a customer without goods coming back. It is a credit note: it takes the next number from the same series as return credit notes,
 * so no number is ever used twice. The amount can go to the customer's wallet, be paid back now, or be taken off what they owe on an invoice.
 */
export async function createCreditMemo(user: AuthUser, input: any, audit: Audit) {
  const gstOn = await isGstEnabled();
  const id = await withTransaction(async (session) => {
    const cust: any = await Customer.findById(input.customerId).session(session).lean();
    if (!cust) throw notFound('Customer');
    let inv: any = null;
    if (input.invoiceId) {
      inv = await SalesBill.findById(input.invoiceId).session(session);
      if (!inv || String(inv.customerId) !== input.customerId) throw badRequest('This invoice is not this customer\'s', [{ path: 'invoiceId', message: 'Choose one of this customer\'s invoices' }]);
      if (inv.status !== 'finalized') throw businessRule('Only a finished invoice can be credited', 'INVOICE_NOT_FINAL');
      // The credits on an invoice, together with what was returned on it, never exceed what was billed.
      const given: any[] = await CreditMemo.aggregate([{ $match: { invoiceId: inv._id } }, { $group: { _id: null, t: { $sum: '$amount' } } }]).session(session);
      if ((given[0]?.t ?? 0) + input.amount > inv.grandTotal) throw businessRule(`Credits on this invoice would be more than its total of ${(inv.grandTotal / 100).toFixed(2)} rupees`, 'CREDIT_EXCEEDS_INVOICE');
    }
    if (input.settle === 'reduce_due') {
      if (!inv) throw badRequest('Choose the invoice to reduce', [{ path: 'invoiceId', message: 'Needed to reduce what the customer owes' }]);
      if ((inv.creditDue ?? 0) < input.amount) throw businessRule(`This invoice has only ${((inv.creditDue ?? 0) / 100).toFixed(2)} rupees left to pay. Use the wallet or a refund for the rest.`, 'MORE_THAN_DUE');
    }
    if (input.settle === 'refund' && !input.refundMode) throw badRequest('Say how the money was paid back', [{ path: 'refundMode', message: 'Choose cash, UPI, card or bank transfer' }]);
    // The tax inside the amount, shown on the credit note. Same state: half each as CGST and SGST. Another state: IGST.
    let taxable = input.amount, cgst = 0, sgst = 0, igst = 0; const rate = gstOn ? (input.gstRate ?? null) : null;
    if (gstOn) {
      if (rate === null) throw badRequest('Choose the GST rate', [{ path: 'gstRate', message: 'GST is on, so the credit note needs the rate' }]);
      taxable = Math.round((input.amount * 100) / (100 + rate));
      const tax = input.amount - taxable;
      if (inv?.supply === 'inter') igst = tax; else { cgst = Math.floor(tax / 2); sgst = tax - cgst; }
    }
    const creditNoteNumber = await nextNumber('CN', { session });
    const [m] = await CreditMemo.create([{
      creditNoteNumber, customerId: cust._id, customer: { name: cust.name, mobile: cust.mobile }, invoiceId: inv?._id, invoiceNumber: inv?.invoiceNumber, reason: input.reason, note: input.note ?? '',
      gstMode: gstOn ? 'on' : 'off', gstRate: rate, amount: input.amount, taxable, cgst, sgst, igst, settle: input.settle, refundMode: input.refundMode, createdBy: user.id,
    }], { session });
    if (input.settle === 'wallet') await WalletLedger.create([{ customerId: cust._id, amount: input.amount, type: 'CREDIT', docType: 'CREDIT_NOTE', docNumber: creditNoteNumber }], { session });
    if (input.settle === 'reduce_due') await SalesBill.updateOne({ _id: inv._id }, { $inc: { creditDue: -input.amount } }, { session });
    return String(m!._id);
  });
  const dto = await getCreditMemo(id);
  audit({ entity: 'credit_memo', entityId: id, action: 'create', after: { creditNoteNumber: dto.creditNoteNumber, amount: dto.amount, settle: dto.settle, customerId: dto.customerId } });
  return dto;
}

export async function getCreditMemo(id: string) {
  const m: any = await CreditMemo.findById(id).lean();
  if (!m) throw notFound('Credit memo');
  return memoDto(m);
}

export async function listCreditMemos(q: ListQuery & { customerId?: string; invoiceId?: string }) {
  const f: any = {};
  if (q.customerId) f.customerId = q.customerId;
  if (q.invoiceId) f.invoiceId = q.invoiceId;
  if (q.from || q.to) f.createdAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  if (q.q) { const r = new RegExp(escapeRegex(q.q), 'i'); f.$or = [{ creditNoteNumber: r }, { 'customer.name': r }, { invoiceNumber: r }, { reason: r }]; }
  const res = await paginate(CreditMemo, f, q, parseSort(q.sort, ['createdAt', 'creditNoteNumber', 'amount'], { createdAt: -1 }), (m) => m);
  return { ...res, items: res.items.map(memoDto) };
}
