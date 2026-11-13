import { Trash2 } from 'lucide-react';
import { formatPaise } from '@thunikart/shared';
import { Button, Input } from '@thunikart/ui';
import { TENDERS } from '../../features/pos/types';
import type { Cart } from '../../features/pos/use-cart';

/**
 * Split payment across Cash, UPI, Card, Wallet, Bank Transfer and Credit. A tender button adds a line prefilled with the amount
 * still left (as the API reports it). The amount left and the cash change due come from the API preview, not from this screen.
 */
export function TenderPanel({ cart, big }: { cart: Cart; big?: boolean }) {
  const pv = cart.preview;
  const h = big ? 'min-h-12' : 'min-h-10';
  return (
    <section aria-label="Payment" className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {TENDERS.map((t) => (
          <Button key={t} className={`${h} text-xs`} disabled={!pv} onClick={() => cart.addPayment(t, pv && pv.payment.left > 0 ? String(pv.payment.left / 100) : '')} aria-label={`Pay with ${t}`}>{t}</Button>
        ))}
      </div>
      <ul className="flex flex-col gap-2" aria-label="Payment lines">
        {cart.cart.payments.map((p) => (
          <li key={p.id} className="rounded border-2 border-navy-100 p-2">
            <div className="flex items-center gap-2">
              <span className="w-24 text-sm font-medium">{p.mode}</span>
              <Input aria-label={`${p.mode} amount`} inputMode="decimal" className={`${h} text-right`} value={p.amount} onChange={(e) => cart.setPayment(p.id, { amount: e.target.value })} />
              <button type="button" aria-label={`Remove ${p.mode} payment`} onClick={() => cart.removePayment(p.id)} className="flex h-11 w-11 shrink-0 items-center justify-center text-danger"><Trash2 size={16} /></button>
            </div>
            {p.mode !== 'Cash' && <Input aria-label={`${p.mode} reference`} className={`mt-2 ${h}`} placeholder="Reference (UPI id, card last 4, cheque)" value={p.reference} onChange={(e) => cart.setPayment(p.id, { reference: e.target.value })} />}
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-2 text-sm" aria-live="polite">
        <div className="rounded bg-mist p-2"><dt className="text-xs text-muted">Amount left</dt><dd className="text-base font-semibold" data-testid="amount-left">{pv ? formatPaise(pv.payment.left) : '–'}</dd></div>
        <div className="rounded bg-mist p-2"><dt className="text-xs text-muted">Cash change due</dt><dd className="text-base font-semibold" data-testid="change-due">{pv ? formatPaise(pv.payment.changeDue) : '–'}</dd></div>
      </dl>
    </section>
  );
}
