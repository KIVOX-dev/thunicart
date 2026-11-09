import type { ClientSession } from 'mongoose';
import { NumberSeries } from '../models';
import { financialYearOf } from './financialYear';
import { AppError } from './errors';

export const formatNumber = (prefix: string, financialYear: string, counter: number, padding: number) => {
  const num = String(counter).padStart(padding, '0');
  return financialYear ? `${prefix}-${financialYear}-${num}` : `${prefix}-${num}`;
};

/**
 * Takes the next number with ONE atomic findOneAndUpdate + $inc. Never read then write.
 * Pass the transaction session when the number belongs to a document being saved: if the
 * transaction rolls back, the number rolls back too, so there are no gaps.
 */
export async function nextNumber(key: string, opts: { date?: Date; session?: ClientSession } = {}): Promise<string> {
  const date = opts.date ?? new Date();
  const base: any = await NumberSeries.findOne({ key }).sort({ financialYear: -1 }).session(opts.session ?? null).lean();
  if (!base) throw new AppError(500, 'SERIES_MISSING', `Number series ${key} is not set up`);
  const fy = base.perFinancialYear ? financialYearOf(date) : '';

  const attempt = () =>
    NumberSeries.findOneAndUpdate(
      { key, financialYear: fy },
      { $inc: { counter: 1 }, $setOnInsert: { prefix: base.prefix, padding: base.padding, perFinancialYear: base.perFinancialYear } },
      { upsert: true, new: true, session: opts.session ?? undefined },
    ).lean() as Promise<any>;

  let doc: any;
  try {
    doc = await attempt();
  } catch (e: any) {
    // Two requests created the first row of a new financial year at the same moment. The loser retries.
    if (e?.code === 11000) doc = await attempt();
    else throw e;
  }
  return formatNumber(doc.prefix, doc.financialYear, doc.counter, doc.padding);
}

export const DEFAULT_SERIES = [
  { key: 'POS', prefix: 'POS', padding: 6, perFinancialYear: true },
  { key: 'ECM', prefix: 'ECM', padding: 6, perFinancialYear: true },
  { key: 'CNT', prefix: 'CNT', padding: 6, perFinancialYear: true },
  { key: 'PO', prefix: 'PO', padding: 6, perFinancialYear: true },
  { key: 'GRN', prefix: 'GRN', padding: 6, perFinancialYear: true },
  { key: 'PR', prefix: 'PR', padding: 6, perFinancialYear: true },
  { key: 'CN', prefix: 'CN', padding: 6, perFinancialYear: true },
  { key: 'DN', prefix: 'DN', padding: 6, perFinancialYear: true },
  { key: 'CUST', prefix: 'CUST', padding: 6, perFinancialYear: false },
  { key: 'VND', prefix: 'VND', padding: 6, perFinancialYear: false },
] as const;
