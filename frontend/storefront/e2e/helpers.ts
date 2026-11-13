import { expect, type APIRequestContext, type Page } from '@playwright/test';

export interface Variant { id: string; size: string; color: string; stock: number }
export interface Prod { id: string; slug: string; name: string; fromPrice: number; variants: Variant[] }

export async function products(request: APIRequestContext, query = 'pageSize=50'): Promise<Prod[]> {
  const r = await request.get(`/api/v1/catalog/products?${query}`);
  return ((await r.json()) as { items: Prod[] }).items;
}
/** A product with a size that has plenty in stock, and another size that is sold out. */
export async function stocked(request: APIRequestContext, minStock = 5) {
  const list = await products(request);
  const p = list.find((x) => x.variants.some((v) => v.stock >= minStock))!;
  const color = p.variants.find((v) => v.stock >= minStock)!.color;
  return { p, variant: p.variants.find((v) => v.stock >= minStock)!, color };
}
export async function resetMock(request: APIRequestContext) { await request.post('/api/v1/mock/reset'); }

export async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

/** Opens a product, picks the colour and size, and adds it to the bag. Works on both views. */
export async function addToBag(page: Page, slug: string, color: string, size: string) {
  await page.goto(`/p/${slug}`);
  await page.getByRole('button', { name: `Colour ${color}` }).click();
  await page.getByRole('button', { name: new RegExp(`^Size ${size}$`) }).click();
  await page.getByRole('button', { name: 'Add to cart' }).filter({ visible: true }).first().click();
}

export async function signIn(page: Page, email = 'shopper@example.com', next = '/account') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await page.getByLabel('6 digit code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[/]/g, '\\/')));
}
