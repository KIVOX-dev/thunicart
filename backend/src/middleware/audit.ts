import type { FastifyRequest } from 'fastify';
import { ActivityLog } from '../models';

export interface AuditEntry {
  entity: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
}

const SECRET_KEYS = /password|secret|token|hash|otp/i;

/** Remove secrets and convert Mongo values into plain JSON before they are stored in the log. */
export function sanitize(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value, (k, v) => (k && SECRET_KEYS.test(k) ? '[redacted]' : v)));
}

declare module 'fastify' {
  interface FastifyRequest {
    auditEntries: AuditEntry[];
    actor?: { id: string; name: string; role?: string } | null;
  }
}

/** Which admin module a change belongs to, from the entity name or the URL. Used by the activity log filter. */
const MODULE_RULES: Array<[RegExp, string]> = [
  [/^\/(pos|sales|credit-memos)\b|pos_bill|sales_|credit_memo|shift/, 'Billing Center'],
  [/^\/(admin\/orders|admin\/returns|banners|cms|blog|coupons|admin\/store-settings|store)\b|banner|coupon|cms_|blog|store_settings|online_order|^order$/, 'Online Store'],
  [/^\/vendor-settlements|vendor_settlement|^\/(expenses|expense-categories|receipts|payments)\b|^expense|receipt|payment_voucher|^payment$/, 'Accounts'],
  [/^\/(purchase-orders|grn|purchase-bills|vendor-payments)\b|purchase_order|grn|purchase_bill|vendor_payment/, 'Purchase and Payment'],
  [/purchase_return|^\/purchase-returns/, 'Return Transfers'],
  [/^\/stock\/audits|stock_audit/, 'Stock Audit'],
  [/^\/stock\/transfers|transfer/, 'Return Transfers'],
  [/^\/stock|stock_adjust|adjustment/, 'Stock Audit'],
  [/^\/vendors|^vendor$/, 'Vendors'],
  [/^\/customers|^customer$/, 'Customers'],
  [/^\/(users|roles|permissions)\b|^user$|^role$|role_permission/, 'Users'],
  [/^\/(settings|number-series)|number_series|business_profile|app_settings|settings/, 'Settings'],
  [/^\/(items|import|imports|labels|masters|uploads|hsn)\b|^item|variant|review|import/, 'Items and Review Queue'],
  [/^\/(reports|exports|dashboard)\b|export/, 'Reports'],
];
export function moduleOf(path: string, entity?: string | null): string | null {
  for (const [re, name] of MODULE_RULES) if (re.test(path.replace(/^\/api\/v\d+/, '')) || (entity && re.test(entity))) return name;
  return null;
}

export const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Called from onSend: stores every explicit entry, or one generic entry for a successful write. */
export async function persistAudit(req: FastifyRequest, status: number): Promise<void> {
  const isWrite = WRITE_METHODS.has(req.method);
  const entries = req.auditEntries ?? [];
  if (!isWrite && !entries.length) return; // reads are not logged, unless the handler records something (for example an export download)
  if (!entries.length && !(status >= 200 && status < 300)) return;
  const base = {
    at: new Date(),
    userId: req.actor?.id ?? null,
    userName: req.actor?.name ?? null,
    userRole: req.actor?.role ?? null,
    method: req.method,
    path: (req.routeOptions?.url ?? req.url).split('?')[0],
    status,
    ip: req.ip ?? null,
    requestId: String(req.id),
  };
  const rows = entries.length
    ? entries.map((e) => ({ ...base, module: moduleOf(base.path ?? '', e.entity), entity: e.entity, entityId: e.entityId ?? null, action: e.action, before: sanitize(e.before), after: sanitize(e.after) }))
    : [{ ...base, module: moduleOf(base.path ?? ''), entity: null, entityId: null, action: 'write', before: null, after: null }];
  await ActivityLog.insertMany(rows);
}
