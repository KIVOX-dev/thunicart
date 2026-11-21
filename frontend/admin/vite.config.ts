import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * VITE_BASE is '/admin/' when the admin is served under a path on the same domain as the store (see frontend/vercel.json).
 * It builds into dist/admin/, so a request for /admin/assets/x.js finds dist/admin/assets/x.js with no path rewriting.
 * Without it everything stays at the root, which is how local development and the tests run.
 */
const BASE = process.env.VITE_BASE ?? '/';

/**
 * A second install target: opening the Billing center and choosing "Install" / "Add to Home screen" makes an app called "Thunikart Billing"
 * that starts on the billing screen. The page switches to this manifest while billing is open (see billing-app.tsx).
 */
const billingManifest = () => ({
  name: 'billing-manifest',
  generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
    this.emitFile({
      type: 'asset', fileName: 'billing.webmanifest',
      source: JSON.stringify({
        id: '/billing', name: 'Thunikart Billing', short_name: 'Thunikart Billing', start_url: '/billing', scope: '/billing',
        display: 'standalone', background_color: '#ffffff', theme_color: '#0B1B54',
        icons: [{ src: `${BASE}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' }],
      }),
    });
  },
});

export default defineConfig({
  base: BASE,
  build: { outDir: BASE === '/' ? 'dist' : `dist${BASE.replace(/\/$/, '')}`, emptyOutDir: true },
  plugins: [
    react(),
    billingManifest(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'logo-mark.png', 'logo-sidebar.png', 'logo-primary.png'],
      manifest: {
        id: BASE,
        name: 'Thunikart Admin',
        short_name: 'Thunikart Admin',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0B1B54',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: { navigateFallback: `${BASE}index.html`, navigateFallbackDenylist: [/^\/api\//, /mockServiceWorker\.js$/] },
    }),
  ],
  server: { port: 5173 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as import('vite').UserConfig);
