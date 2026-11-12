import { formatDate, formatPaise } from '@thunikart/shared';
import { Badge, ListSkeleton } from '@thunikart/ui';
import type { Customer } from '../features/catalog/types';
import { useCustomerLedgers } from '../features/catalog/use-parties';
import { QueryError } from './ErrorBanner';

/** Outstanding, loyalty and wallet are read only. They change only through bills, returns and receipts. */
export function LedgerPanel({ customer }: { customer: Customer }) {
  const l = useCustomerLedgers(customer.id);
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded border border-line p-3"><dt className="text-xs text-muted">Outstanding</dt><dd className="font-semibold">{formatPaise(customer.outstanding)}</dd></div>
        <div className="rounded border border-line p-3"><dt className="text-xs text-muted">Loyalty points</dt><dd className="font-semibold">{customer.loyaltyPoints}</dd></div>
        <div className="rounded border border-line p-3"><dt className="text-xs text-muted">Wallet</dt><dd className="font-semibold">{formatPaise(customer.walletBalance)}</dd></div>
      </dl>
      <Badge className="self-start">Read only. Changes come from bills, returns and receipts.</Badge>
      {l.isPending ? <ListSkeleton rows={2} label="Loading ledgers" /> : l.isError ? <QueryError error={l.error} onRetry={() => l.refetch()} /> : (
        <>
          {([['Loyalty ledger', l.data.loyalty, false], ['Wallet ledger', l.data.wallet, true]] as const).map(([title, rows, money]) => (
            <section key={title} aria-label={title}>
              <h3 className="mb-1 text-xs">{title}</h3>
              {rows.length === 0 ? <p className="text-sm text-muted">No entries yet.</p> : (
                <ul className="divide-y divide-line rounded border border-line text-sm">
                  {rows.map((r) => <li key={r.id} className="flex justify-between p-2"><span>{r.note}<span className="block text-xs text-muted">{formatDate(r.at)}</span></span><span>{money ? formatPaise(r.amount) : r.amount}</span></li>)}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
