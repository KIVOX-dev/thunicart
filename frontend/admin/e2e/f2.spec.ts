import { expect, test, type Page } from '@playwright/test';
import { adminApi, expectNoSidewaysScroll, loadApp, login } from './helpers';
import { GST_PROFILE, SHOP, WAREHOUSE, addStock, createItem, scan, seedReceived, stockOf } from './inventory-helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); sessionStorage.setItem('seeded', '1'); } });
});

const dlg = (page: Page, name: string) => page.getByRole('dialog', { name });

test.describe('purchase order to receiving', () => {
  test('raise a PO for 500, receive 495 by scanning, PO stays partly received, stock and ledger update', async ({ page }) => {
    test.setTimeout(90_000);
    await loadApp(page);
    await createItem(page, 'PO-ITEM-1', 'Order Kurti');
    await login(page, 'admin@thunikart.test');

    // Raise the order: vendor, scan or search to add, quantity, live totals from the API.
    await page.goto('/purchase/orders/new');
    await page.getByRole('combobox', { name: 'Vendor' }).selectOption({ label: 'TexStyles Manufacturing' });
    await page.getByLabel('Search items to add').fill('Order Kurti');
    await page.getByRole('button', { name: 'Add Order Kurti size M' }).click();
    await page.getByLabel(/^Quantity/).fill('500');
    await expect(page.getByTestId('po-total')).toHaveText('₹2,00,000.00'); // 500 x ₹400, no GST while GST is off
    await expect(page.getByRole('group', { name: 'Order totals' }).or(page.getByLabel('Order totals'))).not.toContainText('GST');
    await page.getByRole('button', { name: 'Create order' }).click();
    await expect(page).toHaveURL(/\/purchase\/orders\/[0-9a-f]{24}$/);
    await expect(page.getByText('Draft').first()).toBeVisible();

    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Approved').first()).toBeVisible();
    await page.getByRole('button', { name: /^Send/ }).click();
    await expect(page.getByText('Sent').first()).toBeVisible();

    // PDF preview.
    await page.getByRole('button', { name: /PDF/ }).click();
    await expect(page.frameLocator('iframe[title="Purchase order"]').getByText('PURCHASE ORDER')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).first().click();

    // Receive by scanning: one scan, then type the quantity for the rest.
    await page.getByRole('button', { name: /^Receive/ }).click();
    await expect(page).toHaveURL(/\/purchase\/grn\//);
    await expect(page.getByTestId('grn-pieces')).toHaveText('0');
    await scan(page, 'PO-ITEM-1');
    await expect(page.getByTestId('grn-pieces')).toHaveText('1');
    const qty = page.getByLabel('Received for Order Kurti size M');
    await qty.fill('495');
    await qty.press('Enter');
    await expect(page.getByTestId('grn-pieces')).toHaveText('495');
    await expect(page.getByText('Short').first()).toBeVisible();

    // Short receipt warning, then finish anyway.
    await page.getByRole('button', { name: 'Finish receiving' }).click();
    await expect(dlg(page, 'Check before finishing')).toBeVisible();
    await expect(dlg(page, 'Check before finishing')).toContainText('ordered 500, received 495');
    await dlg(page, 'Check before finishing').getByRole('button', { name: 'Finish anyway' }).click();
    await expect(page.getByText('Receipt finished. Stock updated.')).toBeVisible();

    // The PO stays partly received.
    await page.goto('/purchase');
    await expect(page.locator('span:text-is("Partly received")').first()).toBeVisible();
    await expect(page.getByText(/495 (\/|of) 500/).first()).toBeVisible();

    // Stock and ledger.
    expect((await stockOf(page, 'PO-ITEM-1'))[WAREHOUSE]).toBe(495);
    await page.goto('/stock?tab=ledger');
    await expect(page.getByText('+495').first()).toBeVisible();
    await expect(page.getByText(/Goods received/).last()).toBeVisible();
    await expectNoSidewaysScroll(page);
  });

  test('an unknown barcode and a scan of an item not on the order are handled plainly', async ({ page }) => {
    await loadApp(page);
    const a = await createItem(page, 'ON-PO', 'On Order Kurti');
    await createItem(page, 'OFF-PO', 'Off Order Kurti');
    const vendors = await adminApi<{ items: Array<{ id: string }> }>(page, 'GET', '/vendors');
    const po = await adminApi<{ id: string }>(page, 'POST', '/purchase/orders', { vendorId: vendors.items[0]!.id, expectedDate: '2026-12-01', notes: '', lines: [{ variantId: a.variants[0]!.id, orderedQty: 5, unitCost: 40000 }] });
    await adminApi(page, 'POST', `/purchase/orders/${po.id}/approve`, {});
    const grn = await adminApi<{ id: string }>(page, 'POST', '/purchase/grns', { poId: po.id });
    await login(page, 'admin@thunikart.test');
    await page.goto(`/purchase/grn/${grn.id}`);
    await expect(page.getByTestId('grn-pieces')).toHaveText('0');
    await scan(page, 'NO-SUCH-CODE');
    await expect(page.getByRole('alert').filter({ hasText: 'NO-SUCH-CODE' })).toBeVisible();
    await scan(page, 'OFF-PO');
    await expect(page.getByText('Not on the PO').first()).toBeVisible();
    await expect(page.getByTestId('grn-pieces')).toHaveText('1');
  });

  test('finishing twice does not receive the goods twice', async ({ page }) => {
    await loadApp(page);
    const { item, grn } = await seedReceived(page, 'ONCE-1', 'Once Kurti', 10);
    expect((await stockOf(page, 'ONCE-1'))[WAREHOUSE]).toBe(10);
    await adminApi(page, 'POST', `/purchase/grns/${grn.id}/finish`, { confirmWarnings: true });
    expect((await stockOf(page, 'ONCE-1'))[WAREHOUSE]).toBe(10);
    void item;
  });
});

test.describe('bills, returns, payments and ageing', () => {
  test('add a bill from a receipt, pay it in full, and the ageing clears', async ({ page }) => {
    test.setTimeout(90_000);
    await loadApp(page);
    await seedReceived(page, 'BILL-1', 'Billed Kurti', 100);
    await login(page, 'admin@thunikart.test');

    await page.goto('/purchase?tab=bills');
    await page.getByRole('button', { name: 'Add bill' }).click();
    const bill = dlg(page, 'Add purchase bill');
    await bill.getByRole('button', { name: 'Add bill' }).click();
    await expect(bill.getByText('Choose a receipt')).toBeVisible();
    await bill.getByLabel('Receipt').selectOption({ index: 1 });
    await bill.getByLabel(/Vendor bill number/).fill('INV-77');
    await bill.getByRole('button', { name: 'Add bill' }).click();
    await expect(page.getByText('Bill added')).toBeVisible();
    await expect(page.getByText('PB-0001').first()).toBeVisible();
    await expect(page.getByText('Unpaid').first()).toBeVisible();

    await page.goto('/purchase?tab=ageing');
    await expect(page.getByText('TexStyles Manufacturing').first()).toBeVisible();
    await expect(page.getByText('₹40,000.00').first()).toBeVisible();

    await page.goto('/purchase?tab=payments');
    await page.getByRole('button', { name: 'Pay vendor' }).first().click();
    const pay = dlg(page, 'Pay vendor');
    await pay.getByRole('combobox', { name: 'Vendor' }).selectOption({ label: 'TexStyles Manufacturing' });
    await pay.getByRole('button', { name: 'Pay PB-0001 in full' }).click();
    await pay.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText('Payment recorded')).toBeVisible();
    await expect(page.getByText('VP-0001').first()).toBeVisible();

    await page.goto('/purchase?tab=bills');
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
    await page.goto('/purchase?tab=ageing');
    await expect(page.getByText('Nothing is owed')).toBeVisible();
  });

  test('paying more than the balance is refused with a plain message', async ({ page }) => {
    await loadApp(page);
    const { grn } = await seedReceived(page, 'OVERPAY-1', 'Overpay Kurti', 10);
    const bill = await adminApi<{ id: string; vendorId: string }>(page, 'POST', '/purchase/bills', { grnId: grn.id, vendorBillNo: 'X-1', date: '2026-11-09', dueDate: '2026-12-09' });
    await login(page, 'admin@thunikart.test');
    await page.goto('/purchase?tab=payments');
    await page.getByRole('button', { name: 'Pay vendor' }).first().click();
    const pay = dlg(page, 'Pay vendor');
    await pay.getByRole('combobox', { name: 'Vendor' }).selectOption({ label: 'TexStyles Manufacturing' });
    await pay.getByLabel('Amount to pay on PB-0001').fill('999999');
    await pay.getByRole('button', { name: 'Record payment' }).click();
    await expect(pay.getByRole('alert')).toContainText('left to pay');
    void bill;
  });

  test('a purchase return takes stock out and creates a debit note', async ({ page }) => {
    await loadApp(page);
    await seedReceived(page, 'RET-1', 'Return Kurti', 20);
    await login(page, 'admin@thunikart.test');
    await page.goto('/purchase?tab=returns');
    await page.getByRole('button', { name: 'New return' }).first().click();
    const f = dlg(page, 'New purchase return');
    await f.getByRole('combobox', { name: 'Vendor' }).selectOption({ label: 'TexStyles Manufacturing' });
    await f.getByLabel('Search items to add').fill('Return Kurti');
    await f.getByRole('button', { name: 'Add Return Kurti size M' }).click();
    await f.getByLabel('Return quantity for Return Kurti size M').fill('5');
    await f.getByRole('button', { name: 'Create return' }).click();
    await expect(page.getByText('Return created. Stock updated.')).toBeVisible();
    await expect(page.getByText(/DN\/2026-27\/000001/).first()).toBeVisible();
    expect((await stockOf(page, 'RET-1'))[WAREHOUSE]).toBe(15);
  });
});

