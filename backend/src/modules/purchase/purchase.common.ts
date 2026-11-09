import type { ClientSession } from 'mongoose';
import { BusinessProfile, Item, Store, Variant, Vendor } from '../../models';
import { badRequest, businessRule, notFound } from '../../lib/errors';
import { isGstEnabled } from '../../lib/gst';
import { resolveGstRate } from '../../lib/gstRate';
import { calcPurchaseLine, supplyFor, type Supply } from '../../lib/purchaseTax';
import { iso } from '../../lib/list';

export const totalsOf = (t: any) => ({ taxable: t?.taxable ?? 0, cgst: t?.cgst ?? 0, sgst: t?.sgst ?? 0, igst: t?.igst ?? 0, tax: t?.tax ?? 0, total: t?.total ?? 0, currency: 'INR' as const });

export async function homeStateCode(session?: ClientSession): Promise<string> {
  const p: any = await BusinessProfile.findOne({ singleKey: 'main' }, { stateCode: 1 }).session(session ?? null).lean();
  return p?.stateCode ?? '33';
}

export interface TaxMode { gstOn: boolean; supply: Supply | null; gstMode: 'on' | 'off' }
/** GST on or off, and CGST+SGST or IGST by comparing the vendor's state code with ours. Never copied from a sample row. */
export async function taxModeFor(vendor: any, session?: ClientSession): Promise<TaxMode> {
  const gstOn = await isGstEnabled(session);
  return { gstOn, gstMode: gstOn ? 'on' : 'off', supply: gstOn ? supplyFor(vendor.stateCode, await homeStateCode(session)) : null };
}

export async function loadVendor(id: string, session?: ClientSession) {
  const v: any = await Vendor.findById(id).session(session ?? null).lean();
  if (!v) throw badRequest('Vendor not found', [{ path: 'vendorId', message: 'Choose an existing vendor' }]);
  if (!v.active) throw businessRule('This vendor is inactive', 'VENDOR_INACTIVE', [{ path: 'vendorId', message: 'Inactive vendor' }]);
  return v;
}
export async function loadStore(id: string, session?: ClientSession) {
  const s: any = await Store.findById(id).session(session ?? null).lean();
  if (!s || !s.active) throw badRequest('Store not found', [{ path: 'storeId', message: 'Choose an active store' }]);
  return s;
}

export interface VariantCtx { v: any; item: any }
export async function variantContext(ids: string[], session?: ClientSession): Promise<Map<string, VariantCtx>> {
  const vs: any[] = await Variant.find({ _id: { $in: ids } }).session(session ?? null).lean();
  const items: any[] = await Item.find({ _id: { $in: vs.map((v) => v.itemId) } }).session(session ?? null).lean();
  const im = new Map(items.map((i) => [String(i._id), i]));
  return new Map(vs.map((v) => [String(v._id), { v, item: im.get(String(v.itemId)) }]));
}
export const describe = (c: VariantCtx) => [c.item?.name ?? c.v.itemCode, c.v.size, c.v.color].filter(Boolean).join(' ');

/**
 * Which GST rate to use for a purchase line. While GST is off the rate is not used for tax at all.
 * With GST on: the rate typed on the line, else the item override, else the rate rules for the HSN.
 */
export async function rateFor(input: number | null | undefined, c: VariantCtx, unitCost: number, mode: TaxMode, at: Date, path: string, session?: ClientSession): Promise<number | null> {
  if (input !== undefined && input !== null) return input;
  if (!mode.gstOn) return null;
  if (c.item?.hsn) {
    const r = await resolveGstRate({ hsn: c.item.hsn, unitPricePaise: unitCost, date: at, override: c.item.gstRateOverride }, session);
    if (r) return r.rate;
  }
  throw badRequest(`GST rate is not known for ${c.v.itemCode}`, [{ path, message: c.item?.hsn ? `No GST rate rule covers HSN ${c.item.hsn}. Type the rate on the line or add a rule.` : 'The item has no HSN. Type the rate on the line.' }]);
}

export function lineFields(l: { qty: number; unitCost: number; discountPercent: number; gstRate: number | null }, mode: TaxMode) {
  return { ...l, ...calcPurchaseLine(l, mode) };
}

export async function namesFor(vendorIds: string[], storeIds: string[]) {
  const [vs, ss]: any[] = await Promise.all([Vendor.find({ _id: { $in: vendorIds } }).lean(), Store.find({ _id: { $in: storeIds } }).lean()]);
  return { vendor: new Map<string, any>(vs.map((v: any) => [String(v._id), v])), store: new Map<string, any>(ss.map((s: any) => [String(s._id), s])) };
}
export const needDoc = <T>(d: T | null | undefined, what: string): T => { if (!d) throw notFound(what); return d; };
export { iso };
