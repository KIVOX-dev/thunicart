import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatPaise } from '@thunikart/shared';
import { Badge, Button, EmptyState, Input, ListSkeleton, Modal, Select, Table, TBody, Td, Th, THead, Tabs, Tr, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { Pager } from '../../../components/Pager';
import { PageHeader } from '../../../components/PageHeader';
import { useCan } from '../../../features/auth/permissions';
import { REVIEW_LABELS, type ReviewRow } from '../../../features/catalog/types';
import { useFacets } from '../../../features/catalog/use-items';
import { useBulkFix, useDataQuality, useFixRow, useReviewQueuePage, REVIEW_PAGE_SIZE, type FixAction } from '../../../features/catalog/use-review';
import { ApiError } from '../../../features/api/http';

const label = (k: string) => REVIEW_LABELS[k] ?? k;

const HSN = ['MISSING_HSN', 'INVALID_HSN', 'HSN_NO_RATE'];
const TEXT_FIELD: Record<string, { key: 'category' | 'brand' | 'model'; label: string }> = { MISSING_CATEGORY: { key: 'category', label: 'Category' }, MISSING_BRAND: { key: 'brand', label: 'Brand' }, MISSING_MODEL: { key: 'model', label: 'Model' } };
/** Sizes worth a single tap. Free Size first, because most of the rows here are items with no size at all. */
const QUICK_SIZES = ['Free Size', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];
const rupeesToInt = (v: string) => Math.round(Number(v) * 100);

function Row({ r }: { r: ReviewRow }) {
  const fix = useFixRow();
  const facets = useFacets().data;
  const [hsn, setHsn] = useState(r.hsn);
  const [size, setSize] = useState(r.size);
  const [otherSize, setOtherSize] = useState(false);
  const [text, setText] = useState('');
  const [sizesText, setSizesText] = useState(((r.sizes ?? []).length ? r.sizes : [r.size]).filter(Boolean).join(', '));
  const [mrp, setMrp] = useState(r.mrp ? String(r.mrp / 100) : '');
  const [mrpNew, setMrpNew] = useState('');
  const [rate, setRate] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const save = async (a: FixAction) => {
    setErr(null);
    try { await fix.mutateAsync({ id: r.id, ...a }); } catch (e) { setErr(e instanceof ApiError ? (e.fields[0]?.message ?? e.friendly) : 'Could not save'); }
  };
  const tf = TEXT_FIELD[r.issue];
  return (
    <Tr>
      <Td className="font-mono text-xs">{r.code}</Td>
      <Td className="max-w-xs"><span className="block truncate">{r.name}</span><span className="text-xs text-muted">{r.category}</span></Td>
      <Td><Badge tone="warning">{label(r.issue)}</Badge></Td>
      <Td>
        <div className="flex flex-wrap items-center gap-2">
          {HSN.includes(r.issue) && (<>
            <Input aria-label={`HSN for ${r.code}`} className="w-28" inputMode="numeric" value={hsn} onChange={(e) => setHsn(e.target.value)} />
            {r.suggestedHsn && <Button size="sm" onClick={() => save({ action: 'apply_suggestion' })} aria-label={`Use HSN ${r.suggestedHsn} for ${r.code}`}>Use {r.suggestedHsn}</Button>}
            <Button size="sm" variant="primary" disabled={!/^(\d{4}|\d{6}|\d{8})$/.test(hsn)} onClick={() => save({ action: 'set', set: { hsn } })}>Save</Button>
          </>)}
          {(r.issue === 'MISSING_SIZE' || r.issue === 'ODD_SIZE') && (<>
            {/* One tap sets the size and saves. Typing is only for an unusual size, behind Other. */}
            <div role="group" aria-label={`Choose the size for ${r.code}`} className="flex flex-wrap items-center gap-1">
              {QUICK_SIZES.map((z) => <Button key={z} size="sm" disabled={fix.isPending} onClick={() => save({ action: 'set', set: { size: z } })} aria-label={`Set size ${z} for ${r.code}`}>{z}</Button>)}
              <Button size="sm" variant={otherSize ? 'primary' : undefined} aria-expanded={otherSize} onClick={() => setOtherSize((o) => !o)}>Other</Button>
            </div>
            {otherSize && (<>
              <Input aria-label={`Other size for ${r.code}`} className="w-28" autoFocus value={size} onChange={(e) => setSize(e.target.value)} />
              <Button size="sm" variant="primary" disabled={!size.trim()} onClick={() => save({ action: 'set', set: { size: size.trim() } })}>Save</Button>
            </>)}
          </>)}
          {r.issue === 'MULTI_SIZE' && (<>
            <Input aria-label={`Sizes for ${r.code}, separated by commas`} className="w-44" placeholder="S, M, L, XL" value={sizesText} onChange={(e) => setSizesText(e.target.value)} />
            <Button size="sm" variant="primary" disabled={sizesText.split(/[,/\s]+/).filter(Boolean).length < 2} onClick={() => save({ action: 'split_sizes', sizes: sizesText.split(/[,/\s]+/).filter(Boolean) })}>Split into sizes</Button>
            <Button size="sm" onClick={() => save({ action: 'set', set: { size: 'Free Size' } })}>Free Size</Button>
          </>)}
          {tf && (<>
            {tf.key === 'model'
              ? <Input aria-label={`${tf.label} for ${r.code}`} className="w-40" placeholder={tf.label} value={text} onChange={(e) => setText(e.target.value)} />
              : <Select aria-label={`${tf.label} for ${r.code}`} className="w-44" value={text} onChange={(e) => setText(e.target.value)}><option value="">Choose {tf.label.toLowerCase()}</option>{(tf.key === 'category' ? facets?.categories : facets?.brands)?.map((o) => <option key={o}>{o}</option>)}</Select>}
            <Button size="sm" variant="primary" disabled={!text.trim()} onClick={() => save({ action: 'set', set: { [tf.key]: text.trim() } })}>Save</Button>
          </>)}
          {r.issue === 'NO_PRICE' && (<>
            <Input aria-label={`MRP for ${r.code}`} className="w-24" placeholder="MRP" inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value)} />
            <Input aria-label={`Selling price for ${r.code}`} className="w-28" placeholder="Selling price" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            <Button size="sm" variant="primary" disabled={!Number(mrp) || !Number(rate)} onClick={() => save({ action: 'set', set: { mrp: rupeesToInt(mrp), sellingPrice: rupeesToInt(rate) } })}>Save</Button>
          </>)}
          {r.issue === 'MRP_RAISED' && (<>
            <Input aria-label={`MRP for ${r.code}`} className="w-28" inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value)} />
            <Button size="sm" variant="primary" disabled={!Number(mrp)} onClick={() => save({ action: 'set', set: { mrp: rupeesToInt(mrp) } })}>Save</Button>
          </>)}
          {(r.issue === 'NO_COST' || r.issue === 'NEGATIVE_QTY' || r.issue === 'ODD_CODE') && <Link to={`/items/${r.itemId}`} className="text-sm underline">{r.issue === 'NEGATIVE_QTY' ? 'Open item. Correct it with a stock adjustment' : 'Open item to fix'}</Link>}
          <Button size="sm" variant="ghost" onClick={() => save({ action: 'dismiss' })} aria-label={`Dismiss ${r.code}`}>Looks fine</Button>
        </div>
        {err && <span role="alert" className="mt-1 block text-xs text-danger">{err}</span>}
      </Td>
      <Td className="text-right text-xs">
        {r.mrp ? <span className="text-sm font-semibold">{formatPaise(r.mrp)}</span> : (
          // No MRP in the database for this item: type it here and it is saved on the item.
          <span className="inline-flex items-center justify-end gap-1">
            <Input aria-label={`Type the MRP for ${r.code}`} className="w-24" placeholder="MRP ₹" inputMode="decimal" value={mrpNew} onChange={(e) => setMrpNew(e.target.value)} />
            <Button size="sm" variant="primary" disabled={!Number(mrpNew) || fix.isPending} onClick={() => save({ action: 'set', set: { mrp: rupeesToInt(mrpNew) } })}>Save</Button>
          </span>
        )}
      </Td>
    </Tr>
  );
}

