import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatDate } from '@thunikart/shared';
import { Badge, Button, Checkbox, EmptyState, Input, ListSkeleton, Modal, Select, Table, TBody, Td, Th, THead, Tabs, Tr, useToast } from '@thunikart/ui';
import { AdjustPanel } from '../../../components/AdjustPanel';
import { QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { statusTone } from '../../../components/StockCard';
import { useCan } from '../../../features/auth/permissions';
import { STOCK_STATUSES } from '../../../features/catalog/types';
import { useFacets, useItemFilters, useItems } from '../../../features/catalog/use-items';
import { useVendors } from '../../../features/catalog/use-parties';
import { LEDGER_LABEL, LEDGER_TYPES } from '../../../features/inventory/types';
import { useCreateFromReorder } from '../../../features/inventory/use-purchase-orders';
import { EMPTY_LEDGER, useLedger, useReorder } from '../../../features/inventory/use-stock';
import { LookupDesktop } from './LookupDesktop';

function ByItemTab() {
  const { filters, set } = useItemFilters();
  const items = useItems(filters);
  const facets = useFacets().data;
  const stores = facets?.stores ?? [];
  const data = items.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3">
        <div className="w-64"><Input aria-label="Search stock" placeholder="Name, code or barcode" value={filters.q} onChange={(e) => set({ q: e.target.value })} /></div>
        <Select aria-label="Category" className="w-44" value={filters.category} onChange={(e) => set({ category: e.target.value })}><option value="">All categories</option>{facets?.categories.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select aria-label="Stock status" className="w-40" value={filters.stockStatus} onChange={(e) => set({ stockStatus: e.target.value })}><option value="">Any stock</option>{STOCK_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
      </div>
      {items.isPending ? <ListSkeleton rows={8} label="Loading stock" /> : items.isError ? <QueryError error={items.error} onRetry={() => items.refetch()} /> : data.length === 0 ? <EmptyState title="No stock found" /> : (
        <>
          <Table caption="Stock by item and size">
            <THead><Tr><Th>Code</Th><Th>Item</Th><Th>Size</Th>{stores.map((s) => <Th key={s.id} className="text-right">{s.name}</Th>)}<Th className="text-right">Total</Th><Th>Reorder at</Th><Th>Status</Th></Tr></THead>
            <TBody>{data.flatMap((i) => i.variants.map((v, n) => (
              <Tr key={v.id}><Td className="font-mono text-xs">{n === 0 ? i.code : ''}</Td><Td className="font-medium">{n === 0 ? i.name : ''}</Td><Td>{v.size}</Td>
                {stores.map((s) => <Td key={s.id} className="text-right">{v.stock[s.id] ?? 0}</Td>)}<Td className="text-right font-semibold">{Object.values(v.stock).reduce((a, b) => a + b, 0)}</Td><Td>{v.reorderLevel}</Td>
                <Td>{n === 0 && <Badge tone={statusTone(i.stockStatus)}>{i.stockStatus}</Badge>}</Td></Tr>
            )))}</TBody>
          </Table>
          {items.hasNextPage && <div className="mt-3"><Button onClick={() => items.fetchNextPage()} loading={items.isFetchingNextPage}>Load more</Button></div>}
        </>
      )}
    </div>
  );
}

function LedgerTab() {
  const [f, setF] = useState(EMPTY_LEDGER);
  const stores = useFacets().data?.stores ?? [];
  const q = useLedger(f);
  const data = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="w-60"><Input aria-label="Search ledger" placeholder="Item name or code" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <Select aria-label="Store" className="w-48" value={f.storeId} onChange={(e) => setF({ ...f, storeId: e.target.value })}><option value="">All stores</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Select aria-label="Type" className="w-44" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">All movements</option>{LEDGER_TYPES.map((t) => <option key={t} value={t}>{LEDGER_LABEL[t]}</option>)}</Select>
        <Input aria-label="From date" type="date" className="w-40" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <Input aria-label="To date" type="date" className="w-40" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
      </div>
      {q.isPending ? <ListSkeleton rows={8} label="Loading ledger" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No stock movements" body="Receiving, sales, adjustments and transfers appear here." /> : (
        <>
          <Table caption="Stock ledger">
            <THead><Tr><Th>When</Th><Th>Item</Th><Th>Size</Th><Th>Store</Th><Th>Movement</Th><Th className="text-right">Change</Th><Th className="text-right">Balance</Th><Th>Reference</Th></Tr></THead>
            <TBody>{data.map((e) => <Tr key={e.id}><Td className="whitespace-nowrap">{formatDate(e.at)}</Td><Td><span className="font-medium">{e.name}</span><span className="block font-mono text-xs text-muted">{e.code}</span></Td><Td>{e.size}</Td><Td>{e.storeName}</Td><Td>{LEDGER_LABEL[e.type] ?? e.type}</Td><Td className={`text-right font-semibold ${e.qty < 0 ? 'text-danger' : ''}`}>{e.qty > 0 ? `+${e.qty}` : e.qty}</Td><Td className="text-right">{e.balance}</Td><Td>{e.ref}{e.note && <span className="block text-xs text-muted">{e.note}</span>}</Td></Tr>)}</TBody>
          </Table>
          {q.hasNextPage && <div className="mt-3"><Button onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button></div>}
        </>
      )}
    </div>
  );
}

