import { useState } from 'react';
import { Button, Input, ListSkeleton } from '@thunikart/ui';
import { ErrorBanner } from '../../../components/ErrorBanner';
import { ScanBox } from '../../../components/ScanBox';
import { StockCard } from '../../../components/StockCard';
import { useItems } from '../../../features/catalog/use-items';
import { useStockLookup } from '../../../features/catalog/use-stock-lookup';

/** Mobile first: a big scan button, then price, sizes and stock by store for the scanned item. */
export function LookupMobile() {
  const lookup = useStockLookup();
  const [q, setQ] = useState('');
  const results = useItems({ q, category: '', brand: '', stockStatus: '', active: '', issue: '', sort: 'name' });
  const list = q.trim().length >= 2 ? results.data?.pages[0]?.items ?? [] : [];
  return (
    <div className="flex flex-col gap-4">
      <ScanBox large onCode={lookup.scan} placeholder="Scan or type a code" />
      <div className="flex flex-col gap-3" aria-live="polite">
        {lookup.busy && <ListSkeleton rows={2} label="Looking up" />}
        {lookup.notFound && <div role="alert" className="rounded border border-danger bg-danger-bg p-3 text-sm">No item found for <strong>{lookup.notFound}</strong>.</div>}
        {lookup.error && <ErrorBanner message={lookup.error.friendly} requestId={lookup.error.requestId} />}
        {lookup.found && <StockCard item={lookup.found.item} variantId={lookup.found.variantId} flash />}
      </div>
      <Input aria-label="Search by name" placeholder="Or search by name" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-12" />
      {list.length > 0 && <ul className="divide-y divide-line rounded border-2 border-navy-100">{list.slice(0, 8).map((i) => <li key={i.id}><Button variant="ghost" className="min-h-14 w-full justify-start text-left normal-case tracking-normal" onClick={() => { lookup.choose(i); setQ(''); }} aria-label={`Show ${i.name}`}>{i.name}</Button></li>)}</ul>}
    </div>
  );
}
