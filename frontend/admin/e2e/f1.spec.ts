import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { adminApi, expectNoSidewaysScroll, loadApp, login, sampleItem } from './helpers';

const REAL = existsSync('src/mocks/data/stock.json');

/** A keyboard scanner sends the whole code in a few milliseconds and ends with Enter. Dispatching it in one go keeps the test independent of machine load. */
async function scan(page: import('@playwright/test').Page, code: string) {
  await page.evaluate((c) => {
    for (const key of [...c, 'Enter']) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }, code);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); sessionStorage.setItem('seeded', '1'); } });
});

const rowsNeedFix = async (status: import('@playwright/test').Locator) => Number(((await status.innerText().catch(() => '0 rows')).replace(/,/g, '').match(/(\d+) rows/) ?? [])[1] ?? 0);

test.describe('import wizard and review queue (desktop first)', () => {
  test('mobile shows a desktop notice for import and review', async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await login(page, 'admin@thunikart.test');
    for (const path of ['/import', '/import/review']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: 'Switch to desktop view' })).toBeVisible();
      await expectNoSidewaysScroll(page);
    }
  });

  test('import the stock file, fix rows in bulk, roll the batch back', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop first screen');
    test.setTimeout(90_000);
    await login(page, 'admin@thunikart.test');
    await page.goto('/import');
    await page.getByLabel('Choose file to import').setInputFiles({ name: 'Master_Sheet_Krishnas_Orchids_Nov_2026.xlsb', mimeType: 'application/octet-stream', buffer: Buffer.from('stock file') });
    await expect(page.getByRole('region', { name: 'Choose sheet' })).toBeVisible();
    await page.getByRole('button', { name: 'Next: map columns' }).click();
    // Columns are guessed from their names, so the required fields are already mapped.
    await expect(page.getByLabel('Column for Item Code')).toHaveValue('Code');
    await expect(page.getByLabel('Column for HSN Code')).toHaveValue('HSN');
    await page.getByRole('button', { name: /Check the file/ }).click();
    await expect(page.getByTestId('count-Rows read')).toBeVisible();
    if (REAL) {
      await expect(page.getByTestId('count-Items to import')).toHaveText('535');
      await expect(page.getByTestId('count-Pieces in stock')).toHaveText('5,019');
    }
    await page.getByRole('button', { name: /^Import [\d,]+ items/ }).click();
    await expect(page.getByTestId('import-result')).toBeVisible({ timeout: 20_000 });
    if (REAL) await expect(page.getByTestId('import-result')).toHaveText('535 items and 5,019 pieces imported');

    await page.goto('/items');
    if (REAL) await expect(page.getByText('535 items, 5,019 pieces in stock')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Items' })).toBeVisible();

    // Review queue: accept the HSN suggestions in bulk, and the number of rows that need a fix goes down.
    await page.goto('/import/review');
    const status = page.getByRole('status').filter({ hasText: 'rows need a fix' });
    await expect(status).toBeVisible();
    const before = await rowsNeedFix(status);
    await page.getByRole('button', { name: /Accept all HSN suggestions/ }).click();
    await expect(page.getByText(/items fixed|Nothing to fix here/)).toBeVisible();
    if (REAL) await expect.poll(() => rowsNeedFix(status)).toBeLessThan(before);

    // Row level fix.
    await page.getByLabel('Problem').selectOption('SIZE_PLACEHOLDER');
    const free = page.getByRole('table', { name: 'Review queue' }).getByRole('button', { name: 'Free Size' }).first();
    if (await free.count()) await free.click();

    await page.getByRole('tab', { name: 'Data quality report' }).click();
    await expect(page.getByRole('table', { name: 'Data quality by category' })).toBeVisible();

    // Roll the batch back from the history list.
    await page.goto('/import');
    await page.getByRole('button', { name: /Roll back Master_Sheet/ }).click();
    await page.getByRole('dialog', { name: 'Roll back this import?' }).getByRole('button', { name: 'Yes, roll back' }).click();
    await expect(page.getByText('Import rolled back').first()).toBeVisible();
    await page.goto('/items');
    await expect(page.getByText('No items found')).toBeVisible();
  });
});

