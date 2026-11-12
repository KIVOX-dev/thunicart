import { useState } from 'react';
import { formatDate, formatPaise } from '@thunikart/shared';
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
        <section aria-label="Open day" className="rounded border border-line p-4">
          <div className="flex items-center justify-between"><h2 className="text-sm">Day is open</h2><Badge tone="success">Open</Badge></div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Opening cash</dt><dd className="text-right">{formatPaise(open.openingCash)}</dd>
            <dt className="text-muted">Bills today</dt><dd className="text-right">{open.bills}</dd>
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
            <li key={s.id} className="rounded border border-line p-3 text-sm" data-testid="closed-shift">
              <div className="flex justify-between"><strong>{formatDate(s.openedAt)}</strong><span className="text-muted">{s.bills} bills</span></div>
              <dl className="mt-1 grid grid-cols-2 gap-1"><dt className="text-muted">Expected cash</dt><dd className="text-right" data-testid="shift-expected">{formatPaise(s.expectedCash ?? 0)}</dd><dt className="text-muted">Counted cash</dt><dd className="text-right" data-testid="shift-counted">{formatPaise(s.countedCash ?? 0)}</dd><dt className="font-semibold">Difference</dt><dd className={`text-right font-semibold ${(s.difference ?? 0) < 0 ? 'text-danger' : ''}`} data-testid="shift-diff">{(s.difference ?? 0) < 0 ? '-' : ''}{formatPaise(Math.abs(s.difference ?? 0))}</dd></dl>
            </li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}
