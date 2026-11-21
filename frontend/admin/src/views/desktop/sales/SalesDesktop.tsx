import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDate, formatPaise } from '@thunikart/shared';
import { Badge, Button, EmptyState, Input, ListSkeleton, Table, TBody, Td, Th, THead, Tabs, Tr } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { ExportButton } from '../../../components/ExportButton';
import { PageHeader } from '../../../components/PageHeader';
import { CreditMemoPanel } from '../../../components/pos/CreditMemoPanel';
import { HeldPanel } from '../../../components/pos/HeldPanel';
import { InvoiceViewer } from '../../../components/pos/InvoiceViewer';
import { ReturnPanel } from '../../../components/pos/ReturnPanel';
import { ShiftPanel } from '../../../components/pos/ShiftPanel';
import { useCan } from '../../../features/auth/permissions';
import type { Invoice } from '../../../features/pos/types';
import { fetchBill, useBills, useCreditNotes } from '../../../features/pos/use-pos-data';
import { Pager } from '../../../components/Pager';
import { usePagedView } from '../../../features/api/use-paged-view';

function BillsTab() {
  const [q, setQ] = useState('');
  const [view, setView] = useState<Invoice | null>(null);
  const list = useBills(q);
  const pv = usePagedView(list);
  const data = pv.items;
  return (
    <div>
      <div className="mb-3 w-72"><Input aria-label="Search bills" placeholder="Bill number, customer or mobile" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list.isPending ? <ListSkeleton label="Loading bills" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : data.length === 0 ? <EmptyState title="No bills found" /> : (
        <>
          <Table caption="Bills">
            <THead><Tr><Th>Bill</Th><Th>Date</Th><Th>Customer</Th><Th>Paid by</Th><Th className="text-right">Pieces</Th><Th className="text-right">Total</Th><Th><span className="sr-only">Actions</span></Th></Tr></THead>
            <TBody>{data.map((b) => <Tr key={b.id}><Td className="font-medium">{b.number}</Td><Td>{formatDate(b.date)} {b.time}</Td><Td>{b.customerName}</Td><Td>{b.tenders}</Td><Td className="text-right">{b.pieces}</Td><Td className="text-right">{formatPaise(b.total)}</Td><Td className="text-right"><Button size="sm" onClick={async () => setView(await fetchBill(b.id))} aria-label={`Reprint ${b.number}`}>Reprint</Button></Td></Tr>)}</TBody>
          </Table>
          <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
        </>
      )}
      <InvoiceViewer invoice={view} onClose={() => setView(null)} title="Bill" />
    </div>
  );
}

function CreditNotesTab() {
  const q = useCreditNotes();
  const pv = usePagedView(q);
  const data = pv.items;
  if (q.isPending) return <ListSkeleton label="Loading credit notes" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (!data.length) return <EmptyState title="No credit notes" body="A credit note is made for every return or exchange." />;
  return (
    <Table caption="Credit notes">
      <THead><Tr><Th>Credit note</Th><Th>Bill</Th><Th>Customer</Th><Th>Date</Th><Th>Reason</Th><Th>Refund</Th><Th className="text-right">Total</Th></Tr></THead>
      <TBody>{data.map((c) => <Tr key={c.id}><Td className="font-medium">{c.number}</Td><Td>{c.invoiceNumber}{c.exchangeInvoiceNumber && <Badge className="ml-2">Exchange {c.exchangeInvoiceNumber}</Badge>}</Td><Td>{c.customerName}</Td><Td>{formatDate(c.date)}</Td><Td>{c.reason}</Td><Td>{c.refunded ? `${formatPaise(c.refunded)} by ${c.refundMode}` : c.collected ? `Collected ${formatPaise(c.collected)}` : '–'}</Td><Td className="text-right">{formatPaise(c.total)}</Td></Tr>)}</TBody>
    </Table>
  );
}

export function SalesDesktop() {
  const [sp, setSp] = useSearchParams();
  const can = useCan();
  return (
    <div>
      <PageHeader title="Bills and returns" description="Reprint bills, take returns and exchanges, resume held bills and close the day." actions={<><ExportButton dataset="sales" />{can('pos.view') && <Link to="/billing"><Button variant="primary">New bill</Button></Link>}{can('pos.create') && <Link to="/billing/b2b"><Button>Counter invoice (B2B)</Button></Link>}</>} />
      <Tabs value={sp.get('tab') ?? 'bills'} onChange={(t) => setSp({ tab: t }, { replace: true })} items={[
        { key: 'bills', label: 'Bills', panel: <BillsTab /> }, { key: 'returns', label: 'Returns and exchanges', panel: <ReturnPanel /> },
        { key: 'credit', label: 'Credit notes', panel: <CreditNotesTab /> }, { key: 'memo', label: 'Credit memos', panel: <CreditMemoPanel /> }, { key: 'held', label: 'Held bills', panel: <HeldPanel /> }, { key: 'day', label: 'Day close', panel: <ShiftPanel /> },
      ]} />
    </div>
  );
}
