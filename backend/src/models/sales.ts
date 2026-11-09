import { defineModel, oid, paise } from './_define';

const money = { ...paise };

export const SalesBill = defineModel('SalesBill', 'sales_bills', {
  invoiceNumber: { type: String },
  status: { type: String, enum: ['draft', 'hold', 'finalized', 'cancelled'], default: 'draft' },
  channel: { type: String, enum: ['POS', 'ECM', 'CNT'], required: true },
  storeId: { ...oid('Store', true) },
  cashierId: { ...oid('User') },
  shiftId: { ...oid('Shift') },
  customerId: { ...oid('Customer') },
  customer: { type: Object, default: {} }, // snapshot at the time: name, mobile, address, stateCode, gstin
  placeOfSupply: { type: String, default: '' },
  supply: { type: String, default: null },
  gstMode: { type: String, enum: ['on', 'off'], default: 'off' },
  lines: [{
    variantId: { ...oid('Variant', true) }, itemCode: String, description: String, hsn: String, size: String,
    qty: Number, mrp: money, unitPrice: money, lineDiscount: money, billDiscountShare: money, gross: money, net: money, rate: { type: Number, default: null },
    taxable: money, cgst: money, sgst: money, igst: money, unitCostAtSale: money, returnedQty: { type: Number, default: 0 },
    discountInput: { type: Object, default: null },
  }],
  billDiscountInput: { type: Object, default: null },
  groups: { type: Array, default: [] },
  totals: { type: Object, default: {} },
  roundOff: { type: Number, default: 0 },
  grandTotal: { ...paise },
  tenders: [{ mode: String, amount: money, reference: String, _id: false }],
  creditDue: { ...paise },
  dueDate: { type: Date, default: null },
  loyaltyEarned: { type: Number, default: 0 },
  loyaltyRedeemed: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  snapshot: { type: Object, default: null }, // everything printed, so an old invoice reprints identically
  exchangeOfReturnId: { ...oid('SalesReturn') },
  orderNumber: { type: String }, // online order number for ECM
  finalizedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  createdBy: { ...oid('User') },
}, [
  [{ invoiceNumber: 1 }, { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string' } } }],
  [{ status: 1, channel: 1, createdAt: -1 }], [{ storeId: 1, finalizedAt: -1 }], [{ customerId: 1 }], [{ finalizedAt: -1 }],
  [{ orderNumber: 1 }, { unique: true, partialFilterExpression: { orderNumber: { $type: 'string' } } }],
], { minimize: false });

export const Shift = defineModel('Shift', 'pos_shifts', {
  storeId: { ...oid('Store', true) },
  cashierId: { ...oid('User', true) },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  openingCash: money, openedAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
  expectedCash: money, countedCash: money, difference: { type: Number, default: 0 }, note: String,
}, [[{ storeId: 1, cashierId: 1, status: 1 }]]);

/** A sales return with its credit note (own CN number). */
export const SalesReturn = defineModel('SalesReturn', 'sales_returns', {
  creditNoteNumber: { type: String, required: true },
  invoiceId: { ...oid('SalesBill', true) },
  invoiceNumber: String,
  channel: String,
  customerId: { ...oid('Customer') },
  customer: { type: Object, default: {} },
  reason: String, note: String,
  gstMode: { type: String, default: 'off' },
  lines: [{ variantId: { ...oid('Variant') }, itemCode: String, description: String, hsn: String, qty: Number, unitPrice: money, net: money, rate: { type: Number, default: null }, taxable: money, cgst: money, sgst: money, igst: money, restockStoreId: { ...oid('Store') }, damaged: Boolean, _id: false }],
  totals: { type: Object, default: {} },
  refundTotal: money,
  refunds: [{ mode: String, amount: money, reference: String, _id: false }],
  refundTo: String,
  exchangeInvoiceId: { ...oid('SalesBill') },
  isCancellation: { type: Boolean, default: false },
  createdBy: { ...oid('User') },
}, [[{ creditNoteNumber: 1 }, { unique: true }], [{ invoiceId: 1 }], [{ createdAt: -1 }]], { minimize: false });
