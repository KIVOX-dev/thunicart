import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { formatPaise } from '@thunikart/shared';
import { Badge, BottomSheet, Button, EmptyState, Input, ListSkeleton, Select } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { ScanBox } from '../../../components/ScanBox';
import { statusTone } from '../../../components/StockCard';
import { useCan } from '../../../features/auth/permissions';
import { ISSUE_LABELS, STOCK_STATUSES } from '../../../features/catalog/types';
import { lookupBarcode, priceSpan, useFacets, useItemFilters, useItems } from '../../../features/catalog/use-items';
import { beep } from '../../../pwa/feedback';

export function ItemsMobile() {
  const can = useCan();
  const nav = useNavigate();
  const { filters, set, reset, activeCount } = useItemFilters();
  const items = useItems(filters);
  const facets = useFacets().data;
  const [sheet, setSheet] = useState(false);
  const [miss, setMiss] = useState<string | null>(null);
  const rows = items.data?.pages.flatMap((p) => p.items) ?? [];
  const first = items.data?.pages[0];
  const scan = async (code: string) => {
    try { const r = await lookupBarcode(code); beep(true); nav(`/items/${r.item.id}`); } catch { beep(false); setMiss(code); }
  };
  return (
    <div className="flex flex-col gap-3 pb-20">
      <ScanBox onCode={scan} placeholder="Scan a barcode" />
      {miss && <p role="alert" className="rounded border border-danger bg-danger-bg p-2 text-sm">No item with code {miss}.</p>}
      <div className="flex gap-2">
        <Input aria-label="Search items" placeholder="Search name or code" value={filters.q} onChange={(e) => set({ q: e.target.value })} className="min-h-12" />
        <Button onClick={() => setSheet(true)} className="min-h-12 min-w-12" aria-label={`Filters${activeCount ? `, ${activeCount} active` : ''}`}><SlidersHorizontal aria-hidden size={18} />{activeCount > 0 && <span>{activeCount}</span>}</Button>
      </div>
      {first && <p className="text-xs text-muted">{first.total.toLocaleString('en-IN')} items · {first.pieces.toLocaleString('en-IN')} pieces</p>}
      {items.isPending ? <ListSkeleton label="Loading items" /> : items.isError ? <QueryError error={items.error} onRetry={() => items.refetch()} /> : rows.length === 0 ? (
        <EmptyState title="No items found" body={activeCount || filters.q ? 'Try fewer filters.' : 'Stock is imported from a computer. Add an item to start.'} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((i) => {
            const pr = priceSpan(i);
            return (
              <li key={i.id}>
                <Link to={`/items/${i.id}`} className="block rounded border-2 border-navy-100 p-3">
                  <div className="flex items-start justify-between gap-2"><strong className="text-sm">{i.name}</strong><Badge tone={statusTone(i.stockStatus)}>{i.stockStatus}</Badge></div>
                  <p className="mt-1 font-mono text-xs text-muted">{i.code}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{pr.low ? formatPaise(pr.low) : 'No price'}</span><span className="text-muted">{i.totalStock} in stock</span>
                    {!i.hsn && <Badge tone="warning">No HSN</Badge>}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {items.hasNextPage && <Button size="lg" className="min-h-12" onClick={() => items.fetchNextPage()} loading={items.isFetchingNextPage}>Load more</Button>}
      {can('items.create') && <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 border-t-2 border-navy-100 bg-white p-3"><Link to="/items/new"><Button variant="primary" size="lg" block className="min-h-12">Add item</Button></Link></div>}
      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Filters" footer={<><Button onClick={reset}>Clear</Button><Button variant="primary" onClick={() => setSheet(false)}>Show items</Button></>}>
        <div className="flex flex-col gap-4">
          <label className="text-xs font-medium">Category<Select className="mt-1 min-h-12" value={filters.category} onChange={(e) => set({ category: e.target.value })}><option value="">All categories</option>{facets?.categories.map((c) => <option key={c}>{c}</option>)}</Select></label>
          <label className="text-xs font-medium">Brand<Select className="mt-1 min-h-12" value={filters.brand} onChange={(e) => set({ brand: e.target.value })}><option value="">All brands</option>{facets?.brands.map((c) => <option key={c}>{c}</option>)}</Select></label>
          <label className="text-xs font-medium">Stock status<Select className="mt-1 min-h-12" value={filters.stockStatus} onChange={(e) => set({ stockStatus: e.target.value })}><option value="">Any</option>{STOCK_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></label>
          <label className="text-xs font-medium">Active<Select className="mt-1 min-h-12" value={filters.active} onChange={(e) => set({ active: e.target.value })}><option value="">Any</option><option value="true">Active</option><option value="false">Switched off</option></Select></label>
          <label className="text-xs font-medium">Data problem<Select className="mt-1 min-h-12" value={filters.issue} onChange={(e) => set({ issue: e.target.value })}><option value="">None selected</option>{Object.entries(ISSUE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        </div>
      </BottomSheet>
    </div>
  );
}
