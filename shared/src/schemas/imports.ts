import { z } from 'zod';
import { objectId } from './common';

export const IMPORT_TARGETS = ['items', 'vendors', 'customers', 'opening_stock'] as const;
export const importTarget = z.enum(IMPORT_TARGETS);

export const presignBody = z.object({
  purpose: z.enum(['image', 'video', 'pdf', 'size_chart', 'import']),
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(3).max(100),
  size: z.number().int().min(1),
});
export const presignResponse = z.object({
  key: z.string(), uploadUrl: z.string(), method: z.literal('PUT'), headers: z.record(z.string(), z.string()), expiresInSeconds: z.number().int(),
  maxBytes: z.number().int(),
});

export const importCreateBody = z.object({ fileKey: z.string().min(3).max(300), filename: z.string().min(1).max(200), target: importTarget });
export const importMappingBody = z.object({
  sheet: z.string().min(1),
  headerRow: z.number().int().min(1).max(50).default(1),
  /** Target field -> source column header. Fields not listed are ignored. */
  mapping: z.record(z.string(), z.string()),
  /** Only for opening stock: store to post the opening balance to, and the as-of date. */
  storeId: objectId.optional(),
  asOf: z.string().optional(),
  saveMappingAs: z.string().trim().min(2).max(60).optional(),
});
export const importCommitBody = z.object({ maxSeconds: z.number().int().min(1).max(25).default(20) });

export const importCounts = z.object({ new: z.number().int(), updated: z.number().int(), skipped: z.number().int(), failed: z.number().int(), reviewFlagged: z.number().int() });
export const importDto = z.object({
  id: objectId, target: importTarget, filename: z.string(),
  status: z.enum(['uploaded', 'mapped', 'previewed', 'committing', 'committed', 'rolled_back', 'failed']),
  sheets: z.array(z.object({ name: z.string(), rows: z.number().int(), headers: z.array(z.string()) })),
  sheet: z.string().nullable(), mapping: z.record(z.string(), z.string()), mappingName: z.string().nullable(),
  suggestedMapping: z.object({ name: z.string(), sheet: z.string().nullable(), mapping: z.record(z.string(), z.string()) }).nullable(),
  progress: z.object({ processed: z.number().int(), total: z.number().int() }),
  counts: importCounts.nullable(),
  createdAt: z.string(), committedAt: z.string().nullable(),
});
export const importPreviewResponse = z.object({
  importId: objectId, counts: importCounts,
  totals: z.object({ rows: z.number().int(), pieces: z.number().int(), costValue: z.number().int(), currency: z.literal('INR') }),
  sample: z.array(z.record(z.string(), z.unknown())),
  errors: z.array(z.object({ row: z.number().int(), code: z.string().nullable(), message: z.string() })).max(200),
  errorCount: z.number().int(),
  notes: z.array(z.string()),
});
export const importCommitResponse = z.object({
  importId: objectId, status: z.enum(['committing', 'committed']), processed: z.number().int(), total: z.number().int(),
  counts: importCounts, done: z.boolean(),
});
export const importRollbackResponse = z.object({ importId: objectId, removed: z.object({ items: z.number().int(), variants: z.number().int(), ledgerRows: z.number().int(), others: z.number().int() }), reverted: z.number().int() });

export const REVIEW_REASONS = ['MISSING_SIZE', 'MISSING_CATEGORY', 'MISSING_BRAND', 'MISSING_MODEL', 'MISSING_HSN', 'INVALID_HSN', 'HSN_NO_RATE', 'MULTI_SIZE', 'ODD_SIZE', 'MRP_RAISED', 'NO_PRICE', 'NEGATIVE_QTY', 'NO_COST', 'ODD_CODE'] as const;
export const reviewItemDto = z.object({
  id: objectId, batchId: objectId, rowNumber: z.number().int().nullable(), itemCode: z.string(), itemId: objectId.nullable(), variantId: objectId.nullable(),
  name: z.string(), category: z.string().nullable(), reasons: z.array(z.string()), detail: z.record(z.string(), z.unknown()),
  suggestion: z.object({ hsn: z.string(), count: z.number().int(), total: z.number().int(), note: z.string() }).nullable(),
  status: z.enum(['open', 'resolved']),
});
export const reviewQuery = z.object({ reason: z.enum(REVIEW_REASONS).optional(), batchId: objectId.optional(), reviewStatus: z.enum(['open', 'resolved']).optional() });
export const reviewBulkBody = z.object({
  ids: z.array(objectId).min(1).max(1000).optional(),
  /** Alternatively apply to every open row with this reason. */
  reason: z.enum(REVIEW_REASONS).optional(),
  batchId: objectId.optional(),
  action: z.enum(['apply_suggestion', 'set', 'split_sizes', 'dismiss']),
  set: z.object({
    hsn: z.string().regex(/^(\d{4}|\d{6}|\d{8})$/).optional(),
    size: z.string().trim().max(30).optional(),
    category: z.string().trim().max(80).optional(),
    brand: z.string().trim().max(80).optional(),
    model: z.string().trim().max(100).optional(),
    mrp: z.number().int().min(1).optional(),
    sellingPrice: z.number().int().min(0).optional(),
  }).optional(),
  /** For split_sizes: the sizes this combined row should become. If omitted the detected sizes are used. */
  sizes: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
  /** For split_sizes: pieces for each size, in the same order as sizes. The first size keeps the original row and whatever is not given to the others. */
  quantities: z.array(z.number().int().min(0)).max(12).optional(),
});
export const reviewBulkResponse = z.object({ updated: z.number().int(), resolved: z.number().int(), stillOpen: z.number().int(), skipped: z.number().int() });
export const mappingDto = z.object({ id: objectId, name: z.string(), target: importTarget, mapping: z.record(z.string(), z.string()), builtin: z.boolean() });
export const dataQualityQuery = z.object({ batchId: objectId.optional(), format: z.enum(['json', 'csv']).default('json') });
export const dataQualityResponse = z.object({
  generatedAt: z.string(),
  summary: z.record(z.string(), z.number().int()),
  rows: z.array(reviewItemDto),
  hsnWithoutRate: z.array(z.object({ hsn: z.string(), items: z.number().int() })),
  /** All sizes in stock, and how many of them still have a problem to review, so the report can say how many are clean. */
  totalVariants: z.number().int(), flagged: z.number().int(),
});

/** Every sheet row as the import sees it: cleaned values, generated product code and batch number, and what happens to the row. Money is in paise. */
export const importProcessedRow = z.object({
  row: z.number().int(), status: z.enum(['new', 'updated', 'skipped', 'failed']), message: z.string(),
  itemCode: z.string(), codeGenerated: z.boolean(), batchNumber: z.string(), batchGenerated: z.boolean(),
  product: z.string(), variantsInProduct: z.number().int(),
  name: z.string(), category: z.string(), brand: z.string(), model: z.string(), size: z.string(), color: z.string(), hsn: z.string(), barcode: z.string(),
  qty: z.number(), baseCost: z.number().int(), sellingPrice: z.number().int(), mrp: z.number().int(),
  attributes: z.record(z.string(), z.string()), flags: z.array(z.string()),
});
export const importProcessedResponse = z.object({
  items: z.array(importProcessedRow), total: z.number().int(), nextPage: z.number().int().nullable(),
  summary: z.object({ new: z.number().int(), updated: z.number().int(), skipped: z.number().int(), failed: z.number().int(), generatedCodes: z.number().int(), batchNumbers: z.array(z.string()) }),
});
