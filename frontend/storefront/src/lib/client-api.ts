import { API_BASE } from './config';

export interface FieldIssue { path: string; message: string }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: FieldIssue[] = [], public requestId?: string) { super(message); }
  get friendly(): string {
    if (this.status === 429) return 'Too many tries. Please wait a minute and try again.';
    if (this.status === 0) return 'Cannot reach the store. Check your connection.';
    return this.message;
  }
}

/** Browser calls to the API. Errors carry the field messages and the request id for support. */
export async function capi<T>(method: string, path: string, body?: unknown, opts: { idempotencyKey?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method, credentials: 'include',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new ApiError(0, 'NETWORK', 'Cannot reach the store.'); }
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
  let b: { code?: string; message?: string; fields?: FieldIssue[]; requestId?: string } = {};
  try { b = await res.json(); } catch { /* not json */ }
  throw new ApiError(res.status, b.code ?? 'ERROR', b.message ?? `Request failed (${res.status})`, b.fields ?? [], b.requestId);
}
export const newKey = () => crypto.randomUUID();
