import { z } from 'zod';

/**
 * Master data contracts used by the F1 screens. The backend spec for B1 is not published yet, so these are
 * proposals (see docs/api-requests.md). Money is always integer paise. Stock Status is computed by the API, never typed.
 */
export const STOCK_STATUSES = ['In Stock', 'Low Stock', 'Out of Stock'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const variantDto = z.object({
  id: z.string(),
  size: z.string(),
  color: z.string(),
  mrp: z.number().int(),
  selling: z.number().int(),
  offer: z.number().int().nullable(),
  cost: z.number().int(),
  reorderLevel: z.number().int(),
  bin: z.string(),
  barcode: z.string(),
  batch: z.string().optional(),
  /** Read only. Quantity per store id. */
  stock: z.record(z.string(), z.number().int()),
});
export type Variant = z.infer<typeof variantDto>;

export const ITEM_ISSUES = ['MISSING_HSN', 'SIZE_PLACEHOLDER', 'MISSING_MRP', 'MISSING_RATE', 'NEGATIVE_STOCK'] as const;
export type ItemIssue = (typeof ITEM_ISSUES)[number];
export const ISSUE_LABELS: Record<ItemIssue, string> = {
  MISSING_HSN: 'No HSN code',
  SIZE_PLACEHOLDER: 'Size is a placeholder',
  MISSING_MRP: 'No MRP',
  MISSING_RATE: 'No selling price',
  NEGATIVE_STOCK: 'Stock is below zero',
};

/** Problems the import can flag on a row, as the API names them. */
export const REVIEW_LABELS: Record<string, string> = {
  MISSING_SIZE: 'No size', ODD_SIZE: 'Unusual size', MULTI_SIZE: 'Several sizes in one row', MISSING_CATEGORY: 'No category', MISSING_BRAND: 'No brand', MISSING_MODEL: 'No model',
  MISSING_HSN: 'No HSN code', INVALID_HSN: 'HSN is not valid', HSN_NO_RATE: 'HSN has no GST rate', NO_PRICE: 'No price', MRP_RAISED: 'MRP was below the selling price', NO_COST: 'Stock has no cost',
  NEGATIVE_QTY: 'Quantity is below zero', ODD_CODE: 'Unusual item code',
};

export const itemDto = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  category: z.string(),
  brand: z.string(),
  model: z.string(),
  type: z.string(),
  hsn: z.string(),
  description: z.string(),
  active: z.boolean(),
  imageKeys: z.array(z.string()),
  videoKey: z.string().nullable(),
  sizeChartKey: z.string().nullable(),
  variants: z.array(variantDto),
  stockStatus: z.enum(STOCK_STATUSES),
  totalStock: z.number().int(),
  importBatchId: z.string().nullable(),
  issues: z.array(z.string()),
});
export type Item = z.infer<typeof itemDto>;

export const storeDto = z.object({ id: z.string(), name: z.string() });
export type Store = z.infer<typeof storeDto>;

/** Body for create and update. Prices are paise. */
export const itemBody = z.object({
  code: z.string().trim().min(1, 'Item code is required').max(40),
  name: z.string().trim().min(2, 'Name is required').max(150),
  category: z.string().trim().min(1, 'Product category is required').max(60),
  brand: z.string().trim().max(60),
  model: z.string().trim().min(1, 'Model or style number is required').max(60),
  type: z.string().trim().min(1, 'Type is required').max(60),
  hsn: z.string().trim().regex(/^(\d{4}|\d{6}|\d{8})?$/, 'HSN is 4, 6 or 8 digits'),
  description: z.string().max(2000),
  active: z.boolean(),
  imageKeys: z.array(z.string()),
  videoKey: z.string().nullable(),
  sizeChartKey: z.string().nullable(),
  variants: z.array(variantDto.omit({ stock: true }).extend({ id: z.string().optional() })).min(1, 'Add at least one size'),
});
export type ItemBody = z.infer<typeof itemBody>;

