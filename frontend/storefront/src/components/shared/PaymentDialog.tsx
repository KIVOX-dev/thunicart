'use client';
import { useState } from 'react';
import { Modal } from '@thunikart/ui';
import { capi } from '@/lib/client-api';
import { MOCK_MODE, RAZORPAY_KEY } from '@/lib/config';
import { formatPaise } from '@/lib/format';
import type { Order } from '@/lib/types';

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } } }

/**
 * Payment. With a live Razorpay key it opens Razorpay checkout. In mock mode a practice window is shown instead.
 * Closing either one only moves the shopper to the Confirming screen. An order is never marked paid from the browser result:
 * the backend confirms it, and the Confirming screen waits for that.
 */
export function PaymentDialog({ order, open, onClose, onDone }: { order: Order; open: boolean; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = !MOCK_MODE && !!RAZORPAY_KEY;

  const openLive = async () => {
    if (!window.Razorpay) await new Promise<void>((res, rej) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = () => res(); s.onerror = () => rej(new Error('Could not load the payment window')); document.body.appendChild(s); });
    new window.Razorpay!({ key: RAZORPAY_KEY, order_id: order.payment.gatewayOrderId, name: 'Thunikart', description: order.number, handler: () => onDone(), modal: { ondismiss: onDone } }).open();
  };
  const pay = async () => { setBusy(true); try { await capi('POST', `/mock/payments/${order.id}/succeed`); onDone(); } finally { setBusy(false); } };
  const fail = async () => { setBusy(true); try { await capi('POST', `/mock/payments/${order.id}/fail`); setFailed(true); } finally { setBusy(false); } };

  if (live) return <Modal open={open} onClose={onClose} title="Pay securely" footer={<button type="button" onClick={onClose} className="min-h-11 px-4 text-sm underline">Not now</button>}><p className="mb-3 text-sm">You will pay {formatPaise(order.totals.total)} on the secure Razorpay window.</p><button type="button" onClick={openLive} className="min-h-12 w-full rounded-sm bg-orange text-sm font-semibold uppercase tracking-wider text-navy">Pay {formatPaise(order.totals.total)}</button></Modal>;
  return (
    <Modal open={open} onClose={onClose} title="Practice payment" footer={<button type="button" onClick={onClose} className="min-h-11 px-4 text-sm underline">Not now</button>}>
      <p className="mb-3 rounded-xl border-2 border-navy-100 bg-navy-50 p-3 text-xs">Demo mode. No money is taken. This window stands in for Razorpay.</p>
      <dl className="mb-4 text-sm"><div className="flex justify-between"><dt>Order</dt><dd>{order.number}</dd></div><div className="flex justify-between text-base font-semibold"><dt>To pay</dt><dd>{formatPaise(order.totals.total)}</dd></div></dl>
      <fieldset className="mb-4 flex flex-col gap-2"><legend className="sr-only">Pay with</legend>{['UPI', 'Card', 'Net banking', 'EMI'].map((m, i) => <label key={m} className="flex min-h-11 items-center gap-3 rounded-xl border-2 border-navy-100 p-2 text-sm"><input type="radio" name="demo-pay" defaultChecked={i === 0} className="h-4 w-4 accent-[var(--color-navy)]" />{m}</label>)}</fieldset>
      {failed && <p role="alert" className="mb-3 text-sm text-danger">The practice payment failed. You can try again before the stock hold ends.</p>}
      <div className="flex flex-col gap-2">
        <button type="button" disabled={busy} onClick={pay} className="min-h-12 rounded-sm bg-orange text-sm font-semibold uppercase tracking-wider text-navy disabled:opacity-50">Pay {formatPaise(order.totals.total)}</button>
        <button type="button" disabled={busy} onClick={fail} className="min-h-11 rounded-sm border-2 border-navy-100 text-sm">Simulate a failed payment</button>
      </div>
    </Modal>
  );
}
