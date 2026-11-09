import type { ClientSession } from 'mongoose';
import { GstRate } from '../models';

export interface ResolvedRate {
  rate: number;
  source: 'item_override' | 'rule';
  ruleId?: string;
  ruleType?: 'flat' | 'slab';
  confirmed?: boolean;
}

/**
 * The GST rate for a line, found by HSN, bill date and per piece selling price (paise).
 * An item level override wins. Tries the full HSN, then 6 digits, then the 4 digit heading.
 * Returns null when no rule exists, so callers can flag it instead of guessing.
 */
export async function resolveGstRate(
  q: { hsn: string; date?: Date; unitPricePaise: number; override?: number | null },
  session?: ClientSession,
): Promise<ResolvedRate | null> {
  if (q.override !== null && q.override !== undefined) return { rate: q.override, source: 'item_override' };
  const date = q.date ?? new Date();
  const candidates = [...new Set([q.hsn, q.hsn.slice(0, 6), q.hsn.slice(0, 4)].filter((c) => c.length >= 4))];
  const rules: any[] = await GstRate.find({
    hsnCode: { $in: candidates },
    effectiveFrom: { $lte: date },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: date } }],
  }).session(session ?? null).lean();
  if (!rules.length) return null;
  rules.sort((a, b) => b.hsnCode.length - a.hsnCode.length || +new Date(b.effectiveFrom) - +new Date(a.effectiveFrom));
  const r = rules[0];
  const rate = r.ruleType === 'slab' ? (q.unitPricePaise <= r.slabLimit ? r.rateBelow : r.rateAbove) : r.rate;
  return { rate, source: 'rule', ruleId: String(r._id), ruleType: r.ruleType, confirmed: !!r.confirmed };
}