export const listEnvelope = <T extends z.ZodType>(t: T) => z.object({ items: z.array(t), total: z.number().int(), nextPage: z.number().int().nullable() });

export const facetsDto = z.object({ categories: z.array(z.string()), brands: z.array(z.string()), stores: z.array(storeDto) });

export const vendorDto = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  contactPerson: z.string(),
  email: z.string(),
  mobile: z.string(),
  address: z.string(),
  city: z.string(),
  stateCode: z.string(),
  gstin: z.string(),
  pan: z.string(),
  paymentTerms: z.string(),
  glAccount: z.string(),
  /** Read only, paise. */
  outstanding: z.number().int(),
  active: z.boolean(),
});
export type Vendor = z.infer<typeof vendorDto>;

const gstinFormat = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const panFormat = /^[A-Z]{5}\d{4}[A-Z]$/;
export const STATES: Array<[string, string]> = [['33', 'Tamil Nadu'], ['32', 'Kerala'], ['29', 'Karnataka'], ['37', 'Andhra Pradesh'], ['36', 'Telangana'], ['27', 'Maharashtra'], ['24', 'Gujarat'], ['07', 'Delhi'], ['19', 'West Bengal'], ['09', 'Uttar Pradesh']];

export const vendorBody = z.object({
  name: z.string().trim().min(2, 'Vendor name is required').max(150),
  contactPerson: z.string().trim().max(100),
  email: z.string().trim().email('Enter a valid email'),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10 digit Indian mobile number'),
  address: z.string().trim().max(200),
  city: z.string().trim().max(80),
  stateCode: z.string().regex(/^\d{2}$/, 'Choose a state'),
  // Optional here: the server asks for a vendor GSTIN only while GST is on, and takes the PAN from the GSTIN when it is left empty.
  gstin: z.string().trim().toUpperCase().regex(gstinFormat, 'GSTIN format is not valid').or(z.literal('')),
  pan: z.string().trim().toUpperCase().regex(panFormat, 'PAN format is not valid').or(z.literal('')),
  paymentTerms: z.string().trim().min(1, 'Payment terms are required').max(20),
  glAccount: z.string().trim().max(20),
});
export type VendorBody = z.infer<typeof vendorBody>;

export const CUSTOMER_GROUPS = ['Retail Walk-in', 'E-commerce B2C', 'B2B Trade Customer'] as const;
/** Online customers signed up on the website (E-commerce B2C). Offline customers were added at the counter or imported. */
export const CUSTOMER_SOURCES = ['online', 'offline'] as const;
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];
export const customerDto = z.object({
  id: z.string(),
  /** The mock API calls the customer number `code`, the live API calls it `customerId`. */
  code: z.string().optional(),
  customerId: z.string().optional(),
  accountGroup: z.string(),
  /** Older mock data has no source: it is worked out from the account group. */
  source: z.enum(CUSTOMER_SOURCES).optional(),
  name: z.string(),
  email: z.string(),
  mobile: z.string(),
  address: z.string(),
  city: z.string(),
  stateCode: z.string(),
  gstin: z.string(),
  pan: z.string(),
  glAccount: z.string(),
  /** Read only. The live customer list does not send it. */
  outstanding: z.number().int().default(0),
  loyaltyPoints: z.number().int(),
  walletBalance: z.number().int(),
}).transform(({ customerId, code, mobile, ...c }) => ({
  ...c, code: code ?? customerId ?? '',
  // A website sign up with no phone number yet carries a placeholder; show it as empty.
  mobile: mobile.startsWith('pending-') ? '' : mobile,
}));
export type Customer = z.infer<typeof customerDto>;

