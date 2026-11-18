import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { adminApi, expectNoSidewaysScroll, loadApp, login } from './helpers';
import { GST_PROFILE } from './inventory-helpers';
import { billApi, openDayApi, pricedItem } from './pos-helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); sessionStorage.setItem('seeded', '1'); } });
});

const TRADE_CUSTOMER = '000000000000000000000193'; // Trendy Apparel Retailers, a B2B trade customer in the mock
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Presses a download control and returns the saved file's bytes and name. */
async function saved(page: Page, click: () => Promise<void>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: dl.suggestedFilename(), bytes: readFileSync(await dl.path()) };
}
const head = (b: Buffer, n: number) => b.subarray(0, n).toString('latin1');
const reportKeys = async (page: Page) => (await adminApi<Array<{ key: string }>>(page, 'GET', '/reports')).map((r) => r.key);

async function seedSales(page: Page) {
  const it = await pricedItem(page, 'D-1', 'Dash Kurti', 500);
  await openDayApi(page);
  await billApi(page, [{ variantId: it.variants[0]!.id, qty: 1 }], [{ mode: 'Cash', amount: 50000 }]);
  await billApi(page, [{ variantId: it.variants[0]!.id, qty: 2 }], [{ mode: 'UPI', amount: 100000 }]);
  return it;
}

test.describe('dashboard', () => {
  test('shows today and month sales, bills, average, margin and the top items', async ({ page }) => {
    await loadApp(page);
    await seedSales(page);
    await login(page, 'admin@thunikart.test');
    await page.goto('/dashboard');
    await expect(page.getByTestId('sales-today')).toHaveText('₹1,500.00');
    await expect(page.getByTestId('sales-month')).toHaveText('₹1,500.00');
    await expect(page.getByTestId('bills-today').or(page.getByRole('button', { name: /Sales today/ }))).toBeVisible();
    await expect(page.getByTestId('margin-today')).toHaveText('₹300.00'); // 1,500 sales less 3 x 400 cost
    await expect(page.getByRole('img', { name: /Sales for the last 30 days/ })).toBeVisible();
    await expect(page.getByLabel('Top items')).toContainText('Dash Kurti');
    await expect(page.getByTestId('payables')).toHaveText('₹0.00');
    await expectNoSidewaysScroll(page);
  });

  test('a phone shows stacked summary cards and a tap opens the detail', async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await loadApp(page);
    await seedSales(page);
    await login(page, 'admin@thunikart.test');
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Sales today/ }).click();
    const d = page.getByRole('dialog', { name: 'Sales today' });
    await expect(d).toContainText('POS Store');
    await expect(d).toContainText('₹1,500.00');
    await expect(d).toContainText('Average bill');
  });
});

test.describe('expenses, receipts and outstanding', () => {
  test('add an expense with a receipt photo', async ({ page, isMobile }) => {
    await loadApp(page);
    await login(page, 'admin@thunikart.test');
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Add expense' }).click();
    const f = page.getByRole('dialog', { name: 'Add expense' });
    await f.getByRole('button', { name: 'Save expense' }).click();
    await expect(f.getByRole('alert').filter({ hasText: 'Choose a category' })).toBeVisible();
    await f.getByRole('combobox', { name: 'Category' }).selectOption('Rent');
    await f.getByLabel(/^Amount/).fill('12000');
    await f.getByLabel('Note').fill('Shop rent for November');
    await f.getByLabel('Add receipt photo').setInputFiles({ name: 'rent.png', mimeType: 'image/png', buffer: PNG });
    await expect(f.getByTestId('receipt-uploaded')).toBeVisible({ timeout: 10_000 });
    await expect(f.getByRole('img', { name: 'Receipt preview' })).toBeVisible();
    await f.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByText('Expense saved')).toBeVisible();
    await expect(page.getByTestId('expense-month')).toHaveText('₹12,000.00');
    await expect(page.locator('td, strong').filter({ hasText: /^Rent$/ }).first()).toBeVisible();
    await expectNoSidewaysScroll(page);
    void isMobile;
  });

  test('a customer who bought on credit shows as overdue, then a receipt clears it', async ({ page }) => {
    test.setTimeout(90_000);
    await loadApp(page);
    const it = await pricedItem(page, 'CR-1', 'Credit Kurti', 500);
    await billApi(page, [{ variantId: it.variants[0]!.id, qty: 4 }], [{ mode: 'Credit', amount: 200000 }], { customerId: TRADE_CUSTOMER, channel: 'Counter', dueDate: '2026-01-01' });
    await login(page, 'admin@thunikart.test');
    await page.goto('/dashboard');
    await expect(page.getByTestId('receivables')).toHaveText('₹2,000.00');
    await page.goto('/accounts?tab=outstanding');
    await expect(page.getByText('Trendy Apparel Retailers').first()).toBeVisible();
    await expect(page.getByText('₹2,000.00').first()).toBeVisible();

    await page.goto('/accounts?tab=receipts');
    await page.getByRole('button', { name: 'Record receipt' }).first().click();
    const f = page.getByRole('dialog', { name: 'Record receipt' });
    await f.getByRole('combobox', { name: 'Customer' }).selectOption({ index: 1 });
    await f.getByLabel(/^Amount received/).fill('999999');
    await f.getByRole('button', { name: 'Record receipt' }).click();
    await expect(f.getByRole('alert').first()).toContainText('owes only');
    await f.getByRole('button', { name: 'Full' }).click();
    await f.getByRole('button', { name: 'Record receipt' }).click();
    await expect(page.getByText('Receipt recorded')).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.getByTestId('receivables')).toHaveText('₹0.00');
    await page.goto('/accounts?tab=outstanding');
    await expect(page.getByText('Nobody owes anything')).toBeVisible();
  });
});

