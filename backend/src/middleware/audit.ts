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
    actor?: { id: string; name: string } | null;
  }
}

export const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Called from onSend: stores every explicit entry, or one generic entry for a successful write. */
export async function persistAudit(req: FastifyRequest, status: number): Promise<void> {
  const isWrite = WRITE_METHODS.has(req.method);
  if (!isWrite) return;
  const entries = req.auditEntries ?? [];
  if (!entries.length && !(status >= 200 && status < 300)) return;
  const base = {
    at: new Date(),
    userId: req.actor?.id ?? null,
    userName: req.actor?.name ?? null,
    method: req.method,
    path: (req.routeOptions?.url ?? req.url).split('?')[0],
    status,
    ip: req.ip ?? null,
    requestId: String(req.id),
  };
  const rows = entries.length
    ? entries.map((e) => ({ ...base, entity: e.entity, entityId: e.entityId ?? null, action: e.action, before: sanitize(e.before), after: sanitize(e.after) }))
    : [{ ...base, entity: null, entityId: null, action: 'write', before: null, after: null }];
  await ActivityLog.insertMany(rows);
}
