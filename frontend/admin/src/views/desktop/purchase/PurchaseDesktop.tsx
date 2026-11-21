import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatDate, formatPaise } from '@thunikart/shared';
import { Badge, Button, EmptyState, Input, ListSkeleton, Modal, Select, Table, TBody, Td, Th, THead, Tabs, Tr, useToast } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { ExportButton } from '../../../components/ExportButton';
import { PageHeader } from '../../../components/PageHeader';
import { BillForm, PaymentForm } from '../../../components/PurchaseForms';
import { useCan, useGstMode } from '../../../features/auth/permissions';
import { PO_STATUSES, PO_STATUS_LABEL, poTone } from '../../../features/inventory/types';
import { useAgeing, useBills, usePayments } from '../../../features/inventory/use-billing';
import { useGrns, useStartGrn } from '../../../features/inventory/use-grn';
import { usePos, useReceivablePos } from '../../../features/inventory/use-purchase-orders';
import { Pager } from '../../../components/Pager';
import { usePagedView } from '../../../features/api/use-paged-view';


function OrdersTab() {
  const can = useCan();
  const gst = useGstMode();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const list = usePos(status, q);
  const pv = usePagedView(list);
  const data = pv.items;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select aria-label="Status" className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{PO_STATUSES.map((s) => <option key={s} value={s}>{PO_STATUS_LABEL[s]}</option>)}</Select>
        <div className="w-64"><Input aria-label="Search orders" placeholder="Order number or vendor" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {can('purchase.create') && <Link to="/purchase/orders/new" className="ml-auto"><Button variant="primary">New order</Button></Link>}
      </div>
      {list.isPending ? <ListSkeleton label="Loading orders" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : data.length === 0 ? <EmptyState title="No purchase orders" body="Create an order to buy stock from a vendor." /> : (
        <>
          <Table caption="Purchase orders">
            <THead><Tr><Th>Order</Th><Th>Vendor</Th><Th>Date</Th><Th>Expected</Th><Th>Status</Th><Th className="text-right">Pieces</Th>{gst === 'on' && <Th className="text-right">GST</Th>}<Th className="text-right">Total</Th></Tr></THead>
            <TBody>{data.map((p) => (
              <Tr key={p.id}><Td><Link className="font-medium underline" to={`/purchase/orders/${p.id}`}>{p.number}</Link></Td><Td>{p.vendorName}</Td><Td>{formatDate(p.date)}</Td><Td>{formatDate(p.expectedDate)}</Td>
                <Td><Badge tone={poTone(p.status)}>{PO_STATUS_LABEL[p.status]}</Badge></Td><Td className="text-right">{p.receivedPieces} / {p.pieces}</Td>
                {gst === 'on' && <Td className="text-right">{p.totals.tax !== null ? formatPaise(p.totals.tax) : ''}</Td>}<Td className="text-right">{formatPaise(p.totals.total)}</Td></Tr>
            ))}</TBody>
          </Table>
          <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
        </>
      )}
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
  const pv = usePagedView(list);
  const data = pv.items;
  return (
    <div>
      {can('purchase.create') && <div className="mb-3 flex justify-end"><Button variant="primary" onClick={() => setOpen(true)}>Start receiving</Button></div>}
      {list.isPending ? <ListSkeleton label="Loading receipts" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : data.length === 0 ? <EmptyState title="No receipts yet" body="Start receiving against an approved order, then scan the goods in." /> : (
        <>
          <Table caption="Goods receipts">
            <THead><Tr><Th>Receipt</Th><Th>Order</Th><Th>Vendor</Th><Th>Into</Th><Th>Status</Th><Th className="text-right">Pieces</Th></Tr></THead>
            <TBody>{data.map((g) => <Tr key={g.id}><Td><Link className="font-medium underline" to={`/purchase/grn/${g.id}`}>{g.number}</Link></Td><Td>{g.poNumber}</Td><Td>{g.vendorName}</Td><Td>{g.storeName}</Td><Td><Badge tone={g.status === 'finished' ? 'success' : 'warning'}>{g.status === 'finished' ? 'Finished' : 'Receiving'}</Badge></Td><Td className="text-right">{g.pieces}</Td></Tr>)}</TBody>
          </Table>
          <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Start receiving" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!poId} loading={start.isPending} onClick={async () => { const g = await start.mutateAsync({ poId }); nav(`/purchase/grn/${g.id}`); }}>Start</Button></>}>
        <label className="text-xs font-medium">Purchase order
          <Select className="mt-1" value={poId} onChange={(e) => setPoId(e.target.value)}><option value="">Choose an approved order</option>{receivable.data?.map((p) => <option key={p.id} value={p.id}>{p.number} · {p.vendorName}</option>)}</Select>
        </label>
        {receivable.data?.length === 0 && <p className="mt-2 text-sm text-muted">No approved orders waiting. Approve an order first.</p>}
      </Modal>
    </div>
  );
}

function BillsTab() {
  const can = useCan();
  const gst = useGstMode();
  const { toast } = useToast();
  const [paymentStatus, setPaymentStatus] = useState<'' | 'unpaid' | 'partial' | 'paid'>('');
  const list = useBills({ paymentStatus });
  const [open, setOpen] = useState(false);
  const pv = usePagedView(list);
  const data = pv.items;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Select aria-label="Payment status" className="w-48" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as typeof paymentStatus)}><option value="">All payment statuses</option><option value="unpaid">Unpaid</option><option value="partial">Partially paid</option><option value="paid">Paid</option></Select>
        {can('purchase.create') && <Button variant="primary" onClick={() => setOpen(true)}>Add bill</Button>}
      </div>
      {list.isPending ? <ListSkeleton label="Loading bills" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : data.length === 0 ? <EmptyState title="No purchase bills" body="Add a bill after a receipt is finished." /> : (
        <Table caption="Purchase bills">
          <THead><Tr><Th>Bill</Th><Th>Vendor bill no.</Th><Th>Vendor</Th><Th>Date</Th><Th>Due</Th>{gst === 'on' && <Th className="text-right">GST</Th>}<Th className="text-right">Total</Th><Th className="text-right">Balance</Th><Th>Status</Th></Tr></THead>
          <TBody>{data.map((b) => <Tr key={b.id}><Td className="font-medium">{b.number}</Td><Td>{b.vendorBillNo}</Td><Td>{b.vendorName}</Td><Td>{formatDate(b.date)}</Td><Td>{formatDate(b.dueDate)}</Td>{gst === 'on' && <Td className="text-right">{b.totals.tax !== null ? formatPaise(b.totals.tax) : ''}</Td>}<Td className="text-right">{formatPaise(b.totals.total)}</Td><Td className="text-right">{formatPaise(b.balance)}</Td><Td><Badge tone={b.status === 'paid' ? 'success' : b.status === 'part-paid' ? 'warning' : 'neutral'}>{b.status === 'part-paid' ? 'Part paid' : b.status === 'paid' ? 'Paid' : 'Unpaid'}</Badge></Td></Tr>)}</TBody>
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add purchase bill"><BillForm onDone={() => { setOpen(false); toast('Bill added', 'success'); }} /></Modal>
    </div>
  );
}

function PaymentsTab() {
  const can = useCan();
  const { toast } = useToast();
  const list = usePayments();
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const pv = usePagedView(list);
  const data = pv.items;
  return (
    <div>
      {can('accounts.create') && <div className="mb-3 flex justify-end"><Button variant="primary" onClick={() => setOpen(true)}>Pay vendor</Button></div>}
      {list.isPending ? <ListSkeleton label="Loading payments" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : data.length === 0 ? <EmptyState title="No vendor payments" /> : (
        <Table caption="Vendor payments">
          <THead><Tr><Th>Payment</Th><Th>Vendor</Th><Th>Date</Th><Th>Mode</Th><Th>Settles</Th><Th className="text-right">Amount</Th></Tr></THead>
          <TBody>{data.map((p) => <Tr key={p.id}><Td className="font-medium">{p.number}</Td><Td>{p.vendorName}</Td><Td>{formatDate(p.date)}</Td><Td>{p.mode}{p.reference && <span className="block text-xs text-muted">{p.reference}</span>}</Td><Td>{p.settlements.map((s) => s.billNumber).join(', ')}</Td><Td className="text-right">{formatPaise(p.amount)}</Td></Tr>)}</TBody>
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Pay vendor"><PaymentForm vendorId={vendorId} onVendor={setVendorId} onDone={() => { setOpen(false); setVendorId(''); toast('Payment recorded', 'success'); }} /></Modal>
    </div>
  );
}

function AgeingTab() {
  const q = useAgeing();
  if (q.isPending) return <ListSkeleton label="Loading ageing" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.length) return <EmptyState title="Nothing is owed" body="Open bills show here by how late they are." />;
  return (
    <Table caption="Vendor ageing">
      <THead><Tr><Th>Vendor</Th><Th className="text-right">Not due</Th><Th className="text-right">1 to 30 days</Th><Th className="text-right">31 to 60</Th><Th className="text-right">61 to 90</Th><Th className="text-right">Over 90</Th><Th className="text-right">Total owed</Th></Tr></THead>
      <TBody>{q.data.map((r) => <Tr key={r.vendorId}><Td className="font-medium">{r.vendorName}</Td>{[r.current, r.d1to30, r.d31to60, r.d61to90, r.d90plus].map((v, i) => <Td key={i} className="text-right">{v ? formatPaise(v) : '–'}</Td>)}<Td className="text-right font-semibold">{formatPaise(r.total)}</Td></Tr>)}</TBody>
    </Table>
  );
}

export function PurchaseDesktop() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'orders';
  return (
    <div>
      <PageHeader title="Purchase and payment" description="Orders, receiving, bills, payments and what you owe vendors." actions={<ExportButton dataset="purchases" />} />
      <Tabs value={tab} onChange={(t) => setSp({ tab: t }, { replace: true })} items={[
        { key: 'orders', label: 'Orders', panel: <OrdersTab /> }, { key: 'receipts', label: 'Receipts', panel: <ReceiptsTab /> }, { key: 'bills', label: 'Bills', panel: <BillsTab /> },
        { key: 'payments', label: 'Payments', panel: <PaymentsTab /> }, { key: 'ageing', label: 'Vendor ageing', panel: <AgeingTab /> },
      ]} />
    </div>
  );
}
