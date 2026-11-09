import { defineModel, oid } from './_define';

export const ImportBatch = defineModel('ImportBatch', 'import_batches', {
  target: { type: String, enum: ['items', 'vendors', 'customers', 'opening_stock'], required: true },
  fileKey: { type: String, required: true },
  filename: { type: String, required: true },
  sheets: [{ name: String, rows: Number, headers: [String], _id: false }],
  sheet: String,
  headerRow: { type: Number, default: 1 },
  mapping: { type: Object, default: {} }, // targetField -> source header
  mappingName: String,
  options: { type: Object, default: {} }, // storeId, asOf date, ...
  status: { type: String, enum: ['uploaded', 'mapped', 'previewed', 'committing', 'committed', 'rolled_back', 'failed'], default: 'uploaded' },
  preview: { type: Object, default: null }, // counts + first rows
  progress: { processed: { type: Number, default: 0 }, total: { type: Number, default: 0 }, nextRow: { type: Number, default: 0 } },
  result: { type: Object, default: null },
  /** A commit call holds this lock so two calls cannot process the same batch at once. */
  lockUntil: { type: Date, default: null },
  createdBy: { ...oid('User') },
  committedAt: Date,
  rolledBackAt: Date,
}, [[{ createdAt: -1 }], [{ status: 1 }]], { minimize: false });

/** What a batch created or changed, so it can be rolled back exactly. */
export const ImportEffect = defineModel('ImportEffect', 'import_effects', {
  batchId: { ...oid('ImportBatch', true) },
  coll: { type: String, required: true },
  docId: { type: String, required: true },
  action: { type: String, enum: ['created', 'updated'], required: true },
  before: { type: Object, default: null },
}, [[{ batchId: 1, coll: 1 }]], { timestamps: false, minimize: false });

/** Rows that need a human decision (missing size, HSN, multi size ...). */
export const ReviewItem = defineModel('ReviewItem', 'import_review_queue', {
  batchId: { ...oid('ImportBatch', true) },
  rowNumber: Number,
  itemCode: String,
  itemId: { ...oid('Item') },
  variantId: { ...oid('Variant') },
  name: String,
  category: String,
  reasons: [String], // MISSING_SIZE, MISSING_HSN, INVALID_HSN, MULTI_SIZE, MRP_RAISED, NO_PRICE, NEGATIVE_QTY ...
  detail: { type: Object, default: {} },
  suggestion: { type: Object, default: null }, // { hsn, count, total, note }
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  resolvedAt: Date,
  resolvedBy: { ...oid('User') },
}, [[{ status: 1, reasons: 1 }], [{ batchId: 1, rowNumber: 1 }], [{ variantId: 1 }], [{ itemCode: 1 }]], { minimize: false });

/** Saved column mappings, for example the Krishnas Orchids stock sheet. */
export const ImportMapping = defineModel('ImportMapping', 'import_mappings', {
  name: { type: String, required: true },
  target: { type: String, required: true },
  headers: [String], // signature used to auto pick this mapping
  mapping: { type: Object, required: true },
  options: { type: Object, default: {} },
  builtin: { type: Boolean, default: false },
}, [[{ target: 1, name: 1 }, { unique: true }]], { minimize: false });

export const LabelTemplate = defineModel('LabelTemplate', 'label_templates', {
  name: { type: String, required: true },
  widthMm: { type: Number, required: true },
  heightMm: { type: Number, required: true },
  fields: [String], // barcode, name, size, color, mrp, itemCode
  isDefault: { type: Boolean, default: false },
}, [[{ name: 1 }, { unique: true }]]);