test.describe('stock screens', () => {
  test('stock by item shows a size grid with a column per store', async ({ page }) => {
    await loadApp(page);
    const it = await createItem(page, 'GRID-1', 'Grid Kurti');
    await addStock(page, it.variants[0]!.id, WAREHOUSE, 7);
    await addStock(page, it.variants[0]!.id, SHOP, 3);
    await login(page, 'admin@thunikart.test');
    await page.goto('/stock?tab=items');
    await expect(page.getByText('Grid Kurti')).toBeVisible();
    await expect(page.getByText(/Warehouse: 7/).or(page.getByRole('cell', { name: '7', exact: true }).first())).toBeVisible();
    await expect(page.locator('span:text-is("In Stock")').first()).toBeVisible();
    await expectNoSidewaysScroll(page);
  });

  test('an adjustment needs a reason and writes a ledger entry', async ({ page }) => {
    await loadApp(page);
    await createItem(page, 'ADJ-1', 'Adjust Kurti');
    await login(page, 'admin@thunikart.test');
    await page.goto('/stock?tab=adjust');
    await page.getByRole('button', { name: 'Save adjustment' }).click();
    await expect(page.getByText('Choose an item').first()).toBeVisible();
    await page.getByLabel('Search items to add').fill('Adjust Kurti');
    await page.getByRole('button', { name: 'Add Adjust Kurti size M' }).click();
    await expect(page.getByTestId('adjust-picked')).toContainText('Adjust Kurti');
    await page.getByRole('form', { name: 'Adjust stock' }).getByRole('combobox', { name: 'Store' }).selectOption({ label: 'Warehouse' });
    await page.getByLabel(/Quantity change/).fill('12');
    await page.getByRole('combobox', { name: 'Reason' }).selectOption('Count correction');
    await page.getByRole('button', { name: 'Save adjustment' }).click();
    await expect(page.getByText('Stock adjusted')).toBeVisible();
    expect((await stockOf(page, 'ADJ-1'))[WAREHOUSE]).toBe(12);
    await page.goto('/stock?tab=ledger');
    await expect(page.getByText('+12').first()).toBeVisible();
  });

  test('reorder alerts create a draft PO', async ({ page }) => {
    await loadApp(page);
    const it = await createItem(page, 'LOW-1', 'Reorder Kurti', {}, { reorderLevel: 5 });
    await addStock(page, it.variants[0]!.id, SHOP, 2);
    await login(page, 'admin@thunikart.test');
    await page.goto('/stock?tab=reorder');
    await page.getByRole('checkbox', { name: 'Select Reorder Kurti size M' }).check();
    await page.getByRole('button', { name: /Create PO \(1\)/ }).click();
    const d = page.getByRole('dialog', { name: 'Create purchase order' });
    await d.getByRole('combobox').selectOption({ label: 'TexStyles Manufacturing' });
    await d.getByRole('button', { name: /Create draft/ }).click();
    await expect(page).toHaveURL(/\/purchase\/orders\/[0-9a-f]{24}$/);
    await expect(page.getByLabel(/^Quantity/)).toHaveValue('13'); // the API suggests 3 x reorder level less on hand
  });
});

