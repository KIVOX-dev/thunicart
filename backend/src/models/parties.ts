import { defineModel, oid, paise } from './_define';

export const Vendor = defineModel('Vendor', 'vendors', {
  vendorId: { type: String, required: true }, // from the VND number series
  name: { type: String, required: true },
  contactPerson: { type: String, default: '' },
  email: { type: String, required: true },
  mobile: { type: String, required: true },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  stateCode: { type: String, required: true },
  country: { type: String, default: 'IN' },
  gstin: { type: String, default: '' },
  pan: { type: String, default: '' },
  paymentTerms: { type: String, default: 'NET30' }, // NET15, NET30...
  glAccount: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, [[{ vendorId: 1 }, { unique: true }], [{ name: 1 }], [{ mobile: 1 }], [{ active: 1 }]]);

export const Customer = defineModel('Customer', 'customers', {
  customerId: { type: String, required: true }, // from the CUST number series
  accountGroup: { type: String, enum: ['Retail Walk-in', 'E-commerce B2C', 'B2B Trade'], required: true },
  name: { type: String, required: true },
  email: { type: String, default: '' },
  mobile: { type: String, required: true },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  stateCode: { type: String, required: true },
  country: { type: String, default: 'IN' },
  gstin: { type: String, default: '' },
  pan: { type: String, default: '' },
  glAccount: { type: String, default: '' },
  creditLimit: { ...paise },
  active: { type: Boolean, default: true },
}, [
  [{ customerId: 1 }, { unique: true }],
  [{ mobile: 1 }, { unique: true }], // mobile is unique per customer
  [{ email: 1 }],
  [{ accountGroup: 1, active: 1 }],
]);

/** Loyalty points and wallet balance are LEDGERS. The balance is the sum of the rows, never an editable number. */
export const LoyaltyLedger = defineModel('LoyaltyLedger', 'loyalty_ledger', {
  customerId: { ...oid('Customer', true) },
  points: { type: Number, required: true }, // signed
  type: { type: String, enum: ['OPENING', 'EARN', 'REDEEM', 'EXPIRE', 'ADJUST'], required: true },
  docType: String,
  docNumber: String,
  at: { type: Date, default: Date.now },
  importBatchId: { ...oid('ImportBatch') },
}, [[{ customerId: 1, at: 1 }]], { timestamps: false });

export const WalletLedger = defineModel('WalletLedger', 'wallet_ledger', {
  customerId: { ...oid('Customer', true) },
  amount: { type: Number, required: true }, // signed paise
  type: { type: String, enum: ['OPENING', 'CREDIT', 'DEBIT', 'REFUND', 'ADJUST'], required: true },
  docType: String,
  docNumber: String,
  at: { type: Date, default: Date.now },
}, [[{ customerId: 1, at: 1 }]], { timestamps: false });