test.describe('items', () => {
  test('add an item with a size, then find it', async ({ page, isMobile }) => {
    await login(page, 'admin@thunikart.test');
    await page.goto('/items/new');
    const f = page.getByRole('form', { name: 'Add item' });
    await f.getByLabel('Item Code').fill('KO-NEW-1');
    await f.getByRole('textbox', { name: 'Name', exact: true }).fill('New Cotton Kurti');
    await f.getByLabel('Product Category').fill('Kurties');
    await f.getByLabel('Model/Style No').fill('K-77');
    await f.getByLabel('Type').fill('Woven');
    if (isMobile) {
      await page.getByRole('button', { name: 'Next' }).click();
      await f.getByRole('textbox', { name: 'Size', exact: true }).fill('M');
      await f.getByLabel('Retail MRP').fill('599');
      await page.getByRole('button', { name: 'Next' }).click();
    } else {
      await f.getByLabel('Size, row 1').fill('M');
      await f.getByLabel('MRP, row 1').fill('599');
    }
    await page.getByRole('button', { name: 'Add item' }).last().click();
    await expect(page.getByText('Item added')).toBeVisible();
    await expect(page).toHaveURL(/\/items\/[0-9a-f]{24}$/);
    await expect(page.getByText('No HSN. Add one before GST goes live.')).toBeVisible();
    await expect(page.getByText('Out of Stock').first()).toBeVisible(); // shown, never typed
    await page.goto('/items');
    await expect(page.getByText('New Cotton Kurti')).toBeVisible();
    await expectNoSidewaysScroll(page);
  });

  test('required fields show errors next to the fields', async ({ page }) => {
    await login(page, 'admin@thunikart.test');
    await page.goto('/items/new');
    await page.getByRole('button', { name: /Add item|Next/ }).last().click();
    await expect(page.getByText('Item code is required')).toBeVisible();
  });

  test('uploads images with progress, reorders and removes them', async ({ page, isMobile }) => {
    await login(page, 'admin@thunikart.test');
    await page.goto('/items/new');
    if (isMobile) {
      const f = page.getByRole('form', { name: 'Add item' });
      await f.getByLabel('Item Code').fill('IMG-1');
      await f.getByRole('textbox', { name: 'Name', exact: true }).fill('Image Test');
      await f.getByLabel('Product Category').fill('Kurties');
      await f.getByLabel('Model/Style No').fill('M');
      await f.getByLabel('Type').fill('W');
      await page.getByRole('button', { name: 'Next' }).click();
      await f.getByRole('textbox', { name: 'Size', exact: true }).fill('M');
      await f.getByLabel('Retail MRP').fill('100');
      await page.getByRole('button', { name: 'Next' }).click();
    }
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.getByLabel('Add images').setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: png }, { name: 'b.png', mimeType: 'image/png', buffer: png }]);
    await expect(page.getByRole('list', { name: 'Uploads' }).getByText('Uploaded')).toHaveCount(2, { timeout: 10_000 });
    await expect(page.getByRole('img', { name: 'Image 2' })).toBeVisible();
    await page.getByRole('button', { name: 'Move image 2 earlier' }).click();
    await page.getByRole('button', { name: 'Remove image 1' }).click();
    await expect(page.getByRole('img', { name: /Image \d/ })).toHaveCount(1);
  });

  test('filters narrow the list, bulk actions work on desktop', async ({ page, isMobile }) => {
    await loadApp(page);
    await adminApi(page, 'POST', '/items', sampleItem('A-1', 'Alpha Kurti'));
    await adminApi(page, 'POST', '/items', { ...sampleItem('B-1', 'Beta Nightie'), category: 'Nighties', hsn: '' });
    await login(page, 'admin@thunikart.test');
    await page.goto('/items');
    await expect(page.getByText('Alpha Kurti')).toBeVisible();
    await expect(page.getByText('Beta Nightie')).toBeVisible();
    if (isMobile) {
      await page.getByRole('button', { name: /Filters/ }).click();
      await page.getByLabel('Category').selectOption('Nighties');
      await page.getByRole('button', { name: 'Show items' }).click();
    } else {
      await page.getByRole('combobox', { name: 'Category' }).selectOption('Nighties');
    }
    await expect(page.getByText('Alpha Kurti')).toHaveCount(0);
    await expect(page.getByText('Beta Nightie')).toBeVisible();
    await expect(page.getByText('No HSN', { exact: true }).first()).toBeVisible();
    if (!isMobile) {
      await page.getByRole('checkbox', { name: 'Select Beta Nightie' }).check();
      await page.getByRole('button', { name: 'Switch off' }).click();
      await expect(page.getByText('1 items updated')).toBeVisible();
    }
  });
});

