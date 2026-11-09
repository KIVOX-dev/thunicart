import type { ClientSession } from 'mongoose';
import { customerBody, vendorBody, PAYMENT_TERMS } from '@thunikart/shared';
import { Customer, ImportEffect, LoyaltyLedger, Vendor } from '../../models';
import type { SheetRow } from '../../lib/excel/read';
import { nextNumber } from '../../lib/numberSeries';
import { checkTaxIds } from '../parties/parties.service';
import type { RowIssue } from './stock';

export interface PartyRow { row: number; key: string; data: any; loyaltyPoints: number; existing?: any }
export interface PartyPrepared { rows: PartyRow[]; errors: RowIssue[]; skipped: RowIssue[] }

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const digits = (v: unknown) => (typeof v === 'number' ? String(Math.trunc(v)) : str(v)).replace(/\D/g, '');
const stateCode = (v: unknown) => { const d = digits(v); return d ? d.padStart(2, '0') : ''; };
const terms = (v: unknown) => { const t = str(v).toUpperCase().replace(/\s+/g, ''); return (PAYMENT_TERMS as readonly string[]).includes(t) ? t : t || 'NET30'; };
const group = (v: unknown) => {
  const g = str(v).toLowerCase();
  if (g.includes('b2b') || g.includes('trade')) return 'B2B Trade';
  if (g.includes('commerce') || g.includes('b2c') || g.includes('online')) return 'E-commerce B2C';
  return 'Retail Walk-in';
};

export async function preparePartyRows(target: 'vendors' | 'customers', raw: SheetRow[], mapping: Record<string, string>): Promise<PartyPrepared> {
  const get = (r: SheetRow, f: string) => (mapping[f] ? r.values[mapping[f]!] : undefined);
  const out: PartyPrepared = { rows: [], errors: [], skipped: [] };
  const seen = new Set<string>();
  for (const r of raw) {
    const name = str(get(r, 'name'));
    if (!name && !digits(get(r, 'mobile'))) { out.skipped.push({ row: r.row, code: null, message: 'Blank row' }); continue; }
    const base: any = {
      name, email: str(get(r, 'email')).toLowerCase(), mobile: digits(get(r, 'mobile')).slice(-10), address: str(get(r, 'address')), city: str(get(r, 'city')),
      stateCode: stateCode(get(r, 'stateCode')), gstin: str(get(r, 'gstin')).toUpperCase(), pan: str(get(r, 'pan')).toUpperCase(), glAccount: digits(get(r, 'glAccount')),
    };
    let body: any;
    if (target === 'vendors') { body = { ...base, contactPerson: str(get(r, 'contactPerson')), paymentTerms: terms(get(r, 'paymentTerms')), active: true }; }
    else { body = { ...base, accountGroup: group(get(r, 'accountGroup')), creditLimit: 0, active: true }; }
    const parsed = (target === 'vendors' ? vendorBody : customerBody).safeParse(body);
    const code = str(get(r, target === 'vendors' ? 'vendorId' : 'customerId')) || null;
    if (!parsed.success) { out.errors.push({ row: r.row, code, message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }); continue; }
    const data: any = parsed.data;
    try {
      const ids = await checkTaxIds({ gstin: data.gstin, pan: data.pan, stateCode: data.stateCode, required: target === 'vendors' ? 'when_gst_on' : data.accountGroup === 'B2B Trade' ? 'always' : 'never' });
      data.gstin = ids.gstin; data.pan = ids.pan;
    } catch (e: any) {
      out.errors.push({ row: r.row, code, message: (e.fields ?? []).map((f: any) => `${f.path}: ${f.message}`).join('; ') || e.message }); continue;
    }
    const key = target === 'customers' ? data.mobile : (code ?? data.gstin ?? data.name.toLowerCase());
    if (seen.has(key)) { out.skipped.push({ row: r.row, code, message: `Duplicate of an earlier row (${key})` }); continue; }
    seen.add(key);
    if (code) data[target === 'vendors' ? 'vendorId' : 'customerId'] = code;
    out.rows.push({ row: r.row, key, data, loyaltyPoints: target === 'customers' ? Math.trunc(Number(str(get(r, 'loyaltyPoints'))) || 0) : 0 });
  }
  return out;
}

export async function planParties(target: 'vendors' | 'customers', rows: PartyRow[]) {
  if (target === 'customers') {
    const ex: any[] = await Customer.find({ mobile: { $in: rows.map((r) => r.data.mobile) } }).lean();
    const m = new Map(ex.map((c) => [c.mobile, c]));
    rows.forEach((r) => { r.existing = m.get(r.data.mobile); });
  } else {
    const ids = rows.map((r) => r.data.vendorId).filter(Boolean);
    const ex: any[] = await Vendor.find({ $or: [{ vendorId: { $in: ids } }, { gstin: { $in: rows.map((r) => r.data.gstin).filter(Boolean) } }] }).lean();
    rows.forEach((r) => { r.existing = ex.find((v) => (r.data.vendorId && v.vendorId === r.data.vendorId) || (r.data.gstin && v.gstin === r.data.gstin)); });
  }
  return { newRows: rows.filter((r) => !r.existing).length, updatedRows: rows.filter((r) => r.existing).length };
}

export async function applyParties(target: 'vendors' | 'customers', rows: PartyRow[], ctx: { batchId: string; session: ClientSession }) {
  const Model: any = target === 'vendors' ? Vendor : Customer;
  const collection = target === 'vendors' ? 'vendors' : 'customers';
  const idField = target === 'vendors' ? 'vendorId' : 'customerId';
  const series = target === 'vendors' ? 'VND' : 'CUST';
  const effects: any[] = []; const res = { new: 0, updated: 0, reviewFlagged: 0, pieces: 0, costValue: 0 };
  const s = { session: ctx.session };
  for (const r of rows) {
    if (r.existing) {
      const before = { ...r.existing }; delete before._id; delete before.createdAt; delete before.updatedAt; delete before.version;
      const { [idField]: _id, ...fields } = r.data;
      await Model.updateOne({ _id: r.existing._id }, { $set: fields }, s);
      effects.push({ batchId: ctx.batchId, coll: collection, docId: String(r.existing._id), action: 'updated', before });
      res.updated++;
    } else {
      const data = { ...r.data }; if (!data[idField]) data[idField] = await nextNumber(series, s);
      const [doc] = await Model.create([data], s);
      effects.push({ batchId: ctx.batchId, coll: collection, docId: String(doc._id), action: 'created' });
      if (target === 'customers' && r.loyaltyPoints > 0) {
        const [led] = await LoyaltyLedger.create([{ customerId: doc._id, points: r.loyaltyPoints, type: 'OPENING', docType: 'IMPORT', docNumber: ctx.batchId, importBatchId: ctx.batchId }], s);
        effects.push({ batchId: ctx.batchId, coll: 'loyalty_ledger', docId: String(led!._id), action: 'created' });
      }
      res.new++;
    }
  }
  if (effects.length) await ImportEffect.insertMany(effects, s);
  return res;
}
