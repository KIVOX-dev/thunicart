import { defineModel, oid, paise } from './_define';

export const Store = defineModel('Store', 'stores', {
  code: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['shop', 'warehouse', 'online'], required: true },
  address: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, [[{ code: 1 }, { unique: true }], [{ type: 1, active: 1 }]]);

export const Category = defineModel('Category', 'categories', {
  name: { type: String, required: true },
  slug: { type: String, required: true },
  parentId: { ...oid('Category') },
  section: { type: String, enum: ['Men', 'Women', 'Kids', 'Accessories', 'Unisex'] },
  active: { type: Boolean, default: true },
}, [[{ slug: 1 }, { unique: true }], [{ parentId: 1 }]]);

export const Brand = defineModel('Brand', 'brands', {
  name: { type: String, required: true },
  slug: { type: String, required: true },
  active: { type: Boolean, default: true },
}, [[{ slug: 1 }, { unique: true }]]);

export const Hsn = defineModel('Hsn', 'hsn', {
  code: { type: String, required: true }, // text, 4 to 8 digits
  description: { type: String, default: '' },
  chapter: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, [[{ code: 1 }, { unique: true }]]);

export const GstRate = defineModel('GstRate', 'gst_rates', {
  hsnCode: { type: String, required: true },
  ruleType: { type: String, enum: ['flat', 'slab'], required: true },
  /** For slab rules: price per piece in paise at or below which rateBelow applies. */
  slabLimit: { ...paise, default: null },
  rateBelow: { type: Number }, // percent, e.g. 5
  rateAbove: { type: Number },
  rate: { type: Number }, // for flat rules
  effectiveFrom: { type: Date, required: true },
  effectiveTo: { type: Date, default: null },
  confirmed: { type: Boolean, default: false },
  confirmedBy: { ...oid('User') },
}, [[{ hsnCode: 1, effectiveFrom: -1 }]]);

export const Item = defineModel('Item', 'items', {
  name: { type: String, required: true },
  printName: String,
  categoryId: { ...oid('Category') },
  brandId: { ...oid('Brand') },
  model: String,
  type: String,
  fabric: String,
  description: String,
  occasion: String,
  section: { type: String, enum: ['Men', 'Women', 'Kids', 'Accessories', 'Unisex'] },
  hsn: String,
  gstRateOverride: { type: Number, default: null },
  gstOverrideReason: String,
  images: [String],
  video: String,
  sizeChart: String,
  showOnWebsite: { type: Boolean, default: false },
  slug: String,
  active: { type: Boolean, default: true },
  importBatchId: { ...oid('ImportBatch') },
}, [
  [{ categoryId: 1, active: 1 }],
  [{ brandId: 1 }],
  [{ slug: 1 }, { unique: true, sparse: true }],
  [{ name: 'text', printName: 'text', model: 'text' }],
]);

export const Variant = defineModel('Variant', 'variants', {
  itemId: { ...oid('Item', true) },
  itemCode: { type: String, required: true },
  sku: { type: String, required: true },
  barcode: { type: String, required: true },
  size: String,
  color: String,
  mrp: { ...paise },
  sellingPrice: { ...paise },
  offerPrice: { ...paise, default: null },
  baseCost: { ...paise }, // weighted average
  reorderLevel: { type: Number, default: 0 },
  binLocation: String,
  batchRef: String,
  active: { type: Boolean, default: true },
  hasStockHistory: { type: Boolean, default: false },
  /** Set by an import when the source row had no usable price. Cleared when a price is saved. */
  priceMissing: { type: Boolean, default: false },
  importBatchId: { ...oid('ImportBatch') },
}, [
  [{ itemCode: 1 }, { unique: true }],
  [{ sku: 1 }, { unique: true }],
  [{ barcode: 1 }, { unique: true }],
  [{ itemId: 1 }],
]);

/** Append only. A wrong entry is fixed with a reversing entry. */
export const StockLedger = defineModel('StockLedger', 'stock_ledger', {
  variantId: { ...oid('Variant', true) },
  storeId: { ...oid('Store', true) },
  type: {
    type: String, required: true,
    enum: ['OPENING', 'GRN', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN', 'ONLINE_ORDER_RESERVE', 'ONLINE_ORDER_RELEASE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'AUDIT'],
  },
  qty: { type: Number, required: true }, // signed change in on hand (reserve rows change reserved)
  unitCost: { ...paise },
  docType: String,
  docNumber: String,
  docId: String,
  userId: { ...oid('User') },
  at: { type: Date, default: Date.now },
  note: String,
}, [
  [{ variantId: 1, storeId: 1, at: 1 }],
  [{ docType: 1, docNumber: 1 }],
  [{ type: 1, at: -1 }],
], { timestamps: false });

export const StockBalance = defineModel('StockBalance', 'stock_balances', {
  variantId: { ...oid('Variant', true) },
  storeId: { ...oid('Store', true) },
  onHand: { type: Number, default: 0 },
  reserved: { type: Number, default: 0 },
}, [[{ variantId: 1, storeId: 1 }, { unique: true }], [{ storeId: 1 }]]);
