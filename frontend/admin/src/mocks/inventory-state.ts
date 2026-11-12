import type { Audit, Bill, Grn, LedgerEntry, Payment, Po, PurchaseReturn, Transfer } from '../features/inventory/types';

/** Mock inventory state kept inside the mock database. */
export interface InventoryState {
  pos: Po[];
  grns: Grn[];
  bills: Bill[];
  returns: PurchaseReturn[];
  payments: Payment[];
  ledger: LedgerEntry[];
  /** Full audit records include the scan history used by Undo. */
  audits: Array<Audit & { history: string[] }>;
  transfers: Array<Transfer & { history: string[] }>;
  counters: Record<string, number>;
}

export const seedInventory = (): { inv: InventoryState } => ({ inv: { pos: [], grns: [], bills: [], returns: [], payments: [], ledger: [], audits: [], transfers: [], counters: {} } });
