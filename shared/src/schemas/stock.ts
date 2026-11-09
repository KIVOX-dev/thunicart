import { z } from 'zod';
import { objectId } from './common';
import { paise, currency } from './purchase';
import { stockStatus } from './masters';

export const LEDGER_TYPES = ['OPENING', 'GRN', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN', 'ONLINE_ORDER_RESERVE', 'ONLINE_ORDER_RELEASE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'AUDIT'] as const;

// ---------- stock and ledger ----------
export const stockQuery = z.object({
  storeId: objectId.optional(),
  stockStatus: stockStatus.optional(),
  size: z.string().optional(),
  /** true: include variants with no stock at all */
  includeZero: z.enum(['true', 'false']).optional(),
});
export const stockRowDto = z.object({
  variantId: objectId, itemId: objectId, itemCode: z.string(), name: z.string(), size: z.string().nullable(), color: z.string().nullable(),
  storeId: objectId.nullable(), storeName: z.string().nullable(),
  onHand: z.number().int(), reserved: z.number().int(), available: z.number().int(), reorderLevel: z.number().int(), stockStatus,
  baseCost: paise, costValue: paise, mrp: paise, mrpValue: paise,
});
export const stockResponse = z.object({
  items: z.array(stockRowDto), total: z.number().int(), nextPage: z.number().int().nullable(),
  totals: z.object({ onHand: z.number().int(), costValue: paise, mrpValue: paise, currency }),
});
export const ledgerQuery = z.object({
  variantId: objectId.optional(), storeId: objectId.optional(), type: z.enum(LEDGER_TYPES).optional(), docNumber: z.string().optional(),
});
export const ledgerRowDto = z.object({
  id: objectId, at: z.string(), type: z.enum(LEDGER_TYPES), variantId: objectId, itemCode: z.string().nullable(), storeId: objectId, storeName: z.string().nullable(),
  qty: z.number().int(), unitCost: paise, docType: z.string().nullable(), docNumber: z.string().nullable(), userId: objectId.nullable(), note: z.string().nullable(),
});

// ---------- adjustments ----------
export const adjustmentBody = z.object({
  storeId: objectId,
  reason: z.string().trim().min(3).max(200),
  lines: z.array(z.object({
    variantId: objectId,
    /** Signed change in pieces. Negative removes stock (damage, loss). */
    qty: z.number().int().refine((n) => n !== 0, 'Quantity cannot be zero'),
    note: z.string().trim().max(200).optional(),
  })).min(1).max(200),
});
export const adjustmentDto = z.object({
  docNumber: z.string(), storeId: objectId, reason: z.string(),
  lines: z.array(z.object({ variantId: objectId, itemCode: z.string(), qty: z.number().int(), unitCost: paise, onHandAfter: z.number().int() })),
});

// ---------- audits ----------
export const auditStartBody = z.object({
  storeId: objectId,
  categoryId: objectId.optional(),
  binLocation: z.string().trim().max(40).optional(),
  name: z.string().trim().max(80).optional(),
});
export const auditScanBody = z.object({
  barcode: z.string().trim().min(1),
  /** Pieces counted in this scan (default 1). With set: true it replaces the count instead of adding. */
  qty: z.number().int().min(0).max(100000).default(1),
  set: z.boolean().default(false),
});
export const auditApproveBody = z.object({
  /** What to do with items in scope that were never scanned: leave them (default) or treat them as counted zero. */
  uncounted: z.enum(['skip', 'zero']).default('skip'),
});
export const auditLineDto = z.object({
  variantId: objectId, itemCode: z.string(), name: z.string(), size: z.string().nullable(), binLocation: z.string().nullable(),
  systemQty: z.number().int(), countedQty: z.number().int().nullable(), variance: z.number().int(), varianceValue: paise,
  /** Stock is not frozen: true when this item had movements after the audit started. */
  movedDuringAudit: z.boolean(), movementSinceStart: z.number().int(), unitCost: paise,
});
export const auditDto = z.object({
  id: objectId, auditNumber: z.string(), name: z.string(), storeId: objectId, storeName: z.string(), categoryId: objectId.nullable(), binLocation: z.string().nullable(),
  status: z.enum(['in_progress', 'approved']), startedAt: z.string(), approvedAt: z.string().nullable(),
  summary: z.object({ lines: z.number().int(), counted: z.number().int(), uncounted: z.number().int(), withVariance: z.number().int(), movedDuringAudit: z.number().int(), varianceValue: paise, varianceQty: z.number().int(), currency }),
  lines: z.array(auditLineDto),
});
export const auditListDto = auditDto.omit({ lines: true });