test.describe('stock audit and transfers (scan to count, scan to receive)', () => {
  test('count by scanning, undo, review the variance and approve', async ({ page }) => {
    test.setTimeout(90_000);
    await loadApp(page);
    const it = await createItem(page, 'AUD-1', 'Audit Kurti');
    await addStock(page, it.variants[0]!.id, WAREHOUSE, 10);
    await login(page, 'admin@thunikart.test');
    await page.goto('/stock/audits');
    await page.getByRole('button', { name: 'Start a count' }).click();
    const s = dlg(page, 'Start a stock count');
    await s.getByRole('combobox', { name: 'Store' }).selectOption({ label: 'Warehouse' });
    await s.getByRole('button', { name: 'Start counting' }).click();
    await expect(page).toHaveURL(/\/stock\/audits\/[0-9a-f]{24}$/);
    await expect(page.getByTestId('audit-count')).toHaveText('0');
    await scan(page, 'AUD-1', 8);
    await expect(page.getByTestId('audit-count')).toHaveText('8');
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect(page.getByTestId('audit-count')).toHaveText('7');
    await page.getByRole('button', { name: /Finish counting/ }).click();
    await expect(page.getByRole('region', { name: 'Variance sheet' })).toContainText('-3');
    await page.getByRole('button', { name: 'Approve and update stock' }).click();
    await expect(page.getByText('Count approved. Stock updated.')).toBeVisible();
    expect((await stockOf(page, 'AUD-1'))[WAREHOUSE]).toBe(7);
    const audit = await adminApi<{ items: Array<{ qty: number }> }>(page, 'GET', '/stock/ledger?type=AUDIT');
    expect(audit.items[0]!.qty).toBe(-3);
  });

  test('a second count cannot be opened on the same store', async ({ page }) => {
    await loadApp(page);
    await adminApi(page, 'POST', '/stock/audits', { storeId: SHOP });
    await login(page, 'admin@thunikart.test');
    await page.goto('/stock/audits');
    await page.getByRole('button', { name: 'Start a count' }).click();
    const s = dlg(page, 'Start a stock count');
    await s.getByRole('combobox', { name: 'Store' }).selectOption({ label: 'Thunikart, Pattanam (shop)' });
    await s.getByRole('button', { name: 'Start counting' }).click();
    await expect(s.getByRole('alert')).toContainText('already open');
  });

  test('move stock from the warehouse to the shop: request, dispatch, scan to receive', async ({ page }) => {
    test.setTimeout(90_000);
    await loadApp(page);
    const it = await createItem(page, 'TRF-1', 'Transfer Kurti');
    await addStock(page, it.variants[0]!.id, WAREHOUSE, 10);
    await login(page, 'admin@thunikart.test');
    await page.goto('/stock/transfers');
    await page.getByRole('button', { name: 'Request transfer' }).first().click();
    const f = dlg(page, 'Request transfer');
    await f.getByRole('combobox', { name: 'From' }).selectOption({ label: 'Warehouse' });
    await f.getByRole('combobox', { name: 'To', exact: true }).selectOption({ label: 'Thunikart, Pattanam (shop)' });
    await f.getByLabel('Search items to add').fill('Transfer Kurti');
    await f.getByRole('button', { name: 'Add Transfer Kurti size M' }).click();
    await f.getByLabel('Quantity to move for Transfer Kurti size M').fill('4');
    await f.getByRole('button', { name: 'Request transfer' }).click();
    await expect(page).toHaveURL(/\/stock\/transfers\/[0-9a-f]{24}$/);
    await expect(page.getByText('Requested').first()).toBeVisible();

    await page.getByRole('button', { name: 'Dispatch' }).click();
    await expect(page.getByText('In transit').first()).toBeVisible();
    expect((await stockOf(page, 'TRF-1'))[WAREHOUSE]).toBe(6);

    await scan(page, 'TRF-1', 4);
    await expect(page.getByTestId('transfer-received')).toHaveText('4');
    await scan(page, 'OTHER-ITEM-9');
    await expect(page.getByRole('alert').filter({ hasText: 'OTHER-ITEM-9' })).toBeVisible();
    await page.getByRole('button', { name: 'Finish receiving' }).click();
    await expect(page.getByText('Transfer received. Stock updated.')).toBeVisible();
    const stock = await stockOf(page, 'TRF-1');
    expect(stock[SHOP]).toBe(4);
    expect(stock[WAREHOUSE]).toBe(6);
  });

  test('dispatch is refused with the item named when stock changed', async ({ page }) => {
    await loadApp(page);
    const it = await createItem(page, 'TRF-2', 'Short Kurti');
    await addStock(page, it.variants[0]!.id, WAREHOUSE, 2);
    const t = await adminApi<{ id: string }>(page, 'POST', '/stock/transfers', { fromStoreId: WAREHOUSE, toStoreId: SHOP, lines: [{ variantId: it.variants[0]!.id, qty: 5 }] });
    await login(page, 'admin@thunikart.test');
    await page.goto(`/stock/transfers/${t.id}`);
    await page.getByRole('button', { name: 'Dispatch' }).click();
    await expect(page.getByRole('alert')).toContainText('Only 2 of Short Kurti');
  });
});

