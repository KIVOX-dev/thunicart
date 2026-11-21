import { API_BASE, MOCK_MODE } from './config';

export interface FieldIssue { path: string; message: string }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: FieldIssue[] = [], public requestId?: string) { super(message); }
  get friendly(): string {
    if (this.status === 429) return 'Too many tries. Please wait a minute and try again.';
    if (this.status === 0) return 'Cannot reach the store. Check your connection.';
    return this.message;
  }
}

/**
 * On the live API the customer routes live under /customer and use a bearer token (the demo server used a cookie). This maps the screens' paths
 * to the live ones and keeps the token for the tab. When the token has run out, the refresh cookie gets a new one.
 */
const LIVE_PATHS: Record<string, string> = { '/auth/otp/request': '/customer/auth/otp/send', '/auth/otp/verify': '/customer/auth/otp/verify', '/auth/logout': '/customer/auth/logout', '/me': '/customer/profile', '/addresses': '/customer/addresses', '/wallet': '/customer/wallet' };
const TOKEN_KEY = 'tk_customer_token';
const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = (t: string | null) => { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } };
async function refreshToken(): Promise<boolean> {
  try { const r = await fetch(`${API_BASE}/customer/auth/refresh`, { method: 'POST', credentials: 'include' }); if (!r.ok) return false; const j = await r.json(); setToken(j.accessToken ?? null); return !!j.accessToken; } catch { return false; }
}

/** Browser calls to the API. Errors carry the field messages and the request id for support. */
export async function capi<T>(method: string, path: string, body?: unknown, opts: { idempotencyKey?: string } = {}, retried = false): Promise<T> {
  let res: Response;
  const live = !MOCK_MODE; const real = live ? (LIVE_PATHS[path] ?? path) : path;
  try {
    res = await fetch(`${API_BASE}${real}`, {
      method, credentials: 'include',
      headers: { Accept: 'application/json', ...(live && getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new ApiError(0, 'NETWORK', 'Cannot reach the store.'); }
  if (res.ok) {
    const data = (res.status === 204 ? undefined : await res.json()) as any;
    if (live && real === '/customer/auth/otp/verify') setToken(data?.accessToken ?? null);
    if (live && real === '/customer/auth/logout') setToken(null);
    return data as T;
  }
  if (live && res.status === 401 && !retried && real.startsWith('/customer') && !real.startsWith('/customer/auth') && await refreshToken()) return capi<T>(method, path, body, opts, true);
  let b: { code?: string; message?: string; fields?: FieldIssue[]; requestId?: string } = {};
  try { b = await res.json(); } catch { /* not json */ }
  throw new ApiError(res.status, b.code ?? 'ERROR', b.message ?? `Request failed (${res.status})`, b.fields ?? [], b.requestId);
}
export const newKey = () => crypto.randomUUID();
