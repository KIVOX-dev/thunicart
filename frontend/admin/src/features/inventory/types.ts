import { z } from 'zod';
import { itemDto, listEnvelope, storeDto } from '../catalog/types';

/**
 * Purchase and inventory contracts for the F2 screens. The B2 spec is not published yet, so these are proposals
 * (see docs/api-requests.md). Money is integer paise. Totals, tax, balances and ageing all come from the API.
 */
export const PO_STATUSES = ['draft', 'approved', 'sent', 'partially-received', 'received', 'cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];
export const PO_STATUS_LABEL: Record<PoStatus, string> = { draft: 'Draft', approved: 'Approved', sent: 'Sent', 'partially-received': 'Partly received', received: 'Received', cancelled: 'Cancelled' };
export const poTone = (s: PoStatus) => (s === 'received' ? 'success' : s === 'cancelled' ? 'danger' : s === 'draft' ? 'neutral' : s === 'partially-received' ? 'warning' : 'accent') as 'success' | 'danger' | 'neutral' | 'warning' | 'accent';

const lineBase = { variantId: z.string(), itemId: z.string(), code: z.string(), name: z.string(), size: z.string() };
export const totalsDto = z.object({ subtotal: z.number().int(), tax: z.number().int().nullable(), total: z.number().int() });

export const poLine = z.object({ id: z.string(), ...lineBase, orderedQty: z.number().int(), receivedQty: z.number().int(), unitCost: z.number().int(), taxRate: z.number().nullable() });
export const poDto = z.object({
  id: z.string(), number: z.string(), vendorId: z.string(), vendorName: z.string(), status: z.enum(PO_STATUSES), date: z.string(), expectedDate: z.string(), notes: z.string(),
  lines: z.array(poLine), totals: totalsDto, pieces: z.number().int(), receivedPieces: z.number().int(),
});
export type Po = z.infer<typeof poDto>;
export const poBody = z.object({
  vendorId: z.string().min(1, 'Choose a vendor'),
  expectedDate: z.string().min(1, 'Choose an expected date'),
  notes: z.string().max(500),
  lines: z.array(z.object({ variantId: z.string(), orderedQty: z.number().int().min(1, 'Quantity must be at least 1'), unitCost: z.number().int().min(0) })).min(1, 'Add at least one item'),
});
export type PoBody = z.infer<typeof poBody>;

export const GRN_WARNINGS = ['SHORT', 'OVER', 'NOT_ON_PO'] as const;
export const grnLine = z.object({ id: z.string(), ...lineBase, orderedQty: z.number().int(), receivedQty: z.number().int(), unitCost: z.number().int(), warning: z.enum(GRN_WARNINGS).nullable() });
export const grnDto = z.object({
  id: z.string(), number: z.string(), poId: z.string().nullable(), poNumber: z.string().nullable(), vendorId: z.string(), vendorName: z.string(), storeId: z.string(), storeName: z.string(),
  status: z.enum(['draft', 'finished']), lines: z.array(grnLine), createdAt: z.string(), finishedAt: z.string().nullable(), lastLineId: z.string().nullable(), pieces: z.number().int(),
});
export type Grn = z.infer<typeof grnDto>;
export type GrnLine = z.infer<typeof grnLine>;
export const WARNING_TEXT: Record<(typeof GRN_WARNINGS)[number], string> = { SHORT: 'Short', OVER: 'More than ordered', NOT_ON_PO: 'Not on the PO' };

export const billDto = z.object({
  id: z.string(), number: z.string(), vendorBillNo: z.string(), vendorId: z.string(), vendorName: z.string(), grnId: z.string().nullable(), grnNumber: z.string().nullable(), date: z.string(), dueDate: z.string(),
  totals: totalsDto, paid: z.number().int(), balance: z.number().int(), status: z.enum(['unpaid', 'part-paid', 'paid']),
});
export type Bill = z.infer<typeof billDto>;
export const billBody = z.object({ grnId: z.string().min(1, 'Choose a receipt'), vendorBillNo: z.string().trim().min(1, 'Vendor bill number is required').max(40), date: z.string().min(1, 'Bill date is required'), dueDate: z.string().min(1, 'Due date is required') });

export const returnDto = z.object({
  id: z.string(), number: z.string(), vendorId: z.string(), vendorName: z.string(), reason: z.string(), date: z.string(), totals: totalsDto,
  lines: z.array(z.object({ ...lineBase, qty: z.number().int(), unitCost: z.number().int() })),
});
export type PurchaseReturn = z.infer<typeof returnDto>;
export const RETURN_REASONS = ['Damaged', 'Wrong item', 'Quality issue', 'Excess supply'] as const;
export const returnBody = z.object({ vendorId: z.string().min(1, 'Choose a vendor'), reason: z.enum(RETURN_REASONS), lines: z.array(z.object({ variantId: z.string(), qty: z.number().int().min(1) })).min(1, 'Add at least one item') });

export const PAY_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque'] as const;
export const paymentDto = z.object({
  id: z.string(), number: z.string(), vendorId: z.string(), vendorName: z.string(), mode: z.string(), reference: z.string(), date: z.string(), amount: z.number().int(),
  settlements: z.array(z.object({ billId: z.string(), billNumber: z.string(), amount: z.number().int() })),
});
export type Payment = z.infer<typeof paymentDto>;
export const paymentBody = z.object({
  vendorId: z.string().min(1), mode: z.enum(PAY_MODES), reference: z.string().max(60),
  settlements: z.array(z.object({ billId: z.string(), amount: z.number().int().min(1) })).min(1, 'Choose at least one bill to settle'),
});

export const ageingRow = z.object({ vendorId: z.string(), vendorName: z.string(), current: z.number().int(), d1to30: z.number().int(), d31to60: z.number().int(), d61to90: z.number().int(), d90plus: z.number().int(), total: z.number().int() });
export type AgeingRow = z.infer<typeof ageingRow>;

/* Stock */
export const LEDGER_TYPES = ['GRN', 'SALE', 'SALE_RETURN', 'RETURN_OUT', 'ADJUSTMENT', 'AUDIT', 'TRANSFER_OUT', 'TRANSFER_IN'] as const;
export const LEDGER_LABEL: Record<string, string> = { GRN: 'Goods received', SALE: 'Sale', SALE_RETURN: 'Customer return', RETURN_OUT: 'Purchase return', ADJUSTMENT: 'Adjustment', AUDIT: 'Stock audit', TRANSFER_OUT: 'Transfer out', TRANSFER_IN: 'Transfer in' };
export const ledgerEntry = z.object({ id: z.string(), at: z.string(), ...lineBase, storeId: z.string(), storeName: z.string(), type: z.string(), qty: z.number().int(), balance: z.number().int(), ref: z.string(), note: z.string() });
export type LedgerEntry = z.infer<typeof ledgerEntry>;
export const ADJUST_REASONS = ['Damaged', 'Lost or stolen', 'Found stock', 'Count correction', 'Opening stock error'] as const;
export const adjustBody = z.object({ variantId: z.string().min(1, 'Choose an item'), storeId: z.string().min(1, 'Choose a store'), delta: z.number().int().refine((n) => n !== 0, 'Enter a quantity other than zero'), reason: z.enum(ADJUST_REASONS), note: z.string().max(200) });
export const reorderRow = z.object({ ...lineBase, onHand: z.number().int(), reorderLevel: z.number().int(), vendorId: z.string().nullable() });
export type ReorderRow = z.infer<typeof reorderRow>;

export const auditDto = z.object({
  id: z.string(), number: z.string(), storeId: z.string(), storeName: z.string(), status: z.enum(['counting', 'review', 'approved']), scope: z.string(), createdAt: z.string(),
  lines: z.array(z.object({ ...lineBase, expected: z.number().int(), counted: z.number().int(), variance: z.number().int() })), scans: z.number().int(), notCounted: z.number().int(), lastVariantId: z.string().nullable(),
});
export type Audit = z.infer<typeof auditDto>;

export const transferDto = z.object({
  id: z.string(), number: z.string(), fromStoreId: z.string(), toStoreId: z.string(), fromName: z.string(), toName: z.string(), status: z.enum(['requested', 'in-transit', 'received', 'cancelled']), createdAt: z.string(),
  lines: z.array(z.object({ id: z.string(), ...lineBase, qty: z.number().int(), receivedQty: z.number().int() })), lastLineId: z.string().nullable(), pieces: z.number().int(),
});
export type Transfer = z.infer<typeof transferDto>;
export const TRANSFER_LABEL = { requested: 'Requested', 'in-transit': 'In transit', received: 'Received', cancelled: 'Cancelled' } as const;

export const poList = listEnvelope(poDto);
export const grnList = listEnvelope(grnDto);
export const billList = listEnvelope(billDto);
export const returnList = listEnvelope(returnDto);
export const paymentList = listEnvelope(paymentDto);
export const ledgerList = listEnvelope(ledgerEntry);
export { itemDto, storeDto };

export const auditTone = (s: string) => (s === 'approved' ? 'success' : s === 'review' ? 'warning' : 'accent') as 'success' | 'warning' | 'accent';
export const auditLabel = (s: string) => (s === 'approved' ? 'Approved' : s === 'review' ? 'In review' : 'Counting');
export const transferTone = (s: string) => (s === 'received' ? 'success' : s === 'cancelled' ? 'danger' : s === 'in-transit' ? 'warning' : 'accent') as 'success' | 'danger' | 'warning' | 'accent';
