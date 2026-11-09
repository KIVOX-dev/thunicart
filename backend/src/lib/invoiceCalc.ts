import { allocateProportionally, divRoundHalfUp } from './money';

export interface SaleLineIn { qty: number; unitPrice: number; lineDiscount: number; rate: number | null; hsn: string }
export interface SaleLineOut extends SaleLineIn { gross: number; billDiscountShare: number; net: number; taxable: number; cgst: number; sgst: number; igst: number }
export interface HsnGroup { hsn: string; rate: number; net: number; taxable: number; cgst: number; sgst: number; igst: number }
const bp = (r: number) => Math.round(r * 100);

/** Taxable value of an amount that already includes GST: round half up of net x 100 / (100 + rate). */
export const taxableOf = (net: number, rate: number) => divRoundHalfUp(net * 10000, 10000 + bp(rate));
const taxOn = (taxable: number, rate: number, supply: 'intra' | 'inter') =>
  supply === 'inter' ? { cgst: 0, sgst: 0, igst: divRoundHalfUp(taxable * bp(rate), 10000) } : { cgst: divRoundHalfUp(taxable * bp(rate), 20000), sgst: divRoundHalfUp(taxable * bp(rate), 20000), igst: 0 };

/**
 * The invoice maths (all whole paise, round half up). Prices include GST.
 * 1. line net = qty x price - line discount - this line's proportional share of the bill discount (leftover paisa to the largest line)
 * 2. with GST on: group by HSN + rate; taxable = round(group net x 100 / (100 + rate)); CGST = SGST = round(taxable x rate / 2); IGST = round(taxable x rate)
 * 3. round off = what the customer pays (sum of nets) - (taxable + tax). The grand total always equals the sum of the line nets.
 */
export function calcInvoice(lines: SaleLineIn[], billDiscount: number, mode: { gstOn: boolean; supply: 'intra' | 'inter' }) {
  const base = lines.map((l) => Math.max(0, l.qty * l.unitPrice - l.lineDiscount));
  const shares = allocateProportionally(Math.min(billDiscount, base.reduce((a, b) => a + b, 0)), base);
  const out: SaleLineOut[] = lines.map((l, i) => {
    const net = base[i]! - shares[i]!;
    const r: SaleLineOut = { ...l, gross: l.qty * l.unitPrice, billDiscountShare: shares[i]!, net, taxable: net, cgst: 0, sgst: 0, igst: 0 };
    if (mode.gstOn && l.rate) { r.taxable = taxableOf(net, l.rate); Object.assign(r, taxOn(r.taxable, l.rate, mode.supply)); }
    return r;
  });
  const grandTotal = out.reduce((a, l) => a + l.net, 0);
  const groups: HsnGroup[] = [];
  if (mode.gstOn) {
    const m = new Map<string, HsnGroup>();
    for (const l of out) {
      if (!l.rate) continue;
      const k = `${l.hsn}|${l.rate}`; const g = m.get(k) ?? { hsn: l.hsn, rate: l.rate, net: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      g.net += l.net; m.set(k, g);
    }
    for (const g of m.values()) { g.taxable = taxableOf(g.net, g.rate); Object.assign(g, taxOn(g.taxable, g.rate, mode.supply)); groups.push(g); }
    groups.sort((a, b) => a.hsn.localeCompare(b.hsn));
  }
  const noTax = out.filter((l) => !l.rate || !mode.gstOn).reduce((a, l) => a + l.net, 0); // lines with no rate carry no tax
  const taxable = groups.reduce((a, g) => a + g.taxable, 0) + (mode.gstOn ? noTax : grandTotal);
  const cgst = groups.reduce((a, g) => a + g.cgst, 0), sgst = groups.reduce((a, g) => a + g.sgst, 0), igst = groups.reduce((a, g) => a + g.igst, 0);
  const tax = cgst + sgst + igst;
  const gross = out.reduce((a, l) => a + l.gross, 0);
  return {
    lines: out, groups,
    totals: { gross, discount: gross - grandTotal, taxable, cgst, sgst, igst, tax, roundOff: mode.gstOn ? grandTotal - (taxable + tax) : 0, grandTotal },
  };
}

/** Convert a discount input to paise against a base amount. */
export function discountToPaise(d: { type: 'amount' | 'percent'; value: number } | undefined, base: number): number {
  if (!d) return 0;
  return d.type === 'percent' ? divRoundHalfUp(base * Math.round(d.value * 100), 10000) : Math.round(d.value);
}
