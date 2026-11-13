import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDate, formatPaise } from '@thunikart/shared';
import { BottomSheet, Button, EmptyState, ListSkeleton, Tabs, useToast } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { ExpenseForm, ReceiptForm } from '../../../components/reports/AccountForms';
import { useCan } from '../../../features/auth/permissions';
import { useExpenses, useReceipts, useReceivables } from '../../../features/reports/use-reports';

const Sticky = ({ children }: { children: React.ReactNode }) => <div className="fixed inset-x-0 bottom-14 z-30 border-t-2 border-navy-100 bg-white p-3">{children}</div>;

function ExpensesTab() {
  const can = useCan();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const q = useExpenses('');
  const data = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-3 pb-20">
      <p className="rounded bg-mist p-3 text-sm">This month <strong className="ml-1 text-lg" data-testid="expense-month">{formatPaise(q.data?.pages[0]?.monthTotal ?? 0)}</strong></p>
      {q.isPending ? <ListSkeleton label="Loading expenses" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No expenses yet" /> : data.map((e) => (
        <div key={e.id} className="rounded border-2 border-navy-100 p-3 text-sm"><div className="flex justify-between"><strong>{e.category}</strong><strong>{formatPaise(e.amount)}</strong></div><p className="text-xs text-muted">{formatDate(e.date)} · {e.note || 'No note'}{e.receiptKey ? ' · receipt attached' : ''}</p></div>
      ))}
      {q.hasNextPage && <Button size="lg" className="min-h-12" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button>}
      {can('accounts.create') && <Sticky><Button variant="primary" size="lg" block className="min-h-12" onClick={() => setOpen(true)}>Add expense</Button></Sticky>}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Add expense"><ExpenseForm big onDone={() => { setOpen(false); toast('Expense saved', 'success'); }} /></BottomSheet>
    </div>
  );
}

function ReceiptsTab() {
  const can = useCan();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const q = useReceipts();
  const data = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-3 pb-20">
      {q.isPending ? <ListSkeleton label="Loading receipts" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No customer receipts" /> : data.map((r) => (
        <div key={r.id} className="rounded border-2 border-navy-100 p-3 text-sm"><div className="flex justify-between"><strong>{r.number}</strong><strong>{formatPaise(r.amount)}</strong></div><p className="text-xs text-muted">{r.customerName} · {r.mode} · {formatDate(r.date)}</p></div>
      ))}
      {can('accounts.create') && <Sticky><Button variant="primary" size="lg" block className="min-h-12" onClick={() => setOpen(true)}>Record receipt</Button></Sticky>}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Record receipt"><ReceiptForm big onDone={() => { setOpen(false); toast('Receipt recorded', 'success'); }} /></BottomSheet>
    </div>
  );
}

function OutstandingTab() {
  const q = useReceivables();
  if (q.isPending) return <ListSkeleton label="Loading receivables" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Vendor ageing is in <Link to="/purchase?tab=ageing" className="underline">Purchase</Link>.</p>
      {q.data.length === 0 ? <EmptyState title="Nobody owes anything" /> : q.data.map((r) => (
        <div key={r.customerId} className="rounded border-2 border-navy-100 p-3 text-sm"><div className="flex justify-between"><strong>{r.customerName}</strong><strong>{formatPaise(r.total)}</strong></div>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-muted">{([['Not due', r.current], ['1 to 30 days', r.d1to30], ['31 to 60', r.d31to60], ['61 to 90', r.d61to90], ['Over 90', r.d90plus]] as const).map(([l, v]) => <div key={l} className="flex justify-between"><dt>{l}</dt><dd>{v ? formatPaise(v) : '–'}</dd></div>)}</dl></div>
      ))}
    </div>
  );
}

export function AccountsMobile() {
  const [sp, setSp] = useSearchParams();
  return (
    <Tabs value={sp.get('tab') ?? 'expenses'} onChange={(t) => setSp({ tab: t }, { replace: true })} items={[
      { key: 'expenses', label: 'Expenses', panel: <ExpensesTab /> }, { key: 'receipts', label: 'Receipts', panel: <ReceiptsTab /> }, { key: 'outstanding', label: 'Owed', panel: <OutstandingTab /> },
    ]} />
  );
}