// ---------- transfers ----------
export const transferBody = z.object({
  fromStoreId: objectId, toStoreId: objectId,
  lines: z.array(z.object({ variantId: objectId, qty: z.number().int().min(1).max(100000) })).min(1).max(200),
  notes: z.string().trim().max(300).default(''),
});
export const transferReceiveBody = z.object({
  lines: z.array(z.object({ variantId: objectId, receivedQty: z.number().int().min(0) })).min(1),
  /** Close the transfer now. Anything not received becomes a discrepancy. Without it the transfer stays partly received. */
  final: z.boolean().default(false),
  notes: z.string().trim().max(300).default(''),
});
export const transferDto = z.object({
  id: objectId, transferNumber: z.string(), status: z.enum(['requested', 'dispatched', 'partly_received', 'received', 'cancelled']),
  fromStoreId: objectId, fromStoreName: z.string(), toStoreId: objectId, toStoreName: z.string(),
  lines: z.array(z.object({ variantId: objectId, itemCode: z.string(), qty: z.number().int(), dispatchedQty: z.number().int(), receivedQty: z.number().int(), shortQty: z.number().int(), inTransit: z.number().int() })),
  inTransitTotal: z.number().int(), notes: z.string(), requestedAt: z.string(), dispatchedAt: z.string().nullable(), receivedAt: z.string().nullable(),
});
export const discrepancyDto = z.object({
  id: objectId, transferId: objectId, transferNumber: z.string(), variantId: objectId, itemCode: z.string(), qty: z.number().int(),
  fromStoreName: z.string(), toStoreName: z.string(), status: z.enum(['open', 'resolved']), at: z.string(), resolution: z.string().nullable(),
});
export const transferQuery = z.object({ transferStatus: z.enum(['requested', 'dispatched', 'partly_received', 'received', 'cancelled']).optional() });

// ---------- reorder alerts ----------
export const reorderAlertsDto = z.object({
  generatedAt: z.string(),
  groups: z.array(z.object({
    vendorId: objectId.nullable(), vendorName: z.string(),
    items: z.array(z.object({ variantId: objectId, itemCode: z.string(), name: z.string(), size: z.string().nullable(), available: z.number().int(), reorderLevel: z.number().int(), suggestedQty: z.number().int(), lastUnitCost: paise })),
  })),
  totalItems: z.number().int(),
});

// ---------- operations settings ----------
export const operationsSettingsBody = z.object({
  /** An Admin can allow selling below zero. Default off. */
  allowNegativeStock: z.boolean(),
  /** A purchase order above this value (paise, including GST) needs an Admin to approve it. */
  poApprovalLimit: z.number().int().min(0),
  /** Suggested order quantity = reorder level x this, minus what is available. */
  reorderTargetMultiplier: z.number().min(1).max(10),
  /** Each role's maximum discount percent at the counter. Above it a manager PIN is needed. */
  maxDiscountPct: z.record(z.string(), z.number().min(0).max(100)).optional(),
  /** Set or change the manager approval PIN (stored hashed, never returned). */
  managerPin: z.string().min(4).max(20).optional(),
  requireOpenShift: z.boolean().optional(),
  returnWindowDays: z.number().int().min(0).max(365).optional(),
  returnDiscountedItems: z.boolean().optional(),
  defectReportHours: z.number().int().min(1).max(720).optional(),
  loyalty: z.object({ enabled: z.boolean(), pointsPer100: z.number().min(0), pointValuePaise: z.number().int().min(0), minRedeem: z.number().int().min(0), expiryDays: z.number().int().min(0) }).optional(),
});
export const operationsSettingsDto = operationsSettingsBody.omit({ managerPin: true }).extend({ managerPinSet: z.boolean(), version: z.number().int(), updatedAt: z.string() });

export const auditScanResponse = z.object({ itemCode: z.string(), name: z.string(), size: z.string().nullable(), countedQty: z.number().int(), systemQty: z.number().int() });
export const auditApproveResponse = auditDto.extend({ postedLines: z.number().int() });
export const discrepancyResolveBody = z.object({ action: z.enum(['found_at_destination', 'return_to_source', 'write_off']), note: z.string().trim().max(200).default('') });
export const reorderPoQuery = z.object({});
