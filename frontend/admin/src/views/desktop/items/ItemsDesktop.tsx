import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatPaise } from '@thunikart/shared';
import { Badge, Button, Checkbox, EmptyState, Field, Input, ListSkeleton, Modal, Select, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { Pager } from '../../../components/Pager';
import { ExportButton } from '../../../components/ExportButton';
import { PageHeader } from '../../../components/PageHeader';
import { statusTone } from '../../../components/StockCard';
import { useCan, useGstMode } from '../../../features/auth/permissions';
import { ISSUE_LABELS, STOCK_STATUSES } from '../../../features/catalog/types';
import { priceSpan, useBulkItems, useFacets, useItemFilters, useItemsPage, ITEMS_PAGE_SIZE } from '../../../features/catalog/use-items';

const COLUMNS = [
  { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }, { key: 'brand', label: 'Brand' },
  { key: 'sizes', label: 'Sizes' }, { key: 'hsn', label: 'HSN' }, { key: 'price', label: 'Price' }, { key: 'stock', label: 'Stock' }, { key: 'status', label: 'Stock status' }, { key: 'active', label: 'Active' },
] as const;
type ColKey = (typeof COLUMNS)[number]['key'];
const DEFAULT_COLS: ColKey[] = ['code', 'name', 'category', 'brand', 'price', 'stock', 'status', 'active'];

function useColumnChoice() {
  const [cols, setCols] = useState<ColKey[]>(() => {
    try { const v = JSON.parse(localStorage.getItem('tk.items.cols') ?? 'null') as ColKey[] | null; return v?.length ? v : DEFAULT_COLS; } catch { return DEFAULT_COLS; }
  });
  useEffect(() => { try { localStorage.setItem('tk.items.cols', JSON.stringify(cols)); } catch { /* storage blocked */ } }, [cols]);
  return [cols, (k: ColKey) => setCols((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))] as const;
}

export function ItemsDesktop() {
  const can = useCan();
  const gst = useGstMode();
  const nav = useNavigate();
  const { toast } = useToast();
  const { filters, set, reset, activeCount } = useItemFilters();
  const [page, setPage] = useState(1);
  const filterKey = JSON.stringify(filters);
  useEffect(() => { setPage(1); }, [filterKey]);
  const items = useItemsPage(filters, page);
  const facets = useFacets().data;
  const bulk = useBulkItems();
  const [cols, toggleCol] = useColumnChoice();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState<string | null>(null);
  const [showCols, setShowCols] = useState(false);
  const rows = items.data?.items ?? [];
  const first = items.data;
  const has = (k: ColKey) => cols.includes(k);
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const doBulk = async (action: 'activate' | 'deactivate' | 'set-category', category?: string) => {
    const r = await bulk.mutateAsync({ ids: [...picked], action, category });
    toast(`${r.updated} items updated`, 'success'); setPicked(new Set());
  };
  return (
    <div>
      <PageHeader title="Items" description={first ? `${first.total.toLocaleString('en-IN')} items, ${first.pieces.toLocaleString('en-IN')} pieces in stock` : 'Products, sizes and prices'}
        actions={<>
          <ExportButton dataset="items" />
          {can('items.create') && <Link to="/import"><Button>Import stock</Button></Link>}
          <Link to="/items/labels"><Button>Print labels</Button></Link>
          {can('items.create') && <Link to="/items/new"><Button variant="primary">Add item</Button></Link>}
        </>} />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="w-64"><Input aria-label="Search items" placeholder="Search name, code or barcode" value={filters.q} onChange={(e) => set({ q: e.target.value })} /></div>
        <Select aria-label="Category" className="w-44" value={filters.category} onChange={(e) => set({ category: e.target.value })}><option value="">All categories</option>{facets?.categories.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select aria-label="Brand" className="w-40" value={filters.brand} onChange={(e) => set({ brand: e.target.value })}><option value="">All brands</option>{facets?.brands.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select aria-label="Stock status" className="w-40" value={filters.stockStatus} onChange={(e) => set({ stockStatus: e.target.value })}><option value="">Any stock</option>{STOCK_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
        <Select aria-label="Active" className="w-32" value={filters.active} onChange={(e) => set({ active: e.target.value })}><option value="">Active or not</option><option value="true">Active</option><option value="false">Switched off</option></Select>
        <Select aria-label="Problem" className="w-44" value={filters.issue} onChange={(e) => set({ issue: e.target.value })}><option value="">Any data problem</option>{Object.entries(ISSUE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        {activeCount > 0 && <Button variant="ghost" onClick={reset}>Clear filters</Button>}
        <div className="relative ml-auto">
          <Button onClick={() => setShowCols((s) => !s)} aria-expanded={showCols}>Columns</Button>
          {showCols && <div role="group" aria-label="Choose columns" className="absolute right-0 z-30 mt-1 w-48 rounded border-2 border-navy-100 bg-white p-3 shadow-overlay">{COLUMNS.filter((c) => gst === 'on' || c.key !== 'hsn').map((c) => <div key={c.key} className="py-1"><Checkbox label={c.label} checked={has(c.key)} onChange={() => toggleCol(c.key)} /></div>)}</div>}
        </div>
      </div>
      {picked.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="mb-3 flex flex-wrap items-center gap-2 rounded border border-navy bg-mist px-3 py-2 text-sm">
          <strong>{picked.size} selected</strong>
          {can('items.edit') && <><Button size="sm" onClick={() => doBulk('activate')}>Activate</Button><Button size="sm" onClick={() => doBulk('deactivate')}>Switch off</Button><Button size="sm" onClick={() => setCat('')}>Set category</Button></>}
          <Button size="sm" onClick={() => nav('/items/labels', { state: { itemIds: [...picked], items: rows.filter((r) => picked.has(r.id)) } })}>Print labels</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
        </div>
      )}
      {items.isPending ? <ListSkeleton rows={8} label="Loading items" /> : items.isError ? <QueryError error={items.error} onRetry={() => items.refetch()} /> : rows.length === 0 ? (
        <EmptyState title="No items found" body={activeCount || filters.q ? 'Try fewer filters.' : 'Import the stock file or add the first item.'} action={can('items.create') ? <Link to="/import"><Button variant="primary">Import stock</Button></Link> : undefined} />
      ) : (
        <>
          <Table caption="Items">
            <THead><Tr>
              <Th className="w-10"><Checkbox aria-label="Select all shown" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} /></Th>
              {COLUMNS.filter((c) => has(c.key) && (gst === 'on' || c.key !== 'hsn')).map((c) => <Th key={c.key} className={c.key === 'price' || c.key === 'stock' ? 'text-right' : ''}>{c.label}</Th>)}
            </Tr></THead>
            <TBody>
              {rows.map((i) => {
                const pr = priceSpan(i);
                return (
                  <Tr key={i.id}>
                    <Td><Checkbox aria-label={`Select ${i.name}`} checked={picked.has(i.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} /></Td>
                    {has('code') && <Td className="font-mono text-xs">{i.code}</Td>}
                    {has('name') && <Td><Link to={`/items/${i.id}`} className="font-medium hover:underline">{i.name}</Link>{gst === 'on' && !i.hsn && <Badge tone="warning" className="ml-2">No HSN</Badge>}</Td>}
                    {has('category') && <Td>{i.category}</Td>}
                    {has('brand') && <Td>{i.brand}</Td>}
                    {has('sizes') && <Td>{i.variants.map((v) => v.size).join(', ')}</Td>}
                    {gst === 'on' && has('hsn') && <Td>{i.hsn || '–'}</Td>}
                    {has('price') && <Td className="text-right">{pr.low ? (pr.low === pr.high ? formatPaise(pr.low) : `${formatPaise(pr.low)} to ${formatPaise(pr.high)}`) : <Badge tone="warning">No price</Badge>}</Td>}
                    {has('stock') && <Td className="text-right">{i.totalStock}</Td>}
                    {has('status') && <Td><Badge tone={statusTone(i.stockStatus)}>{i.stockStatus}</Badge></Td>}
                    {has('active') && <Td>{i.active ? 'Yes' : <Badge>Off</Badge>}</Td>}
                  </Tr>
                );
              })}
            </TBody>
          </Table>
          <p className="mt-3 text-sm text-muted">Showing {rows.length} of {first?.total}</p>
          <Pager page={page} total={first?.total ?? 0} pageSize={ITEMS_PAGE_SIZE} onPage={setPage} />
        </>
      )}
      <Modal open={cat !== null} onClose={() => setCat(null)} title="Set category" footer={<><Button onClick={() => setCat(null)}>Cancel</Button><Button variant="primary" disabled={!cat?.trim()} onClick={async () => { await doBulk('set-category', cat!); setCat(null); }}>Apply to {picked.size} items</Button></>}>
        <Field label="Category" required>{(p) => <Input {...p} value={cat ?? ''} onChange={(e) => setCat(e.target.value)} list="cats" />}</Field>
        <datalist id="cats">{facets?.categories.map((c) => <option key={c} value={c} />)}</datalist>
      </Modal>
    </div>
  );
}
