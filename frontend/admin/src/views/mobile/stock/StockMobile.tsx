import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatDate } from '@thunikart/shared';
import { Badge, BottomSheet, Button, Checkbox, EmptyState, Input, ListSkeleton, Select, Tabs, useToast } from '@thunikart/ui';
import { AdjustPanel } from '../../../components/AdjustPanel';
import { QueryError } from '../../../components/ErrorBanner';
import { statusTone } from '../../../components/StockCard';
import { useCan } from '../../../features/auth/permissions';
import { useFacets, useItemFilters, useItems } from '../../../features/catalog/use-items';
import { useVendors } from '../../../features/catalog/use-parties';
import { LEDGER_LABEL, LEDGER_TYPES } from '../../../features/inventory/types';
import { useCreateFromReorder } from '../../../features/inventory/use-purchase-orders';
import { EMPTY_LEDGER, useLedger, useReorder } from '../../../features/inventory/use-stock';
import { LookupMobile } from './LookupMobile';

function ByItemTab() {
  const { filters, set } = useItemFilters();
  const items = useItems(filters);
  const stores = useFacets().data?.stores ?? [];
  const data = items.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-3">
      <Input aria-label="Search stock" placeholder="Name, code or barcode" value={filters.q} onChange={(e) => set({ q: e.target.value })} className="min-h-12" />
      {items.isPending ? <ListSkeleton label="Loading stock" /> : items.isError ? <QueryError error={items.error} onRetry={() => items.refetch()} /> : data.length === 0 ? <EmptyState title="No stock found" /> : data.map((i) => (
        <div key={i.id} className="rounded border-2 border-navy-100 p-3">
          <div className="flex items-start justify-between gap-2"><span><strong className="text-sm">{i.name}</strong><span className="block font-mono text-xs text-muted">{i.code}</span></span><Badge tone={statusTone(i.stockStatus)}>{i.stockStatus}</Badge></div>
          <ul className="mt-2 divide-y divide-line text-sm">{i.variants.map((v) => <li key={v.id} className="py-1"><span className="font-medium">Size {v.size}</span>: {Object.values(v.stock).reduce((a, b) => a + b, 0)} <span className="block text-xs text-muted">{stores.map((s) => `${s.name}: ${v.stock[s.id] ?? 0}`).join(' | ')}</span></li>)}</ul>
        </div>
      ))}
      {items.hasNextPage && <Button size="lg" className="min-h-12" onClick={() => items.fetchNextPage()} loading={items.isFetchingNextPage}>Load more</Button>}
    </div>
  );
}

function LedgerTab() {
  const [f, setF] = useState(EMPTY_LEDGER);
  const [sheet, setSheet] = useState(false);
  const stores = useFacets().data?.stores ?? [];
  const q = useLedger(f);
  const data = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2"><Input aria-label="Search ledger" placeholder="Item name or code" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className="min-h-12" /><Button className="min-h-12" onClick={() => setSheet(true)}>Filters</Button></div>
      {q.isPending ? <ListSkeleton label="Loading ledger" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No stock movements" /> : data.map((e) => (
        <div key={e.id} className="rounded border-2 border-navy-100 p-3 text-sm"><div className="flex justify-between"><strong>{e.name}</strong><span className={`font-semibold ${e.qty < 0 ? 'text-danger' : ''}`}>{e.qty > 0 ? `+${e.qty}` : e.qty}</span></div>
          <p className="text-xs text-muted">Size {e.size} · {e.storeName} · {LEDGER_LABEL[e.type] ?? e.type} · {e.ref} · {formatDate(e.at)} · balance {e.balance}</p></div>
      ))}
      {q.hasNextPage && <Button size="lg" className="min-h-12" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button>}
      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Ledger filters" footer={<><Button onClick={() => setF(EMPTY_LEDGER)}>Clear</Button><Button variant="primary" onClick={() => setSheet(false)}>Show</Button></>}>
        <div className="flex flex-col gap-3">
          <Select aria-label="Store" className="min-h-12" value={f.storeId} onChange={(e) => setF({ ...f, storeId: e.target.value })}><option value="">All stores</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Select aria-label="Type" className="min-h-12" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">All movements</option>{LEDGER_TYPES.map((t) => <option key={t} value={t}>{LEDGER_LABEL[t]}</option>)}</Select>
          <Input aria-label="From date" type="date" className="min-h-12" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <Input aria-label="To date" type="date" className="min-h-12" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </div>
      </BottomSheet>
    </div>
  );
}

function ReorderTab() {
  const can = useCan();
  const nav = useNavigate();
  const { toast } = useToast();
  const q = useReorder();
  const create = useCreateFromReorder();
  const vendors = useVendors('').data?.pages.flatMap((p) => p.items) ?? [];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState('');
  if (q.isPending) return <ListSkeleton label="Loading reorder alerts" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.length) return <EmptyState title="Nothing to reorder" />;
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="flex flex-col gap-3 pb-20">
      {q.data.map((r) => (
        <label key={r.variantId} className="flex min-h-14 items-center gap-3 rounded border-2 border-navy-100 p-3">
          <Checkbox aria-label={`Select ${r.name} size ${r.size}`} checked={picked.has(r.variantId)} onChange={() => toggle(r.variantId)} />
          <span className="min-w-0 flex-1 text-sm"><strong className="block truncate">{r.name}</strong><span className="text-xs text-muted">Size {r.size} · on hand {r.onHand} · reorder at {r.reorderLevel}</span></span>
        </label>
      ))}
      {can('purchase.create') && <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 border-t-2 border-navy-100 bg-white p-3"><Button variant="primary" size="lg" block className="min-h-12" disabled={picked.size === 0} onClick={() => setOpen(true)}>Create PO ({picked.size})</Button></div>}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Create purchase order" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!vendorId} loading={create.isPending} onClick={async () => { const po = await create.mutateAsync({ vendorId, variantIds: [...picked] }); toast(`Draft order ${po.number} created`, 'success'); nav(`/purchase/orders/${po.id}`); }}>Create draft</Button></>}>
        <Select aria-label="Vendor" className="min-h-12" value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">Choose a vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
      </BottomSheet>
    </div>
  );
}

export function StockMobile() {
  const [sp, setSp] = useSearchParams();
  const can = useCan();
  return (
    <Tabs value={sp.get('tab') ?? 'lookup'} onChange={(t) => setSp({ tab: t }, { replace: true })} items={[
      { key: 'lookup', label: 'Scan', panel: <LookupMobile /> }, { key: 'items', label: 'By item', panel: <ByItemTab /> }, { key: 'ledger', label: 'Ledger', panel: <LedgerTab /> },
      { key: 'adjust', label: 'Adjust', panel: can('stock.create') ? <AdjustPanel big /> : <EmptyState title="No permission" /> }, { key: 'reorder', label: 'Reorder', panel: <ReorderTab /> },
    ]} />
  );
}
