import mongoose from 'mongoose';
import { Customer, LoyaltyLedger, Vendor, WalletLedger } from '../../models';
import { badRequest, notFound } from '../../lib/errors';
import { validateGstin } from '../../lib/gstin';
import { isGstEnabled } from '../../lib/gst';
import { nextNumber } from '../../lib/numberSeries';

export type FieldErr = { path: string; message: string };

/**
 * GSTIN rules for vendors and B2B customers:
 *  - format, check character, first two digits = state code, characters 3 to 12 = PAN
 *  - required for vendors only while GST mode is ON; required for B2B customers always
 * If a GSTIN is given and PAN is empty, the PAN is taken from the GSTIN.
 */
export async function checkTaxIds(p: { gstin?: string; pan?: string; stateCode: string; required: 'always' | 'when_gst_on' | 'never' }): Promise<{ gstin: string; pan: string }> {
  const gstin = (p.gstin ?? '').trim().toUpperCase();
  let pan = (p.pan ?? '').trim().toUpperCase();
  const errs: FieldErr[] = [];
  const need = p.required === 'always' || (p.required === 'when_gst_on' && (await isGstEnabled()));
  if (!gstin && need) errs.push({ path: 'gstin', message: p.required === 'always' ? 'GSTIN is required for B2B customers' : 'GSTIN is required while GST is on' });
  if (gstin) {
    const c = validateGstin(gstin, p.stateCode, pan || undefined);
    if (!c.ok) errs.push({ path: 'gstin', message: c.reason! });
    else if (!pan) pan = gstin.slice(2, 12);
  }
  if (errs.length) throw badRequest('Tax details are not valid', errs);
  return { gstin, pan };
}

// ---------- vendors ----------
export const vendorDto = (v: any) => ({
  id: String(v._id), vendorId: v.vendorId, name: v.name, contactPerson: v.contactPerson ?? '', email: v.email, mobile: v.mobile, address: v.address ?? '',
  city: v.city ?? '', stateCode: v.stateCode, country: v.country ?? 'IN', gstin: v.gstin ?? '', pan: v.pan ?? '', paymentTerms: v.paymentTerms ?? 'NET30',
  glAccount: v.glAccount ?? '', active: !!v.active,
});

export async function prepareVendor(input: any, existing?: any) {
  const merged = { ...(existing ?? {}), ...input };
  const ids = await checkTaxIds({ gstin: merged.gstin, pan: merged.pan, stateCode: merged.stateCode, required: 'when_gst_on' });
  const out: any = { ...input, gstin: ids.gstin, pan: ids.pan };
  if (!existing) out.vendorId = await nextNumber('VND');
  return out;
}

// ---------- customers ----------
export async function balancesFor(ids: string[]) {
  const oids = ids.map((i) => new mongoose.Types.ObjectId(i));
  const [pts, wal] = await Promise.all([
    LoyaltyLedger.aggregate([{ $match: { customerId: { $in: oids } } }, { $group: { _id: '$customerId', v: { $sum: '$points' } } }]),
    WalletLedger.aggregate([{ $match: { customerId: { $in: oids } } }, { $group: { _id: '$customerId', v: { $sum: '$amount' } } }]),
  ]);
  return { points: new Map(pts.map((r) => [String(r._id), r.v as number])), wallet: new Map(wal.map((r) => [String(r._id), r.v as number])) };
}

export const customerDto = (c: any, b?: Awaited<ReturnType<typeof balancesFor>>) => ({
  id: String(c._id), customerId: c.customerId, accountGroup: c.accountGroup, name: c.name, email: c.email ?? '', mobile: c.mobile, address: c.address ?? '',
  city: c.city ?? '', stateCode: c.stateCode, country: c.country ?? 'IN', gstin: c.gstin ?? '', pan: c.pan ?? '', glAccount: c.glAccount ?? '',
  creditLimit: c.creditLimit ?? 0, active: !!c.active,
  loyaltyPoints: b?.points.get(String(c._id)) ?? 0, walletBalance: b?.wallet.get(String(c._id)) ?? 0, currency: 'INR' as const,
});

export async function prepareCustomer(input: any, existing?: any) {
  const merged = { ...(existing ?? {}), ...input };
  if (input.mobile && (await Customer.exists({ mobile: input.mobile, ...(existing ? { _id: { $ne: existing._id } } : {}) }))) {
    throw badRequest('A customer with this mobile number already exists', [{ path: 'mobile', message: 'Mobile must be unique per customer' }]);
  }
  const ids = await checkTaxIds({ gstin: merged.gstin, pan: merged.pan, stateCode: merged.stateCode, required: merged.accountGroup === 'B2B Trade' ? 'always' : 'never' });
  const out: any = { ...input, gstin: ids.gstin, pan: ids.pan };
  if (!existing) out.customerId = await nextNumber('CUST');
  return out;
}

export async function getCustomerByMobile(mobile: string) {
  const c: any = await Customer.findOne({ mobile }).lean();
  if (!c) throw notFound('Customer');
  return customerDto(c, await balancesFor([String(c._id)]));
}
export { Vendor };
