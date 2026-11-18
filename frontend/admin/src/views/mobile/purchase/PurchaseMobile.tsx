import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatDate, formatPaise } from '@thunikart/shared';
import { Badge, BottomSheet, Button, EmptyState, ListSkeleton, Select, Tabs, useToast } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { BillForm, PaymentForm } from '../../../components/PurchaseForms';
import { useCan, useGstMode } from '../../../features/auth/permissions';
import { PO_STATUSES, PO_STATUS_LABEL, poTone } from '../../../features/inventory/types';
import { useAgeing, useBills, usePayments } from '../../../features/inventory/use-billing';
import { useGrns, useStartGrn } from '../../../features/inventory/use-grn';
import { usePos, useReceivablePos } from '../../../features/inventory/use-purchase-orders';

const rows = <T,>(d?: { pages: Array<{ items: T[] }> }) => d?.pages.flatMap((p) => p.items) ?? [];
const Card = ({ children, to }: { children: React.ReactNode; to?: string }) => (to ? <Link to={to} className="block rounded border-2 border-navy-100 p-3">{children}</Link> : <div className="rounded border-2 border-navy-100 p-3">{children}</div>);
const Sticky = ({ children }: { children: React.ReactNode }) => <div className="fixed inset-x-0 bottom-14 z-30 border-t-2 border-navy-100 bg-white p-3">{children}</div>;
const More = ({ q }: { q: { hasNextPage: boolean; fetchNextPage: () => unknown; isFetchingNextPage: boolean } }) => (q.hasNextPage ? <Button size="lg" className="mt-3 min-h-12" block onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button> : null);

function OrdersTab() {
  const can = useCan();
  const [status, setStatus] = useState('');
  const list = usePos(status, '');
  const data = rows(list.data);
  return (
    <div className="flex flex-col gap-3 pb-20">
      <Select aria-label="Status" className="min-h-12" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{PO_STATUSES.map((s) => <option key={s} value={s}>{PO_STATUS_LABEL[s]}</option>)}</Select>
      {list.isPending ? <ListSkeleton label="Loading orders" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : data.length === 0 ? <EmptyState title="No purchase orders" /> : data.map((p) => (
        <Card key={p.id} to={`/purchase/orders/${p.id}`}><div className="flex items-center justify-between"><strong className="text-sm">{p.number}</strong><Badge tone={poTone(p.status)}>{PO_STATUS_LABEL[p.status]}</Badge></div><p className="text-sm">{p.vendorName}</p><p className="text-xs text-muted">{p.receivedPieces} of {p.pieces} pieces · {formatPaise(p.totals.total)}</p></Card>
      ))}
      <More q={list} />
      {can('purchase.create') && <Sticky><Link to="/purchase/orders/new"><Button variant="primary" size="lg" block className="min-h-12">New order</Button></Link></Sticky>}
    </div>
  );
}

function ReceiptsTab() {
  const can = useCan();
  const nav = useNavigate();
  const list = useGrns('');
  const receivable = useReceivablePos();
  const start = useStartGrn();
  const [open, setOpen] = useState(false);
  const [poId, setPoId] = useState('');
  const data = rows(list.data);
  return (
    <div className="flex flex-col gap-3 pb-20">
      {list.isPending ? <ListSkeleton label="Loading receipts" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : data.length === 0 ? <EmptyState title="No receipts yet" body="Start receiving, then scan the goods in." /> : data.map((g) => (
        <Card key={g.id} to={`/purchase/grn/${g.id}`}><div className="flex items-center justify-between"><strong className="text-sm">{g.number}</strong><Badge tone={g.status === 'finished' ? 'success' : 'warning'}>{g.status === 'finished' ? 'Finished' : 'Receiving'}</Badge></div><p className="text-sm">{g.vendorName}</p><p className="text-xs text-muted">{g.poNumber} · {g.pieces} pieces</p></Card>
      ))}
      <More q={list} />
      {can('purchase.create') && <Sticky><Button variant="primary" size="lg" block className="min-h-12" onClick={() => setOpen(true)}>Start receiving</Button></Sticky>}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Start receiving" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!poId} loading={start.isPending} onClick={async () => { const g = await start.mutateAsync({ poId }); nav(`/purchase/grn/${g.id}`); }}>Start</Button></>}>
        <label className="text-xs font-medium">Purchase order<Select className="mt-1 min-h-12" value={poId} onChange={(e) => setPoId(e.target.value)}><option value="">Choose an approved order</option>{receivable.data?.map((p) => <option key={p.id} value={p.id}>{p.number} · {p.vendorName}</option>)}</Select></label>
      </BottomSheet>
    </div>
  );
}

