import { defineConfig } from '@playwright/test';

/** The store runs on its own mock API (NEXT_PUBLIC_API_URL is a placeholder), so every journey can be tested without keys. Each page is tested at 390 px and 1440 px. */
const PORT = Number(process.env.TEST_PORT ?? 3100);
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 2,
  retries: 1,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
  // a production build in its own folder (.next-test), so a dev server on port 3000 is never disturbed
  webServer: { command: `pnpm exec next build && pnpm exec next start -p ${PORT}`, url: `http://localhost:${PORT}`, reuseExistingServer: true, timeout: 420_000, env: { NEXT_DIST_DIR: '.next-test', NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`, NEXT_PUBLIC_API_URL: 'REPLACE_ME_http://localhost:4000' } },
});
