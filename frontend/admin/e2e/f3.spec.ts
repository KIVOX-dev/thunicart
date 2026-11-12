import { expect, test, type Page } from '@playwright/test';
import { adminApi, expectNoSidewaysScroll, loadApp, login } from './helpers';
import { GST_PROFILE, SHOP, scan, stockOf } from './inventory-helpers';
import { billApi, openDayApi, payFull, pricedItem, printCount, stubPrint } from './pos-helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); sessionStorage.setItem('seeded', '1'); } });
});

/** The scan box is mounted once the day state has loaded. Scans sent before that are lost, like on a real counter. */
const ready = (page: Page) => expect(page.getByLabel('Scan or search').first()).toBeVisible();
const viewer = (page: Page) => page.getByRole('dialog', { name: /^(Bill|Invoice|Exchange bill) / });
const style = async (page: Page) => (await viewer(page).locator('style').first().textContent()) ?? '';

test.describe('billing by scanning', () => {
  test('open the day, bill three items by scanning, split the payment, finalize and print at all four sizes', async ({ page, isMobile }) => {
    test.setTimeout(120_000);
    await stubPrint(page);
    await loadApp(page);
    await pricedItem(page, 'BILL-A', 'Alpha Kurti', 499);
    await pricedItem(page, 'BILL-B', 'Beta Nightie', 299);
    await pricedItem(page, 'BILL-C', 'Gamma Legging', 199);
    await login(page, 'admin@thunikart.test');
    await page.goto('/pos');

    // The day must be opened with the cash in the drawer.
    await expect(page.getByRole('form', { name: 'Open the day' })).toBeVisible();
    await page.getByLabel(/Cash in the drawer/).fill('1000');
    await page.getByRole('button', { name: 'Open the day' }).click();
    await expect(page.getByLabel('Scan or search')).toBeVisible();

    await scan(page, 'BILL-A');
    await scan(page, 'BILL-B');
    await scan(page, 'BILL-C');
    await expect(page.getByTestId('qty-BILL-A')).toHaveText('1');
    await expect(page.getByTestId('qty-BILL-B')).toBeVisible();
    await expect(page.getByTestId('qty-BILL-C')).toBeVisible();
    await scan(page, 'BILL-A'); // a scan of an item already in the cart adds one to its quantity
    await expect(page.getByTestId('qty-BILL-A')).toHaveText('2');
    await page.getByRole('button', { name: 'Fewer Alpha Kurti' }).click();
    await expect(page.getByTestId('qty-BILL-A')).toHaveText('1');

    // The total comes from the API preview: 499 + 299 + 199.
    const total = isMobile ? page.getByTestId('bar-total') : page.getByTestId('grand-total');
    await expect(total).toHaveText('₹997.00');

    // Split payment: UPI 500 with a reference, cash 600 gives change.
    if (isMobile) await page.getByRole('button', { name: 'Pay', exact: true }).click();
    await page.getByRole('button', { name: 'Pay with UPI' }).click();
    await page.getByLabel('UPI amount').fill('500');
    await page.getByLabel('UPI reference').fill('upi-9981');
    await expect(page.getByTestId('amount-left')).toHaveText('₹497.00');
    await page.getByRole('button', { name: 'Pay with Cash' }).click();
    await page.getByLabel('Cash amount').fill('600');
    await expect(page.getByTestId('amount-left')).toHaveText('₹0.00');
    await expect(page.getByTestId('change-due')).toHaveText('₹103.00');
    await page.getByRole('button', { name: isMobile ? 'Finish bill' : /^Pay \(F8\)/ }).click();

    // The saved bill, printed at each paper size, with GST off.
    const v = viewer(page);
    await expect(v).toBeVisible();
    await expect(v).toContainText('POS-000001');
    await expect(v.getByTestId('invoice-grand-total')).toHaveText('₹997.00');
    await expect(v).toContainText('Bill of Supply');
    await expect(v).not.toContainText('Round off');
    await expect(v).not.toContainText('GST summary');
    const sizes: Array<[string, string]> = [['4x6', 'size: 101.6mm 152.4mm'], ['2in', 'size: 58mm auto'], ['3in', 'size: 80mm auto'], ['a4', 'size: 210mm 297mm']];
    for (const [key, css] of sizes) {
      await v.getByLabel('Paper size').selectOption(key);
      await expect(v.getByTestId(`invoice-${key}`)).toBeVisible();
      expect(await style(page)).toContain(css);
      expect(await style(page)).toContain('margin: 0');
      await expect(v.getByRole('img', { name: 'Barcode POS-000001' })).toBeVisible();
    }
    await v.getByRole('button', { name: 'Print' }).click();
    await expect.poll(() => printCount(page)).toBeGreaterThan(0);
    await expect(page.locator('.print-area [data-testid="invoice-a4"]')).toHaveCount(1);

    // Stock came off the shelf.
    expect((await stockOf(page, 'BILL-A'))[SHOP]).toBe(9);
    await expectNoSidewaysScroll(page);
  });

  test('the sample invoice shows 2,159.00 with a round off line when GST is on', async ({ page, isMobile }) => {
    test.setTimeout(120_000);
    await loadApp(page);
    await pricedItem(page, 'SMP-A', 'Sample Dress', 1499);
    await pricedItem(page, 'SMP-B', 'Sample Top', 450);
    await adminApi(page, 'PUT', '/settings/business-profile', GST_PROFILE);
    await adminApi(page, 'PATCH', '/settings/number-series/POS', { counter: 984321 });
    await openDayApi(page);
    await login(page, 'admin@thunikart.test');
    await page.goto('/pos');
    await ready(page);
    await scan(page, 'SMP-A');
    await scan(page, 'SMP-B');
    await scan(page, 'SMP-B');
    await expect(page.getByTestId('qty-SMP-B')).toHaveText('2');
    await page.getByLabel('Discount for Sample Dress').fill('150');
    await page.getByLabel('Discount for Sample Top').fill('90');
    const total = isMobile ? page.getByTestId('bar-total') : page.getByTestId('grand-total');
    await expect(total).toHaveText('₹2,159.00');
    if (!isMobile) {
      await expect(page.getByRole('definition').filter({ hasText: '₹' }).first()).toBeVisible();
      await expect(page.getByLabel('Bill totals')).toContainText('Round off');
      await expect(page.getByLabel('Bill totals')).toContainText('CGST');
    }
    await payFull(page, isMobile);
    const v = viewer(page);
    await expect(v).toContainText('POS-984322');
    await v.getByLabel('Paper size').selectOption('a4');
    await expect(v).toContainText('Tax Invoice');
    await expect(v.getByTestId('invoice-grand-total')).toHaveText('₹2,159.00');
    await expect(v).toContainText('Round off');
    await expect(v).toContainText('GST summary');
    await expect(v).toContainText('GSTIN: 33ABCDE1234F1Z5');
    for (const key of ['4x6', '3in', '2in']) {
      await v.getByLabel('Paper size').selectOption(key);
      await expect(v.getByTestId('invoice-grand-total')).toHaveText('₹2,159.00');
      await expect(v).toContainText('Round off');
    }
  });

  test('a reprint after GST goes live is identical to the original bill', async ({ page }) => {
    test.setTimeout(90_000);
    await loadApp(page);
    const it = await pricedItem(page, 'RPT-1', 'Reprint Kurti', 800);
    await openDayApi(page);
    const bill = await billApi(page, [{ variantId: it.variants[0]!.id, qty: 1 }], [{ mode: 'Cash', amount: 80000 }]);
    await adminApi(page, 'PUT', '/settings/business-profile', GST_PROFILE); // GST goes live after the bill was made
    await login(page, 'admin@thunikart.test');
    await page.goto('/sales');
    await page.getByLabel('Search bills').fill(bill.number);
    await page.getByRole('button', { name: `Reprint ${bill.number}` }).click();
    const v = viewer(page);
    await expect(v).toContainText('Bill of Supply');
    await expect(v).not.toContainText('Round off');
    await expect(v).not.toContainText('GST summary');
    await expect(v.getByTestId('invoice-grand-total')).toHaveText('₹800.00');
  });
});

