import { HttpResponse, delay } from 'msw';
import { API_PREFIX } from '@thunikart/shared';
import { getDb, nextId } from './db';
import type { MockUser } from './db';

export const p = (path: string) => `*${API_PREFIX}${path}`;
export const SESSION_KEY = 'tk.mock.session';
let rid = 0;
export const requestId = () => `req_mock_${(++rid).toString(36)}`;

export function fail(status: number, code: string, message: string, fields: Array<{ path: string; message: string }> = []) {
  return HttpResponse.json({ code, message, fields, requestId: requestId() }, { status });
}
export const zodFields = (e: { issues: Array<{ path: PropertyKey[]; message: string }> }) => e.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));

export const roleOf = (id: string) => getDb().roles.find((r) => r.id === id);
export function authed(req: Request): MockUser | null {
  const m = /^Bearer mock-token-(.+)$/.exec(req.headers.get('authorization') ?? '');
  return (m && getDb().users.find((u) => u.id === m[1] && u.active)) || null;
}
export function can(u: MockUser, key: string) {
  const r = roleOf(u.roleId);
  return !!r && (r.isAdmin || r.permissions.includes(key));
}
export function log(u: MockUser | null, method: string, path: string, entity: string, action: string, entityId: string | null, before: unknown, after: unknown) {
  const d = getDb();
  d.activity.unshift({ id: nextId(), at: new Date().toISOString(), userId: u?.id ?? null, userName: u?.name ?? null, method, path, status: 200, entity, entityId, action, before, after, ip: '127.0.0.1', requestId: requestId() });
  d.activity.length = Math.min(d.activity.length, 300);
}

/** Wraps a handler with auth and a permission check. 401 triggers the client's quiet refresh, 403 shows the no permission page. */
export function guarded(perm: string | null, fn: (ctx: { user: MockUser; request: Request; params: Record<string, string | readonly string[] | undefined> }) => Promise<Response> | Response) {
  return async ({ request, params }: { request: Request; params: Record<string, string | readonly string[] | undefined> }) => {
    await delay(120);
    const user = authed(request);
    if (!user) return fail(401, 'UNAUTHENTICATED', 'Please sign in again.');
    if (perm && !can(user, perm)) return fail(403, 'FORBIDDEN', `You do not have permission (${perm}).`);
    return fn({ user, request, params });
  };
}

