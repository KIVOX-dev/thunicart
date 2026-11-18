import type { Action, ModuleKey } from '@thunikart/shared';

const V = 'view', C = 'create', E = 'edit', D = 'delete', A = 'approve', X = 'export';
export type Matrix = Partial<Record<ModuleKey, Action[]>>;
const ALL: Action[] = [V, C, E, D, A, X];

/**
 * Default permission matrix from the brief. Admin can change any cell later.
 * Mapping notes (also in docs/decisions.md): "request transfer" and "receive/adjust" use stock.create / stock.edit,
 * "pay" uses accounts.create, "cancel" uses sales.delete, "return" uses sales.create.
 */
export const DEFAULT_MATRIX: Record<string, Matrix> = {
  Sales: {
    items: [V], customers: [V, C, E], stock: [V, C], pos: [V, C], sales: [V, C], reports: [V], orders: [V, E],
  },
  'Buyer Purchase': {
    items: [V, C, E], vendors: [V, C, E], purchase: [V, C, E, D, X], stock: [V, C, E], pos: [V], sales: [V], reports: [V],
  },
  /** The top level Employee role: counter billing, customers (view and add), stock audit and customer returns. An Admin can change it under Users > Roles. */
  Employee: {
    pos: [V, C], sales: [V, C], customers: [V, C], items: [V], stock: [V, C, E], orders: [V],
  },
  Accounts: {
    items: [V], vendors: [V], customers: [V], purchase: [V], stock: [V], pos: [V], sales: [V, D],
    accounts: ALL, gst: ALL, reports: ALL, orders: [V], cms: [V],
  },
};

export const SYSTEM_ROLE_DESCRIPTIONS: Record<string, string> = {
  Admin: 'Full access. Can create roles and edit permissions.',
  Employee: 'Billing center, customers (view and add), stock audit and customer returns.',
  Sales: 'Counter billing and customers.',
  'Buyer Purchase': 'Buying, vendors, receiving and stock adjustments.',
  Accounts: 'Accounts, GST, payments and reports.',
};

/** Terms from the client's 4x6 invoice PDF (confirmed correct), plus the not-returnable garment rule. Editable in Settings. */
export const DEFAULT_TERMS = [
  '1. Original invoice mandatory for exchanges.',
  '2. Items can be exchanged within 7 days.',
  '3. Discounted items cannot be returned/refunded.',
  '4. Defective items must be reported within 48h.',
  '5. No returns/exchanges on washed, worn or customized garments.',
].join('\n');

export const STORES = [
  { code: 'KOH', name: 'Krishnas Orchids Hub', type: 'shop' },
  { code: 'MAINWH', name: 'Main Warehouse', type: 'warehouse' },
  { code: 'ONLINE', name: 'Online', type: 'online' },
] as const;