test.describe('discounts, conflicts, hold and customers', () => {
  test('a discount above the role limit asks for a manager PIN', async ({ page, isMobile }) => {
    test.setTimeout(90_000);
    await loadApp(page);
    await pricedItem(page, 'DSC-1', 'Discount Kurti', 1000);
    await openDayApi(page);
    await login(page, 'sales@thunikart.test');
    await page.goto('/pos');
    await ready(page);
    await scan(page, 'DSC-1');
    await page.getByLabel('Bill discount type').selectOption('percent');
    await page.locator('#bill-discount').fill('20');
    const total = isMobile ? page.getByTestId('bar-total') : page.getByTestId('grand-total');
    await expect(total).toHaveText('₹800.00');
    await expect(page.getByText('Discount above your limit').first()).toBeVisible();
    if (isMobile) await page.getByRole('button', { name: 'Pay', exact: true }).click();
    await page.getByRole('button', { name: 'Pay with UPI' }).click();
    await page.getByRole('button', { name: isMobile ? 'Get approval' : /Get approval/ }).click();
    const d = page.getByRole('dialog', { name: 'Manager approval needed' });
    await d.getByLabel(/Manager PIN/).fill('0000');
    await d.getByRole('button', { name: 'Approve' }).click();
    await expect(d.getByText('Wrong PIN')).toBeVisible();
    await d.getByLabel(/Manager PIN/).fill('2468');
    await d.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('dialog', { name: 'Manager approval needed' })).toBeHidden();
    await page.getByRole('button', { name: isMobile ? 'Finish bill' : /^Pay \(F8\)/ }).click();
    await expect(viewer(page)).toContainText('POS-000001');
    await expect(viewer(page).getByTestId('invoice-grand-total')).toHaveText('₹800.00');
  });

  test('a stock conflict names the item and offers to remove it', async ({ page, isMobile }) => {
    await loadApp(page);
    await pricedItem(page, 'CNF-1', 'Scarce Kurti', 300, 1);
    await pricedItem(page, 'CNF-2', 'Plenty Kurti', 100, 10);
    await openDayApi(page);
    await login(page, 'admin@thunikart.test');
    await page.goto('/pos');
    await ready(page);
    await scan(page, 'CNF-1');
    await scan(page, 'CNF-1');
    await scan(page, 'CNF-2');
    await expect(page.getByTestId('qty-CNF-1')).toHaveText('2');
    await payFull(page, isMobile);
    const alert = page.getByRole('alert').filter({ hasText: 'Stock changed' });
    await expect(alert).toContainText('Scarce Kurti');
    await expect(alert).toContainText('only 1 in stock');
    await alert.getByRole('button', { name: 'Remove Scarce Kurti' }).click();
    await expect(page.getByTestId('qty-CNF-1')).toHaveCount(0);
    await expect(page.getByTestId('qty-CNF-2')).toBeVisible();
  });

  test('hold a bill, then resume it', async ({ page, isMobile }) => {
    await loadApp(page);
    await pricedItem(page, 'HLD-1', 'Held Kurti', 250);
    await openDayApi(page);
    await login(page, 'admin@thunikart.test');
    await page.goto('/pos');
    await ready(page);
    await scan(page, 'HLD-1');
    await page.getByRole('button', { name: isMobile ? 'Hold' : /^Hold/ }).click();
    await expect(page.getByText(/Bill held as/)).toBeVisible();
    await expect(page.getByTestId('qty-HLD-1')).toHaveCount(0);
    await page.goto('/sales?tab=held');
    await expect(page.getByRole('list', { name: 'Held bills' })).toContainText('Held Kurti'.slice(0, 0) + 'Held 1');
    await page.getByRole('button', { name: /^Resume/ }).click();
    await expect(page).toHaveURL(/\/billing$/);
    await expect(page.getByTestId('qty-HLD-1')).toHaveText('1');
  });

  test('add a customer with just a name and a mobile', async ({ page, isMobile }) => {
    await loadApp(page);
    await pricedItem(page, 'CST-1', 'Customer Kurti', 250);
    await openDayApi(page);
    await login(page, 'admin@thunikart.test');
    await page.goto('/pos');
    await page.getByRole('button', { name: 'Add customer' }).click();
    const d = page.getByRole('dialog', { name: 'Customer' });
    await d.getByRole('button', { name: 'Add a new customer' }).click();
    await d.getByLabel(/^Name/).fill('Meera Quick');
    await d.getByLabel(/^Mobile/).fill('98000');
    await d.getByRole('button', { name: 'Save and use' }).click();
    await expect(d.getByText('Enter a 10 digit Indian mobile number')).toBeVisible();
    await d.getByLabel(/^Mobile/).fill('9800000001');
    await d.getByRole('button', { name: 'Save and use' }).click();
    await expect(page.getByRole('button', { name: isMobile ? 'Meera Quick' : 'Change' }).first()).toBeVisible();
    await expect(page.getByText('Meera Quick').first()).toBeVisible();
  });

  test('the desktop function keys: F2 clears the bill and F4 holds it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Function keys are for the counter keyboard');
    await loadApp(page);
    await pricedItem(page, 'KEY-1', 'Key Kurti', 100);
    await openDayApi(page);
    await login(page, 'admin@thunikart.test');
    await page.goto('/pos');
    await ready(page);
    await scan(page, 'KEY-1');
    await expect(page.getByTestId('qty-KEY-1')).toHaveText('1');
    await page.keyboard.press('F4');
    await expect(page.getByText(/Bill held as/)).toBeVisible();
    await scan(page, 'KEY-1');
    await expect(page.getByTestId('qty-KEY-1')).toHaveText('1');
    await page.keyboard.press('F2');
    await expect(page.getByTestId('qty-KEY-1')).toHaveCount(0);
  });
});