test.describe('scanning and stock lookup', () => {
  test('a keyboard scanner finds an item by barcode', async ({ page }) => {
    await loadApp(page);
    await adminApi(page, 'POST', '/items', sampleItem('KO1000369', 'Scanned Kurti'));
    await login(page, 'admin@thunikart.test');
    await page.goto('/stock');
    await expect(page.getByLabel('Scan or search')).toBeVisible();
    // A scanner types fast and ends with Enter, with nothing focused.
    await page.getByRole('main').click();
    await scan(page, 'KO1000369');
    const card = page.getByRole('region', { name: 'Scanned item' });
    await expect(card).toContainText('Scanned Kurti');
    await expect(card).toContainText('₹999.00');
    await expect(card).toContainText('Thunikart, Pattanam (shop): 0');
    await scan(page, 'NOPE-0000');
    await expect(page.getByRole('alert').filter({ hasText: 'NOPE-0000' })).toBeVisible();
    await expectNoSidewaysScroll(page);
  });

  test('typing a code in the search box and pressing Enter works too', async ({ page }) => {
    await loadApp(page);
    await adminApi(page, 'POST', '/items', sampleItem('TYPED-9', 'Typed Kurti'));
    await login(page, 'admin@thunikart.test');
    await page.goto('/stock');
    await page.getByLabel('Scan or search').fill('typed-9');
    await page.getByLabel('Scan or search').press('Enter');
    await expect(page.getByRole('region', { name: 'Scanned item' })).toContainText('Typed Kurti');
  });

  test('the camera button opens a camera view with a typing fallback', async ({ page }) => {
    await login(page, 'admin@thunikart.test');
    await page.goto('/stock');
    await page.getByRole('button', { name: 'Scan with camera' }).click();
    await expect(page.getByRole('dialog', { name: 'Scan a barcode' })).toBeVisible();
    await expect(page.getByLabel('Type a code')).toBeVisible();
  });
});

