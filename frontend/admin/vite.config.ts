import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Thunikart Admin and POS',
        short_name: 'Thunikart',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0B1B54',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//, /mockServiceWorker\.js$/] },
    }),
  ],
  server: { port: 5173 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as import('vite').UserConfig);
