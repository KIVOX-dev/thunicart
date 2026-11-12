import { formatPaise } from '@thunikart/shared';
import { useGstMode } from '../features/auth/permissions';
import type { Po } from '../features/inventory/types';

/** Totals as the API returns them. The tax line shows only while GST mode is on. */
export function PoTotals({ totals }: { totals: Po['totals'] | null }) {
  const gst = useGstMode();
  if (!totals) return <p className="text-sm text-muted">Totals appear when you add items.</p>;
  return (
    <dl className="ml-auto w-64 space-y-1 text-sm" aria-label="Order totals">
      <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPaise(totals.subtotal)}</dd></div>
      {gst === 'on' && totals.tax !== null && <div className="flex justify-between"><dt>GST</dt><dd>{formatPaise(totals.tax)}</dd></div>}
      <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd data-testid="po-total">{formatPaise(totals.total)}</dd></div>
    </dl>
  );
}
