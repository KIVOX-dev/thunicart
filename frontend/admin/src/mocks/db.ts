import { ALL_PERMISSION_KEYS, NUMBER_SERIES_KEYS } from '@thunikart/shared';

/** In-memory mock database for MSW mode. Persisted to localStorage so a demo survives reloads. */
export interface MockRole { id: string; name: string; description: string; isSystem: boolean; isAdmin: boolean; permissions: string[]; createdAt: string; updatedAt: string }
export interface MockUser { id: string; name: string; email: string; mobile: string | null; roleId: string; active: boolean; password: string; lastLoginAt: string | null; createdAt: string }
export interface MockActivity { id: string; at: string; userId: string | null; userName: string | null; method: string; path: string; status: number; entity: string | null; entityId: string | null; action: string | null; before: unknown; after: unknown; ip: string | null; requestId: string }
export interface MockDb {
  seq: number;
  roles: MockRole[];
  users: MockUser[];
  activity: MockActivity[];
  profile: Record<string, unknown> & { gstin: string; gstGoLiveAt: string | null; version: number; updatedAt: string };
  series: Array<{ key: string; prefix: string; padding: number; perFinancialYear: boolean; financialYear: string; counter: number }>;
}

const KEY = 'tk.mock.db.v1';
export const mockId = (n: number) => n.toString(16).padStart(24, '0');
const now = () => new Date().toISOString();

function seed(): MockDb {
  const t = now();
  const perms = (list: string[]) => list.filter((k) => ALL_PERMISSION_KEYS.includes(k as never));
  const role = (n: number, name: string, description: string, permissions: string[], isAdmin = false): MockRole => ({
    id: mockId(n), name, description, isSystem: true, isAdmin, permissions, createdAt: t, updatedAt: t,
  });
  const roles = [
    role(1, 'Admin', 'Full access. Can create roles and edit permissions.', [...ALL_PERMISSION_KEYS], true),
    role(2, 'Sales', 'Counter billing and customers.', perms(['pos.view', 'pos.create', 'sales.view', 'sales.create', 'customers.view', 'customers.create', 'customers.edit', 'items.view', 'stock.view', 'orders.view'])),
    role(3, 'Buyer Purchase', 'Vendors, purchase orders and receiving.', perms(['items.view', 'items.create', 'items.edit', 'items.export', 'vendors.view', 'vendors.create', 'vendors.edit', 'purchase.view', 'purchase.create', 'purchase.edit', 'purchase.approve', 'purchase.export', 'stock.view', 'stock.create', 'stock.edit'])),
    role(4, 'Accounts', 'Payments, expenses, GST and reports.', perms(['accounts.view', 'accounts.create', 'accounts.edit', 'accounts.export', 'gst.view', 'gst.export', 'reports.view', 'reports.export', 'sales.view', 'purchase.view', 'vendors.view', 'customers.view'])),
  ];
  const u = (n: number, name: string, email: string, roleId: string): MockUser => ({ id: mockId(100 + n), name, email, mobile: null, roleId, active: true, password: 'Thunikart@123', lastLoginAt: null, createdAt: t });
  return {
    seq: 1000,
    roles,
    users: [
      u(1, 'Admin User', 'admin@thunikart.test', roles[0]!.id),
      u(2, 'Sales User', 'sales@thunikart.test', roles[1]!.id),
      u(3, 'Buyer User', 'buyer@thunikart.test', roles[2]!.id),
      u(4, 'Accounts User', 'accounts@thunikart.test', roles[3]!.id),
    ],
    activity: [],
    profile: {
      legalName: 'Krishnas Orchids', brandName: 'Thunikart',
      addressLines: ['Near KN Hall', 'Peedampalli Main Road', 'Pattanam'],
      city: 'Coimbatore', state: 'Tamil Nadu', stateCode: '33', pincode: '641016',
      phone: '8400044191', email: '', website: '', logoKey: null, gstin: '', pan: '',
      defaultPrintSize: '4x6', termsText: 'Goods once sold will not be taken back without a bill.', invoiceFooter: 'Thank you. Visit again.',
      gstGoLiveAt: null, version: 1, updatedAt: t,
    },
    series: NUMBER_SERIES_KEYS.map((key) => ({
      key, prefix: key, padding: 6, perFinancialYear: ['POS', 'ECM', 'PO', 'GRN', 'PR', 'CN', 'DN'].includes(key), financialYear: '2026-27', counter: 0,
    })),
  };
}

let db: MockDb;
export function getDb(): MockDb {
  if (db) return db;
  try {
    const raw = localStorage.getItem(KEY);
    db = raw ? (JSON.parse(raw) as MockDb) : seed();
  } catch {
    db = seed();
  }
  return db;
}
export function saveDb() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage may be blocked */ }
}
export function resetDb() {
  db = seed();
  saveDb();
}
export const nextId = () => mockId(++getDb().seq);
