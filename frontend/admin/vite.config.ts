import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'logo-mark.png', 'logo-sidebar.png', 'logo-primary.png'],
      manifest: {
        name: 'Thunikart Admin and POS',
        short_name: 'Thunikart',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0B1B54',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//, /mockServiceWorker\.js$/] },
    }),
  ],
  server: { port: 5173 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as import('vite').UserConfig);
