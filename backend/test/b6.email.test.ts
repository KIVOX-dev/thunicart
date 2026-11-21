import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { outbox } from '../src/adapters/email';
import { Role, PasswordReset } from '../src/models';
import { setupTest, type TestCtx } from './helpers';

let t: TestCtx; let roleId: string;
const A = '/api/v1';
beforeAll(async () => { t = await setupTest(); roleId = String(((await Role.findOne({ name: { $ne: 'Admin' } }).lean()) as any)._id); });
afterAll(async () => { await t.close(); });
const mailTo = (to: string) => [...outbox].reverse().find((m) => m.to === to);

describe('staff emails', () => {
  it('a new employee is emailed their login, branded with the logo', async () => {
    const r = await t.api('POST', `${A}/users`, { token: t.adminToken, body: { name: 'Ravi Kumar', email: 'ravi@test.local', password: 'Counter-Pass-2026', roleId } });
    expect(r.status).toBe(201);
    expect(r.body.credentialsEmailed).toBe(true);
    const m = mailTo('ravi@test.local')!;
    expect(m.subject).toMatch(/staff login/i);
    expect(m.html).toContain('logo-primary.png');
    expect(m.html).toContain('Counter-Pass-2026');
  });

  it('forgot password works for any staff login, says the same for strangers, and the link works once', async () => {
    const before = outbox.length;
    const unknown = await t.api('POST', `${A}/auth/forgot-password`, { body: { email: 'nobody@test.local' } });
    expect(unknown.status).toBe(200);
    expect(outbox.length).toBe(before);

    const ok = await t.api('POST', `${A}/auth/forgot-password`, { body: { email: 'ravi@test.local' } });
    expect(ok.status).toBe(200);
    const token = /token=([a-f0-9]{64})/.exec(mailTo('ravi@test.local')!.text ?? '')![1]!;
    const reset = await t.api('POST', `${A}/auth/reset-password`, { body: { token, password: 'Brand-New-Pass-2026' } });
    expect(reset.status).toBe(200);
    expect(await t.login('ravi@test.local', 'Brand-New-Pass-2026')).toBeTruthy();
    const again = await t.api('POST', `${A}/auth/reset-password`, { body: { token, password: 'Another-Pass-2026x' } });
    expect(again.status).toBe(400);
    expect(await PasswordReset.countDocuments({ usedAt: null })).toBe(0);
  });

  it('a shopper gets a welcome email the first time they sign in', async () => {
    await t.api('POST', `${A}/customer/auth/otp/send`, { body: { email: 'newbie@test.local' } });
    const code = /(\d{6})/.exec(mailTo('newbie@test.local')!.text ?? '')![1]!;
    const v = await t.api('POST', `${A}/customer/auth/otp/verify`, { body: { email: 'newbie@test.local', code } });
    expect(v.status).toBe(200);
    expect(outbox.some((m) => m.to === 'newbie@test.local' && /Welcome to Thunikart/.test(m.subject))).toBe(true);
  });
});

describe('account building form', () => {
  it('a new shopper is incomplete until name, mobile, gender and date of birth are saved; the address is optional', async () => {
    await t.api('POST', `${A}/customer/auth/otp/send`, { body: { email: 'form@test.local' } });
    const code = /(\d{6})/.exec(mailTo('form@test.local')!.text ?? '')![1]!;
    const v = await t.api('POST', `${A}/customer/auth/otp/verify`, { body: { email: 'form@test.local', code } });
    expect(v.body.customer.profileComplete).toBe(false);
    const token = v.body.accessToken;
    const bad = await t.api('PUT', `${A}/customer/profile`, { token, body: { name: 'Divya S', mobile: '9876500011', gender: 'Female', dob: '2999-01-01' } });
    expect(bad.status).toBe(400);
    const ok = await t.api('PUT', `${A}/customer/profile`, { token, body: { name: 'Divya S', mobile: '9876500011', gender: 'Female', dob: '1995-04-12' } });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: 'Divya S', mobile: '9876500011', gender: 'Female', dob: '1995-04-12', profileComplete: true });
  });
});

describe('home page layout', () => {
  it('the admin can hide, rename, reorder and re-card sections, and the website home data follows', async () => {
    const put = await t.api('PUT', `${A}/admin/home-layout`, { token: t.adminToken, body: { order: ['lookbook', 'categories'], sections: { lookbook: { enabled: false, title: 'Our story' }, categories: { enabled: true, title: 'Pick a department', cards: [{ title: 'Kurtis', image: '', link: '/c/kurtis' }] } } } });
    expect(put.status).toBe(200);
    const h = await t.api('GET', '/shop/api/v1/cms/home');
    expect(h.status).toBe(200);
    expect(h.body.layout[0]).toMatchObject({ key: 'lookbook', enabled: false, title: 'Our story' });
    expect(h.body.layout.find((l: any) => l.key === 'categories').title).toBe('Pick a department');
    expect(h.body.categoryCards).toEqual([{ title: 'Kurtis', image: '', link: '/c/kurtis' }]);
    expect(h.body.layout).toHaveLength(7);
  });
});

describe('day close dates', () => {
  it('an open day carries its India date, cashier and cash, and closed days are listed', async () => {
    const { Store } = await import('../src/models');
    const store: any = await Store.findOne({}).lean();
    const open = await t.api('POST', `${A}/pos/shifts/open`, { token: t.adminToken, body: { storeId: String(store._id), openingCash: 50000 } });
    expect(open.status).toBe(201);
    expect(open.body).toMatchObject({ openingCash: 50000, bills: 0, stale: false, cashier: 'Test Admin' });
    expect(open.body.businessDate).toBe(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()));
    const close = await t.api('POST', `${A}/pos/shifts/${open.body.id}/close`, { token: t.adminToken, body: { countedCash: 50000 } });
    expect(close.status).toBe(200);
    const list = await t.api('GET', `${A}/pos/shifts?storeId=${store._id}`, { token: t.adminToken });
    expect(list.body.items[0]).toMatchObject({ id: open.body.id, status: 'closed', businessDate: open.body.businessDate, difference: 0 });
  });
});
