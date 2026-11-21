import type { MetadataRoute } from 'next';

/** The online store installs as "Thunikart". The admin and billing apps have their own manifests under /admin/ ("Thunikart Admin", "Thunikart Billing"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'Thunikart', short_name: 'Thunikart', start_url: '/', scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#0B1B54',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  };
}
