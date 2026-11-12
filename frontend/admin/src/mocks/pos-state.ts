import type { CreditNote, Held, Invoice, Shift } from '../features/pos/types';

export interface PosState {
  bills: Invoice[];
  held: Held[];
  shifts: Shift[];
  creditNotes: CreditNote[];
  approvals: Record<string, string>;
  /** Idempotency-Key to the invoice id it created, so a retry returns the same bill. */
  idem: Record<string, string>;
  counters: Record<string, number>;
}
export const seedPos = (): { pos: PosState } => ({ pos: { bills: [], held: [], shifts: [], creditNotes: [], approvals: {}, idem: {}, counters: {} } });
