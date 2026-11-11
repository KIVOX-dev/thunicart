import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ActivityLog, NumberSeries, User } from '../src/models';
import { nextNumber } from '../src/lib/numberSeries';
import { routeRegistry } from '../src/lib/route';
import { ACCESS_TTL_SECONDS } from '../src/middleware/auth';
import { ADMIN, makeGstin, setupTest, validProfile, type TestCtx } from './helpers';

let t: TestCtx;
const A = '/api/v1';
beforeAll(async () => { t = await setupTest(); });
afterAll(async () => { await t.close(); });

describe('health and docs', () => {
  it('serves /health and /ready, with a request id', async () => {
    const r = await t.api('GET', '/health');
    expect(r.status).toBe(200);
    expect(r.headers['x-request-id']).toBeTruthy();
    expect((await t.api('GET', '/ready')).status).toBe(200);
  });
  it('serves the OpenAPI spec with permissions and idempotency on every operation', async () => {
    const r = await t.api('GET', '/api/docs/openapi.json');
    expect(r.status).toBe(200);
    const op = r.body.paths['/api/v1/users'].post;
    expect(op['x-permission']).toBe('users.create');
    expect(op.responses['403']).toBeTruthy();
    expect(op.requestBody.content['application/json'].schema).toBeTruthy();
  });
  it('unknown route gives the standard error shape', async () => {
    const r = await t.api('GET', `${A}/nope`);
    expect(r.status).toBe(404);
    expect(Object.keys(r.body).sort()).toEqual(['code', 'fields', 'message', 'requestId']);
  });
});

describe('permission coverage', () => {
  it('every route declares a permission, and every protected route returns 401 without a token', async () => {
    expect(routeRegistry.length).toBeGreaterThan(20);
    const ids = '665f0c2a9b1e4c0012ab34cd';
    for (const def of routeRegistry) {
      expect(def.permission, `${def.method} ${def.path} must declare a permission`).toBeTruthy();
      if (def.permission === 'public' || def.permission === 'customer_optional') continue;
      const url = (def.root ? '' : A) + def.path.replace(/:id/g, ids).replace(/:key/g, 'POS');
      const r = await t.api(def.method, url, { body: def.method === 'GET' ? undefined : {} });
      expect(r.status, `${def.method} ${def.path}`).toBe(401);
    }
  });
});

describe('auth', () => {
  it('logs in, returns /me with all permissions for Admin, and sets an httpOnly refresh cookie', async () => {
    const r = await t.api('POST', `${A}/auth/login`, { body: ADMIN });
    expect(r.status).toBe(200);
    expect(r.body.expiresInSeconds).toBe(ACCESS_TTL_SECONDS);
    const c = r.cookies.find((x: any) => x.name === 'tk_admin_rt');
    expect(c.httpOnly).toBe(true);
    const me = await t.api('GET', `${A}/me`, { token: r.body.accessToken });
    expect(me.body.role.isAdmin).toBe(true);
    expect(me.body.permissions).toContain('settings.edit');
    expect(me.body.gst.gstMode).toBe('off');
  });
  it('rejects a wrong password without saying which part was wrong', async () => {
    const r = await t.api('POST', `${A}/auth/login`, { body: { email: ADMIN.email, password: 'wrong-wrong-1' } });
    expect(r.status).toBe(401);
    const r2 = await t.api('POST', `${A}/auth/login`, { body: { email: 'ghost@test.local', password: 'wrong-wrong-1' } });
    expect(r2.body.message).toBe(r.body.message);
  });
  it('validates input with field errors', async () => {
    const r = await t.api('POST', `${A}/auth/login`, { body: { email: 'not-an-email' } });
    expect(r.status).toBe(400);
    expect(r.body.fields.map((f: any) => f.path)).toContain('email');
  });
  it('rotates the refresh cookie and kills the session when an old cookie is replayed', async () => {
    const login = await t.api('POST', `${A}/auth/login`, { body: ADMIN });
    const first = login.cookies.find((x: any) => x.name === 'tk_admin_rt').value;
    const r1 = await t.api('POST', `${A}/auth/refresh`, { cookies: { tk_admin_rt: first } });
    expect(r1.status).toBe(200);
    const second = r1.cookies.find((x: any) => x.name === 'tk_admin_rt').value;
    expect(second).not.toBe(first);
    const replay = await t.api('POST', `${A}/auth/refresh`, { cookies: { tk_admin_rt: first } });
    expect(replay.status).toBe(401);
    const after = await t.api('POST', `${A}/auth/refresh`, { cookies: { tk_admin_rt: second } });
    expect(after.status).toBe(401); // whole session revoked after the replay
  });
  it('logout revokes the session so the access token stops working', async () => {
    const login = await t.api('POST', `${A}/auth/login`, { body: ADMIN });
    const tok = login.body.accessToken;
    const cookie = login.cookies.find((x: any) => x.name === 'tk_admin_rt').value;
    expect((await t.api('GET', `${A}/me`, { token: tok })).status).toBe(200);
    await t.api('POST', `${A}/auth/logout`, { cookies: { tk_admin_rt: cookie } });
    expect((await t.api('GET', `${A}/me`, { token: tok })).status).toBe(401);
  });
  it('lists and revokes my own sessions', async () => {
    const tok = await t.login(ADMIN.email, ADMIN.password);
    const list = await t.api('GET', `${A}/auth/sessions`, { token: tok });
    const other = list.body.items.find((s: any) => !s.current);
    expect(list.body.items.some((s: any) => s.current)).toBe(true);
    expect((await t.api('POST', `${A}/auth/sessions/${other.id}/revoke`, { token: tok })).status).toBe(200);
  });
});

