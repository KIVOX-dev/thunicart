import { Banknote, Check, Smartphone, Trash2, Wallet } from 'lucide-react';
import { formatPaise } from '@thunikart/shared';
import { Input } from '@thunikart/ui';
import { POS_TENDERS, type Tender } from '../../features/pos/types';
import type { Cart } from '../../features/pos/use-cart';

const ICON: Record<(typeof POS_TENDERS)[number], typeof Banknote> = { Cash: Banknote, UPI: Smartphone, Wallet };
/** Loyalty: 1 point for every Rs 100 on the bill (the Settings rate, shown here as a hint only). */
const POINTS_PER_100 = 1;

/**
 * Payment for the counter: Cash, UPI and the customer's Wallet, split as needed. A tile adds a line prefilled with the amount
 * still left (as the API reports it). The wallet card is found by the customer's phone number and shows the wallet and the points.
 * The amount left and the cash change due come from the API preview, not from this screen.
 */
export function TenderPanel({ cart, big }: { cart: Cart; big?: boolean }) {
  const pv = cart.preview;
  const h = big ? 'min-h-12' : 'min-h-10';
  const c = cart.cart.customer;
  const wallet = c?.walletBalance ?? 0;
  const points = c?.loyaltyPoints ?? 0;
  const walletUsed = Math.round(cart.cart.payments.filter((p) => p.mode === 'Wallet').reduce((a, p) => a + (Number(p.amount) || 0) * 100, 0));
  const walletLeft = Math.max(0, wallet - walletUsed);
  const earn = pv ? Math.floor((pv.totals.grandTotal / 10000) * POINTS_PER_100) : 0;
  const add = (t: Tender) => {
    const left = pv && pv.payment.left > 0 ? pv.payment.left : 0;
    const amt = t === 'Wallet' ? Math.min(left, walletLeft) : left;
    cart.addPayment(t, amt > 0 ? String(amt / 100) : '');
  };
  return (
    <section aria-label="Payment" className="flex flex-col gap-3">
      <div aria-label="Customer wallet" className="rounded-xl border-2 border-navy-100 bg-mist p-3">
        <p className="truncate text-xs text-muted">{c ? `${c.name} · ${c.mobile}` : 'Enter the customer mobile number to use the wallet and earn points'}</p>
        <dl className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white p-2"><dt className="text-xs text-muted">Wallet</dt><dd className="text-lg font-bold" data-testid="wallet-balance">{formatPaise(wallet)}</dd></div>
          <div className="rounded-lg bg-white p-2"><dt className="text-xs text-muted">Points</dt><dd className="text-lg font-bold" data-testid="wallet-points">{points}{c && earn > 0 && <span className="ml-1 text-xs font-medium text-success">+{earn} on this bill</span>}</dd></div>
        </dl>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Add a payment">
        {POS_TENDERS.map((t) => {
          const Icon = ICON[t];
          const used = cart.cart.payments.some((p) => p.mode === t);
          const off = !pv || (t === 'Wallet' && walletLeft <= 0);
          return (
            <button key={t} type="button" disabled={off} onClick={() => add(t)} aria-label={`Pay with ${t}`} aria-pressed={used}
              className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${big ? 'min-h-16' : 'min-h-14'} ${used ? 'border-navy-900 bg-navy-900 text-white' : 'border-navy-100 bg-white text-navy-900 hover:border-navy-900'}`}>
              {used && <Check size={14} className="absolute right-2 top-2" aria-hidden />}
              <Icon size={20} aria-hidden />{t}
            </button>
          );
        })}
      </div>
      <ul className="flex flex-col gap-2" aria-label="Payment lines">
        {cart.cart.payments.map((p) => (
          <li key={p.id} className="rounded border-2 border-navy-100 p-2">
            <div className="flex items-center gap-2">
              <span className="w-20 text-sm font-medium">{p.mode}</span>
              <Input aria-label={`${p.mode} amount`} inputMode="decimal" className={`${h} text-right`} value={p.amount} onChange={(e) => cart.setPayment(p.id, { amount: e.target.value })} />
              <button type="button" aria-label={`Remove ${p.mode} payment`} onClick={() => cart.removePayment(p.id)} className="flex h-11 w-11 shrink-0 items-center justify-center text-danger"><Trash2 size={16} /></button>
            </div>
            {p.mode === 'UPI' && <Input aria-label="UPI reference" className={`mt-2 ${h}`} placeholder="UPI reference (optional)" value={p.reference} onChange={(e) => cart.setPayment(p.id, { reference: e.target.value })} />}
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
