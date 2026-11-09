import { defineConfig } from '@playwright/test';

/** Every screen is tested at 390 px (mobile) and 1440 px (desktop). Runs against the MSW mock API. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
