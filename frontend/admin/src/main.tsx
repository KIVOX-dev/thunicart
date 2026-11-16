import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@thunikart/ui/tokens.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Providers } from './app/providers';
import { router } from './app/router';
import { MOCK_MODE } from './features/api/http';
import { bootstrapSession } from './features/auth/use-session';

// After a new version goes live, a tab still running the old one asks for files that no longer exist. Reload once to pick up the new version
// (not again within 30 seconds, so a real outage cannot loop).
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('tk.reloaded-at') ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem('tk.reloaded-at', String(Date.now()));
  } catch { /* storage blocked: reload anyway, once per page load */ }
  event.preventDefault();
  window.location.reload();
});

async function start() {
  if (MOCK_MODE) {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass', quiet: true, serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` } });
  }
  // Restore the session from the refresh cookie before the first /me call.
  await bootstrapSession();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );
}
void start();