test.describe('report center (GST off)', () => {
  test('every non GST report opens with no tax columns, and GST reports are not offered', async ({ page }) => {
    test.setTimeout(150_000);
    await loadApp(page);
    await seedSales(page);
    const keys = await reportKeys(page);
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const k of ['gstr1', 'gstr3b', 'hsn-summary', 'itc-vs-output']) expect(keys).not.toContain(k);
    await login(page, 'admin@thunikart.test');
    await page.goto('/reports');
    await expect(page.getByRole('link', { name: /Sales register/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /GSTR-1/ })).toHaveCount(0);
    for (const k of keys) {
      await page.goto(`/reports/${k}`);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('status', { name: /Loading/ })).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByText('Taxable value')).toHaveCount(0);
      await expect(page.getByText('GSTIN')).toHaveCount(0);
    }
    await page.goto('/reports/gstr1');
    await expect(page.getByRole('alert')).toContainText('GST reports are available only while GST is on');
    await page.goto('/gst');
    await expect(page.getByText('GST is not switched on')).toBeVisible();
  });

  test('filters, totals, sorting and pages', async ({ page, isMobile }) => {
    test.setTimeout(120_000);
    await loadApp(page);
    for (let n = 1; n <= 27; n++) await pricedItem(page, `PG-${String(n).padStart(2, '0')}`, `Paged Kurti ${n}`, 100 + n, 0);
    await login(page, 'admin@thunikart.test');
    await page.goto('/reports/stock-summary');
    await expect(page.getByTestId('total-onHand')).toBeVisible();
    if (isMobile) {
      await expect(page.getByText('1 of 2')).toBeVisible();
      await page.getByRole('button', { name: 'Next' }).click();
      await expect(page.getByText('2 of 2')).toBeVisible();
      await page.getByRole('button', { name: 'Filters' }).click();
      await page.getByLabel('Search').fill('Kurti 27');
      await page.getByRole('button', { name: 'Show' }).click();
      await expect(page.getByText('PG-27').or(page.getByText('Paged Kurti 27')).first()).toBeVisible();
    } else {
      await expect(page.getByTestId('page-info')).toContainText('Page 1 of 2 · 27 rows');
      await page.getByRole('button', { name: 'Sort by Code' }).click();
      await expect(page.getByRole('cell', { name: 'PG-01' })).toBeVisible();
      await page.getByRole('button', { name: 'Sort by Code' }).click();
      await expect(page.getByRole('cell', { name: 'PG-27' })).toBeVisible();
      await page.getByRole('button', { name: 'Next' }).click();
      await expect(page.getByTestId('page-info')).toContainText('Page 2 of 2');
      await page.getByLabel('Search').fill('Kurti 27');
      await expect(page.getByTestId('page-info')).toContainText('Page 1 of 1 · 1 rows');
    }
    await expectNoSidewaysScroll(page);
  });
});

test.describe('downloads', () => {
  test('download a report as Excel, CSV and PDF, and the files are real', async ({ page, isMobile }) => {
    test.setTimeout(120_000);
    await loadApp(page);
    await seedSales(page);
    await login(page, 'admin@thunikart.test');
    await page.goto('/reports/sales-by-item');
    const open = () => page.getByRole('button', { name: 'Download' }).click();
    const pick = (name: string) => page.getByRole('menuitem', { name }).click();

    const xlsx = await saved(page, async () => { await open(); await pick('Excel'); });
    expect(xlsx.name).toBe('sales-by-item.xlsx');
    expect(head(xlsx.bytes, 2)).toBe('PK');
    expect(xlsx.bytes.toString('latin1')).toContain('xl/worksheets/sheet1.xml');
    expect(xlsx.bytes.toString('utf8')).toContain('Dash Kurti');

    const csv = await saved(page, async () => { await open(); await pick('CSV'); });
    expect(csv.name).toBe('sales-by-item.csv');
    expect(csv.bytes.toString('utf8').split('\r\n')[0]).toBe('Code,Item,Category,Size,Pieces,Amount');
    expect(csv.bytes.toString('utf8')).toContain('1500.00');

    const pdf = await saved(page, async () => { await open(); await pick('PDF'); });
    expect(pdf.name).toBe('sales-by-item.pdf');
    expect(head(pdf.bytes, 8)).toBe('%PDF-1.4');
    await expect(page.getByTestId('download-saved')).toContainText('sales-by-item.pdf');
    void isMobile;
  });

  test('a big report runs as a background job with progress, then offers the download', async ({ page }) => {
    test.setTimeout(90_000);
    await loadApp(page);
    await seedSales(page);
    await login(page, 'admin@thunikart.test');
    await page.goto('/reports/sales-register');
    await page.getByRole('button', { name: 'Download' }).click();
    await page.getByRole('menuitem', { name: 'Excel' }).click();
    const job = page.getByTestId('download-job');
    await expect(job).toBeVisible();
    await expect(job.getByRole('progressbar').or(job.getByText(/Ready/))).toBeVisible();
    await expect(job).toContainText('Ready', { timeout: 15_000 });
    const out = await saved(page, async () => { await job.getByRole('button', { name: /Download Sales register/ }).click(); });
    expect(out.name).toBe('sales-register.xlsx');
    expect(head(out.bytes, 2)).toBe('PK');
  });
})