function BillsTab() {
  const can = useCan();
  const gst = useGstMode();
  const { toast } = useToast();
  const list = useBills();
  const [open, setOpen] = useState(false);
  const data = rows(list.data);
  return (
    <div className="flex flex-col gap-3 pb-20">
      {list.isPending ? <ListSkeleton label="Loading bills" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : data.length === 0 ? <EmptyState title="No purchase bills" /> : data.map((b) => (
        <Card key={b.id}><div className="flex items-center justify-between"><strong className="text-sm">{b.number}</strong><Badge tone={b.status === 'paid' ? 'success' : b.status === 'part-paid' ? 'warning' : 'neutral'}>{b.status === 'part-paid' ? 'Part paid' : b.status === 'paid' ? 'Paid' : 'Unpaid'}</Badge></div><p className="text-sm">{b.vendorName} · {b.vendorBillNo}</p><p className="text-xs text-muted">Due {formatDate(b.dueDate)} · Total {formatPaise(b.totals.total)}{gst === 'on' && b.totals.tax !== null ? ` (GST ${formatPaise(b.totals.tax)})` : ''} · Balance {formatPaise(b.balance)}</p></Card>
      ))}
      {can('purchase.create') && <Sticky><Button variant="primary" size="lg" block className="min-h-12" onClick={() => setOpen(true)}>Add bill</Button></Sticky>}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Add purchase bill"><BillForm onDone={() => { setOpen(false); toast('Bill added', 'success'); }} /></BottomSheet>
    </div>
  );
}

function PaymentsTab() {
  const can = useCan();
  const { toast } = useToast();
  const list = usePayments();
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const data = rows(list.data);
  return (
    <div className="flex flex-col gap-3 pb-20">
      {list.isPending ? <ListSkeleton label="Loading payments" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : data.length === 0 ? <EmptyState title="No vendor payments" /> : data.map((p) => (
        <Card key={p.id}><div className="flex justify-between"><strong className="text-sm">{p.number}</strong><span className="font-semibold">{formatPaise(p.amount)}</span></div><p className="text-sm">{p.vendorName} · {p.mode}</p><p className="text-xs text-muted">Settles {p.settlements.map((s) => s.billNumber).join(', ')}</p></Card>
      ))}
      {can('accounts.create') && <Sticky><Button variant="primary" size="lg" block className="min-h-12" onClick={() => setOpen(true)}>Pay vendor</Button></Sticky>}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Pay vendor"><PaymentForm vendorId={vendorId} onVendor={setVendorId} onDone={() => { setOpen(false); setVendorId(''); toast('Payment recorded', 'success'); }} /></BottomSheet>
    </div>
  );
}

function AgeingTab() {
  const q = useAgeing();
  if (q.isPending) return <ListSkeleton label="Loading ageing" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.length) return <EmptyState title="Nothing is owed" />;
  return (
    <div className="flex flex-col gap-3">
      {q.data.map((r) => (
        <Card key={r.vendorId}><div className="flex justify-between"><strong className="text-sm">{r.vendorName}</strong><span className="font-semibold">{formatPaise(r.total)}</span></div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-muted">{([['Not due', r.current], ['1 to 30 days', r.d1to30], ['31 to 60', r.d31to60], ['61 to 90', r.d61to90], ['Over 90', r.d90plus]] as const).map(([l, v]) => <div key={l} className="flex justify-between"><dt>{l}</dt><dd>{v ? formatPaise(v) : '–'}</dd></div>)}</dl></Card>
      ))}
    </div>
  );
}

export function PurchaseMobile() {
  const [sp, setSp] = useSearchParams();
  return (
    <Tabs value={sp.get('tab') ?? 'orders'} onChange={(t) => setSp({ tab: t }, { replace: true })} items={[
      { key: 'orders', label: 'Orders', panel: <OrdersTab /> }, { key: 'receipts', label: 'Receipts', panel: <ReceiptsTab /> }, { key: 'bills', label: 'Bills', panel: <BillsTab /> },
      { key: 'payments', label: 'Pay', panel: <PaymentsTab /> }, { key: 'ageing', label: 'Ageing', panel: <AgeingTab /> },
    ]} />
  );
}