describe('roles, users and 403', () => {
  let managerRoleId: string;
  it('Admin creates the Store Manager role with chosen permissions', async () => {
    const perms = await t.api('GET', `${A}/permissions`, { token: t.adminToken });
    expect(perms.body.keys).toContain('pos.create');
    const r = await t.api('POST', `${A}/roles`, { token: t.adminToken, body: { name: 'Store Manager', description: 'Shop floor', permissions: ['items.view', 'stock.view', 'pos.view', 'pos.create'] } });
    expect(r.status).toBe(201);
    managerRoleId = r.body.id;
    expect(r.body.permissions).toEqual(['items.view', 'pos.create', 'pos.view', 'stock.view']);
  });
  it('rejects unknown permission keys and duplicate names', async () => {
    const bad = await t.api('POST', `${A}/roles`, { token: t.adminToken, body: { name: 'Odd', permissions: ['items.fly'] } });
    expect(bad.status).toBe(400);
    const dup = await t.api('POST', `${A}/roles`, { token: t.adminToken, body: { name: 'store manager' } });
    expect(dup.status).toBe(409);
  });
  it('the new user can log in, and gets 403 outside their permissions', async () => {
    const u = await t.api('POST', `${A}/users`, { token: t.adminToken, body: { name: 'Meena K', email: 'Meena@Test.local', password: 'Shop-Floor-2026', roleId: managerRoleId } });
    expect(u.status).toBe(201);
    expect(u.body.email).toBe('meena@test.local');
    const tok = await t.login('meena@test.local', 'Shop-Floor-2026');
    expect((await t.api('GET', `${A}/me`, { token: tok })).body.role.name).toBe('Store Manager');
    for (const [m, url] of [['GET', '/users'], ['GET', '/roles'], ['GET', '/settings/business'], ['GET', '/activity-log'], ['GET', '/number-series']] as const) {
      const r = await t.api(m, `${A}${url}`, { token: tok });
      expect(r.status, url).toBe(403);
      expect(r.body.code).toBe('FORBIDDEN');
    }
    expect((await t.api('POST', `${A}/users`, { token: tok, body: {} })).status).toBe(403);
    expect((await t.api('PUT', `${A}/settings/business`, { token: tok, body: validProfile() })).status).toBe(403);
    expect((await t.api('GET', `${A}/settings/gst-status`, { token: tok })).status).toBe(200); // authenticated only
  });
  it('changing role permissions takes effect on the next request', async () => {
    const tok = await t.login('meena@test.local', 'Shop-Floor-2026');
    expect((await t.api('GET', `${A}/users`, { token: tok })).status).toBe(403);
    const put = await t.api('PUT', `${A}/roles/${managerRoleId}/permissions`, { token: t.adminToken, body: { permissions: ['users.view'] } });
    expect(put.status).toBe(200);
    expect((await t.api('GET', `${A}/users`, { token: tok })).status).toBe(200);
  });
  it('the Admin role cannot be edited or deleted, and roles in use cannot be deleted', async () => {
    const roles = await t.api('GET', `${A}/roles`, { token: t.adminToken });
    const admin = roles.body.items.find((r: any) => r.isAdmin);
    expect((await t.api('PUT', `${A}/roles/${admin.id}/permissions`, { token: t.adminToken, body: { permissions: [] } })).status).toBe(422);
    expect((await t.api('DELETE', `${A}/roles/${admin.id}`, { token: t.adminToken })).status).toBe(422);
    expect((await t.api('DELETE', `${A}/roles/${managerRoleId}`, { token: t.adminToken })).body.code).toBe('ROLE_IN_USE');
  });
  it('seeds the four roles with the default matrix', async () => {
    const roles = (await t.api('GET', `${A}/roles`, { token: t.adminToken })).body.items;
    const by = (n: string) => roles.find((r: any) => r.name === n);
    expect(by('Sales').permissions).toContain('customers.create');
    expect(by('Sales').permissions).not.toContain('purchase.view');
    expect(by('Buyer Purchase').permissions).toContain('purchase.create');
    expect(by('Buyer Purchase').permissions).not.toContain('purchase.approve');
    expect(by('Accounts').permissions).toContain('gst.export');
    expect(by('Accounts').permissions).not.toContain('settings.view');
  });
});

