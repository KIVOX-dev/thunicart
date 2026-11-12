'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-base">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">Please try again. If it keeps happening, call us on 8400044191.</p>
      {error.digest && <p className="mt-1 text-xs text-muted">Reference: {error.digest}</p>}
      <button type="button" onClick={reset} className="mt-6 min-h-12 rounded-sm bg-orange px-6 text-sm font-semibold uppercase tracking-wider text-navy">Try again</button>
    </div>
  );
}
