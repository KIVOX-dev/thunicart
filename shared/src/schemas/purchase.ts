import { z } from 'zod';
import { objectId, patchOf } from './common';

export const paise = z.number().int();
const qty = z.number().int().min(1).max(1_000_000);
const pct = z.number().min(0).max(100);
const rate = z.number().min(0).max(40);
const money = z.number().int().min(0);
export const currency = z.literal('INR');

export const PO_STATUSES = ['draft', 'approved', 'sent', 'partly_received', 'closed', 'cancelled'] as const;
export const PAY_MODES = ['cash', 'bank', 'upi', 'cheque'] as const;

export const totalsDto = z.object({
  taxable: paise, cgst: paise, sgst: paise, igst: paise, tax: paise, total: paise, currency,
});
export const gstModeEnum = z.enum(['on', 'off']);
export const supplyEnum = z.enum(['intra', 'inter']);

// ---------- purchase orders ----------
export const poLineBody = z.object({
  variantId: objectId,
  qty,
  /** Unit cost in paise, EXCLUDING GST. */
  unitCost: money,
  /** Trade discount as a percent of the line value (for example 2.5). */
  discountPercent: pct.default(0),
  /** Leave empty to use the GST rate rules for the item's HSN. Ignored while GST is off. */
  gstRate: rate.nullable().optional(),
});
export const poBody = z.object({
  vendorId: objectId,
  storeId: objectId,
  date: z.string().datetime().optional(),
  expectedDate: z.string().datetime().nullable().optional(),
  lines: z.array(poLineBody).min(1).max(200),
  terms: z.string().trim().max(1000).default(''),
  notes: z.string().trim().max(1000).default(''),
});
export const poUpdateBody = patchOf(poBody);
export const taxedLine = z.object({
  taxable: paise, cgst: paise, sgst: paise, igst: paise, total: paise, gross: paise, discount: paise,
});
export const poLineDto = taxedLine.extend({
  id: objectId, variantId: objectId, itemCode: z.string(), description: z.string(),
  qty: z.number().int(), receivedQty: z.number().int(), pendingQty: z.number().int(),
  unitCost: paise, discountPercent: z.number(), gstRate: z.number().nullable(),
});
export const poDto = z.object({
  id: objectId, poNumber: z.string(), status: z.enum(PO_STATUSES),
  vendorId: objectId, vendorName: z.string(), vendorStateCode: z.string(), storeId: objectId, storeName: z.string(),
  date: z.string(), expectedDate: z.string().nullable(), lines: z.array(poLineDto), totals: totalsDto,
  gstMode: gstModeEnum, supply: supplyEnum.nullable(), terms: z.string(), notes: z.string(),
  requiresApproval: z.boolean(), approvalLimit: paise, approvedBy: z.string().nullable(), approvedAt: z.string().nullable(), sentAt: z.string().nullable(),
  version: z.number().int(), createdAt: z.string(),
});
export const poQuery = z.object({ vendorId: objectId.optional(), poStatus: z.enum(PO_STATUSES).optional() });
export const poFromAlertsBody = z.object({ vendorId: objectId, storeId: objectId, variantIds: z.array(objectId).max(200).optional() });

// ---------- goods receipt ----------
export const grnLineBody = z.object({
  poLineId: objectId.optional(),
  variantId: objectId,
  receivedQty: z.number().int().min(0).max(1_000_000),
  rejectedQty: z.number().int().min(0).default(0),
  /** Direct receipts need these. For lines from a PO they default to the PO line. */
  unitCost: money.optional(),
  discountPercent: pct.optional(),
  gstRate: rate.nullable().optional(),
  batchRef: z.string().trim().max(40).optional(),
  binLocation: z.string().trim().max(40).optional(),
});
export const grnBody = z.object({
  poId: objectId.optional(),
  vendorId: objectId.optional(),
  storeId: objectId.optional(),
  vendorInvoiceNo: z.string().trim().min(1).max(40),
  vendorInvoiceDate: z.string().datetime(),
  /** Freight (excluding GST) shared across accepted lines by value. It becomes part of the landed cost. */
  freight: money.default(0),
  /** Needed when more is received than was ordered. Requires purchase.approve. */
  approveOverReceipt: z.boolean().default(false),
  lines: z.array(grnLineBody).min(1).max(200),
  notes: z.string().trim().max(1000).default(''),
});
export const grnLineDto = taxedLine.extend({
  id: objectId, poLineId: objectId.nullable(), variantId: objectId, itemCode: z.string(), description: z.string(),
  orderedQty: z.number().int().nullable(), receivedQty: z.number().int(), rejectedQty: z.number().int(), acceptedQty: z.number().int(),
  unitCost: paise, discountPercent: z.number(), gstRate: z.number().nullable(),
  /** Landed unit cost excluding GST: taxable plus freight share, per accepted piece. This is what feeds the weighted average cost. */
  landedUnitCost: paise, batchRef: z.string().nullable(), binLocation: z.string().nullable(),
  billedQty: z.number().int(), returnedQty: z.number().int(),
});
export const grnDto = z.object({
  id: objectId, grnNumber: z.string(), status: z.enum(['open', 'partly_billed', 'billed']),
  poId: objectId.nullable(), poNumber: z.string().nullable(), vendorId: objectId, vendorName: z.string(), vendorStateCode: z.string(),
  storeId: objectId, storeName: z.string(), vendorInvoiceNo: z.string(), vendorInvoiceDate: z.string(), date: z.string(),
  lines: z.array(grnLineDto), freight: paise, totals: totalsDto, gstMode: gstModeEnum, supply: supplyEnum.nullable(),
  overReceiptApproved: z.boolean(), notes: z.string(), createdAt: z.string(),
});