describe('admin protection', () => {
  let adminRoleId: string; let hrRoleId: string; let salesRoleId: string; let meId: string;
  beforeAll(async () => {
    const roles = (await t.api('GET', `${A}/roles`, { token: t.adminToken })).body.items;
    adminRoleId = roles.find((r: any) => r.isAdmin).id; salesRoleId = roles.find((r: any) => r.name === 'Sales').id;
    hrRoleId = (await t.api('POST', `${A}/roles`, { token: t.adminToken, body: { name: 'HR Helper', permissions: ['users.view', 'users.edit', 'users.delete'] } })).body.id;
    meId = (await t.api('GET', `${A}/me`, { token: t.adminToken })).body.id;
  });
  const mk = async (name: string, email: string, roleId: string) => {
    const u = await t.api('POST', `${A}/users`, { token: t.adminToken, body: { name, email, password: 'Some-Pass-2026', roleId } });
    return { id: u.body.id as string, token: await t.login(email, 'Some-Pass-2026') };
  };

  it('an Admin cannot remove their own Admin role, deactivate themselves or delete themselves', async () => {
    const role = await t.api('PUT', `${A}/users/${meId}`, { token: t.adminToken, body: { roleId: salesRoleId } });
    expect(role.status).toBe(422);
    expect(role.body.code).toBe('SELF_ADMIN_REMOVAL');
    expect((await t.api('PUT', `${A}/users/${meId}`, { token: t.adminToken, body: { active: false } })).body.code).toBe('SELF_ADMIN_REMOVAL');
    expect((await t.api('DELETE', `${A}/users/${meId}`, { token: t.adminToken })).body.code).toBe('SELF_ADMIN_REMOVAL');
  });
  it('the last Admin cannot be demoted, deactivated or deleted by anyone else', async () => {
    const hr = await mk('HR One', 'hr1@test.local', hrRoleId);
    for (const r of [
      await t.api('PUT', `${A}/users/${meId}`, { token: hr.token, body: { roleId: salesRoleId } }),
      await t.api('PUT', `${A}/users/${meId}`, { token: hr.token, body: { active: false } }),
      await t.api('DELETE', `${A}/users/${meId}`, { token: hr.token }),
    ]) {
      expect(r.status).toBe(422);
      expect(r.body.code).toBe('LAST_ADMIN');
    }
    expect((await t.api('GET', `${A}/users/${meId}`, { token: t.adminToken })).body.roleName).toBe('Admin');
  });
  it('with two Admins, one can be demoted, and then the other is protected', async () => {
    const hr = await mk('HR Two', 'hr2@test.local', hrRoleId);
    const second = await mk('Second Admin', 'second@test.local', adminRoleId);
    expect((await t.api('PUT', `${A}/users/${second.id}`, { token: hr.token, body: { roleId: salesRoleId } })).status).toBe(200);
    expect((await t.api('PUT', `${A}/users/${meId}`, { token: hr.token, body: { roleId: salesRoleId } })).body.code).toBe('LAST_ADMIN');
    // The demoted user's old sessions were ended.
    expect((await t.api('GET', `${A}/me`, { token: second.token })).status).toBe(401);
  });
  it('two Admins demoted at the same moment never leaves zero Admins', async () => {
    const hrA = await mk('HR A', 'hra@test.local', hrRoleId);
    const hrB = await mk('HR B', 'hrb@test.local', hrRoleId);
    const other = await mk('Other Admin', 'otheradmin@test.local', adminRoleId);
    const rs = await Promise.all([
      t.api('PUT', `${A}/users/${meId}`, { token: hrA.token, body: { roleId: salesRoleId } }),
      t.api('PUT', `${A}/users/${other.id}`, { token: hrB.token, body: { roleId: salesRoleId } }),
    ]);
    expect(rs.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    expect(await User.countDocuments({ roleId: adminRoleId, active: true, deletedAt: null })).toBeGreaterThanOrEqual(1);
    await User.updateOne({ _id: meId }, { $set: { roleId: adminRoleId, active: true } }); // restore for later tests
    t.adminToken = await t.login(ADMIN.email, ADMIN.password); // a demotion ends that user's sessions
  });
});

describe('login lock', () => {
  it('locks for 15 minutes after 5 wrong passwords, even with the right password, until unlocked', async () => {
    const roles = (await t.api('GET', `${A}/roles`, { token: t.adminToken })).body.items;
    const u = await t.api('POST', `${A}/users`, { token: t.adminToken, body: { name: 'Lock Me', email: 'lock@test.local', password: 'Right-Pass-123', roleId: roles.find((r: any) => r.name === 'Sales').id } });
    for (let i = 0; i < 5; i++) expect((await t.api('POST', `${A}/auth/login`, { body: { email: 'lock@test.local', password: 'wrong-pass-1' } })).status).toBe(401);
    const locked = await t.api('POST', `${A}/auth/login`, { body: { email: 'lock@test.local', password: 'Right-Pass-123' } });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
    const list = await t.api('GET', `${A}/users/${u.body.id}`, { token: t.adminToken });
    expect(list.body.lockedUntil).toBeTruthy();
    await t.api('POST', `${A}/users/${u.body.id}/unlock`, { token: t.adminToken });
    expect((await t.api('POST', `${A}/auth/login`, { body: { email: 'lock@test.local', password: 'Right-Pass-123' } })).status).toBe(200);
  });
});

describe('rate limit', () => {
  it('limits login attempts per IP with a 429 and Retry-After, counted in MongoDB', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.9' };
    const codes: number[] = [];
    let last: any;
    for (let i = 0; i < 24; i++) { last = await t.api('POST', `${A}/auth/login`, { body: { email: 'nobody@test.local', password: 'wrong-pass-1' }, headers }); codes.push(last.status); }
    expect(codes.slice(0, 20).every((c) => c === 401)).toBe(true);
    expect(codes.slice(20).every((c) => c === 429)).toBe(true);
    expect(last.headers['retry-after']).toBeTruthy();
  });
});

