import { divRoundHalfUp } from './money';

export interface TaxLine { gross: number; discount: number; taxable: number; cgst: number; sgst: number; igst: number; total: number }
export type Supply = 'intra' | 'inter';

/** Same state as the buyer (Tamil Nadu, 33) gives CGST + SGST; any other state gives IGST. Decided by state codes only. */
export const supplyFor = (vendorState: string, homeState: string): Supply => (vendorState === homeState ? 'intra' : 'inter');

const bp = (n: number) => Math.round(n * 100); // percent to basis points: 2.5% is 250

/**
 * Purchase line maths, all in whole paise, round half up.
 * Cost is EXCLUDING GST. taxable = qty x unit cost less the trade discount.
 * CGST = SGST = taxable x rate / 2, IGST = taxable x rate. With GST off there is no tax at all and the
 * taxable value is the full cost.
 */
export function calcPurchaseLine(
  l: { qty: number; unitCost: number; discountPercent: number; gstRate: number | null },
  mode: { gstOn: boolean; supply: Supply | null },
): TaxLine {
  const gross = l.qty * l.unitCost;
  const discount = divRoundHalfUp(gross * bp(l.discountPercent), 10000);
  const taxable = gross - discount;
  if (!mode.gstOn || l.gstRate === null || l.gstRate === 0) return { gross, discount, taxable, cgst: 0, sgst: 0, igst: 0, total: taxable };
  const rate = bp(l.gstRate);
  if (mode.supply === 'inter') {
    const igst = divRoundHalfUp(taxable * rate, 10000);
    return { gross, discount, taxable, cgst: 0, sgst: 0, igst, total: taxable + igst };
  }
  const half = divRoundHalfUp(taxable * rate, 20000);
  return { gross, discount, taxable, cgst: half, sgst: half, igst: 0, total: taxable + 2 * half };
}

export function sumLines(lines: Pick<TaxLine, 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total'>[]) {
  const t = lines.reduce((a, l) => ({ taxable: a.taxable + l.taxable, cgst: a.cgst + l.cgst, sgst: a.sgst + l.sgst, igst: a.igst + l.igst, total: a.total + l.total }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
  return { ...t, tax: t.cgst + t.sgst + t.igst, currency: 'INR' as const };
}

/** Days for payment terms like NET15, NET30. ADVANCE is due the same day. */
export function termDays(terms: string): number {
  const m = /^NET(\d+)$/i.exec(terms);
  return m ? Number(m[1]) : 0;
}
