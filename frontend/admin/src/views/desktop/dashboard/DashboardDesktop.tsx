import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { formatPaise } from '@thunikart/shared';
import { Button, ListSkeleton, Table, TBody, Td, Th, THead, Tr } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { LineChart } from '../../../components/reports/LineChart';
import { CashflowWidgets } from '../../../components/reports/CashflowWidgets';
import { StatCard } from '../../../components/reports/StatCard';
import { useCan } from '../../../features/auth/permissions';
import { useDashboard } from '../../../features/reports/use-reports';

const channels = (c: Record<string, number>) => (Object.keys(c).length ? Object.entries(c).map(([k, v]) => `${k} ${formatPaise(v)}`).join(' · ') : 'No sales yet');

export function DashboardDesktop() {
  const q = useDashboard();
  const can = useCan();
  if (q.isPending) return <div><PageHeader title="Dashboard" /><ListSkeleton rows={6} label="Loading dashboard" /></div>;
  if (q.isError) return <div><PageHeader title="Dashboard" /><QueryError error={q.error} onRetry={() => q.refetch()} /></div>;
  const d = q.data;
  return (
    <div>
      <PageHeader title="Dashboard" description="Today and this month at a glance." actions={can('reports.view') ? <Link to="/reports"><Button variant="primary"><BarChart3 aria-hidden size={16} />Reports</Button></Link> : undefined} />
      <dl className="grid grid-cols-4 gap-4 [&>div:nth-child(3n+1)]:bg-orange-100 [&>div:nth-child(3n+2)]:bg-teal-100">
        <StatCard label="Sales today" value={formatPaise(d.today.total)} hint={channels(d.today.channels)} testId="sales-today" />
        <StatCard label="Sales this month" value={formatPaise(d.month.total)} hint={channels(d.month.channels)} testId="sales-month" />
        <StatCard label="Bills today" value={d.today.bills} hint={`${d.month.bills} this month`} testId="bills-today" />
        <StatCard label="Average bill today" value={formatPaise(d.today.average)} hint={`Month ${formatPaise(d.month.average)}`} testId="avg-today" />
        <StatCard label="Margin today" value={formatPaise(d.margin.today)} hint={`Month ${formatPaise(d.margin.month)}`} testId="margin-today" />
        <StatCard label="Low stock sizes" value={d.lowStock} hint="At or below reorder level" testId="low-stock" />
        <StatCard label="Non moving stock" value={formatPaise(d.nonMovingValue)} hint="Cost value, no sale in 30 days" testId="non-moving" />
        <StatCard label="Payables due" value={formatPaise(d.payablesDue)} hint="Open vendor bills" testId="payables" />
        <StatCard label="Receivables overdue" value={formatPaise(d.receivablesOverdue)} hint="Customers past their due date" testId="receivables" />
      </dl>
      <div className="mt-6"><CashflowWidgets payablesDue={d.payablesDue} receivablesOverdue={d.receivablesOverdue} /></div>
      <div className="mt-6 grid grid-cols-[2fr_1fr] gap-6">
        <section aria-label="Sales for 30 days" className="rounded-xl bg-navy-50 p-5"><h2 className="mb-3 text-xl">Sales, last 30 days</h2><LineChart points={d.salesLine} /></section>
        <section aria-label="Top items" className="rounded-xl bg-navy-50 p-5"><h2 className="mb-3 text-xl">Top items, last 30 days</h2>
          {d.topItems.length === 0 ? <p className="text-sm text-muted">No sales yet.</p> : (
            <Table caption="Top items"><THead><Tr><Th>Item</Th><Th className="text-right">Pieces</Th><Th className="text-right">Amount</Th></Tr></THead><TBody>{d.topItems.map((t) => <Tr key={t.name}><Td>{t.name}</Td><Td className="text-right">{t.qty}</Td><Td className="text-right">{formatPaise(t.amount)}</Td></Tr>)}</TBody></Table>
          )}
        </section>
      </div>
    </div>
  );
}
