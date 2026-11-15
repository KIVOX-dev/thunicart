import type { ClientSession } from 'mongoose';
import { Grn, NumberSeries, Variant } from '../models';
import { bumpSeriesTo, nextNumber } from './numberSeries';

/**
 * Batch numbers look like KO20261108: prefix KO, the calendar year, then a counter that only moves forward (it restarts with each year).
 * Every stock input (goods receipt, import, stock added by adjustment) takes the next one. The counter is one atomic increment,
 * so two people receiving stock at the same moment can never get the same number.
 */
const yearOf = (d: Date) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(d));
const keyOf = (year: number) => `BATCH${year}`;
const pattern = (year: number) => new RegExp(`^KO${year}(\\d+)$`);

/** The highest counter already used by a batch number from this year, so new numbers carry on after the ones that came with the first stock sheet. */
async function highestUsed(year: number, session?: ClientSession): Promise<number> {
  const re = pattern(year);
  let max = 0;
  const seen = (ref: unknown) => { const m = re.exec(String(ref ?? '')); if (m) max = Math.max(max, Number(m[1])); };
  for (const v of await Variant.find({ batchRef: re }, { batchRef: 1 }).session(session ?? null).lean()) seen((v as any).batchRef);
  for (const g of await Grn.find({ 'lines.batchRef': re }, { 'lines.batchRef': 1 }).session(session ?? null).lean()) for (const l of (g as any).lines ?? []) seen(l.batchRef);
  return max;
}

/** Makes the year's series on first use. Inside a database transaction it is made inside it too, otherwise the transaction would not see it. */
async function ensureSeries(year: number, session?: ClientSession): Promise<string> {
  const key = keyOf(year);
  if (await NumberSeries.exists({ key }).session(session ?? null)) return key;
  const doc = { key, prefix: `KO${year}`, padding: 4, perFinancialYear: false, separator: '', financialYear: '', counter: await highestUsed(year, session) };
  try {
    await NumberSeries.create([doc], session ? { session } : {});
  } catch (e: any) {
    if (e?.code !== 11000) throw e; // another request created it first
  }
  return key;
}

/** Set the year's counter up BEFORE a transaction starts: a counter created inside a running transaction by another request would not be visible to it. */
export async function prepareBatchSeries(date: Date = new Date()): Promise<void> { await ensureSeries(yearOf(date)); }

export async function nextBatchNumber(opts: { date?: Date; session?: ClientSession } = {}): Promise<string> {
  const date = opts.date ?? new Date();
  const key = await ensureSeries(yearOf(date), opts.session);
  return nextNumber(key, { date, session: opts.session });
}

/** A batch number that came from outside (a stock sheet, a typed value): the counter moves past it, so a later automatic number never repeats it. */
export async function noteBatchRef(ref: string | null | undefined): Promise<void> {
  const m = /^KO(\d{4})(\d+)$/.exec(String(ref ?? ''));
  if (!m) return;
  const key = await ensureSeries(Number(m[1]));
  await bumpSeriesTo(key, Number(m[2]));
}