function AdjustTab() {
  const can = useCan();
  if (!can('stock.create')) return <EmptyState title="No permission" body="Adjusting stock needs the Stock create permission." />;
  return <AdjustPanel />;
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
  if (!q.data.length) return <EmptyState title="Nothing to reorder" body="Items at or below their reorder level appear here." />;
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div>
      <div className="mb-3 flex items-center gap-3"><span className="text-sm text-muted">{q.data.length} sizes are at or below their reorder level.</span>{can('purchase.create') && <Button variant="primary" className="ml-auto" disabled={picked.size === 0} onClick={() => setOpen(true)}>Create PO ({picked.size})</Button>}</div>
      <Table caption="Reorder alerts">
        <THead><Tr><Th className="w-10"><Checkbox aria-label="Select all" checked={picked.size === q.data.length} onChange={() => setPicked(picked.size === q.data.length ? new Set() : new Set(q.data.map((r) => r.variantId)))} /></Th><Th>Code</Th><Th>Item</Th><Th>Size</Th><Th className="text-right">On hand</Th><Th className="text-right">Reorder at</Th></Tr></THead>
        <TBody>{q.data.map((r) => <Tr key={r.variantId}><Td><Checkbox aria-label={`Select ${r.name} size ${r.size}`} checked={picked.has(r.variantId)} onChange={() => toggle(r.variantId)} /></Td><Td className="font-mono text-xs">{r.code}</Td><Td className="font-medium">{r.name}</Td><Td>{r.size}</Td><Td className={`text-right font-semibold ${r.onHand <= 0 ? 'text-danger' : ''}`}>{r.onHand}</Td><Td className="text-right">{r.reorderLevel}</Td></Tr>)}</TBody>
      </Table>
      <Modal open={open} onClose={() => setOpen(false)} title="Create purchase order" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!vendorId} loading={create.isPending} onClick={async () => { const po = await create.mutateAsync({ vendorId, variantIds: [...picked] }); toast(`Draft order ${po.number} created`, 'success'); nav(`/purchase/orders/${po.id}`); }}>Create draft order</Button></>}>
        <p className="mb-3 text-sm">A draft order is made for the {picked.size} chosen sizes. You can change quantities before approving it.</p>
        <label className="text-xs font-medium">Vendor<Select className="mt-1" value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">Choose a vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></label>
      </Modal>
    </div>
  );
}

export function StockDesktop() {
  const [sp, setSp] = useSearchParams();
  return (
    <div>
      <PageHeader title="Stock" description="Look up, review, adjust and reorder stock." />
      <Tabs value={sp.get('tab') ?? 'lookup'} onChange={(t) => setSp({ tab: t }, { replace: true })} items={[
        { key: 'lookup', label: 'Lookup', panel: <LookupDesktop /> }, { key: 'items', label: 'By item', panel: <ByItemTab /> }, { key: 'ledger', label: 'Ledger', panel: <LedgerTab /> },
        { key: 'adjust', label: 'Adjust', panel: <AdjustTab /> }, { key: 'reorder', label: 'Reorder', panel: <ReorderTab /> },
      ]} />
    </div>
  );
}
