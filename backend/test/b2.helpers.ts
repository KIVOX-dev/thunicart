import { randomBytes } from 'node:crypto';
import { makeGstin, validProfile, type TestCtx } from './helpers';

export const A = '/api/v1';
export const key = () => `k-${randomBytes(8).toString('hex')}`;

export function api(t: TestCtx, token: () => string) {
  const call = (method: string, url: string, body?: unknown, opts: { token?: string; headers?: Record<string, string>; idem?: string | false } = {}) =>
    t.api(method, `${A}${url}`, { token: opts.token ?? token(), body, headers: { ...(opts.idem === false || method === 'GET' ? {} : { 'idempotency-key': opts.idem ?? key() }), ...(opts.headers ?? {}) } });
  return {
    get: (url: string, tk?: string) => call('GET', url, undefined, { token: tk }),
    post: (url: string, body: unknown = {}, o?: { token?: string; headers?: Record<string, string>; idem?: string | false }) => call('POST', url, body, o),
    put: (url: string, body: unknown, o?: { token?: string; headers?: Record<string, string>; idem?: string | false }) => call('PUT', url, body, { idem: false, ...o }),
    del: (url: string, tk?: string) => call('DELETE', url, undefined, { token: tk, idem: false }),
  };
}

export async function setGst(t: TestCtx, on: boolean) {
  await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile(on ? { gstin: makeGstin(), pan: 'ABCDE1234F' } : { gstin: '', confirmGstClear: true }) });
}

export async function tokenFor(t: TestCtx, roleName: string, email: string) {
  const roles = (await t.api('GET', `${A}/roles`, { token: t.adminToken })).body.items;
  await t.api('POST', `${A}/users`, { token: t.adminToken, body: { name: roleName, email, password: 'Some-Pass-2026', roleId: roles.find((r: any) => r.name === roleName).id } });
  return t.login(email, 'Some-Pass-2026');
}

/** Vendors (Tiruppur 33, Surat 24), two stores, and items with variants. GST is OFF when this runs. */
export async function fixtures(t: TestCtx) {
  const h = api(t, () => t.adminToken);
  const stores = (await h.get('/stores')).body.items;
  const shop = stores.find((s: any) => s.type === 'shop'); const wh = stores.find((s: any) => s.name === 'Main Warehouse');
  const vendor = async (name: string, stateCode: string, terms: string, n: number) =>
    (await h.post('/vendors', { name, email: `v${n}@x.in`, mobile: `98000000${String(n).padStart(2, '0')}`, city: 'X', stateCode, paymentTerms: terms })).body;
  const knit = await vendor('Knitwear Hub Corp', '33', 'NET15', 1);
  const tex = await vendor('TexStyles Manufacturing', '24', 'NET30', 2);
  const mkItem = async (name: string, hsn: string, mrp: number, reorder = 0) =>
    (await h.post('/items', { name, hsn, variants: [{ size: 'M', color: 'Blue', mrp, sellingPrice: mrp, reorderLevel: reorder }] })).body.variants[0];
  const tee = await mkItem('Cotton Tee', '6109', 45000);
  const dress = await mkItem('Floral Dress', '6204', 149900);
  const kurti = await mkItem('Kurti', '6104', 80000, 5);
  return { h, shop, wh, knit, tex, tee, dress, kurti };
}

export type Fx = Awaited<ReturnType<typeof fixtures>>;
export const stockOf = async (h: ReturnType<typeof api>, variantId: string, storeId?: string) => {
  const r = (await h.get(`/stock?includeZero=true&pageSize=100${storeId ? `&storeId=${storeId}` : ''}`)).body.items.find((x: any) => x.variantId === variantId);
  return r ?? { onHand: 0, reserved: 0, available: 0 };
};
