import type { ClientSession } from 'mongoose';

/**
 * Batch numbers look like TK20261121: TK, then the date the stock came in (year, month, day, India time).
 * Every stock input (goods receipt, stock import, stock added by an adjustment) takes the batch number of its own day. Stock that arrived on
 * the same day shares one batch, and an older date means older stock, so the number alone tells old stock from new.
 * There is no counter: nothing is shared between two people receiving stock at the same moment, so nothing can clash.
 * Numbers that were made earlier (for example KO20261108) stay exactly as they are.
 */
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/-/g, '');

/** The batch number for stock that comes in on this date (today when none is given). */
export const batchNumberFor = (date: Date = new Date()): string => `TK${ymd(date)}`;

/** True for a number made in this format. Older numbers and numbers typed by hand are valid too, so this is only for telling them apart. */
export const isDateBatch = (ref: string | null | undefined): boolean => /^TK\d{8}$/.test(String(ref ?? ''));

/** The date a TK batch number stands for (as YYYY-MM-DD), or null for any other kind of number. */
export const batchDate = (ref: string | null | undefined): string | null => {
  const m = /^TK(\d{4})(\d{2})(\d{2})$/.exec(String(ref ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

export async function nextBatchNumber(opts: { date?: Date; session?: ClientSession } = {}): Promise<string> {
  return batchNumberFor(opts.date);
}

/** Kept so the callers did not have to change: a date based number needs no counter to set up. */
export async function prepareBatchSeries(_date: Date = new Date()): Promise<void> { /* nothing to prepare */ }

/** Kept for the same reason: a batch number typed by hand or brought by a sheet is stored as it is. */
export async function noteBatchRef(_ref: string | null | undefined): Promise<void> { /* nothing to remember */ }
