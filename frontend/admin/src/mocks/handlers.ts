import { http, HttpResponse, delay, type HttpHandler } from 'msw';
import {
  ACTIONS, MODULES, businessProfileBody, numberSeriesUpdateBody, resetPasswordBody,
  roleCreateBody, rolePermissionsBody, userCreateBody, userUpdateBody, loginBody, isPermissionKey,
} from '@thunikart/shared';
import { getDb, nextId, saveDb, type MockUser } from './db';

import { SESSION_KEY, fail, guarded, log, p, roleOf, zodFields } from './helpers';
import { catalogHandlers } from './catalog-handlers';
import { inventoryHandlers } from './inventory-handlers';
import { posHandlers } from './pos-handlers';
import { accountsHandlers } from './accounts-handlers';
import type { MockRole } from './db';

const userDto = (u: MockUser) => ({ id: u.id, name: u.name, email: u.email, mobile: u.mobile, roleId: u.roleId, roleName: roleOf(u.roleId)?.name ?? '', active: u.active, lockedUntil: null, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt });
const roleDto = (r: MockRole) => ({ ...r, userCount: getDb().users.filter((u) => u.roleId === r.id).length });
const gstStatus = () => {
  const pr = getDb().profile;
  return { gstMode: pr.gstin ? ('on' as const) : ('off' as const), gstin: pr.gstin || null, goLiveAt: pr.gstGoLiveAt };
};

