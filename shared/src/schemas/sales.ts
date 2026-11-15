import { z } from 'zod';
import { objectId, patchOf } from './common';
import { PRINT_SIZES } from '../constants';

const money = z.number().int().min(0);
export const TENDER_MODES = ['cash', 'upi', 'card', 'wallet', 'bank_transfer', 'credit', 'credit_note', 'razorpay'] as const;
export const tenderBody = z.object({ mode: z.enum(TENDER_MODES), amount: z.number().int().min(1), reference: z.string().trim().max(60).optional() });
export const discountInput = z.object({ type: z.enum(['amount', 'percent']), value: z.number().min(0) });
export const saleLineBody = z.object({
  variantId: objectId, qty: z.number().int().min(1).max(10000),
  /** Defaults to the variant's online price rule (offer, else selling, else MRP). Paise, GST inclusive. */
  unitPrice: money.optional(), discount: discountInput.optional(),
  /** The size sold, for an item whose sizes share one stock count (the item's size reads "S, M, L, XL"). Required for those items, ignored for the rest. */
  size: z.string().trim().min(1).max(30).optional(),
});
export const customerSnapshotInput = z.object({
  name: z.string().trim().max(120).default('Walk-in Customer'), mobile: z.string().trim().max(15).default(''), address: z.string().trim().max(200).default(''),
  stateCode: z.string().regex(/^\d{2}$/).optional(), gstin: z.string().trim().toUpperCase().max(15).default(''),
});
export const posBillBody = z.object({
  channel: z.enum(['POS', 'CNT']).default('POS'), storeId: objectId, customerId: objectId.optional(), customer: customerSnapshotInput.optional(),
  lines: z.array(saleLineBody).min(1).max(200), billDiscount: discountInput.optional(), hold: z.boolean().default(false), notes: z.string().trim().max(300).default(''),
  dueDate: z.string().datetime().optional(),
});
export const posBillUpdateBody = patchOf(posBillBody);
export const approvalBody = z.object({ pin: z.string().min(4).max(20) });
export const finalizeBody = z.object({
  tenders: z.array(tenderBody).min(1).max(6), approval: approvalBody.optional(),
  /** Loyalty points to redeem (counts as a discount line). Needs loyalty rules switched on in Settings. */
  redeemPoints: z.number().int().min(0).optional(),
});
export const b2bInvoiceBody = posBillBody.omit({ hold: true, channel: true }).extend({ customerId: objectId, tenders: z.array(tenderBody).max(6).default([]), approval: approvalBody.optional(), dueDate: z.string().datetime().optional() });
export const shiftOpenBody = z.object({ storeId: objectId, openingCash: money });
export const shiftCloseBody = z.object({ countedCash: money, note: z.string().trim().max(200).default('') });
export const invoiceQuery = z.object({ channel: z.enum(['POS', 'ECM', 'CNT']).optional(), invoiceStatus: z.enum(['draft', 'hold', 'finalized', 'cancelled']).optional(), customerId: objectId.optional() });
export const printQuery = z.object({ size: z.enum(PRINT_SIZES).default('4x6'), format: z.enum(['pdf', 'html']).default('pdf') });
export const salesReturnBody = z.object({
  invoiceId: objectId.optional(), invoiceNumber: z.string().trim().optional(),
  lines: z.array(z.object({ variantId: objectId, qty: z.number().int().min(1) })).min(1),
  reason: z.enum(['size', 'defect', 'wrong_item', 'other']), note: z.string().trim().max(300).default(''),
  refundTo: z.enum(['original', 'wallet']).default('original'),
  /** Exchange: the new items. A new bill is made, linked to this return; the difference is collected or refunded. */
  exchange: z.object({ lines: z.array(saleLineBody).min(1), tenders: z.array(tenderBody).max(6).default([]) }).optional(),
});
export const loyaltyRedeemBody = z.object({ points: z.number().int().min(1) });
export const inboundOrderBody = z.object({
  orderNumber: z.string().trim().min(1).max(40), storeId: objectId.optional(), customerId: objectId.optional(),
  customer: customerSnapshotInput, lines: z.array(z.object({ variantId: objectId, qty: z.number().int().min(1), unitPrice: money, discountAmount: money.default(0) })).min(1),
  shippingCharge: money.default(0), tenders: z.array(tenderBody).min(1).max(6), shipTo: z.string().trim().max(300).default(''),
});
/** Invoice responses carry the full printed snapshot. Typed fields are the ones every screen needs. */
export const invoiceDto = z.looseObject({
  id: objectId, invoiceNumber: z.string().nullable(), status: z.enum(['draft', 'hold', 'finalized', 'cancelled']), channel: z.enum(['POS', 'ECM', 'CNT']),
  gstMode: z.enum(['on', 'off']), grandTotal: z.number().int(), roundOff: z.number().int(), currency: z.literal('INR'), version: z.number().int(),
});
export const listInvoices = z.object({ items: z.array(invoiceDto), total: z.number().int(), nextPage: z.number().int().nullable() });
export const salesReturnDto = z.looseObject({ id: objectId, creditNoteNumber: z.string(), refundTotal: z.number().int(), currency: z.literal('INR') });
export const shiftDto = z.looseObject({ id: objectId, status: z.enum(['open', 'closed']), openingCash: z.number().int() });