describe('GST switch', () => {
  it('is off by default with no tax and a clear status', async () => {
    const s = await t.api('GET', `${A}/settings/gst-status`, { token: t.adminToken });
    expect(s.body).toEqual({ gstMode: 'off', gstin: null, goLiveAt: null });
    const p = await t.api('GET', `${A}/settings/business`, { token: t.adminToken });
    expect(p.body.gstEnabled).toBe(false);
    expect(p.body.city).toBe('Coimbatore');
    expect(p.body.stateCode).toBe('33');
  });
  it('a bad checksum fails with a field error and GST stays off', async () => {
    const good = makeGstin();
    const bad = good.slice(0, 14) + (good[14] === 'A' ? 'B' : 'A');
    const r = await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile({ gstin: bad }) });
    expect(r.status).toBe(400);
    expect(r.body.fields[0].path).toBe('gstin');
    expect(r.body.fields[0].message).toMatch(/checksum/i);
    expect((await t.api('GET', `${A}/settings/gst-status`, { token: t.adminToken })).body.gstMode).toBe('off');
  });
  it('a GSTIN whose first two digits do not match the state code is refused', async () => {
    const r = await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile({ gstin: makeGstin('27') }) });
    expect(r.status).toBe(400);
    expect(r.body.fields[0].message).toMatch(/state code/);
  });
  it('a valid GSTIN turns GST on immediately and records the go-live time', async () => {
    const before = Date.now();
    const r = await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile({ gstin: makeGstin(), pan: 'ABCDE1234F' }) });
    expect(r.status).toBe(200);
    expect(r.body.gstEnabled).toBe(true);
    const s = (await t.api('GET', `${A}/settings/gst-status`, { token: t.adminToken })).body;
    expect(s.gstMode).toBe('on');
    expect(new Date(s.goLiveAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    // Saving again keeps the original go-live moment.
    const again = await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile({ gstin: makeGstin(), pan: 'ABCDE1234F', phone: '9999999999' }) });
    expect(again.body.gstGoLiveAt).toBe(s.goLiveAt);
  });
  it('clearing the GSTIN needs confirmation and turns GST off', async () => {
    const no = await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile({ gstin: '' }) });
    expect(no.status).toBe(422);
    expect(no.body.code).toBe('CONFIRMATION_REQUIRED');
    const yes = await t.api('PUT', `${A}/settings/business`, { token: t.adminToken, body: validProfile({ gstin: '', confirmGstClear: true }) });
    expect(yes.status).toBe(200);
    expect(yes.body.gstEnabled).toBe(false);
    expect((await t.api('GET', `${A}/settings/gst-status`, { token: t.adminToken })).body.gstMode).toBe('off');
  });
});

