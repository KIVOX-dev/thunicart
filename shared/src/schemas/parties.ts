import { z } from 'zod';
import { objectId, patchOf } from './common';

const stateCode = z.string().regex(/^\d{2}$/, 'State code is two digits');
const mobile = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10 digit Indian mobile number');
const gstinFmt = z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN format is not valid');
const panFmt = z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'PAN format is not valid');

export const PAYMENT_TERMS = ['ADVANCE', 'NET7', 'NET15', 'NET30', 'NET45', 'NET60'] as const;
export const ACCOUNT_GROUPS = ['Retail Walk-in', 'E-commerce B2C', 'B2B Trade'] as const;

export const vendorBody = z.object({
  name: z.string().trim().min(2).max(120),
  contactPerson: z.string().trim().max(80).default(''),
  email: z.string().trim().toLowerCase().email(),
  mobile,
  address: z.string().trim().max(200).default(''),
  city: z.string().trim().max(60).default(''),
  stateCode,
  gstin: gstinFmt.or(z.literal('')).default(''),
  pan: panFmt.or(z.literal('')).default(''),
  paymentTerms: z.enum(PAYMENT_TERMS).default('NET30'),
  glAccount: z.string().trim().max(20).default(''),
  active: z.boolean().default(true),
});
export const vendorUpdateBody = patchOf(vendorBody);
export const vendorDto = vendorBody.extend({ id: objectId, vendorId: z.string(), country: z.string() });

export const customerBody = z.object({
  accountGroup: z.enum(ACCOUNT_GROUPS),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().or(z.literal('')).default(''),
  mobile,
  address: z.string().trim().max(200).default(''),
  city: z.string().trim().max(60).default(''),
  stateCode,
  gstin: gstinFmt.or(z.literal('')).default(''),
  pan: panFmt.or(z.literal('')).default(''),
  glAccount: z.string().trim().max(20).default(''),
  creditLimit: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});
export const customerUpdateBody = patchOf(customerBody);
export const customerDto = customerBody.extend({
  id: objectId, customerId: z.string(), country: z.string(),
  /** Ledgers, not editable. */
  loyaltyPoints: z.number().int(), walletBalance: z.number().int(), currency: z.literal('INR'),
});
export const mobileQuery = z.object({ mobile: mobile });
export const vendorQuery = z.object({ active: z.enum(['true', 'false']).optional() });
export const customerQuery = z.object({ accountGroup: z.enum(ACCOUNT_GROUPS).optional(), active: z.enum(['true', 'false']).optional() });
