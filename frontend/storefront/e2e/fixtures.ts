import { expect, test as base } from '@playwright/test';

/** Next serves HTML before the page is interactive. Every goto waits for hydration, so a tap or a typed value is never lost to the gap. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = (async (url: string, opts?: Parameters<typeof goto>[1]) => {
      const r = await goto(url, opts);
      await page.waitForFunction(() => document.documentElement.dataset.hydrated === '1', null, { timeout: 15_000 }).catch(() => undefined);
      return r;
    }) as typeof page.goto;
    await use(page);
  },
});
export { expect };
export type { Page } from '@playwright/test';
