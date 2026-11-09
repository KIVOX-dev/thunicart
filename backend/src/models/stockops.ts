import { defineModel, oid, paise } from './_define';

/** One document of operational settings, edited by an Admin. */
export const AppSettings = defineModel('AppSettings', 'app_settings', {
  singleKey: { type: String, default: 'main' },
  allowNegativeStock: { type: Boolean, default: false },
  poApprovalLimit: { ...paise, default: 5_000_000 }, // Rs 50,000 including GST
  reorderTargetMultiplier: { type: Number, default: 2 },
}, [[{ singleKey: 1 }, { unique: true }]]);

export const StockAudit = defineModel('StockAudit', 'stock_audits', {
  auditNumber: { type: String, required: true },
  name: { type: String, default: '' },
  storeId: { ...oid('Store', true) },
  categoryId: { ...oid('Category') },
  binLocation: { type: String, default: null },
  status: { type: String, enum: ['in_progress', 'approved'], default: 'in_progress' },
  startedAt: { type: Date, required: true },
  approvedAt: { type: Date, default: null },
  approvedBy: { ...oid('User') },
  /** System quantity is a snapshot as at the start: stock is not frozen during an audit. */
  lines: [{ variantId: { ...oid('Variant', true) }, itemCode: String, name: String, size: String, binLocation: String, systemQty: Number, countedQty: { type: Number, default: null }, unitCost: { ...paise }, _id: false }],
  createdBy: { ...oid('User') },
}, [[{ auditNumber: 1 }, { unique: true }], [{ storeId: 1, status: 1 }]], { minimize: false });

export const StockTransfer = defineModel('StockTransfer', 'stock_transfers', {
  transferNumber: { type: String, required: true },
  status: { type: String, enum: ['requested', 'dispatched', 'partly_received', 'received', 'cancelled'], default: 'requested' },
  fromStoreId: { ...oid('Store', true) },
  toStoreId: { ...oid('Store', true) },
  lines: [{ variantId: { ...oid('Variant', true) }, itemCode: String, qty: Number, dispatchedQty: { type: Number, default: 0 }, receivedQty: { type: Number, default: 0 }, shortQty: { type: Number, default: 0 }, unitCost: { ...paise }, _id: false }],
  notes: { type: String, default: '' },
  requestedAt: { type: Date, default: Date.now },
  dispatchedAt: { type: Date, default: null },
  receivedAt: { type: Date, default: null },
  requestedBy: { ...oid('User') },
}, [[{ transferNumber: 1 }, { unique: true }], [{ status: 1 }], [{ fromStoreId: 1 }, {}], [{ toStoreId: 1 }, {}]]);

/** Shortfalls from transfers. They never disappear: someone resolves them. */
export const TransferDiscrepancy = defineModel('TransferDiscrepancy', 'transfer_discrepancies', {
  transferId: { ...oid('StockTransfer', true) },
  transferNumber: String,
  variantId: { ...oid('Variant', true) },
  itemCode: String,
  qty: Number,
  fromStoreId: { ...oid('Store') },
  toStoreId: { ...oid('Store') },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  resolution: { type: String, default: null },
  at: { type: Date, default: Date.now },
}, [[{ status: 1, at: -1 }], [{ transferId: 1 }]]);
