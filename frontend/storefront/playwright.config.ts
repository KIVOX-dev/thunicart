import { defineConfig } from '@playwright/test';

/** The store runs on its own mock API (NEXT_PUBLIC_API_URL is a placeholder), so every journey can be tested without keys. Each page is tested at 390 px and 1440 px. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 2,
  retries: 1,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: { command: 'pnpm exec next dev -p 3100', url: 'http://localhost:3100', reuseExistingServer: true, timeout: 180_000, env: { NEXT_PUBLIC_SITE_URL: 'http://localhost:3100', NEXT_PUBLIC_API_URL: 'REPLACE_ME_http://localhost:4000' } },
});