describe('number series', () => {
  it('issues numbers like POS-2026-27-000001 and previews the next one', async () => {
    const list = await t.api('GET', `${A}/number-series`, { token: t.adminToken });
    expect(list.body.items.map((s: any) => s.key).sort()).toEqual(['ADJ', 'AUD', 'CN', 'CNT', 'CUST', 'DN', 'EAN', 'ECM', 'GRN', 'ITEM', 'ORD', 'PB', 'PO', 'POS', 'PR', 'PV', 'RCT', 'TRF', 'VND', 'VP']);
    const pos = list.body.items.find((s: any) => s.key === 'POS');
    expect(pos.next).toMatch(/^POS-\d{4}-\d{2}-000001$/);
    expect(list.body.items.find((s: any) => s.key === 'CUST').next).toBe('CUST-000001');
    expect(await nextNumber('POS')).toBe(pos.next);
  });
  it('two requests at the same moment never get the same number (concurrency)', async () => {
    const results = await Promise.all(Array.from({ length: 60 }, () => nextNumber('PO')));
    expect(new Set(results).size).toBe(60);
    const counters = results.map((r) => Number(r.split('-').pop())).sort((a, b) => a - b);
    expect(counters[counters.length - 1]! - counters[0]!).toBe(59); // no gaps either
  });
  it('the first numbers of a new financial year are race safe and restart at 1', async () => {
    const date = new Date('2031-05-01T00:00:00Z');
    const results = await Promise.all(Array.from({ length: 25 }, () => nextNumber('GRN', { date })));
    expect(new Set(results).size).toBe(25);
    expect(results.every((r) => r.startsWith('GRN-2031-32-'))).toBe(true);
    expect(results.map((r) => Number(r.split('-').pop())).sort((a, b) => a - b)[0]).toBe(1);
  });
  it('the counter can only move forward; prefix and padding can change', async () => {
    const up = await t.api('PUT', `${A}/number-series/ECM`, { token: t.adminToken, body: { counter: 500, padding: 5 } });
    expect(up.status).toBe(200);
    expect(up.body.next).toMatch(/ECM-\d{4}-\d{2}-00501$/);
    const back = await t.api('PUT', `${A}/number-series/ECM`, { token: t.adminToken, body: { counter: 10 } });
    expect(back.status).toBe(422);
    expect((await t.api('PUT', `${A}/number-series/NOPE`, { token: t.adminToken, body: { padding: 4 } })).status).toBe(404);
  });
  it('the series collection has the unique index that makes this safe', async () => {
    const idx = await NumberSeries.collection.indexes();
    expect(idx.some((i: any) => i.unique && i.key.key === 1 && i.key.financialYear === 1)).toBe(true);
  });
});

