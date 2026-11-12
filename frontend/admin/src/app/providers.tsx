import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@thunikart/ui';
import { ApiError } from '../features/api/http';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/OfflineBanner';
import { PrintProvider } from '../features/pos/use-print';
import { ViewProvider } from './view';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (count, err) => !(err instanceof ApiError && [401, 403, 404, 422].includes(err.status)) && count < 2,
      },
    },
  }));
  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <ViewProvider>
          <ToastProvider>
            <OfflineBanner />
            <PrintProvider>{children}</PrintProvider>
          </ToastProvider>
        </ViewProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