test.describe('GST on and off', () => {
  test('tax lines and columns appear only while GST is on', async ({ page }) => {
    await loadApp(page);
    const it = await createItem(page, 'GST-1', 'Tax Kurti');
    const vendors = await adminApi<{ items: Array<{ id: string }> }>(page, 'GET', '/vendors');
    const po = await adminApi<{ id: string }>(page, 'POST', '/purchase/orders', { vendorId: vendors.items[0]!.id, expectedDate: '2026-12-01', notes: '', lines: [{ variantId: it.variants[0]!.id, orderedQty: 10, unitCost: 40000 }] });
    await login(page, 'admin@thunikart.test');
    await page.goto(`/purchase/orders/${po.id}`);
    await expect(page.getByTestId('po-total')).toHaveText('₹4,000.00');
    await expect(page.getByLabel('Order totals')).not.toContainText('GST');
    await page.goto('/purchase');
    await expect(page.getByRole('columnheader', { name: 'GST' })).toHaveCount(0);

    await adminApi(page, 'PUT', '/settings/business-profile', GST_PROFILE);
    await page.goto(`/purchase/orders/${po.id}`);
    await expect(page.getByTestId('po-total')).toHaveText('₹4,200.00'); // 5% GST worked out by the API
    await expect(page.getByLabel('Order totals')).toContainText('GST');
  });
});

