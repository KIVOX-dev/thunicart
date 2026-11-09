import { defineModel } from './_define';

/** One row only (singleKey = 'main'). */
export const BusinessProfile = defineModel('BusinessProfile', 'business_profile', {
  singleKey: { type: String, default: 'main', unique: true },
  legalName: String,
  brandName: String,
  addressLines: [String],
  city: String,
  state: String,
  stateCode: String,
  pincode: String,
  phone: String,
  email: { type: String, default: '' },
  website: { type: String, default: '' },
  logoKey: { type: String, default: null },
  gstin: { type: String, default: '' },
  pan: { type: String, default: '' },
  /** Derived from gstin. Never set directly by a request. */
  gstEnabled: { type: Boolean, default: false },
  gstGoLiveAt: { type: Date, default: null },
  gstHistory: [{ event: String, at: Date, by: String, gstin: String, _id: false }],
  defaultPrintSize: { type: String, enum: ['a4', '2in', '3in', '4x6'], default: '4x6' },
  termsText: { type: String, default: '' },
  invoiceFooter: { type: String, default: '' },
  brandColors: { primary: String, accent: String, secondary: String },
});
