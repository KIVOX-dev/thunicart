import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPaise } from '@thunikart/shared';
import { Badge, Button, EmptyState, Input, ListSkeleton, Modal, Select, Table, TBody, Td, Th, THead, Tabs, Tr, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { useCan } from '../../../features/auth/permissions';
import { ISSUE_LABELS, type ReviewRow } from '../../../features/catalog/types';
import { useFacets } from '../../../features/catalog/use-items';
import { useBulkFix, useDataQuality, useFixRow, useReviewQueue } from '../../../features/catalog/use-review';
import { ApiError } from '../../../features/api/http';

const label = (k: string) => ISSUE_LABELS[k as keyof typeof ISSUE_LABELS] ?? k;

function Row({ r }: { r: ReviewRow }) {
  const fix = useFixRow();
  const [hsn, setHsn] = useState(r.hsn);
  const [size, setSize] = useState(r.size);
  const [mrp, setMrp] = useState(r.mrp ? String(r.mrp / 100) : '');
  const [err, setErr] = useState<string | null>(null);
  const save = async (patch: { hsn?: string; size?: string; mrp?: string }) => {
    setErr(null);
    try { await fix.mutateAsync({ itemId: r.itemId, ...patch }); } catch (e) { setErr(e instanceof ApiError ? (e.fields[0]?.message ?? e.friendly) : 'Could not save'); }
  };
  return (
    <Tr>
      <Td className="font-mono text-xs">{r.code}</Td>
      <Td className="max-w-xs"><span className="block truncate">{r.name}</span><span className="text-xs text-muted">{r.category}</span></Td>
      <Td><Badge tone="warning">{label(r.issue)}</Badge></Td>
      <Td>
        {r.issue === 'MISSING_HSN' && (
          <div className="flex items-center gap-2">
            <Input aria-label={`HSN for ${r.code}`} className="w-28" inputMode="numeric" value={hsn} onChange={(e) => setHsn(e.target.value)} />
            {r.suggestedHsn && <Button size="sm" onClick={() => save({ hsn: r.suggestedHsn! })} aria-label={`Use HSN ${r.suggestedHsn} for ${r.code}`}>Use {r.suggestedHsn}</Button>}
            <Button size="sm" variant="primary" disabled={!hsn} onClick={() => save({ hsn })}>Save</Button>
          </div>
        )}
        {r.issue === 'SIZE_PLACEHOLDER' && <div className="flex items-center gap-2"><Input aria-label={`Size for ${r.code}`} className="w-28" value={size} onChange={(e) => setSize(e.target.value)} /><Button size="sm" onClick={() => save({ size: 'Free Size' })}>Free Size</Button><Button size="sm" variant="primary" onClick={() => save({ size })}>Save</Button></div>}
        {r.issue === 'MISSING_MRP' && <div className="flex items-center gap-2"><Input aria-label={`MRP for ${r.code}`} className="w-28" inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value)} /><Button size="sm" variant="primary" disabled={!Number(mrp)} onClick={() => save({ mrp })}>Save</Button></div>}
        {r.issue === 'MISSING_RATE' && <Link to={`/items/${r.itemId}`} className="text-sm underline">Open item to add a price</Link>}
        {r.issue === 'NEGATIVE_STOCK' && <Link to={`/items/${r.itemId}`} className="text-sm underline">Open item. Correct it with a stock adjustment</Link>}
        {err && <span role="alert" className="mt-1 block text-xs text-danger">{err}</span>}
      </Td>
      <Td className="text-right text-xs text-muted">{r.mrp ? formatPaise(r.mrp) : '–'}</Td>
    </Tr>
  );
}

