import { Button } from '@thunikart/ui';

/** Numbered pages: Previous, 1 2 3 ... last, Next. Page numbers start at 1. */
export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  const shown = new Set([1, last, page - 1, page, page + 1].filter((p) => p >= 1 && p <= last));
  const pages = [...shown].sort((a, b) => a - b);
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center gap-1">
      <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">&lt;</Button>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && p - pages[i - 1]! > 1 && <span aria-hidden className="px-1 text-muted">…</span>}
          <Button size="sm" variant={p === page ? 'primary' : undefined} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</Button>
        </span>
      ))}
      <Button size="sm" disabled={page >= last} onClick={() => onPage(page + 1)} aria-label="Next page">&gt;</Button>
      <span className="ml-3 text-xs text-muted">Page {page} of {last}</span>
    </nav>
  );
}