export const handlers: HttpHandler[] = [
  http.post(p('/auth/login'), async ({ request }) => {
    await delay(200);
    const parsed = loginBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const u = getDb().users.find((x) => x.email === parsed.data.email);
    if (!u || u.password !== parsed.data.password) return fail(401, 'INVALID_CREDENTIALS', 'Email or password is wrong.');
    if (!u.active) return fail(403, 'USER_DISABLED', 'This account is switched off. Ask an Admin.');
    u.lastLoginAt = new Date().toISOString();
    saveDb();
    localStorage.setItem(SESSION_KEY, u.id);
    const r = roleOf(u.roleId)!;
    return HttpResponse.json({ accessToken: `mock-token-${u.id}`, expiresInSeconds: 900, user: { id: u.id, name: u.name, email: u.email, roleId: r.id, roleName: r.name } });
  }),
  http.post(p('/auth/refresh'), async () => {
    const id = localStorage.getItem(SESSION_KEY);
    const u = getDb().users.find((x) => x.id === id && x.active);
    if (!u) return fail(401, 'UNAUTHENTICATED', 'Session expired.');
    return HttpResponse.json({ accessToken: `mock-token-${u.id}`, expiresInSeconds: 900 });
  }),
  http.post(p('/auth/logout'), () => {
    localStorage.removeItem(SESSION_KEY);
    return HttpResponse.json({ ok: true });
  }),
  http.post(p('/auth/forgot-password'), async () => {
    await delay(300);
    return HttpResponse.json({ ok: true });
  }),
  http.get(p('/auth/sessions'), guarded(null, ({ user }) => HttpResponse.json([
    { id: nextId(), createdAt: user.lastLoginAt ?? new Date().toISOString(), lastUsedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), ip: '127.0.0.1', userAgent: navigator.userAgent, current: true },
  ]))),
  http.get(p('/me'), guarded(null, ({ user }) => {
    const r = roleOf(user.roleId)!;
    return HttpResponse.json({ id: user.id, name: user.name, email: user.email, role: { id: r.id, name: r.name, isAdmin: r.isAdmin }, permissions: r.permissions, gst: gstStatus() });
  })),
  http.get(p('/settings/gst-status'), guarded(null, () => HttpResponse.json(gstStatus()))),

  http.get(p('/settings/business-profile'), guarded('settings.view', () => {
    const pr = getDb().profile;
    return HttpResponse.json({ ...pr, gstEnabled: !!pr.gstin });
  })),
  http.put(p('/settings/business-profile'), guarded('settings.edit', async ({ user, request }) => {
    const parsed = businessProfileBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const b = parsed.data;
    const d = getDb();
    const fields: Array<{ path: string; message: string }> = [];
    if (b.gstin) {
      if (b.gstin.slice(0, 2) !== b.stateCode) fields.push({ path: 'gstin', message: `GSTIN starts with state code ${b.gstin.slice(0, 2)} but the business state code is ${b.stateCode}` });
      if (b.pan && b.gstin.slice(2, 12) !== b.pan) fields.push({ path: 'gstin', message: 'GSTIN does not contain the PAN you entered' });
    }
    if (fields.length) return fail(422, 'VALIDATION', 'Check the highlighted fields.', fields);
    if (!b.gstin && d.profile.gstin && !b.confirmGstClear) return fail(422, 'GST_CLEAR_CONFIRM_REQUIRED', 'Clearing a live GSTIN switches GST off. Confirm to continue.');
    const before = { gstin: d.profile.gstin };
    const { confirmGstClear: _c, ...rest } = b;
    const goLive = b.gstin && !d.profile.gstin;
    d.profile = { ...d.profile, ...rest, gstGoLiveAt: b.gstin ? (goLive ? new Date().toISOString() : d.profile.gstGoLiveAt) : null, version: d.profile.version + 1, updatedAt: new Date().toISOString() };
    saveDb();
    log(user, 'PUT', '/settings/business-profile', 'business-profile', goLive ? 'gst.go-live' : 'update', null, before, { gstin: b.gstin });
    return HttpResponse.json({ ...d.profile, gstEnabled: !!d.profile.gstin });
  })),

  http.get(p('/settings/number-series'), guarded('settings.view', () => HttpResponse.json(getDb().series.map((s) => ({ ...s, next: `${s.prefix}${s.perFinancialYear ? '/' + s.financialYear + '/' : '-'}${String(s.counter + 1).padStart(s.padding, '0')}` }))))),
  http.patch(p('/settings/number-series/:key'), guarded('settings.edit', async ({ user, request, params }) => {
    const parsed = numberSeriesUpdateBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const s = getDb().series.find((x) => x.key === params.key);
    if (!s) return fail(404, 'NOT_FOUND', 'Number series not found.');
    if (parsed.data.counter !== undefined && parsed.data.counter < s.counter) return fail(422, 'COUNTER_BACKWARDS', 'The counter can only go forward.', [{ path: 'counter', message: `Must be ${s.counter} or more` }]);
    const before = { ...s };
    Object.assign(s, parsed.data);
    saveDb();
    log(user, 'PATCH', `/settings/number-series/${s.key}`, 'number-series', 'update', s.key, before, { ...s });
    return HttpResponse.json({ ...s, next: `${s.prefix}-${String(s.counter + 1).padStart(s.padding, '0')}` });
  })),

  http.get(p('/users'), guarded('users.view', ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const page = Number(url.searchParams.get('page') ?? 1);
    const size = Number(url.searchParams.get('pageSize') ?? 20);
    const all = getDb().users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.includes(q));
    const items = all.slice((page - 1) * size, page * size).map(userDto);
    return HttpResponse.json({ items, total: all.length, nextPage: page * size < all.length ? page + 1 : null });
  })),
  http.post(p('/users'), guarded('users.create', async ({ user, request }) => {
    const parsed = userCreateBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const d = getDb();
    if (d.users.some((u) => u.email === parsed.data.email)) return fail(409, 'EMAIL_TAKEN', 'A user with this email already exists.', [{ path: 'email', message: 'Already in use' }]);
    if (!roleOf(parsed.data.roleId)) return fail(422, 'VALIDATION', 'Choose a role.', [{ path: 'roleId', message: 'Role not found' }]);
    const u: MockUser = { id: nextId(), name: parsed.data.name, email: parsed.data.email, mobile: parsed.data.mobile ?? null, roleId: parsed.data.roleId, active: parsed.data.active, password: parsed.data.password, lastLoginAt: null, createdAt: new Date().toISOString() };
    d.users.push(u);
    saveDb();
    log(user, 'POST', '/users', 'user', 'create', u.id, null, { email: u.email, roleId: u.roleId });
    return HttpResponse.json(userDto(u), { status: 201 });
  })),
  http.patch(p('/users/:id'), guarded('users.edit', async ({ user, request, params }) => {
    const parsed = userUpdateBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const u = getDb().users.find((x) => x.id === params.id);
    if (!u) return fail(404, 'NOT_FOUND', 'User not found.');
    if (u.id === user.id && parsed.data.active === false) return fail(422, 'SELF_DISABLE', 'You cannot switch off your own account.');
    const before = userDto(u);
    Object.assign(u, parsed.data);
    saveDb();
    log(user, 'PATCH', `/users/${u.id}`, 'user', 'update', u.id, before, userDto(u));
    return HttpResponse.json(userDto(u));
  })),
  http.post(p('/users/:id/reset-password'), guarded('users.edit', async ({ user, request, params }) => {
    const parsed = resetPasswordBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const u = getDb().users.find((x) => x.id === params.id);
    if (!u) return fail(404, 'NOT_FOUND', 'User not found.');
    u.password = parsed.data.password;
    saveDb();
    log(user, 'POST', `/users/${u.id}/reset-password`, 'user', 'reset-password', u.id, null, null);
    return HttpResponse.json({ ok: true });
  })),

  http.get(p('/roles/permission-catalog'), guarded('roles.view', () => HttpResponse.json({
    actions: [...ACTIONS], modules: MODULES.map((m) => ({ key: m.key, label: m.label, actions: [...ACTIONS] })),
    keys: MODULES.flatMap((m) => ACTIONS.map((a) => `${m.key}.${a}`)),
  }))),
  http.get(p('/roles'), guarded('roles.view', () => HttpResponse.json(getDb().roles.map(roleDto)))),
  http.post(p('/roles'), guarded('roles.create', async ({ user, request }) => {
    const parsed = roleCreateBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const d = getDb();
    if (d.roles.some((r) => r.name.toLowerCase() === parsed.data.name.toLowerCase())) return fail(409, 'ROLE_EXISTS', 'A role with this name exists.', [{ path: 'name', message: 'Already in use' }]);
    const t = new Date().toISOString();
    const r: MockRole = { id: nextId(), name: parsed.data.name, description: parsed.data.description, isSystem: false, isAdmin: false, permissions: parsed.data.permissions.filter(isPermissionKey), createdAt: t, updatedAt: t };
    d.roles.push(r);
    saveDb();
    log(user, 'POST', '/roles', 'role', 'create', r.id, null, { name: r.name, permissions: r.permissions.length });
    return HttpResponse.json(roleDto(r), { status: 201 });
  })),
  http.patch(p('/roles/:id'), guarded('roles.edit', async ({ user, request, params }) => {
    const parsed = roleUpdateParse(await request.json());
    if (!parsed.ok) return fail(422, 'VALIDATION', 'Check the highlighted fields.', parsed.fields);
    const r = roleOf(String(params.id));
    if (!r) return fail(404, 'NOT_FOUND', 'Role not found.');
    if (r.isSystem) return fail(422, 'SYSTEM_ROLE', 'System roles cannot be renamed.');
    const before = { name: r.name };
    Object.assign(r, parsed.data, { updatedAt: new Date().toISOString() });
    saveDb();
    log(user, 'PATCH', `/roles/${r.id}`, 'role', 'update', r.id, before, { name: r.name });
    return HttpResponse.json(roleDto(r));
  })),
  http.put(p('/roles/:id/permissions'), guarded('roles.edit', async ({ user, request, params }) => {
    const parsed = rolePermissionsBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const r = roleOf(String(params.id));
    if (!r) return fail(404, 'NOT_FOUND', 'Role not found.');
    if (r.isAdmin) return fail(422, 'ADMIN_LOCKED', 'The Admin role always has every permission.');
    const before = r.permissions.length;
    r.permissions = parsed.data.permissions.filter(isPermissionKey);
    r.updatedAt = new Date().toISOString();
    saveDb();
    log(user, 'PUT', `/roles/${r.id}/permissions`, 'role', 'permissions', r.id, { count: before }, { count: r.permissions.length });
    return HttpResponse.json(roleDto(r));
  })),

  http.get(p('/activity'), guarded('settings.view', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? 1);
    const size = Number(url.searchParams.get('pageSize') ?? 20);
    const entity = url.searchParams.get('entity');
    const userId = url.searchParams.get('userId');
    const all = getDb().activity.filter((a) => (!entity || a.entity === entity) && (!userId || a.userId === userId));
    return HttpResponse.json({ items: all.slice((page - 1) * size, page * size), total: all.length, nextPage: page * size < all.length ? page + 1 : null });
  })),
  ...catalogHandlers,
  ...inventoryHandlers,
  ...posHandlers,
  ...accountsHandlers,
];

function roleUpdateParse(body: unknown): { ok: true; data: { name?: string; description?: string } } | { ok: false; fields: Array<{ path: string; message: string }> } {
  const b = (body ?? {}) as { name?: string; description?: string };
  if (b.name !== undefined && (b.name.trim().length < 2 || b.name.length > 60)) return { ok: false, fields: [{ path: 'name', message: 'Use 2 to 60 characters' }] };
  return { ok: true, data: { ...(b.name !== undefined && { name: b.name.trim() }), ...(b.description !== undefined && { description: b.description }) } };
}
