import type { Page } from '@playwright/test';
import { adminApi, sampleItem } from './helpers';

/** Store ids of the mock database. */
export const SHOP = '000000000000000000000384';
export const WAREHOUSE = '000000000000000000000385';

/** A keyboard scanner sends the whole code in a few milliseconds and ends with Enter. Sent in one go so the test does not depend on machine load. */
export async function scan(page: Page, code: string, times = 1) {
  await page.evaluate(({ code, times }) => {
    for (let n = 0; n < times; n++) for (const key of [...code, 'Enter']) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }, { code, times });
}

interface ItemOut { id: string; variants: Array<{ id: string }> }
export async function createItem(page: Page, code: string, name: string, extra: Record<string, unknown> = {}, variant: Record<string, unknown> = {}) {
  const base = sampleItem(code, name);
  return adminApi<ItemOut>(page, 'POST', '/items', { ...base, ...extra, variants: [{ ...base.variants[0], ...variant }] });
}

export async function addStock(page: Page, variantId: string, storeId: string, qty: number) {
  await adminApi(page, 'POST', '/stock/adjustments', { variantId, storeId, delta: qty, reason: 'Found stock', note: 'test setup' });
}

export async function stockOf(page: Page, barcode: string): Promise<Record<string, number>> {
  const r = await adminApi<{ item: { variants: Array<{ stock: Record<string, number> }> } }>(page, 'GET', `/items/lookup?barcode=${barcode}`);
  return r.item.variants[0]!.stock;
}

/** Item, approved PO and a finished receipt, set up through the API. */
export async function seedReceived(page: Page, code = 'RCV-1', name = 'Received Kurti', qty = 100) {
  const item = await createItem(page, code, name);
  const vendors = await adminApi<{ items: Array<{ id: string; name: string }> }>(page, 'GET', '/vendors');
  const vendor = vendors.items[0]!;
  const po = await adminApi<{ id: string }>(page, 'POST', '/purchase/orders', { vendorId: vendor.id, expectedDate: '2026-12-01', notes: '', lines: [{ variantId: item.variants[0]!.id, orderedQty: qty, unitCost: 40000 }] });
  await adminApi(page, 'POST', `/purchase/orders/${po.id}/approve`, {});
  const grn = await adminApi<{ id: string; number: string; lines: Array<{ id: string }> }>(page, 'POST', '/purchase/grns', { poId: po.id });
  await adminApi(page, 'PATCH', `/purchase/grns/${grn.id}/lines/${grn.lines[0]!.id}`, { receivedQty: qty });
  await adminApi(page, 'POST', `/purchase/grns/${grn.id}/finish`, { confirmWarnings: true });
  return { item, vendor, po, grn };
}

export const GST_PROFILE = {
  legalName: 'Krishnas Orchids', brandName: 'Thunikart', addressLines: ['Near KN Hall'], city: 'Coimbatore', state: 'Tamil Nadu', stateCode: '33', pincode: '641016', phone: '8400044191',
  email: '', website: '', logoKey: null, gstin: '33ABCDE1234F1Z5', pan: 'ABCDE1234F', defaultPrintSize: '4x6', termsText: '', invoiceFooter: '',
};
