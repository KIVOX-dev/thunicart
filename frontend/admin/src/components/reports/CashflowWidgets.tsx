import { Link } from 'react-router-dom';
import { formatPaise } from '@thunikart/shared';
import { StatCard } from './StatCard';
import { useCan } from '../../features/auth/permissions';
import { useCashflow } from '../../features/reports/use-reports';

/** This month's bills by payment: Cash, UPI (GPay, PhonePe and so on) and the customer wallet. */
export function MonthPayments({ cash, upi, wallet, stacked }: { cash: number; upi: number; wallet: number; stacked?: boolean }) {
  return (
    <section aria-label="Collected this month">
      <h2 className="mb-2 text-xs">Collected this month</h2>
      <dl className={stacked ? 'flex flex-col gap-3' : 'grid grid-cols-4 gap-4'}>
        <StatCard label="Cash" value={formatPaise(cash)} hint="This month" testId="month-cash" />
        <StatCard label="UPI (GPay)" value={formatPaise(upi)} hint="This month" testId="month-upi" />
        <StatCard label="Wallet" value={formatPaise(wallet)} hint="Paid from customer wallets this month" testId="month-wallet" />
      </dl>
    </section>
  );
}

/** Cashflow and outstanding widgets for the dashboard, next to the sales and stock cards. Shown to roles that can see accounts. */
export function CashflowWidgets({ payablesDue, receivablesOverdue, stacked }: { payablesDue: number; receivablesOverdue: number; stacked?: boolean }) {
  const can = useCan();
  const cash = useCashflow();
  const t = cash.data;
  return (
    <section aria-label="Cashflow and outstanding">
      <div className="mb-2 flex items-center justify-between"><h2 className="text-xs">Cashflow this month</h2><Link to="/reports" className="text-xs underline">All reports</Link></div>
      <dl className={stacked ? 'flex flex-col gap-3' : 'grid grid-cols-4 gap-4'}>
        {can('accounts.view') && <>
          <StatCard label="Money in" value={t ? formatPaise(t.in) : '…'} hint="Sales, receipts" testId="cash-in" />
          <StatCard label="Money out" value={t ? formatPaise(t.out) : '…'} hint="Refunds, vendor payments, expenses" testId="cash-out" />
          <StatCard label="Net cashflow" value={t ? formatPaise(t.net) : '…'} hint="In less out" testId="cash-net" />
        </>}
        <StatCard label="Outstanding" value={formatPaise(payablesDue)} hint={`To vendors, due within a week. Customers overdue ${formatPaise(receivablesOverdue)}`} testId="outstanding" />
      </dl>
      {can('accounts.view') && <p className="mt-2 text-xs text-muted"><Link to="/accounts?tab=vendors" className="underline">Outstanding to vendors</Link></p>}
    </section>
  );
}