function QueueTab() {
  const [sp, setSp] = useSearchParams();
  const issue = sp.get('issue') ?? '';
  const setIssue = (v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set('issue', v); else n.delete('issue'); return n; }, { replace: true });
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [sizeModal, setSizeModal] = useState(false);
  const [sizeValue, setSizeValue] = useState('Free Size');
  const { toast } = useToast();
  const can = useCan();
  const [page, setPage] = useState(1);
  const list = useReviewQueuePage({ issue, category, q }, page);
  const bulk = useBulkFix();
  const cats = useFacets().data?.categories ?? [];
  const rows = list.data?.items ?? [];
  const run = async (action: 'accept-hsn-suggestions' | 'set-size', value?: string) => {
    const r = await bulk.mutateAsync({ action, category: category || undefined, value });
    toast(r.updated ? `${r.updated} items fixed` : 'Nothing to fix here', r.updated ? 'success' : 'info');
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select aria-label="Problem" className="w-52" value={issue} onChange={(e) => { setIssue(e.target.value); setPage(1); }}><option value="">All problems</option>{Object.entries(REVIEW_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Select aria-label="Category" className="w-44" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
        <div className="w-60"><Input aria-label="Search rows" placeholder="Search name or code" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
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
          <p className="mb-2 text-xs text-muted" role="status">{list.data.total.toLocaleString('en-IN')} rows need a fix. Suggestions use the HSN most used in the same category.</p>
          <Table caption="Review queue">
            <THead><Tr><Th>Code</Th><Th>Item</Th><Th>Problem</Th><Th>Fix</Th><Th className="text-right">MRP</Th></Tr></THead>
            <TBody>{rows.map((r) => <Row key={r.id} r={r} />)}</TBody>
          </Table>
          <Pager page={page} total={list.data.total} pageSize={REVIEW_PAGE_SIZE} onPage={setPage} />
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
  const clean = Math.max(0, d.total - d.flagged);
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-5 gap-3">
        <div className="rounded border-2 border-navy-100 p-3"><dt className="text-xs text-muted">Items and sizes</dt><dd className="mt-1 text-lg font-semibold">{d.total.toLocaleString('en-IN')}</dd></div>
        <div className="rounded border-2 border-navy-100 p-3"><dt className="text-xs text-muted">Without problems</dt><dd className="mt-1 text-lg font-semibold">{clean.toLocaleString('en-IN')}</dd></div>
        {Object.entries(d.byIssue).map(([k, v]) => (
          <Link key={k} to={`/import/review?tab=queue&issue=${k}`} aria-label={`Show the ${v} rows with: ${label(k)}`} className="rounded border border-warning bg-warning-bg p-3 transition hover:shadow-soft focus-visible:outline focus-visible:outline-2">
            <dt className="text-xs">{label(k)}</dt><dd className="mt-1 text-lg font-semibold">{v.toLocaleString('en-IN')}</dd><span className="mt-1 block text-xs text-muted">Show these rows</span>
          </Link>
        ))}
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
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'queue';
  const setTab = (t: string) => setSp({ tab: t }, { replace: true });
  return (
    <div>
      <PageHeader title="Review queue" description="Fix items that came in with missing or odd data." actions={<Link to="/import"><Button>Import stock</Button></Link>} />
      <Tabs value={tab} onChange={setTab} items={[{ key: 'queue', label: 'Review queue', panel: <QueueTab /> }, { key: 'quality', label: 'Data quality report', panel: <QualityTab /> }]} />
    </div>
  );
}
