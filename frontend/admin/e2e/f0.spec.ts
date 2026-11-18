import { expect, test } from '@playwright/test';
import { expectNoSidewaysScroll, login, PASSWORD } from './helpers';

test.beforeEach(async ({ page }) => {
  // Fresh mock database for every test.
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); sessionStorage.setItem('seeded', '1'); } });
});

test.describe('login and shells', () => {
  test('login shows the right shell for the width', async ({ page, isMobile }) => {
    await login(page, 'admin@thunikart.test');
    if (isMobile) {
      await expect(page.getByRole('navigation', { name: 'Main tabs' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Main menu' })).toHaveCount(0);
    } else {
      await expect(page.getByRole('complementary', { name: 'Main menu' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Main tabs' })).toHaveCount(0);
    }
    await expectNoSidewaysScroll(page);
  });

  test('wrong password shows a plain error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@thunikart.test');
    await page.getByLabel('Password').fill('wrong-password-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Email or password is wrong');
    await expect(page.getByRole('alert')).toContainText('Request id');
  });

  test('view switch is remembered per user', async ({ page, isMobile }) => {
    await login(page, 'admin@thunikart.test');
    await page.goto('/profile');
    if (isMobile) {
      await page.getByRole('button', { name: 'Switch to desktop view' }).click();
      await expect(page.getByRole('complementary', { name: 'Main menu' })).toBeVisible();
    } else {
      await page.getByRole('button', { name: 'Switch to mobile view' }).click();
      await expect(page.getByRole('navigation', { name: 'Main tabs' })).toBeVisible();
    }
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(isMobile ? page.getByRole('complementary', { name: 'Main menu' }) : page.getByRole('navigation', { name: 'Main tabs' })).toBeVisible();
  });
});

test.describe('roles and permissions', () => {
  test('Admin creates Store Manager and a user with it (desktop matrix)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The permission matrix is desktop first. Mobile shows a notice, tested below.');
    await login(page, 'admin@thunikart.test');
    await page.goto('/settings/users?tab=permissions');
    await page.getByRole('button', { name: 'Create role' }).click();
    const roleDlg = page.getByRole('dialog', { name: 'Create role' });
    await roleDlg.getByLabel('Role name').fill('Store Manager');
    await roleDlg.getByRole('button', { name: 'Create role' }).click();
    await expect(page.getByRole('heading', { name: /Store Manager/ })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Items and labels: View' }).check();
    await page.getByRole('checkbox', { name: 'Stock audit and return transfers: View' }).check();
    await page.getByRole('button', { name: 'Save permissions' }).click();
    await expect(page.getByText('Saved permissions for Store Manager')).toBeVisible();

    await page.goto('/settings/users');
    await page.getByRole('button', { name: 'Add user' }).click();
    const userDlg = page.getByRole('dialog', { name: 'Add user' });
    await userDlg.getByLabel('Name').fill('Meena Manager');
    await userDlg.getByLabel('Email').fill('meena@thunikart.test');
    await userDlg.getByLabel('Password').fill(PASSWORD);
    await userDlg.getByLabel('Role').selectOption({ label: 'Store Manager' });
    await userDlg.getByRole('button', { name: 'Add user' }).click();
    await expect(page.getByText('User added')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'meena@thunikart.test' })).toBeVisible();
  });

  test('mobile shows a desktop notice for the permission matrix', async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await login(page, 'admin@thunikart.test');
    await page.goto('/settings/users?tab=permissions');
    await expect(page.getByRole('button', { name: 'Switch to desktop view' })).toBeVisible();
    await expect(page.getByText('Store Manager')).toHaveCount(0);
    await expectNoSidewaysScroll(page);
  });

  test('a user with the Store Manager role sees only the allowed menu items', async ({ page, isMobile }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible(); // the mock service worker is up once the app renders
    // Set up the role and user through the mock API (the UI path is covered above).
    await page.evaluate(async (pw) => {
      const call = async (method: string, path: string, token: string | null, body?: unknown) => {
        const r = await fetch(`/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return r.json();
      };
      const { accessToken } = await call('POST', '/auth/login', null, { email: 'admin@thunikart.test', password: pw });
      const role = await call('POST', '/roles', accessToken, { name: 'Store Manager', description: '', permissions: [] });
      await call('PUT', `/roles/${role.id}/permissions`, accessToken, { permissions: ['items.view', 'stock.view'] });
      await call('POST', '/users', accessToken, { name: 'Meena Manager', email: 'meena@thunikart.test', password: pw, roleId: role.id, active: true });
      localStorage.removeItem('tk.mock.session');
    }, PASSWORD);
    await login(page, 'meena@thunikart.test');
    await page.goto('/');
    if (isMobile) await page.getByRole('link', { name: 'More' }).click();
    const menu = isMobile ? page.getByRole('main') : page.getByRole('complementary', { name: 'Main menu' });
    await expect(menu.getByRole('link', { name: 'Items and labels' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Stock levels' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Roles' })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Business profile' })).toHaveCount(0);

    // Hiding is a convenience only: opening the page by URL shows the friendly 403 page.
    await page.goto('/settings/users');
    await expect(page.getByText('No permission')).toBeVisible();
  });
});

test.describe('GST go-live', () => {
  test('saving a valid GSTIN shows the confirmation, then GST wording and menu appear without reload', async ({ page, isMobile }) => {
    await login(page, 'admin@thunikart.test');
    await page.goto('/settings/business-profile');
    await expect(page.getByLabel('GSTIN')).toBeVisible();
    await expect(page.getByText('GST is off').first()).toBeVisible();

    await page.getByLabel('GSTIN').fill('33ABCDE1234F1Z');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('GSTIN format is not valid')).toBeVisible();

    await page.getByLabel('GSTIN').fill('33ABCDE1234F1Z5');
    await page.getByLabel('PAN').fill('ABCDE1234F');
    await page.getByRole('button', { name: 'Save profile' }).click();
    const dialog = page.getByRole('dialog', { name: 'Turn GST on?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('GST columns and tax lines appear')).toBeVisible();
    await dialog.getByRole('button', { name: 'Yes, go live' }).click();
    await expect(page.getByText('Business profile saved')).toBeVisible();
    await expect(page.getByText('GST is on').first()).toBeVisible();

    if (isMobile) {
      await page.getByRole('link', { name: 'More' }).click();
      await expect(page.getByRole('link', { name: 'GST reports' })).toBeVisible();
    } else {
      await expect(page.getByRole('complementary', { name: 'Main menu' }).getByRole('link', { name: 'GST reports' })).toBeVisible();
    }
  });

  test('GSTIN that does not match the state code shows the API field error', async ({ page }) => {
    await login(page, 'admin@thunikart.test');
    await page.goto('/settings/business-profile');
    await page.getByLabel('GSTIN').fill('29ABCDE1234F1Z5');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Yes, go live' }).click();
    await expect(page.getByText(/starts with state code 29/)).toBeVisible();
  });
});

test.describe('screens render in both views', () => {
  for (const path of ['/settings/users', '/settings/roles', '/settings/number-series', '/settings/activity', '/settings/business-profile', '/profile']) {
    test(`${path} has no sideways scroll`, async ({ page }) => {
      await login(page, 'admin@thunikart.test');
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('status', { name: /Loading/ })).toHaveCount(0);
      await expectNoSidewaysScroll(page);
    });
  }

  test('number series can be edited', async ({ page }) => {
    await login(page, 'admin@thunikart.test');
    await page.goto('/settings/number-series');
    await page.getByRole('button', { name: 'Edit POS' }).click();
    await page.getByLabel('Counter').fill('984321');
    await page.getByRole('button', { name: 'Save series' }).click();
    await expect(page.getByText('Number series saved')).toBeVisible();
    await expect(page.getByText(/POS.*984322/).first()).toBeVisible();
  });
});

test.describe('style guide', () => {
  test('renders without sideways scroll and passes the contrast list', async ({ page }) => {
    await page.goto('/style-guide');
    await expect(page.getByRole('heading', { name: 'Style guide' })).toBeVisible();
    await expect(page.getByText('AA fail')).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await page.screenshot({ path: `test-results/style-guide-${test.info().project.name}.png`, fullPage: true });
  });
});