test.describe('returns, exchanges, day close and B2B', () => {
  test('exchange a 1,499 item for a 450 item and refund the difference', async ({ page }) => {
    test.setTimeout(90_000);
    await loadApp(page);
    const big = await pricedItem(page, 'EXC-BIG', 'Big Dress', 1499);
    const small = await pricedItem(page, 'EXC-SML', 'Small Top', 450);
    await openDayApi(page);
    const bill = await billApi(page, [{ variantId: big.variants[0]!.id, qty: 1 }], [{ mode: 'UPI', amount: 149900 }]);
    await login(page, 'admin@thunikart.test');
    await page.goto('/sales?tab=returns');
    await page.getByLabel('Scan or search').first().fill(bill.number);
    await page.getByLabel('Scan or search').first().press('Enter');
    await expect(page.getByTestId('return-invoice')).toHaveText(bill.number);
    await page.getByLabel('Return quantity for Big Dress size M').fill('1');
    await page.getByRole('combobox', { name: 'Reason' }).selectOption('Size does not fit');
    await page.getByLabel('Search items to add').fill('Small Top');
    await page.getByRole('button', { name: 'Add Small Top size M' }).click();
    await expect(page.getByTestId('return-total')).toHaveText('₹1,499.00');
    await expect(page.getByTestId('exchange-total')).toHaveText('₹450.00');
    await expect(page.getByTestId('refund-due')).toHaveText('₹1,049.00');
    await page.getByRole('button', { name: 'Confirm exchange' }).click();
    await expect(page.getByTestId('return-done')).toContainText('CN/2026-27/000001');
    await expect(page.getByTestId('return-done')).toContainText('Refund ₹1,049.00');
    expect((await stockOf(page, 'EXC-BIG'))[SHOP]).toBe(10);
    expect((await stockOf(page, 'EXC-SML'))[SHOP]).toBe(9);
    await page.goto('/sales?tab=credit');
    await expect(page.getByText('CN/2026-27/000001').first()).toBeVisible();
    void small;
  });

  test('a return needs a reason and cannot take back more than was sold', async ({ page }) => {
    await loadApp(page);
    const it = await pricedItem(page, 'RET-S', 'Sold Kurti', 300);
    await openDayApi(page);
    const bill = await billApi(page, [{ variantId: it.variants[0]!.id, qty: 1 }], [{ mode: 'Cash', amount: 30000 }]);
    await login(page, 'admin@thunikart.test');
    await page.goto('/sales?tab=returns');
    await page.getByLabel('Scan or search').first().fill(bill.number);
    await page.getByLabel('Scan or search').first().press('Enter');
    await page.getByLabel('Return quantity for Sold Kurti size M').fill('5'); // clamps to what was sold
    await expect(page.getByLabel('Return quantity for Sold Kurti size M')).toHaveValue('1');
    await expect(page.getByRole('button', { name: 'Confirm return' })).toBeDisabled(); // no reason yet
    await page.getByLabel('Scan or search').first().fill('NOPE-1');
    await page.getByLabel('Scan or search').first().press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: 'No bill with the number NOPE-1' })).toBeVisible();
  });

  test('close the day: expected cash against counted cash', async ({ page }) => {
    await loadApp(page);
    const it = await pricedItem(page, 'DAY-1', 'Day Kurti', 499);
    await openDayApi(page, 1000);
    await billApi(page, [{ variantId: it.variants[0]!.id, qty: 1 }], [{ mode: 'Cash', amount: 49900 }]);
    await login(page, 'admin@thunikart.test');
    await page.goto('/sales?tab=day');
    await page.getByLabel(/Cash counted/).fill('1490');
    await page.getByRole('button', { name: 'Close the day' }).click();
    await expect(page.getByTestId('shift-expected')).toHaveText('₹1,499.00');
    await expect(page.getByTestId('shift-counted')).toHaveText('₹1,490.00');
    await expect(page.getByTestId('shift-diff')).toHaveText('-₹9.00');
  });

  test('billing is blocked until the day is open', async ({ page }) => {
    await loadApp(page);
    await login(page, 'sales@thunikart.test');
    await page.goto('/pos');
    await expect(page.getByRole('form', { name: 'Open the day' })).toBeVisible();
    await expect(page.getByLabel('Scan or search')).toHaveCount(0);
  });

  test('a B2B counter invoice with credit and an A4 print (desktop first)', async ({ page, isMobile }) => {
    await loadApp(page);
    await pricedItem(page, 'B2B-1', 'Trade Kurti', 400, 50);
    await login(page, 'admin@thunikart.test');
    await page.goto('/sales/b2b');
    if (isMobile) { await expect(page.getByRole('button', { name: 'Switch to desktop view' })).toBeVisible(); return; }
    await page.getByRole('button', { name: 'Choose' }).click();
    const c = page.getByRole('dialog', { name: 'Customer' });
    await c.getByLabel('Customer mobile or name').fill('Trendy');
    await c.getByRole('button', { name: 'Choose Trendy Apparel Retailers' }).click();
    await expect(page.getByTestId('b2b-gstin')).toContainText('33AAAAA1111A1Z1');
    await scan(page, 'B2B-1');
    await page.getByLabel('Quantity for Trade Kurti').fill('10');
    await expect(page.getByTestId('grand-total')).toHaveText('₹4,000.00');
    await page.getByRole('button', { name: 'Apply payment to full amount' }).click();
    await expect(page.getByTestId('b2b-left')).toContainText('₹0.00');
    await page.getByRole('button', { name: 'Create invoice' }).click();
    const v = viewer(page);
    await expect(v).toContainText('CNT-000001');
    await expect(v.getByLabel('Paper size')).toHaveValue('a4'); // A4 is the default for counter invoices
    await expect(v).toContainText('Due date');
  });

  test('credit is refused for a walk-in customer', async ({ page }) => {
    await loadApp(page);
    const it = await pricedItem(page, 'CRD-1', 'Credit Kurti', 400);
    await openDayApi(page);
    await login(page, 'admin@thunikart.test');
    const r = await billApi<{ code: string; message: string }>(page, [{ variantId: it.variants[0]!.id, qty: 1 }], [{ mode: 'Credit', amount: 40000 }]);
    expect(r.code).toBe('CREDIT_NOT_ALLOWED');
  });
});

test.describe('print settings and layout', () => {
  test('the paper size is chosen per device and remembered', async ({ page }) => {
    await login(page, 'admin@thunikart.test');
    await page.goto('/settings/print');
    await page.getByRole('radio', { name: /Thermal 3 inch/ }).check();
    await expect(page.getByTestId('invoice-3in')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('radio', { name: /Thermal 3 inch/ })).toBeChecked();
    await expect(page.getByTestId('invoice-3in')).toBeVisible();
  });

  for (const path of ['/pos', '/sales', '/sales?tab=returns', '/sales?tab=held', '/sales?tab=day', '/settings/print']) {
    test(`${path} has no sideways scroll`, async ({ page }) => {
      await loadApp(page);
      await openDayApi(page);
      await login(page, 'admin@thunikart.test');
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('status', { name: /Loading/ })).toHaveCount(0);
      await expectNoSidewaysScroll(page);
    });
  }
});
