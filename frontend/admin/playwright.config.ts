import { defineConfig } from '@playwright/test';

/**
 * Every screen is tested at 390 px (mobile) and 1440 px (desktop), against the MSW mock API on its own port.
 * The mock is forced on here, so these tests never talk to a real backend even if one is running on the same machine.
 */
const PORT = 5174;
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 1,
  // Screens are lazy chunks that the dev server compiles on first use, so give the first paint more time.
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { VITE_API_URL: 'REPLACE_ME_http://localhost:4000', VITE_STOREFRONT_URL: 'http://localhost:3000' },
  },
});
