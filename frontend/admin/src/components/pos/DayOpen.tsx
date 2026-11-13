import { useState } from 'react';
import { Button, Field, Input } from '@thunikart/ui';
import { useShiftActions } from '../../features/pos/use-pos-data';
import { ErrorBanner } from '../ErrorBanner';

/** Billing starts after the day is opened with the cash in the drawer. */
export function DayOpen({ big }: { big?: boolean }) {
  const [cash, setCash] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const a = useShiftActions(setErr);
  return (
    <form onSubmit={(e) => { e.preventDefault(); setErr(null); a.open.mutate(cash); }} className="mx-auto flex max-w-sm flex-col gap-4 rounded border-2 border-navy-100 bg-mist p-6" aria-label="Open the day">
      <h2 className="text-lg">Open the day</h2>
      <p className="text-sm text-muted">Count the cash in the drawer and enter it. Billing starts after this.</p>
      {err && <ErrorBanner message={err} />}
      <Field label="Cash in the drawer (₹)" required>{(p) => <Input {...p} inputMode="decimal" autoFocus className={big ? 'min-h-12' : ''} value={cash} onChange={(e) => setCash(e.target.value)} />}</Field>
      <Button type="submit" variant="primary" size="lg" className={big ? 'min-h-12' : ''} loading={a.open.isPending}>Open the day</Button>
    </form>
  );
}
