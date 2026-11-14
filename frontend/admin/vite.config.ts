import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * VITE_BASE is '/admin/' when the admin is served under a path on the same domain as the store (see frontend/vercel.json).
 * It builds into dist/admin/, so a request for /admin/assets/x.js finds dist/admin/assets/x.js with no path rewriting.
 * Without it everything stays at the root, which is how local development and the tests run.
 */
const BASE = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base: BASE,
  build: { outDir: BASE === '/' ? 'dist' : `dist${BASE.replace(/\/$/, '')}`, emptyOutDir: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'logo-mark.png', 'logo-sidebar.png', 'logo-primary.png'],
      manifest: {
        name: 'Thunikart Admin and POS',
        short_name: 'Thunikart',
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
