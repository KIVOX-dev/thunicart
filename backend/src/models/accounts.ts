import { defineModel, oid, paise } from './_define';

export const ExpenseCategory = defineModel('ExpenseCategory', 'expense_categories', {
  name: { type: String, required: true }, slug: { type: String, required: true }, active: { type: Boolean, default: true },
}, [[{ slug: 1 }, { unique: true }]]);

export const Expense = defineModel('Expense', 'expenses', {
  /** A charge is a cost that is not an operating expense: bank, card and payment gateway fees, delivery charges, penalties. */
  kind: { type: String, enum: ['expense', 'charge'], default: 'expense' },
  category: { type: String, required: true }, payee: { type: String, default: '' }, date: { type: Date, required: true },
  mode: { type: String, enum: ['cash', 'bank', 'upi', 'cheque', 'card'], required: true }, amount: { ...paise }, notes: { type: String, default: '' },
  receiptKey: { type: String, default: null }, storeId: { ...oid('Store') }, createdBy: { ...oid('User') },
}, [[{ date: -1 }], [{ category: 1, date: -1 }], [{ kind: 1, date: -1 }]]);

/** Money received from a customer (B2B on credit, advance). Reduces what they owe. */
export const Receipt = defineModel('Receipt', 'customer_receipts', {
  receiptNumber: { type: String, required: true }, customerId: { ...oid('Customer', true) }, date: { type: Date, required: true },
  mode: { type: String, enum: ['cash', 'bank', 'upi', 'cheque', 'card'], required: true }, amount: { ...paise }, reference: { type: String, default: '' },
  invoiceId: { ...oid('SalesBill') }, notes: { type: String, default: '' }, createdBy: { ...oid('User') },
}, [[{ receiptNumber: 1 }, { unique: true }], [{ customerId: 1, date: -1 }]]);

/** Any other payment out that is not a vendor payment or an expense (for example a deposit). */
export const PaymentVoucher = defineModel('PaymentVoucher', 'payment_vouchers', {
  voucherNumber: { type: String, required: true }, payee: { type: String, required: true }, date: { type: Date, required: true },
  mode: { type: String, enum: ['cash', 'bank', 'upi', 'cheque', 'card'], required: true }, amount: { ...paise }, purpose: { type: String, default: '' }, reference: { type: String, default: '' },
  createdBy: { ...oid('User') },
}, [[{ voucherNumber: 1 }, { unique: true }], [{ date: -1 }]]);

export const ExportJob = defineModel('ExportJob', 'export_jobs', {
  kind: { type: String, required: true }, // report name, "full"
  format: { type: String, required: true },
  filters: { type: Object, default: {} },
  status: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
  fileKey: String, filename: String, contentType: String, bytes: Number, error: String,
  expiresAt: { type: Date, required: true },
  requestedBy: { ...oid('User') },
}, [[{ createdAt: -1 }], [{ expiresAt: 1 }]], { minimize: false });
