export const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const;
export type Action = (typeof ACTIONS)[number];

export const MODULES = [
  { key: 'items', label: 'Items and labels' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'customers', label: 'Customers' },
  { key: 'purchase', label: 'Purchase' },
  { key: 'stock', label: 'Stock and transfers' },
  { key: 'pos', label: 'POS' },
  { key: 'sales', label: 'Sales' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'gst', label: 'GST' },
  { key: 'reports', label: 'Reports' },
  { key: 'orders', label: 'Online orders' },
  { key: 'cms', label: 'Online store CMS' },
  { key: 'settings', label: 'Settings' },
  { key: 'users', label: 'Users' },
  { key: 'roles', label: 'Roles' },
] as const;
export type ModuleKey = (typeof MODULES)[number]['key'];

export type PermissionKey = `${ModuleKey}.${Action}`;
export const ALL_PERMISSION_KEYS: PermissionKey[] = MODULES.flatMap((m) => ACTIONS.map((a) => `${m.key}.${a}` as PermissionKey));
export const isPermissionKey = (k: string): k is PermissionKey => (ALL_PERMISSION_KEYS as string[]).includes(k);

export const SYSTEM_ROLES = ['Admin', 'Sales', 'Buyer Purchase', 'Accounts'] as const;