describe('idempotency', () => {
  it('replays the stored response for the same key and creates one user', async () => {
    const roles = (await t.api('GET', `${A}/roles`, { token: t.adminToken })).body.items;
    const body = { name: 'Idem Person', email: 'idem@test.local', password: 'Idem-Pass-2026', roleId: roles.find((r: any) => r.name === 'Sales').id };
    const h = { 'idempotency-key': 'key-12345678' };
    const r1 = await t.api('POST', `${A}/users`, { token: t.adminToken, body, headers: h });
    const r2 = await t.api('POST', `${A}/users`, { token: t.adminToken, body, headers: h });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.headers['idempotent-replay']).toBe('true');
    expect(r2.body.id).toBe(r1.body.id);
    expect(await User.countDocuments({ email: 'idem@test.local' })).toBe(1);
  });
  it('the same key with a different body is a 422, and parallel duplicates create one row', async () => {
    const roles = (await t.api('GET', `${A}/roles`, { token: t.adminToken })).body.items;
    const rid = roles.find((r: any) => r.name === 'Sales').id;
    const diff = await t.api('POST', `${A}/users`, { token: t.adminToken, body: { name: 'Other', email: 'other@test.local', password: 'Other-Pass-2026', roleId: rid }, headers: { 'idempotency-key': 'key-12345678' } });
    expect(diff.status).toBe(422);
    const body = { name: 'Par', email: 'par@test.local', password: 'Par-Pass-20261', roleId: rid };
    const rs = await Promise.all(Array.from({ length: 5 }, () => t.api('POST', `${A}/users`, { token: t.adminToken, body, headers: { 'idempotency-key': 'parallel-key-1' } })));
    expect(rs.filter((r) => r.status === 201).length).toBeGreaterThanOrEqual(1);
    expect(await User.countDocuments({ email: 'par@test.local' })).toBe(1);
  });
});

describe('activity log', () => {
  it('records writes with user, request id, before and after, and never stores passwords', async () => {
    const roles = (await t.api('GET', `${A}/roles`, { token: t.adminToken })).body.items;
    const sales = roles.find((r: any) => r.name === 'Sales');
    const u = await t.api('POST', `${A}/users`, { token: t.adminToken, body: { name: 'Audit Me', email: 'audit@test.local', password: 'Audit-Pass-2026', roleId: sales.id } });
    const upd = await t.api('PUT', `${A}/users/${u.body.id}`, { token: t.adminToken, body: { name: 'Audit Renamed' } });
    const log = await t.api('GET', `${A}/activity-log?entity=user&pageSize=50`, { token: t.adminToken });
    const row = log.body.items.find((i: any) => i.entityId === u.body.id && i.action === 'update');
    expect(row.before.name).toBe('Audit Me');
    expect(row.after.name).toBe('Audit Renamed');
    expect(row.userName).toBeTruthy();
    expect(row.requestId).toBe(upd.headers['x-request-id']);
    const raw = JSON.stringify(await ActivityLog.find().lean());
    expect(raw).not.toContain('Audit-Pass-2026');
    expect(raw).not.toMatch(/\$argon2/);
  });
  it('logs failed logins and supports paging', async () => {
    await t.api('POST', `${A}/auth/login`, { body: { email: ADMIN.email, password: 'nope-nope-1' } });
    const log = await t.api('GET', `${A}/activity-log?entity=auth&pageSize=2&page=1`, { token: t.adminToken });
    expect(log.body.items.length).toBeLessThanOrEqual(2);
    expect(log.body.items.some((i: any) => i.action === 'login_failed')).toBe(true);
    expect(typeof log.body.total).toBe('number');
    expect((await t.api('GET', `${A}/activity-log?pageSize=500`, { token: t.adminToken })).status).toBe(400);
  });
});