function QueueTab() {
  const [issue, setIssue] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [sizeModal, setSizeModal] = useState(false);
  const [sizeValue, setSizeValue] = useState('Free Size');
  const { toast } = useToast();
  const can = useCan();
  const list = useReviewQueue({ issue, category, q });
  const bulk = useBulkFix();
  const cats = useFacets().data?.categories ?? [];
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const run = async (action: 'accept-hsn-suggestions' | 'set-size', value?: string) => {
    const r = await bulk.mutateAsync({ action, category: category || undefined, value });
    toast(r.updated ? `${r.updated} items fixed` : 'Nothing to fix here', r.updated ? 'success' : 'info');
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select aria-label="Problem" className="w-52" value={issue} onChange={(e) => setIssue(e.target.value)}><option value="">All problems</option>{Object.entries(ISSUE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Select aria-label="Category" className="w-44" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
        <div className="w-60"><Input aria-label="Search rows" placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {can('items.edit') && (
          <span className="ml-auto flex gap-2">
            <Button onClick={() => run('accept-hsn-suggestions')} loading={bulk.isPending}>Accept all HSN suggestions{category ? ` for ${category}` : ''}</Button>
            <Button onClick={() => setSizeModal(true)}>Set size for placeholders{category ? ` in ${category}` : ''}</Button>
          </span>
        )}
      </div>
      {list.isPending ? <ListSkeleton rows={8} label="Loading review queue" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? (
        <EmptyState title="Nothing to review" body="Every item has an HSN, a size and a price." />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted" role="status">{list.data.pages[0]!.total.toLocaleString('en-IN')} rows need a fix. Suggestions use the HSN most used in the same category.</p>
          <Table caption="Review queue">
            <THead><Tr><Th>Code</Th><Th>Item</Th><Th>Problem</Th><Th>Fix</Th><Th className="text-right">MRP</Th></Tr></THead>
            <TBody>{rows.map((r) => <Row key={r.id} r={r} />)}</TBody>
          </Table>
          {list.hasNextPage && <div className="mt-3"><Button onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>Load more</Button></div>}
        </>
      )}
      <Modal open={sizeModal} onClose={() => setSizeModal(false)} title="Set size for placeholders" footer={<><Button onClick={() => setSizeModal(false)}>Cancel</Button><Button variant="primary" disabled={!sizeValue.trim()} onClick={async () => { await run('set-size', sizeValue); setSizeModal(false); }}>Apply</Button></>}>
        <p className="mb-3 text-sm">Replaces the size "Primary" {category ? `for ${category}` : 'for all categories'}.</p>
        <Input aria-label="New size" value={sizeValue} onChange={(e) => setSizeValue(e.target.value)} />
      </Modal>
    </div>
  );
}

function QualityTab() {
  const q = useDataQuality();
  const bulk = useBulkFix();
  const { toast } = useToast();
  if (q.isPending) return <ListSkeleton rows={4} label="Loading data quality" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (d.total === 0) return <EmptyState title="No items yet" body="Import stock to see the data quality report." />;
  const clean = d.total - d.byCategory.reduce((a, c) => a + c.issues, 0);
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-5 gap-3">
        <div className="rounded border-2 border-navy-100 p-3"><dt className="text-xs text-muted">Items</dt><dd className="mt-1 text-lg font-semibold">{d.total.toLocaleString('en-IN')}</dd></div>
        <div className="rounded border-2 border-navy-100 p-3"><dt className="text-xs text-muted">Clean items</dt><dd className="mt-1 text-lg font-semibold">{clean.toLocaleString('en-IN')}</dd></div>
        {Object.entries(d.byIssue).map(([k, v]) => <div key={k} className="rounded border border-warning bg-warning-bg p-3"><dt className="text-xs">{label(k)}</dt><dd className="mt-1 text-lg font-semibold">{v.toLocaleString('en-IN')}</dd></div>)}
      </dl>
      <Table caption="Data quality by category">
        <THead><Tr><Th>Category</Th><Th className="text-right">Items</Th><Th className="text-right">With problems</Th><Th><span className="sr-only">Actions</span></Th></Tr></THead>
        <TBody>{d.byCategory.map((c) => (
          <Tr key={c.category}><Td>{c.category}</Td><Td className="text-right">{c.items}</Td><Td className="text-right">{c.issues ? <Badge tone="warning">{c.issues}</Badge> : 0}</Td>
            <Td className="text-right">{c.issues > 0 && <Button size="sm" onClick={async () => { const r = await bulk.mutateAsync({ action: 'accept-hsn-suggestions', category: c.category }); toast(`${r.updated} items fixed in ${c.category}`, 'success'); }} aria-label={`Accept HSN suggestions for ${c.category}`}>Accept HSN suggestions</Button>}</Td></Tr>
        ))}</TBody>
      </Table>
      {bulk.isError && <ErrorBanner message="Could not apply the fix." />}
    </div>
  );
}

export function ReviewDesktop() {
  const [tab, setTab] = useState('queue');
  return (
    <div>
      <PageHeader title="Review queue" description="Fix items that came in with missing or odd data." actions={<Link to="/import"><Button>Import stock</Button></Link>} />
      <Tabs value={tab} onChange={setTab} items={[{ key: 'queue', label: 'Review queue', panel: <QueueTab /> }, { key: 'quality', label: 'Data quality report', panel: <QualityTab /> }]} />
    </div>
  );
}
