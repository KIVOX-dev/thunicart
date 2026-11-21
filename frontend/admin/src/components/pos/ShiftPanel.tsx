import { useState } from 'react';
import { formatDate, formatPaise } from '@thunikart/shared';

const fullDate = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
import { Badge, Button, Field, Input, ListSkeleton, useToast } from '@thunikart/ui';
import { useCan } from '../../features/auth/permissions';
import { useShift, useShiftActions, useShifts } from '../../features/pos/use-pos-data';
import { ErrorBanner, QueryError } from '../ErrorBanner';
import { DayOpen } from './DayOpen';

/** Day open and close: expected cash against the cash counted, as the API works it out. */
export function ShiftPanel({ big }: { big?: boolean }) {
  const can = useCan();
  const { toast } = useToast();
  const shift = useShift();
  const history = useShifts();
  const [counted, setCounted] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const actions = useShiftActions(setErr);
  if (shift.isPending) return <ListSkeleton rows={2} label="Loading the day" />;
  if (shift.isError) return <QueryError error={shift.error} onRetry={() => shift.refetch()} />;
  const open = shift.data;
  const closed = history.data?.filter((s) => s.closedAt) ?? [];
  return (
    <div className="flex max-w-xl flex-col gap-4">
      {!open ? (can('pos.create') ? <DayOpen big={big} /> : <p className="text-sm text-muted">The day is not open.</p>) : (
        <section aria-label="Open day" className="rounded border-2 border-navy-100 p-4">
          <div className="flex items-center justify-between"><h2 className="text-lg">Day is open</h2><Badge tone={open.stale ? 'warning' : 'success'}>{open.stale ? 'Left open' : 'Open'}</Badge></div>
          {open.businessDate && <p className="mt-1 text-base font-bold" data-testid="business-date">{fullDate(open.businessDate)}</p>}
          {open.stale && <p role="alert" className="mt-2 rounded border-2 border-warning bg-orange-50 p-2 text-sm">This day was opened on an earlier date and was never closed. Count the drawer and close it, then open today's day, so bills go on the right date.</p>}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Opened</dt><dd className="text-right">{clock(open.openedAt)}{open.cashier ? ` by ${open.cashier}` : ''}</dd>
            <dt className="text-muted">Opening cash</dt><dd className="text-right">{formatPaise(open.openingCash)}</dd>
            <dt className="text-muted">Bills this day</dt><dd className="text-right">{open.bills}</dd>
            <dt className="text-muted">Cash sales</dt><dd className="text-right">{formatPaise(open.cashSales)}</dd>
            {open.cashRefunds > 0 && <><dt className="text-muted">Cash refunds</dt><dd className="text-right">{formatPaise(open.cashRefunds)}</dd></>}
            <dt className="font-semibold">Cash that should be in the drawer</dt><dd className="text-right font-semibold" data-testid="expected-now">{formatPaise(open.expectedCash ?? open.openingCash + open.cashSales - open.cashRefunds)}</dd>
          </dl>
          {err && <div className="mt-3"><ErrorBanner message={err} /></div>}
          {can('pos.create') && (
            <form className="mt-4 flex flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await actions.close.mutateAsync(counted); setCounted(''); toast('Day closed', 'success'); } catch { /* shown above */ } }} aria-label="Close the day">
              <Field label="Cash counted in the drawer (₹)" required>{(p) => <Input {...p} inputMode="decimal" className={big ? 'min-h-12' : ''} value={counted} onChange={(e) => setCounted(e.target.value)} />}</Field>
              <Button type="submit" variant="primary" size="lg" className={big ? 'min-h-12' : ''} loading={actions.close.isPending} disabled={counted === ''}>Close the day</Button>
            </form>
          )}
        </section>
      )}
      {closed.length > 0 && (
        <section aria-label="Closed days"><h2 className="mb-2 text-xs">Closed days</h2>
          <ul className="flex flex-col gap-2">{closed.map((s) => (
            <li key={s.id} className="rounded border-2 border-navy-100 p-3 text-sm" data-testid="closed-shift">
              <div className="flex justify-between"><strong>{s.businessDate ? fullDate(s.businessDate) : formatDate(s.openedAt)}</strong><span className="text-muted">{s.bills} bills</span></div>
              <p className="text-xs text-muted">Opened {clock(s.openedAt)}{s.closedAt ? `, closed ${clock(s.closedAt)}${s.businessDate && formatDate(s.closedAt) !== formatDate(s.openedAt) ? ` on ${formatDate(s.closedAt)}` : ''}` : ''}{s.cashier ? ` · ${s.cashier}` : ''}</p>
              <dl className="mt-1 grid grid-cols-2 gap-1"><dt className="text-muted">Expected cash</dt><dd className="text-right" data-testid="shift-expected">{formatPaise(s.expectedCash ?? 0)}</dd><dt className="text-muted">Counted cash</dt><dd className="text-right" data-testid="shift-counted">{formatPaise(s.countedCash ?? 0)}</dd><dt className="font-semibold">Difference</dt><dd className={`text-right font-semibold ${(s.difference ?? 0) < 0 ? 'text-danger' : ''}`} data-testid="shift-diff">{(s.difference ?? 0) < 0 ? '-' : ''}{formatPaise(Math.abs(s.difference ?? 0))}</dd></dl>
            </li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}
