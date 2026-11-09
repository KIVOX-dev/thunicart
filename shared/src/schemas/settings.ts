import { z } from 'zod';
import { PRINT_SIZES } from '../constants';

const gstinFormat = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const panFormat = /^[A-Z]{5}\d{4}[A-Z]$/;

export const businessProfileBody = z.object({
  legalName: z.string().trim().min(2).max(150),
  brandName: z.string().trim().min(2).max(100),
  addressLines: z.array(z.string().trim().max(150)).max(5),
  city: z.string().trim().max(80),
  state: z.string().trim().max(80),
  stateCode: z.string().regex(/^\d{2}$/, 'State code is two digits'),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode is six digits'),
  phone: z.string().trim().max(20),
  email: z.string().trim().email().or(z.literal('')),
  website: z.string().trim().max(200),
  logoKey: z.string().max(300).nullable().default(null),
  gstin: z.string().trim().toUpperCase().regex(gstinFormat, 'GSTIN format is not valid').or(z.literal('')),
  pan: z.string().trim().toUpperCase().regex(panFormat, 'PAN format is not valid').or(z.literal('')),
  defaultPrintSize: z.enum(PRINT_SIZES),
  termsText: z.string().max(2000),
  invoiceFooter: z.string().max(300),
  brandColors: z.object({ primary: z.string(), accent: z.string(), secondary: z.string() }).optional(),
  /** Needed only when clearing a GSTIN that is currently live. */
  confirmGstClear: z.boolean().optional(),
});
export const businessProfileDto = businessProfileBody.omit({ confirmGstClear: true }).extend({
  gstEnabled: z.boolean(),
  gstGoLiveAt: z.string().nullable(),
  version: z.number().int(),
  updatedAt: z.string(),
});
export const numberSeriesDto = z.object({
  key: z.string(),
  prefix: z.string(),
  padding: z.number().int(),
  perFinancialYear: z.boolean(),
  financialYear: z.string(),
  counter: z.number().int(),
  next: z.string(),
});
export const numberSeriesUpdateBody = z.object({
  prefix: z.string().trim().min(1).max(10).regex(/^[A-Z0-9]+$/).optional(),
  padding: z.number().int().min(1).max(10).optional(),
  counter: z.number().int().min(0).optional(),
});