test.describe('GST on', () => {
  test('GST reports and tax columns appear, warnings show before export, and downloads carry the tax columns', async ({ page }) => {
    test.setTimeout(120_000);
    await loadApp(page);
    const noHsn = await pricedItem(page, 'NH-1', 'No Hsn Kurti', 800, 10, { hsn: '' });
    const ok = await pricedItem(page, 'OK-1', 'Hsn Kurti', 600);
    await adminApi(page, 'PUT', '/settings/business-profile', GST_PROFILE);
    await openDayApi(page);
    await billApi(page, [{ variantId: ok.variants[0]!.id, qty: 1 }, { variantId: noHsn.variants[0]!.id, qty: 1 }], [{ mode: 'UPI', amount: 140000 }]);
    await login(page, 'admin@thunikart.test');

    // New bills carry tax, so the sales register has tax columns.
    await page.goto('/reports/sales-register');
    await expect(page.getByText('Taxable value').first()).toBeVisible();
    await expect(page.getByTestId('total-taxable')).toBeVisible();

    // GST menu and GST reports.
    await page.goto('/gst');
    await expect(page.getByRole('link', { name: /GSTR-1/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /HSN summary/ })).toBeVisible();
    await expect(page.getByTestId('gst-warnings')).toContainText('Sold items with no HSN code');

    // Warnings appear on the report before export, and the downloads include the tax columns.
    await page.getByRole('link', { name: /GSTR-1/ }).click();
    await expect(page.getByTestId('gst-warnings')).toBeVisible();
    await page.getByRole('button', { name: 'Download' }).click();
    const xlsx = await saved(page, () => page.getByRole('menuitem', { name: 'Excel' }).click());
    expect(xlsx.name).toBe('gstr1.xlsx');
    expect(xlsx.bytes.toString('utf8')).toContain('Taxable value');
    await page.getByRole('button', { name: 'Download' }).click();
    const json = await saved(page, () => page.getByRole('menuitem', { name: /JSON/ }).click());
    expect(json.name).toBe('gstr1.json');
    const parsed = JSON.parse(json.bytes.toString('utf8')) as { report: string; rows: unknown[]; totals: Record<string, number> };
    expect(parsed.report).toBe('gstr1');
    expect(parsed.rows.length).toBe(1);
    expect(parsed.totals.taxable).toBeGreaterThan(0);

    for (const k of ['gstr3b', 'hsn-summary', 'itc-vs-output']) {
      await page.goto(`/reports/${k}`);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByLabel('Fix before exporting').or(page.getByTestId('gst-clean')).first()).toBeVisible();
    }
    await page.goto('/reports/sales-register');
    const csv = await saved(page, async () => { await page.getByRole('button', { name: 'Download' }).click(); await page.getByRole('menuitem', { name: 'CSV' }).click(); await expect(page.getByTestId('download-job')).toContainText('Ready', { timeout: 15_000 }); await page.getByTestId('download-job').getByRole('button', { name: /Download Sales register/ }).click(); });
    expect(csv.bytes.toString('utf8').split('\r\n')[0]).toContain('Taxable value');
  });
});

test.describe('permissions and layout', () => {
  test('a counter employee cannot open Reports', async ({ page }) => {
    await login(page, 'sales@thunikart.test');
    await page.goto('/reports');
    await expect(page).toHaveURL(/\/billing$/);
  });

  test('Accounts can open reports, and Export center is gone (lists keep their own Export button)', async ({ page }) => {
    await login(page, 'accounts@thunikart.test');
    await page.goto('/reports');
    await expect(page.getByRole('link', { name: /Sales register/ })).toBeVisible();
    await page.goto('/vendors');
    await expect(page.getByRole('button', { name: /Export/ })).toBeVisible();
  });

  for (const path of ['/dashboard', '/accounts', '/accounts?tab=receipts', '/accounts?tab=outstanding', '/reports', '/reports/sales-register', '/reports/customer-ageing']) {
    test(`${path} has no sideways scroll`, async ({ page }) => {
      await login(page, 'admin@thunikart.test');
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('status', { name: /Loading/ })).toHaveCount(0);
      await expectNoSidewaysScroll(page);
    });
  }
});
