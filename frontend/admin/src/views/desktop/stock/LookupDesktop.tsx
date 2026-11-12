import { useState } from 'react';
import { Button, Input, ListSkeleton } from '@thunikart/ui';
import { ErrorBanner } from '../../../components/ErrorBanner';

import { ScanBox } from '../../../components/ScanBox';
import { StockCard } from '../../../components/StockCard';
import { useItems } from '../../../features/catalog/use-items';
import { useStockLookup } from '../../../features/catalog/use-stock-lookup';

/** Stock lookup. A keyboard scanner works anywhere on this page. Full stock screens arrive in Phase F2. */
export function LookupDesktop() {
  const lookup = useStockLookup();
  const [q, setQ] = useState('');
  const results = useItems({ q, category: '', brand: '', stockStatus: '', active: '', issue: '', sort: 'name' });
  const list = q.trim().length >= 2 ? results.data?.pages[0]?.items ?? [] : [];
  return (
    <div className="max-w-4xl">
      <p className="mb-3 text-sm text-muted">Scan an item or search by name to see price, sizes and stock by store.</p>
      <ScanBox large autoFocus onCode={lookup.scan} />
      <p className="mt-2 text-xs text-muted">Keyboard scanners work in this box, or anywhere on the page.</p>
      <div className="mt-4 space-y-3" aria-live="polite">
        {lookup.busy && <ListSkeleton rows={2} label="Looking up" />}
        {lookup.notFound && <div role="alert" className="rounded border border-danger bg-danger-bg p-3 text-sm">No item found for <strong>{lookup.notFound}</strong>. Check the barcode or search by name.</div>}
        {lookup.error && <ErrorBanner message={lookup.error.friendly} requestId={lookup.error.requestId} />}
        {lookup.found && <StockCard item={lookup.found.item} variantId={lookup.found.variantId} flash />}
      </div>
      <section aria-label="Search by name" className="mt-8 border-t border-line pt-4">
        <h2 className="mb-2 text-xs">Search by name</h2>
        <div className="w-80"><Input aria-label="Search by name" placeholder="Type at least two letters" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {list.length > 0 && <ul className="mt-2 max-w-xl divide-y divide-line rounded border border-line">{list.slice(0, 8).map((i) => <li key={i.id} className="flex items-center justify-between gap-2 p-2 text-sm"><span><strong>{i.name}</strong><span className="block font-mono text-xs text-muted">{i.code}</span></span><Button size="sm" onClick={() => lookup.choose(i)} aria-label={`Show ${i.name}`}>Show</Button></li>)}</ul>}
      </section>
    </div>
  );
}
