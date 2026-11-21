import { z } from 'zod';
import { listEnvelope } from '../catalog/types';

/**
 * POS, bills, returns and shift contracts for the F3 screens. The B3 spec is not published yet, so these are proposals
 * (see docs/api-requests.md). Money is integer paise. Every total, tax, discount amount, round off and change due comes from the API.
 */
export const TENDERS = ['Cash', 'UPI', 'Card', 'Wallet', 'Bank Transfer', 'Credit'] as const;
export type Tender = (typeof TENDERS)[number];
/** What the counter offers: Cash, UPI and the customer's wallet. B2B invoices keep their own list (credit, bank transfer). */
export const POS_TENDERS = ['Cash', 'UPI', 'Wallet'] as const satisfies readonly Tender[];
export const PRINT_SIZES_UI = [
  { key: 'a4', label: 'A4 sheet', hint: 'Office printer, B2B invoices' },
  { key: '2in', label: 'Thermal 2 inch (58 mm)', hint: 'Small receipt printer' },
  { key: '3in', label: 'Thermal 3 inch (80 mm)', hint: 'Counter receipt printer' },
  { key: '4x6', label: 'Thermal 4 x 6 inch', hint: 'Label style invoice' },
] as const;
export type PrintSizeKey = (typeof PRINT_SIZES_UI)[number]['key'];

export const previewLine = z.object({
  variantId: z.string(), code: z.string(), name: z.string(), size: z.string(), color: z.string(), hsn: z.string(),
  qty: z.number().int(), rate: z.number().int(), discount: z.number().int(), taxableValue: z.number().int(), taxRate: z.number().nullable(),
  cgst: z.number().int(), sgst: z.number().int(), igst: z.number().int(), net: z.number().int(), available: z.number().int(),
});
export type PreviewLine = z.infer<typeof previewLine>;
export const totalsDto = z.object({
  gross: z.number().int(), discount: z.number().int(), taxable: z.number().int(), cgst: z.number().int(), sgst: z.number().int(), igst: z.number().int(),
  tax: z.number().int().nullable(), roundOff: z.number().int(), grandTotal: z.number().int(), pieces: z.number().int(),
});
export type Totals = z.infer<typeof totalsDto>;
export const previewDto = z.object({
  lines: z.array(previewLine), totals: totalsDto, interState: z.boolean(),
  approvalNeeded: z.object({ limitPct: z.number(), requestedPct: z.number() }).nullable(),
  payment: z.object({ paid: z.number().int(), left: z.number().int(), changeDue: z.number().int() }),
});
export type Preview = z.infer<typeof previewDto>;

export const paymentLine = z.object({ mode: z.string(), amount: z.number().int(), reference: z.string() });
export const invoiceDto = z.object({
  id: z.string(), number: z.string(), type: z.enum(['bill-of-supply', 'tax-invoice']), gst: z.boolean(), date: z.string(), time: z.string(), channel: z.string(), storeName: z.string(),
  customer: z.object({ name: z.string(), mobile: z.string(), gstin: z.string(), state: z.string() }).nullable(),
  lines: z.array(previewLine), totals: totalsDto, payments: z.array(paymentLine), changeDue: z.number().int(), dueDate: z.string().nullable(), cashier: z.string(),
  shop: z.object({ name: z.string(), legalName: z.string(), address: z.array(z.string()), city: z.string(), pincode: z.string(), phone: z.string(), gstin: z.string() }),
  terms: z.string(), footer: z.string(),
  returned: z.array(z.number().int()),
});
export type Invoice = z.infer<typeof invoiceDto>;
export const billSummary = z.object({ id: z.string(), number: z.string(), date: z.string(), time: z.string(), customerName: z.string(), total: z.number().int(), pieces: z.number().int(), tenders: z.string(), channel: z.string() });
export const billList = listEnvelope(billSummary);

export const heldDto = z.object({ id: z.string(), kind: z.enum(['hold', 'draft']), name: z.string(), customerName: z.string(), pieces: z.number().int(), total: z.number().int(), createdAt: z.string(), cart: z.unknown() });
export type Held = z.infer<typeof heldDto>;

export const shiftDto = z.object({
  id: z.string(), openedAt: z.string(), openingCash: z.number().int(), closedAt: z.string().nullable(), bills: z.number().int(), cashSales: z.number().int(), cashRefunds: z.number().int(),
  expectedCash: z.number().int().nullable(), countedCash: z.number().int().nullable(), difference: z.number().int().nullable(),
  /** The India date the day was opened on, who opened it, and whether it was left open from an earlier date. */
  businessDate: z.string().default(''), cashier: z.string().default(''), stale: z.boolean().default(false),
});
export type Shift = z.infer<typeof shiftDto>;

export const creditNoteDto = z.object({
  id: z.string(), number: z.string(), invoiceNumber: z.string(), date: z.string(), reason: z.string(), refundMode: z.string(), total: z.number().int(), refunded: z.number().int(), collected: z.number().int(),
  exchangeInvoiceNumber: z.string().nullable(), lines: z.array(z.object({ name: z.string(), size: z.string(), qty: z.number().int(), amount: z.number().int() })), customerName: z.string(),
});
export type CreditNote = z.infer<typeof creditNoteDto>;
export const creditNoteList = listEnvelope(creditNoteDto);

export const returnPreviewDto = z.object({
  returnTotal: z.number().int(), exchangeTotal: z.number().int(), refundDue: z.number().int(), collectDue: z.number().int(),
  exchange: previewDto.nullable(), payment: z.object({ paid: z.number().int(), left: z.number().int(), changeDue: z.number().int() }),
});
export type ReturnPreview = z.infer<typeof returnPreviewDto>;
export const RETURN_REASONS_SALE = ['Size does not fit', 'Colour or style not liked', 'Defective', 'Wrong item given', 'Other'] as const;
export const REFUND_MODES = ['Cash', 'UPI', 'Card', 'Wallet', 'Bank Transfer'] as const;
