import { API_PREFIX } from '@thunikart/shared';

/**
 * Thin typed wrapper used by the per module hooks. Screens never call fetch.
 * It will be swapped for the generated client in shared/src/api-client once docs/api/openapi.json exists
 * (see docs/api-requests.md). Behaviour follows the prompt: quiet refresh on 401, Idempotency-Key, error shapes.
 */
const RAW = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
export const MOCK_MODE = !RAW || RAW.includes('REPLACE_ME');
const BASE = MOCK_MODE ? '' : RAW.replace(/\/$/, '');

export interface FieldIssue { path: string; message: string }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: FieldIssue[] = [], public requestId?: string) {
    super(message);
  }
  /** What to tell the person, by status. */
  get friendly(): string {
    if (this.status === 403) return 'You do not have permission to do this. Ask an Admin if you need access.';
    if (this.status === 429) return 'Too many requests. Please try again in a minute.';
    if (this.status === 0) return 'Cannot reach the server. Check your connection.';
    return this.message;
  }
}

let accessToken: string | null = null;
let onAuthFailure: (() => void) | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const setAuthFailureHandler = (fn: (() => void) | null) => { onAuthFailure = fn; };

let refreshing: Promise<boolean> | null = null;
/** Single flight refresh using the httpOnly cookie. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}${API_PREFIX}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      accessToken = ((await res.json()) as { accessToken: string }).accessToken;
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

export interface RequestOptions { body?: unknown; query?: Record<string, string | number | boolean | undefined | null>; idempotencyKey?: string; skipRefresh?: boolean }

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(`${BASE}${API_PREFIX}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const send = () => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    return fetch(url, { method, headers, credentials: 'include', body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  };
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && !opts.skipRefresh) {
      if (await refreshSession()) res = await send();
      else { accessToken = null; onAuthFailure?.(); }
    }
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server.');
  }
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
  let b: { code?: string; message?: string; fields?: FieldIssue[]; requestId?: string } = {};
  try { b = await res.json(); } catch { /* non JSON error */ }
  throw new ApiError(res.status, b.code ?? 'ERROR', b.message ?? `Request failed (${res.status})`, b.fields ?? [], b.requestId);
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>('POST', path, { ...o, body: body ?? {} }),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, { body }),
};

/** Fresh key per user action. Reuse the same value when retrying that action. */
export const newIdempotencyKey = () => crypto.randomUUID();