export const customerBody = z.object({
  accountGroup: z.enum(CUSTOMER_GROUPS),
  name: z.string().trim().min(2, 'Full name is required').max(150),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10 digit Indian mobile number'),
  address: z.string().trim().max(200),
  city: z.string().trim().max(80),
  stateCode: z.string().regex(/^\d{2}$/, 'Choose a state'),
  gstin: z.string().trim().toUpperCase().regex(gstinFormat, 'GSTIN format is not valid').or(z.literal('')),
  pan: z.string().trim().toUpperCase().regex(panFormat, 'PAN format is not valid').or(z.literal('')),
  glAccount: z.string().trim().max(20),
});
export type CustomerBody = z.infer<typeof customerBody>;

export const ledgerEntry = z.object({ id: z.string(), at: z.string(), note: z.string(), amount: z.number().int(), balance: z.number().int() });
export const customerLedgers = z.object({ loyalty: z.array(ledgerEntry), wallet: z.array(ledgerEntry) });

export const hsnRuleDto = z.object({
  hsn: z.string(),
  chapter: z.string(),
  description: z.string(),
  rule: z.string(),
  effectiveFrom: z.string(),
  confirmed: z.boolean(),
});
export type HsnRule = z.infer<typeof hsnRuleDto>;

/* Import and review queue */
export const importSheet = z.object({ name: z.string(), rows: z.number().int(), columns: z.array(z.string()) });
export const IMPORT_TARGETS = [{ key: 'items', label: 'Items and stock' }] as const;
export const IMPORT_FIELDS = [
  { key: 'code', label: 'Item Code (generated when empty)', required: false },
  { key: 'name', label: 'Item name', required: true },
  { key: 'category', label: 'Product Category', required: false },
  { key: 'brand', label: 'Brand', required: false },
  { key: 'model', label: 'Model/Style No', required: false },
  { key: 'size', label: 'Size', required: false },
  { key: 'color', label: 'Colour', required: false },
  { key: 'hsn', label: 'HSN Code', required: false },
  { key: 'qty', label: 'Opening quantity', required: false },
  { key: 'cost', label: 'Base Cost', required: false },
  { key: 'rate', label: 'Selling rate', required: false },
  { key: 'mrp', label: 'Retail MRP', required: false },
  { key: 'batchRef', label: 'Batch number (generated when empty)', required: false },
  { key: 'barcode', label: 'Barcode', required: false },
  { key: 'bin', label: 'Bin location', required: false },
] as const;
export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]['key'];

export const importBatch = z.object({
  id: z.string(),
  fileName: z.string(),
  status: z.enum(['uploaded', 'dry-run', 'committing', 'committed', 'rolled-back']),
  progress: z.number(),
  sheets: z.array(importSheet),
  counts: z.object({ rows: z.number().int(), ok: z.number().int(), warnings: z.number().int(), errors: z.number().int(), items: z.number().int(), pieces: z.number().int() }).nullable(),
  errors: z.array(z.object({ row: z.number().int(), code: z.string(), field: z.string(), message: z.string() })),
  createdAt: z.string(),
});
export type ImportBatch = z.infer<typeof importBatch>;

export const reviewRow = z.object({
  /** Pieces in stock (on hand less reserved), for the split box. */
  onHand: z.number().int().default(0),
  /** The batch number of the stock (for example TK20261121), so old and new stock can be told apart. */
  batch: z.string().default(''),
  id: z.string(),
  itemId: z.string(),
  code: z.string(),
  name: z.string(),
  category: z.string(),
  issue: z.string(),
  size: z.string(),
  hsn: z.string(),
  mrp: z.number().int(),
  suggestedHsn: z.string().nullable(),
  /** Sizes the import found inside a combined size cell. */
  sizes: z.array(z.string()).default([]),
});
export type ReviewRow = z.infer<typeof reviewRow>;
export const dataQuality = z.object({ total: z.number().int(), flagged: z.number().int(), byIssue: z.record(z.string(), z.number().int()), byCategory: z.array(z.object({ category: z.string(), items: z.number().int(), issues: z.number().int() })) });
