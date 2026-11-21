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
/**
 * The live backend names a few customer fields differently from what the screens use: the wallet comes as { balance, items }, addresses as
 * { items } with `phone`, and the profile as `walletBalance`. These adapters give the screens the shape they already expect, so one page
 * works on both the mock and the live API (a mismatch here used to crash /account/wallet).
 */
type Row = Record<string, unknown>;
const addressOut = (a: Row) => ({ ...a, mobile: (a.phone as string | undefined) ?? (a.mobile as string | undefined) ?? '' });
function adaptLive(real: string, data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = data as Row;
  if (real === '/customer/wallet' && Array.isArray(d.items)) {
    // Newest first, so each row's balance is what was left after it: the first is today's balance, the rest step back by the newer amounts.
    let bal = Number(d.balance) || 0;
    return (d.items as Row[]).map((r) => {
      const amount = Number(r.amount) || 0; const here = bal; bal -= amount;
      const label = amount < 0 ? 'Used from your wallet' : 'Added to your wallet';
      return { id: String(r.id), at: String(r.at), amount, balance: here, note: r.docNumber ? `${label} · ${String(r.docNumber)}` : label };
    });
  }
  if (real === '/customer/addresses') return Array.isArray(d.items) ? (d.items as Row[]).map(addressOut) : addressOut(d);
  if (real === '/customer/profile') return { ...d, mobile: (d.mobile as string | null) ?? '', wallet: Number(d.walletBalance ?? d.wallet) || 0 };
  return data;
}
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
      // The live address body calls the number `phone`.
      body: body === undefined ? undefined : JSON.stringify(live && real === '/customer/addresses' && body && typeof body === 'object' && 'mobile' in body ? { ...body, phone: (body as Row).mobile } : body),
    });
  } catch { throw new ApiError(0, 'NETWORK', 'Cannot reach the store.'); }
  if (res.ok) {
    const data = (res.status === 204 ? undefined : await res.json()) as { accessToken?: string | null } | undefined;
    if (live && real === '/customer/auth/otp/verify') setToken(data?.accessToken ?? null);
    if (live && real === '/customer/auth/logout') setToken(null);
    return (live ? adaptLive(real, data) : data) as T;
  }
  if (live && res.status === 401 && !retried && real.startsWith('/customer') && !real.startsWith('/customer/auth') && await refreshToken()) return capi<T>(method, path, body, opts, true);
  let b: { code?: string; message?: string; fields?: FieldIssue[]; requestId?: string } = {};
  try { b = await res.json(); } catch { /* not json */ }
  throw new ApiError(res.status, b.code ?? 'ERROR', b.message ?? `Request failed (${res.status})`, b.fields ?? [], b.requestId);
}
export const newKey = () => crypto.randomUUID();
