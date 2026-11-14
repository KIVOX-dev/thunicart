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
