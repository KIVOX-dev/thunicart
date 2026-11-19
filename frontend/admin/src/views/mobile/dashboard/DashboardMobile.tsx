import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPaise } from '@thunikart/shared';
import { BottomSheet, Button, ListSkeleton } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { LineChart } from '../../../components/reports/LineChart';
import { CashflowWidgets } from '../../../components/reports/CashflowWidgets';
import { StatCard } from '../../../components/reports/StatCard';
import { useDashboard } from '../../../features/reports/use-reports';

/** Stacked summary cards with a sales line. Tap a card for the detail. */
export function DashboardMobile() {
  const q = useDashboard();
  const [open, setOpen] = useState<string | null>(null);
  if (q.isPending) return <ListSkeleton rows={5} label="Loading dashboard" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const ch = (c: Record<string, number>) => (Object.keys(c).length ? Object.entries(c).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><span>{formatPaise(v)}</span></li>) : <li className="text-muted">No sales yet</li>);
  const cards: Array<[string, string, string, string, React.ReactNode]> = [
    ['today', 'Sales today', formatPaise(d.today.total), 'sales-today', <ul key="t" className="space-y-1 text-sm">{ch(d.today.channels)}<li className="flex justify-between border-t-2 border-navy-100 pt-1"><span>Bills</span><span>{d.today.bills}</span></li><li className="flex justify-between"><span>Average bill</span><span>{formatPaise(d.today.average)}</span></li></ul>],
    ['month', 'Sales this month', formatPaise(d.month.total), 'sales-month', <ul key="m" className="space-y-1 text-sm">{ch(d.month.channels)}<li className="flex justify-between border-t-2 border-navy-100 pt-1"><span>Bills</span><span>{d.month.bills}</span></li><li className="flex justify-between"><span>Average bill</span><span>{formatPaise(d.month.average)}</span></li></ul>],
    ['margin', 'Margin today', formatPaise(d.margin.today), 'margin-today', <p key="g" className="text-sm">Month {formatPaise(d.margin.month)}</p>],
    ['stock', 'Low stock sizes', String(d.lowStock), 'low-stock', <p key="s" className="text-sm">Sizes at or below their reorder level. Non moving stock is worth {formatPaise(d.nonMovingValue)} at cost.</p>],
    ['pay', 'Payables due', formatPaise(d.payablesDue), 'payables', <p key="p" className="text-sm">Open vendor bills.</p>],
    ['rec', 'Receivables overdue', formatPaise(d.receivablesOverdue), 'receivables', <p key="r" className="text-sm">Customers past their due date.</p>],
  ];
  return (
    <div className="flex flex-col gap-3">
      <Link to="/reports"><Button variant="primary" block className="min-h-12">Reports</Button></Link>
      <dl className="flex flex-col gap-3">
        {cards.map(([k, label, value, id]) => <button key={k} type="button" onClick={() => setOpen(k)} className="min-h-14 text-left" aria-label={`${label}: ${value}. Show detail`}><StatCard label={label} value={value} testId={id} /></button>)}
      </dl>
      <CashflowWidgets stacked payablesDue={d.payablesDue} receivablesOverdue={d.receivablesOverdue} />
      <section aria-label="Sales for 30 days" className="rounded border-2 border-navy-100 p-3"><h2 className="mb-2 text-xs">Sales, last 30 days</h2><LineChart points={d.salesLine} height={100} /></section>
      <section aria-label="Top items" className="rounded border-2 border-navy-100 p-3"><h2 className="mb-2 text-xs">Top items</h2>{d.topItems.length === 0 ? <p className="text-sm text-muted">No sales yet.</p> : <ul className="divide-y divide-line text-sm">{d.topItems.map((t) => <li key={t.name} className="flex justify-between py-2"><span>{t.name}</span><span>{formatPaise(t.amount)}</span></li>)}</ul>}</section>
      {cards.map(([k, label, , , detail]) => <BottomSheet key={k} open={open === k} onClose={() => setOpen(null)} title={label}>{detail}</BottomSheet>)}
    </div>
  );
}
