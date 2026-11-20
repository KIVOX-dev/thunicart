import { expect, test, type Page } from '@playwright/test';
import { expectNoSidewaysScroll, loadApp, login } from './helpers';
import { scan } from './inventory-helpers';
import { openDayApi, pricedItem } from './pos-helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); sessionStorage.setItem('seeded', '1'); } });
});

async function billingLogin(page: Page, email = 'sales@thunikart.test') {
  await page.goto('/billing/login');
  await page.getByLabel(/Employee email/).fill(email);
  await page.getByLabel(/^Password/).fill('Thunikart@123');
  await page.getByRole('button', { name: 'Sign in to billing' }).click();
  await expect(page.getByRole('main')).toBeVisible(); // wait for the sign in to finish before doing anything else
}

test.describe('the store billing counter', () => {
  test('signed out visitors go to the counter sign in, and employees land on the bill screen', async ({ page }) => {
    await page.goto('/billing');
    await expect(page).toHaveURL(/\/billing\/login$/);
    await expect(page.getByRole('form', { name: 'Billing center sign in' })).toBeVisible();
    await billingLogin(page);
    await expect(page).toHaveURL(/\/billing$/);
    await expect(page.getByText('Billing center').first()).toBeVisible();
    await expectNoSidewaysScroll(page);
  });

  test('a wrong password shows a plain error', async ({ page }) => {
    await page.goto('/billing/login');
    await page.getByLabel(/Employee email/).fill('sales@thunikart.test');
    await page.getByLabel(/^Password/).fill('wrong-password-1');
    await page.getByRole('button', { name: 'Sign in to billing' }).click();
    await expect(page.getByRole('alert')).toContainText('Email or password is wrong');
  });

  test('an employee has no admin access: no admin menu, and every admin URL goes back to billing', async ({ page }) => {
    await billingLogin(page);
    await expect(page.getByRole('complementary', { name: 'Main menu' })).toHaveCount(0);
    for (const path of ['/dashboard', '/items', '/settings/users', '/reports', '/purchase', '/accounts', '/stock', '/settings/business-profile']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/billing$/);
    }
    await expect(page.getByRole('link', { name: /Dashboard|Users|Reports|Purchase|Accounts/ })).toHaveCount(0);
  });

  test('the counter has billing, held bills, bills and returns, lookup, day close and print settings', async ({ page, isMobile }) => {
    await billingLogin(page);
    const nav = page.getByRole('navigation', { name: isMobile ? 'Billing tabs' : 'Billing' });
    await expect(nav).toBeVisible();
    const names = isMobile ? ['Bill', 'Bills', 'Held', 'Day close', 'Lookup'] : ['Bill', 'Bills and returns', 'Held bills', 'Day close', 'Item lookup', 'Counter invoice', 'Print settings'];
    for (const n of names) await expect(nav.getByRole('link', { name: n, exact: true })).toBeVisible();
    await nav.getByRole('link', { name: isMobile ? 'Held' : 'Held bills', exact: true }).click();
    await expect(page).toHaveURL(/\/billing\/bills\?tab=held/);
    await expect(page.getByText('No held bills')).toBeVisible();
    await nav.getByRole('link', { name: 'Day close', exact: true }).click();
    await expect(page).toHaveURL(/tab=day/);
    await nav.getByRole('link', { name: isMobile ? 'Lookup' : 'Item lookup', exact: true }).click();
    await expect(page).toHaveURL(/\/billing\/lookup$/);
    await expect(page.getByLabel('Scan or search').first()).toBeVisible();
    if (!isMobile) {
      await page.getByRole('link', { name: 'Print settings' }).click();
      await expect(page).toHaveURL(/\/billing\/print$/);
      await expect(page.getByTestId('invoice-4x6')).toBeVisible();
    }
  });

  test('barcode billing with a preview of the saved invoice, from the counter', async ({ page, isMobile }) => {
    test.setTimeout(90_000);
    await loadApp(page);
    await pricedItem(page, 'CTR-1', 'Counter Kurti', 499);
    await openDayApi(page);
    await billingLogin(page);
    await expect(page.getByLabel('Scan or search').first()).toBeVisible();
    await scan(page, 'CTR-1');
    await scan(page, 'CTR-1');
    await expect(page.getByTestId('qty-CTR-1')).toHaveText('2');
    const total = isMobile ? page.getByTestId('bar-total') : page.getByTestId('grand-total');
    await expect(total).toHaveText('₹998.00');
    if (isMobile) await page.getByRole('button', { name: 'Pay', exact: true }).click();
    await page.getByRole('button', { name: 'Pay with UPI' }).click();
    await page.getByRole('button', { name: isMobile ? 'Finish bill' : /^Pay \(F8\)/ }).click();
    const v = page.getByRole('dialog', { name: /^Bill / });
    await expect(v).toContainText('POS-000001');
    await expect(v.getByTestId('invoice-grand-total')).toHaveText('₹998.00');
    await expect(v.getByRole('button', { name: 'Print' })).toBeVisible();
  });

  test('an employee signs out and is sent to the counter sign in', async ({ page }) => {
    await billingLogin(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/billing\/login$/);
    await page.goto('/billing');
    await expect(page).toHaveURL(/\/billing\/login$/);
  });

  test('a role without billing access is told so, and the owner still uses the admin app', async ({ page, isMobile }) => {
    await billingLogin(page, 'buyer@thunikart.test');
    await expect(page.getByText('Not set up for billing')).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await login(page, 'admin@thunikart.test');
    if (isMobile) { await expect(page.getByRole('navigation', { name: 'Main tabs' })).toBeVisible(); return; }
    const menu = page.getByRole('complementary', { name: 'Main menu' });
    await expect(menu.getByRole('link', { name: 'Vendors' })).toBeVisible();
    await expect(menu.getByRole('link', { name: /Billing/ })).toHaveCount(0); // Billing center is a separate module at /billing, not in the admin menu
    await expect(menu.getByRole('link', { name: 'Bills and returns' })).toHaveCount(0);
    await page.goto('/billing');
    await expect(page).toHaveURL(/\/billing$/);
  });

  for (const path of ['/billing', '/billing/bills', '/billing/bills?tab=held', '/billing/bills?tab=day', '/billing/bills?tab=returns', '/billing/lookup', '/billing/print']) {
    test(`${path} has no sideways scroll`, async ({ page }) => {
      await loadApp(page);
      await openDayApi(page);
      await billingLogin(page);
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('status', { name: /Loading/ })).toHaveCount(0);
      await expectNoSidewaysScroll(page);
    });
  }
});