test.describe('permissions and layout', () => {
  test('a counter employee cannot open Purchase, and is sent to the billing counter', async ({ page }) => {
    await login(page, 'sales@thunikart.test');
    await page.goto('/purchase');
    await expect(page).toHaveURL(/\/billing$/);
  });

  test('Buyer Purchase cannot approve a stock audit', async ({ page }) => {
    await loadApp(page);
    const it = await createItem(page, 'PERM-1', 'Perm Kurti');
    await addStock(page, it.variants[0]!.id, WAREHOUSE, 3);
    const a = await adminApi<{ id: string }>(page, 'POST', '/stock/audits', { storeId: WAREHOUSE });
    await adminApi(page, 'POST', `/stock/audits/${a.id}/scan`, { barcode: 'PERM-1' });
    await adminApi(page, 'POST', `/stock/audits/${a.id}/submit`, {});
    await login(page, 'buyer@thunikart.test');
    await page.goto(`/stock/audits/${a.id}`);
    await expect(page.getByText('Waiting for an approver').or(page.getByRole('link', { name: 'Back to counts' })).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve and update stock' })).toHaveCount(0);
  });

  for (const path of ['/purchase', '/purchase?tab=receipts', '/purchase?tab=bills', '/purchase?tab=ageing', '/purchase/orders/new', '/stock', '/stock?tab=items', '/stock?tab=ledger', '/stock?tab=reorder', '/stock/audits', '/stock/transfers']) {
    test(`${path} has no sideways scroll`, async ({ page }) => {
      await login(page, 'admin@thunikart.test');
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('status', { name: /Loading/ })).toHaveCount(0);
      await expectNoSidewaysScroll(page);
    });
  }
});
