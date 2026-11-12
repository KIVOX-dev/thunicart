import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDate, formatPaise } from '@thunikart/shared';
import { Badge, Button, EmptyState, Input, ListSkeleton, Tabs } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { HeldPanel } from '../../../components/pos/HeldPanel';
import { InvoiceViewer } from '../../../components/pos/InvoiceViewer';
import { ReturnPanel } from '../../../components/pos/ReturnPanel';
import { ShiftPanel } from '../../../components/pos/ShiftPanel';
import type { Invoice } from '../../../features/pos/types';
import { fetchBill, useBills, useCreditNotes } from '../../../features/pos/use-pos-data';

function BillsTab() {
  const [q, setQ] = useState('');
  const [view, setView] = useState<Invoice | null>(null);
  const list = useBills(q);
  const data = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-3">
      <Input aria-label="Search bills" placeholder="Bill number, customer or mobile" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-12" />
      {list.isPending ? <ListSkeleton label="Loading bills" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : data.length === 0 ? <EmptyState title="No bills found" /> : data.map((b) => (
        <div key={b.id} className="rounded border border-line p-3 text-sm"><div className="flex justify-between"><strong>{b.number}</strong><strong>{formatPaise(b.total)}</strong></div>
          <p className="text-xs text-muted">{b.customerName} · {formatDate(b.date)} {b.time} · {b.tenders}</p>
          <Button className="mt-2 min-h-11" block onClick={async () => setView(await fetchBill(b.id))} aria-label={`Reprint ${b.number}`}>Reprint or share</Button></div>
      ))}
      {list.hasNextPage && <Button size="lg" className="min-h-12" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>Load more</Button>}
      <InvoiceViewer sheet invoice={view} onClose={() => setView(null)} title="Bill" />
    </div>
  );
}

function CreditNotesTab() {
  const q = useCreditNotes();
  const data = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isPending) return <ListSkeleton label="Loading credit notes" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (!data.length) return <EmptyState title="No credit notes" />;
  return <ul className="flex flex-col gap-2">{data.map((c) => <li key={c.id} className="rounded border border-line p-3 text-sm"><div className="flex justify-between"><strong>{c.number}</strong><strong>{formatPaise(c.total)}</strong></div><p className="text-xs text-muted">Bill {c.invoiceNumber} · {c.reason} · {formatDate(c.date)}</p>{c.exchangeInvoiceNumber && <Badge className="mt-1">Exchange {c.exchangeInvoiceNumber}</Badge>}</li>)}</ul>;
}

/** The More tab entry for POS people: bills, returns, credit notes, held bills and day close, all in one place. */
export function SalesMobile() {
  const [sp, setSp] = useSearchParams();
  return (
    <Tabs value={sp.get('tab') ?? 'bills'} onChange={(t) => setSp({ tab: t }, { replace: true })} items={[
      { key: 'bills', label: 'Bills', panel: <BillsTab /> }, { key: 'returns', label: 'Returns', panel: <ReturnPanel big sheet /> },
      { key: 'credit', label: 'Credit notes', panel: <CreditNotesTab /> }, { key: 'held', label: 'Held', panel: <HeldPanel big /> }, { key: 'day', label: 'Day', panel: <ShiftPanel big /> },
    ]} />
  );
}
