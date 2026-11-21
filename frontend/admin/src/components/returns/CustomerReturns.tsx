import { useState } from 'react';
import { formatDate, formatPaise } from '@thunikart/shared';
import { Badge, Button, EmptyState, ListSkeleton, Select, Tabs, useToast } from '@thunikart/ui';
import { QueryError } from '../ErrorBanner';
import { ReturnPanel } from '../pos/ReturnPanel';
import { useCan } from '../../features/auth/permissions';
import { ONLINE_RETURN_STATUSES, useOfflineReturns, useOnlineReturns, useReturnStep, type OnlineReturn } from '../../features/inventory/use-customer-returns';
import { Pager } from '../Pager';
import { usePagedView } from '../../features/api/use-paged-view';

function OnlineRow({ o, stage }: { o: OnlineReturn; stage: string }) {
  const can = useCan();
  const { toast } = useToast();
  const { run, saving, error } = useReturnStep();
  const [refundTo, setRefundTo] = useState<'wallet' | 'original'>('wallet');
  const [condition, setCondition] = useState<'restock' | 'damaged'>('restock');
  const go = async (action: 'approve' | 'reject' | 'received' | 'refund', done: string) => { try { await run({ id: o.id, action, refundTo, condition, note: action === 'reject' ? 'Not eligible for return' : '' }); toast(done, 'success'); } catch { /* shown below */ } };
  const ok = can('orders.approve');
  return (
    <li className="rounded border-2 border-navy-100 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{o.orderNumber}</strong><span>{formatPaise(o.total)}</span></div>
      <p className="text-xs text-muted">{formatDate(o.createdAt)}{o.returnRequest?.reason ? ` · ${o.returnRequest.reason}` : ''}</p>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {stage === 'return_requested' && ok && <><Button size="sm" loading={saving} onClick={() => go('approve', 'Return approved')}>Approve</Button><Button size="sm" disabled={saving} onClick={() => go('reject', 'Return rejected')}>Reject</Button></>}
        {stage === 'return_approved' && can('orders.edit') && <Button size="sm" loading={saving} onClick={() => go('received', 'Marked as received')}>Goods received</Button>}
        {stage === 'returned' && ok && (<>
          <Select aria-label="Condition" className="w-36" value={condition} onChange={(e) => setCondition(e.target.value as 'restock' | 'damaged')}><option value="restock">Add back to stock</option><option value="damaged">Damaged</option></Select>
          <Select aria-label="Refund to" className="w-40" value={refundTo} onChange={(e) => setRefundTo(e.target.value as 'wallet' | 'original')}><option value="wallet">Credit to wallet</option><option value="original">Original payment</option></Select>
          <Button size="sm" variant="primary" loading={saving} onClick={() => go('refund', 'Refund issued and stock updated')}>Refund</Button>
        </>)}
        {stage === 'refunded' && <Badge tone="success">Refunded</Badge>}
      </div>
    </li>
  );
}

export function OnlineReturns() {
  const [stage, setStage] = useState<string>(ONLINE_RETURN_STATUSES[0].key);
  const q = useOnlineReturns(stage);
  const pv = usePagedView(q);
  const rows = pv.items;
  return (
    <div className="flex flex-col gap-3">
      <div className="w-64"><Select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)}>{ONLINE_RETURN_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></div>
      {q.isPending ? <ListSkeleton label="Loading online returns" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="Nothing here" body="Return requests from website orders appear at each stage." /> : <ul className="flex flex-col gap-3">{rows.map((o) => <OnlineRow key={o.id} o={o} stage={stage} />)}</ul>}
      <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
    </div>
  );
}

function Offline() {
  const q = useOfflineReturns();
  const pv = usePagedView(q);
  const rows = pv.items;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Returns and exchanges that were taken. Each one has a credit note and the pieces went back to stock.</p>
      {q.isPending ? <ListSkeleton label="Loading counter returns" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="No counter returns yet" /> : (
        <ul className="flex flex-col gap-2">{rows.map((r) => <li key={r.id} className="flex items-center justify-between rounded border-2 border-navy-100 p-3 text-sm"><span><strong>{r.creditNoteNumber}</strong>{r.invoiceNumber && <span className="block text-xs text-muted">Invoice {r.invoiceNumber}</span>}</span><strong>{formatPaise(r.refundTotal)}</strong></li>)}</ul>
      )}
      <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
    </div>
  );
}

/** Customer returns: online (website orders, approve then refund) and offline (counter). Stock goes back up and the customer gets a refund or credit note. */
export function CustomerReturns({ compact }: { compact?: boolean }) {
  const [kind, setKind] = useState('new');
  return (
    <Tabs value={kind} onChange={setKind} items={[
      {
        key: 'new', label: 'New return',
        panel: (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Take a return or exchange for any bill, counter (POS) or website (online). Scan the invoice barcode or type the bill number. Stock goes back up, and the customer gets a refund or a credit note.</p>
            <ReturnPanel big={compact} sheet={compact} />
          </div>
        ),
      },
      { key: 'online', label: 'Online requests', panel: <OnlineReturns /> },
      { key: 'offline', label: 'Returns taken', panel: <Offline /> },
    ]} />
  );
}
