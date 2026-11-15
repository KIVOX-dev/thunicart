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
import { useFacets } from '../../../features/catalog/use-items';
import { useVendors } from '../../../features/catalog/use-parties';
import { LEDGER_LABEL, LEDGER_TYPES } from '../../../features/inventory/types';
import { useCreateFromReorder } from '../../../features/inventory/use-purchase-orders';
import { Pager } from '../../../components/Pager';
import { EMPTY_LEDGER, STOCK_PAGE_SIZE, useLedger, useReorder, useStockRows, type StockFilters } from '../../../features/inventory/use-stock';
import { LookupDesktop } from './LookupDesktop';

function ByItemTab() {
  const [f, setF] = useState<StockFilters>({ q: '', storeId: '', stockStatus: '' });
  const [page, setPage] = useState(1);
  const q = useStockRows(f, page);
  const change = (next: StockFilters) => { setF(next); setPage(1); };
  const stores = useFacets().data?.stores ?? [];
  const data = q.data?.items ?? [];
  const total = q.data?.totals.onHand ?? 0;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3">
        <div className="w-64"><Input aria-label="Search stock" placeholder="Name, code or barcode" value={f.q} onChange={(e) => change({ ...f, q: e.target.value })} /></div>
        <Select aria-label="Store" className="w-48" value={f.storeId} onChange={(e) => change({ ...f, storeId: e.target.value })}><option value="">All stores</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Select aria-label="Stock status" className="w-40" value={f.stockStatus} onChange={(e) => change({ ...f, stockStatus: e.target.value })}><option value="">Any stock</option>{STOCK_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
      </div>
      {q.isPending ? <ListSkeleton rows={8} label="Loading stock" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No stock found" /> : (
        <>
          <p className="mb-2 text-sm text-muted">{total.toLocaleString('en-IN')} pieces on hand{f.storeId ? ' in this store' : ' across all stores'}</p>
          <Table caption="Stock by item and size">
            <THead><Tr><Th>Code</Th><Th>Item</Th><Th>Size</Th>{!f.storeId && <Th>Store</Th>}<Th className="text-right">On hand</Th><Th className="text-right">Reserved</Th><Th className="text-right">Available</Th><Th>Reorder at</Th><Th>Status</Th></Tr></THead>
            <TBody>{data.map((r) => (
              <Tr key={`${r.variantId}-${r.storeId ?? 'all'}`}><Td className="font-mono text-xs">{r.itemCode}</Td><Td className="font-medium">{r.name}</Td><Td>{r.size ?? ''}</Td>{!f.storeId && <Td>{r.storeName ?? 'All stores'}</Td>}
                <Td className="text-right font-semibold">{r.onHand}</Td><Td className="text-right">{r.reserved}</Td><Td className="text-right">{r.available}</Td><Td>{r.reorderLevel}</Td>
                <Td><Badge tone={statusTone(r.stockStatus)}>{r.stockStatus}</Badge></Td></Tr>
            ))}</TBody>
          </Table>
          <Pager page={page} total={q.data?.total ?? 0} pageSize={STOCK_PAGE_SIZE} onPage={setPage} />
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
