import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Thunikart@123';

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('main')).toBeVisible();
}

/** No horizontal page scroll at the current width. */
export async function expectNoSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

/** Calls the mock API as the Admin from inside the page, to set up data quickly. The app must have been loaded once. */
export async function adminApi<T = unknown>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(async ({ method, path, body, pw }) => {
    const call = async (m: string, p: string, token: string | null, b?: unknown) => {
      const r = await fetch(`/api/v1${p}`, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
      return r.json();
    };
    const before = localStorage.getItem('tk.mock.session');
    const { accessToken } = await call('POST', '/auth/login', null, { email: 'admin@thunikart.test', password: pw });
    const result = await call(method, path, accessToken, body);
    // Put the browser session back the way it was (signed in as someone, or signed out).
    if (before) localStorage.setItem('tk.mock.session', before); else localStorage.removeItem('tk.mock.session');
    return result;
  }, { method, path, body, pw: PASSWORD }) as Promise<T>;
}

export async function loadApp(page: Page) {
  await page.goto('/login');
  await expect(page.getByLabel('Email')).toBeVisible(); // the mock service worker is up once the app renders
}

export const sampleItem = (code = 'TEST-001', name = 'Test Kurti') => ({
  code, name, category: 'Kurties', brand: 'Thunikart', model: 'M-1', type: 'Woven', hsn: '6104', description: '', active: true, imageKeys: [], videoKey: null, sizeChartKey: null,
  variants: [{ size: 'M', color: 'Blue', mrp: 99900, selling: 99900, offer: null, cost: 40000, reorderLevel: 3, bin: 'A1', barcode: code }],
});
