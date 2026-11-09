import { Button } from '@thunikart/ui';
import { ApiError } from '../features/api/http';

/** Plain error message with the request id in small text for support. */
export function ErrorBanner({ message, requestId, onRetry }: { message: string; requestId?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-1 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-navy">
      <span>{message}</span>
      {requestId && <span className="text-xs text-muted">Request id: {requestId}</span>}
      {onRetry && <Button size="sm" onClick={onRetry} className="mt-1 self-start">Try again</Button>}
    </div>
  );
}

/** Error panel for a failed query. 403 reads as no permission, 409 offers a refresh. */
export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  const message = e ? (e.status === 409 ? `${e.message} Refresh to see the latest.` : e.friendly) : 'Something went wrong while loading.';
  return <ErrorBanner message={message} requestId={e?.requestId} onRetry={onRetry} />;
}
