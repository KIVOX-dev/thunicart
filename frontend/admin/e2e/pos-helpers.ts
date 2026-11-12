import { expect, type Page } from '@playwright/test';
import { adminApi } from './helpers';
import { SHOP, addStock, createItem } from './inventory-helpers';

/** An item priced in rupees with stock in the shop. */
export async function pricedItem(page: Page, code: string, name: string, rupees: number, stock = 10, extra: Record<string, unknown> = {}) {
  const paise = Math.round(rupees * 100);
  const item = await createItem(page, code, name, extra, { mrp: paise, selling: paise });
  if (stock) await addStock(page, item.variants[0]!.id, SHOP, stock);
  return item;
}

export const openDayApi = (page: Page, rupees = 1000) => adminApi(page, 'POST', '/pos/shift/open', { openingCash: rupees * 100 });

export interface BillLine { variantId: string; qty: number; discount?: { type: 'amount' | 'percent'; value: number } }
export const billApi = <T = { id: string; number: string }>(page: Page, lines: BillLine[], payments: Array<{ mode: string; amount: number; reference?: string }>, extra: Record<string, unknown> = {}) =>
  adminApi<T>(page, 'POST', '/pos/bills', { lines, payments: payments.map((p) => ({ reference: '', ...p })), customerId: null, ...extra });

/** Counts window.print() calls so tests can check Print was pressed without a real dialog. */
export async function stubPrint(page: Page) {
  await page.addInitScript(() => { (window as unknown as { __prints: number }).__prints = 0; window.print = () => { (window as unknown as { __prints: number }).__prints++; }; });
}
export const printCount = (page: Page) => page.evaluate(() => (window as unknown as { __prints: number }).__prints);

/** Pay the whole bill with one tender, on either view. */
export async function payFull(page: Page, isMobile: boolean, mode = 'UPI') {
  if (isMobile) await page.getByRole('button', { name: 'Pay', exact: true }).click();
  await page.getByRole('button', { name: `Pay with ${mode}` }).click();
  await expect(page.getByTestId('amount-left')).toHaveText('₹0.00');
  await page.getByRole('button', { name: isMobile ? 'Finish bill' : /^Pay \(F8\)/ }).click();
}