test.describe('vendors and customers', () => {
  test('vendor form validates GSTIN and state, then saves', async ({ page }) => {
    await login(page, 'admin@thunikart.test');
    await page.goto('/vendors');
    await page.getByRole('button', { name: 'Add vendor' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add vendor' });
    await dlg.getByLabel('Vendor Name').fill('Sri Textiles');
    await dlg.getByLabel('Email').fill('sri@example.com');
    await dlg.getByLabel('Mobile Phone').fill('9876501234');
    await dlg.getByLabel('GSTIN').fill('33AAAAA');
    await dlg.getByLabel('PAN').fill('AAAAA1111A');
    await dlg.getByRole('button', { name: 'Add vendor' }).click();
    await expect(dlg.getByText('GSTIN format is not valid')).toBeVisible();
    await dlg.getByLabel('GSTIN').fill('29AAAAA1111A1Z1'); // state code 29 but the state is 33
    await dlg.getByRole('button', { name: 'Add vendor' }).click();
    await expect(dlg.getByText(/starts with state code 29/)).toBeVisible();
    await dlg.getByLabel('GSTIN').fill('33AAAAA1111A1Z1');
    await dlg.getByRole('button', { name: 'Add vendor' }).click();
    await expect(page.getByText('Vendor saved')).toBeVisible();
    await expect(page.getByText('Sri Textiles').first()).toBeVisible();
    await expectNoSidewaysScroll(page);
  });

  test('customer ledgers are read only', async ({ page }) => {
    await login(page, 'admin@thunikart.test');
    await page.goto('/customers');
    await page.getByRole('button', { name: 'Ledgers for Ananya Sharma' }).click();
    await expect(page.getByText('Read only. Changes come from bills, returns and receipts.')).toBeVisible();
    await expect(page.getByText('Opening balance').first()).toBeVisible();
  });

  test('a duplicate customer mobile shows the API error on the field', async ({ page }) => {
    await login(page, 'admin@thunikart.test');
    await page.goto('/customers');
    await page.getByRole('button', { name: 'Add customer' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add customer' });
    await dlg.getByLabel('Full Name').fill('Someone Else');
    await dlg.getByLabel('Mobile Phone').fill('9876543210');
    await dlg.getByRole('button', { name: 'Add customer' }).click();
    await expect(dlg.getByText('Already in use')).toBeVisible();
  });
});

test.describe('labels and HSN', () => {
  test('labels: pick an item, set copies, preview and design a size (desktop); notice on mobile', async ({ page, isMobile }) => {
    await loadApp(page);
    await adminApi(page, 'POST', '/items', sampleItem('LBL-1', 'Label Kurti'));
    await login(page, 'admin@thunikart.test');
    await page.goto('/items/labels');
    if (isMobile) { await expect(page.getByRole('button', { name: 'Switch to desktop view' })).toBeVisible(); return; }
    await page.getByLabel('Find items').fill('Label');
    await page.getByRole('button', { name: 'Add Label Kurti' }).click();
    await page.getByLabel('Copies for Label Kurti size M').fill('3');
    await expect(page.getByRole('button', { name: 'Print 3 labels' })).toBeEnabled();
    await expect(page.getByRole('img', { name: 'Barcode LBL-1' }).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Label designer' }).click();
    await page.getByLabel('Template name').fill('60 x 30 mm');
    await page.getByLabel('Width (mm)').fill('60');
    await page.getByRole('button', { name: 'Save template' }).click();
    await expect(page.getByText('Label size saved')).toBeVisible();
  });

  test('HSN rules show an unconfirmed banner until an Admin confirms, and only while GST is on', async ({ page }) => {
    await loadApp(page);
    await login(page, 'admin@thunikart.test');
    await page.goto('/settings/hsn');
    await expect(page.getByText('GST is not switched on')).toBeVisible();
    await adminApi(page, 'PUT', '/settings/business-profile', {
      legalName: 'Krishnas Orchids', brandName: 'Thunikart', addressLines: ['Near KN Hall'], city: 'Coimbatore', state: 'Tamil Nadu', stateCode: '33', pincode: '641016', phone: '8400044191',
      email: '', website: '', logoKey: null, gstin: '33ABCDE1234F1Z5', pan: 'ABCDE1234F', defaultPrintSize: '4x6', termsText: '', invoiceFooter: '',
    });
    await page.goto('/settings/hsn'); // the browser session is still signed in, so only the page needs a reload
    await expect(page.getByRole('alert').filter({ hasText: 'rules are not confirmed' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm all rules' }).click();
    await expect(page.getByText('HSN rules confirmed').first()).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'rules are not confirmed' })).toHaveCount(0);
  });
});

test.describe('permissions and layout', () => {
  test('a counter employee is kept in the billing area and cannot reach import by URL', async ({ page }) => {
    await login(page, 'sales@thunikart.test');
    await expect(page).toHaveURL(/\/billing$/);
    await expect(page.getByRole('complementary', { name: 'Main menu' })).toHaveCount(0);
    await page.goto('/import');
    await expect(page).toHaveURL(/\/billing$/);
  });

  for (const path of ['/items', '/items/new', '/vendors', '/customers', '/stock']) {
    test(`${path} has no sideways scroll`, async ({ page }) => {
      await login(page, 'admin@thunikart.test');
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('status', { name: /Loading/ })).toHaveCount(0);
      await expectNoSidewaysScroll(page);
    });
  }
});
