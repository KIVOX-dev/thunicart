import { defineModel, oid, paise } from './_define';

const taxLine = {
  qty: Number, unitCost: { ...paise }, discountPercent: { type: Number, default: 0 }, gstRate: { type: Number, default: null },
  gross: { ...paise }, discount: { ...paise }, taxable: { ...paise }, cgst: { ...paise }, sgst: { ...paise }, igst: { ...paise }, total: { ...paise },
};
const totals = { taxable: { ...paise }, cgst: { ...paise }, sgst: { ...paise }, igst: { ...paise }, tax: { ...paise }, total: { ...paise } };

export const PurchaseOrder = defineModel('PurchaseOrder', 'purchase_orders', {
  poNumber: { type: String, required: true },
  status: { type: String, enum: ['draft', 'approved', 'sent', 'partly_received', 'closed', 'cancelled'], default: 'draft' },
  vendorId: { ...oid('Vendor', true) },
  storeId: { ...oid('Store', true) },
  date: { type: Date, required: true },
  expectedDate: { type: Date, default: null },
  lines: [{
    variantId: { ...oid('Variant', true) }, itemCode: String, description: String, receivedQty: { type: Number, default: 0 }, ...taxLine,
  }],
  totals,
  gstMode: { type: String, enum: ['on', 'off'], default: 'off' },
  supply: { type: String, enum: ['intra', 'inter'], default: null },
  terms: { type: String, default: '' },
  notes: { type: String, default: '' },
  requiresApproval: { type: Boolean, default: false },
  approvalLimit: { ...paise },
  approvedBy: { ...oid('User') },
  approvedAt: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  createdBy: { ...oid('User') },
}, [[{ poNumber: 1 }, { unique: true }], [{ vendorId: 1, status: 1 }], [{ status: 1, date: -1 }], [{ date: -1 }]]);

export const Grn = defineModel('Grn', 'grns', {
  grnNumber: { type: String, required: true },
  status: { type: String, enum: ['open', 'partly_billed', 'billed'], default: 'open' },
  poId: { ...oid('PurchaseOrder') },
  vendorId: { ...oid('Vendor', true) },
  storeId: { ...oid('Store', true) },
  vendorInvoiceNo: { type: String, required: true },
  vendorInvoiceDate: { type: Date, required: true },
  date: { type: Date, required: true },
  lines: [{
    poLineId: { ...oid('PurchaseOrder') }, variantId: { ...oid('Variant', true) }, itemCode: String, description: String,
    orderedQty: { type: Number, default: null }, receivedQty: Number, rejectedQty: { type: Number, default: 0 }, acceptedQty: Number,
    landedUnitCost: { ...paise }, batchRef: String, binLocation: String, billedQty: { type: Number, default: 0 }, returnedQty: { type: Number, default: 0 }, returnedBilledQty: { type: Number, default: 0 }, ...taxLine,
  }],
  freight: { ...paise },
  totals,
  gstMode: { type: String, enum: ['on', 'off'], default: 'off' },
  supply: { type: String, enum: ['intra', 'inter'], default: null },
  overReceiptApproved: { type: Boolean, default: false },
  notes: { type: String, default: '' },
  createdBy: { ...oid('User') },
}, [
  [{ grnNumber: 1 }, { unique: true }],
  [{ vendorId: 1, vendorInvoiceNo: 1 }, { unique: true }], // the same vendor invoice cannot be received twice
  [{ poId: 1 }], [{ status: 1 }], [{ date: -1 }],
]);

export const PurchaseBill = defineModel('PurchaseBill', 'purchase_bills', {
  billNumber: { type: String, required: true },
  vendorBillNo: { type: String, required: true },
  vendorBillKey: { type: String, required: true }, // lower case, for the unique check
  vendorId: { ...oid('Vendor', true) },
  billDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  paymentTerms: String,
  grnIds: [{ ...oid('Grn') }],
  grnNumbers: [String],
  lines: [{ variantId: { ...oid('Variant') }, itemCode: String, description: String, acceptedQty: Number, ...taxLine }],
  totals,
  freight: { ...paise }, otherCharges: { ...paise }, roundOff: { type: Number, default: 0 }, grandTotal: { ...paise },
  freightCostAdded: { ...paise }, freightNote: { type: String, default: '' }, freightAllocation: { type: [Object], default: [] },
  gstMode: { type: String, enum: ['on', 'off'], default: 'off' },
  supply: { type: String, enum: ['intra', 'inter'], default: null },
  inputTaxCredit: { ...paise },
  paid: { ...paise }, debitNotes: { ...paise },
  /** Part of the bill the Admin marked as settled without a payment (negotiated discount, write off). Each one is a VendorSettlement. */
  settled: { ...paise },
  notes: { type: String, default: '' },
  createdBy: { ...oid('User') },
}, [
  [{ billNumber: 1 }, { unique: true }],
  [{ vendorId: 1, vendorBillKey: 1 }, { unique: true }], // vendor bill number is unique per vendor: duplicates are blocked
  [{ vendorId: 1, dueDate: 1 }], [{ billDate: -1 }],
]);

/** A purchase return. It also carries the debit note (own DN number). */
export const PurchaseReturn = defineModel('PurchaseReturn', 'purchase_returns', {
  returnNumber: { type: String, required: true },
  debitNoteNumber: { type: String, required: true },
  vendorId: { ...oid('Vendor', true) },
  billId: { ...oid('PurchaseBill') },
  billNumber: String,
  grnId: { ...oid('Grn') },
  storeId: { ...oid('Store', true) },
  reason: String,
  lines: [{ variantId: { ...oid('Variant', true) }, itemCode: String, ...taxLine }],
  totals,
  gstMode: { type: String, enum: ['on', 'off'], default: 'off' },
  createdBy: { ...oid('User') },
}, [[{ returnNumber: 1 }, { unique: true }], [{ debitNoteNumber: 1 }, { unique: true }], [{ vendorId: 1 }], [{ billId: 1 }]]);

export const VendorPayment = defineModel('VendorPayment', 'vendor_payments', {
  paymentNumber: { type: String, required: true },
  vendorId: { ...oid('Vendor', true) },
  date: { type: Date, required: true },
  mode: { type: String, enum: ['cash', 'bank', 'upi', 'cheque'], required: true },
  reference: { type: String, default: '' },
  amount: { ...paise },
  allocations: [{ billId: { ...oid('PurchaseBill') }, billNumber: String, amount: { ...paise } }],
  notes: { type: String, default: '' },
  createdBy: { ...oid('User') },
}, [[{ paymentNumber: 1 }, { unique: true }], [{ vendorId: 1, date: -1 }]]);

/** The Admin marks vendor outstanding as settled, fully or partly, without a cash payment (agreed discount, write off, contra). Cash payments stay in VendorPayment. */
export const VendorSettlement = defineModel('VendorSettlement', 'vendor_settlements', {
  settlementNumber: { type: String, required: true },
  vendorId: { ...oid('Vendor', true) },
  billId: { ...oid('PurchaseBill', true) },
  billNumber: String,
  date: { type: Date, required: true },
  kind: { type: String, enum: ['full', 'partial'], required: true },
  amount: { ...paise },
  reason: { type: String, required: true },
  createdBy: { ...oid('User') },
}, [[{ settlementNumber: 1 }, { unique: true }], [{ vendorId: 1, date: -1 }], [{ billId: 1 }]]);