// ---------- purchase bill ----------
export const billBody = z.object({
  vendorId: objectId,
  vendorBillNo: z.string().trim().min(1).max(40),
  billDate: z.string().datetime(),
  grnIds: z.array(objectId).min(1).max(50),
  /** Amounts on the vendor's bill. They are payable but are not part of stock cost (freight on the GRN is). No GST on these. */
  freight: money.default(0),
  /** Freight on the vendor's bill belongs to the goods: it is shared across the billed lines by value and added to the cost of the pieces still in stock. Turn off when the freight was already entered on the goods receipt, or is not part of the goods cost. */
  addFreightToCost: z.boolean().default(true),
  otherCharges: money.default(0),
  /** Rounding on the vendor's bill, between -50 and +50 paise. */
  roundOff: z.number().int().min(-50).max(50).default(0),
  notes: z.string().trim().max(1000).default(''),
});
/** Where a purchase bill stands: nothing paid yet, part paid (or credited or settled), or fully cleared. */
export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'] as const;
export const billDto = z.object({
  id: objectId, billNumber: z.string(), vendorBillNo: z.string(), vendorId: objectId, vendorName: z.string(), billDate: z.string(), dueDate: z.string(),
  paymentTerms: z.string(), grnIds: z.array(objectId), grnNumbers: z.array(z.string()),
  lines: z.array(grnLineDto.pick({ variantId: true, itemCode: true, description: true, acceptedQty: true, unitCost: true, discountPercent: true, gstRate: true, taxable: true, cgst: true, sgst: true, igst: true, total: true })),
  totals: totalsDto, freight: paise, otherCharges: paise, roundOff: paise, grandTotal: paise,
  gstMode: gstModeEnum, supply: supplyEnum.nullable(), inputTaxCredit: paise,
  paid: paise, debitNotes: paise, settled: paise, outstanding: paise, paymentStatus: z.enum(PAYMENT_STATUSES), notes: z.string(), createdAt: z.string(),
  /** How much of the bill's freight was added to item cost, and why not when it was not. */
  freightCostAdded: paise, freightNote: z.string(),
});
export const billQuery = z.object({ vendorId: objectId.optional(), billStatus: z.enum(['open', 'paid']).optional(), paymentStatus: z.enum(PAYMENT_STATUSES).optional() });

// ---------- purchase return and debit note ----------
export const returnBody = z.object({
  billId: objectId.optional(),
  grnId: objectId.optional(),
  storeId: objectId.optional(),
  reason: z.string().trim().min(2).max(300),
  lines: z.array(z.object({ variantId: objectId, qty })).min(1).max(100),
});
export const returnDto = z.object({
  id: objectId, returnNumber: z.string(), debitNoteNumber: z.string(), vendorId: objectId, vendorName: z.string(),
  billId: objectId.nullable(), billNumber: z.string().nullable(), grnId: objectId.nullable(), storeId: objectId, reason: z.string(),
  lines: z.array(taxedLine.extend({ variantId: objectId, itemCode: z.string(), qty: z.number().int(), unitCost: paise, gstRate: z.number().nullable() })),
  totals: totalsDto, gstMode: gstModeEnum, createdAt: z.string(),
});

// ---------- vendor payment ----------
export const paymentBody = z.object({
  vendorId: objectId,
  date: z.string().datetime(),
  mode: z.enum(PAY_MODES),
  reference: z.string().trim().max(60).default(''),
  amount: z.number().int().min(1),
  /** Which bills this settles. Anything not allocated stays as an advance for the vendor. */
  allocations: z.array(z.object({ billId: objectId, amount: z.number().int().min(1) })).max(100).default([]),
  notes: z.string().trim().max(500).default(''),
});
export const paymentDto = z.object({
  id: objectId, paymentNumber: z.string(), vendorId: objectId, vendorName: z.string(), date: z.string(), mode: z.enum(PAY_MODES), reference: z.string(),
  amount: paise, allocated: paise, advance: paise, allocations: z.array(z.object({ billId: objectId, billNumber: z.string(), amount: paise })), currency, createdAt: z.string(),
});
export const ageingDto = z.object({ current: paise, d0_30: paise, d31_60: paise, d61_90: paise, over90: paise });
export const outstandingDto = z.object({
  vendorId: objectId, vendorName: z.string(), paymentTerms: z.string(),
  billed: paise, debitNotes: paise, paid: paise, settled: paise, outstanding: paise, advance: paise, netPayable: paise, currency,
  ageing: ageingDto,
  bills: z.array(z.object({ billId: objectId, billNumber: z.string(), vendorBillNo: z.string(), billDate: z.string(), dueDate: z.string(), total: paise, debitNotes: paise, paid: paise, settled: paise, outstanding: paise, daysOverdue: z.number().int() })),
});

// ---------- vendor settlements ----------
export const settlementBody = z.object({
  billId: objectId,
  date: z.string().datetime(),
  /** full clears what is left on the bill; partial takes off `amount`. */
  kind: z.enum(['full', 'partial']),
  amount: z.number().int().min(1).optional(),
  reason: z.string().trim().min(3).max(300),
});
export const settlementDto = z.object({
  id: objectId, settlementNumber: z.string(), vendorId: objectId, vendorName: z.string(), billId: objectId, billNumber: z.string(), date: z.string(),
  kind: z.enum(['full', 'partial']), amount: paise, reason: z.string(), currency, createdAt: z.string(),
});
