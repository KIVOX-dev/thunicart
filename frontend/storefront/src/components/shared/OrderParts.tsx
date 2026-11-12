'use client';
import { useEffect, useState } from 'react';
import { formatPaise } from '@/lib/format';
import type { Order } from '@/lib/types';

export const STATUS_LABEL: Record<Order['status'], string> = { 'pending-payment': 'Waiting for payment', paid: 'Confirmed', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', 'return-requested': 'Return requested', returned: 'Returned' };

/** Counts down the 15 minute stock hold. */
export function HoldCountdown({ until }: { until: string }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(until).getTime() - Date.now()));
  useEffect(() => { const t = setInterval(() => setLeft(Math.max(0, new Date(until).getTime() - Date.now())), 1000); return () => clearInterval(t); }, [until]);
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return <span data-testid="hold-countdown" role="timer" aria-live="off">{left > 0 ? `${m}:${String(s).padStart(2, '0')}` : 'Time is up'}</span>;
}

export function OrderSummary({ o }: { o: Order }) {
  const row = 'flex justify-between';
  return (
    <section aria-label="Order summary" className="flex flex-col gap-4">
      <ul className="divide-y divide-line">{o.lines.map((l) => (
        <li key={l.variantId} className="flex gap-3 py-2 text-sm"><img src={l.image} alt="" width={48} height={64} className="h-16 w-12 rounded-sm object-cover" /><div className="min-w-0 flex-1"><p className="font-medium">{l.name}</p><p className="text-xs text-muted">Size {l.size} · {l.color} · Qty {l.qty}</p></div><strong>{formatPaise(l.lineTotal)}</strong></li>
      ))}</ul>
      <dl className="flex flex-col gap-1 text-sm">
        <div className={row}><dt>Subtotal</dt><dd>{formatPaise(o.totals.subtotal)}</dd></div>
        {o.totals.discount > 0 && <div className={row}><dt>Discount</dt><dd>-{formatPaise(o.totals.discount)}</dd></div>}
        <div className={row}><dt>Shipping</dt><dd>{o.totals.shipping ? formatPaise(o.totals.shipping) : 'Free'}</dd></div>
        {o.totals.tax !== null && <div className={row}><dt>Includes GST</dt><dd>{formatPaise(o.totals.tax)}</dd></div>}
        {o.totals.walletUsed > 0 && <div className={row}><dt>Wallet</dt><dd>-{formatPaise(o.totals.walletUsed)}</dd></div>}
        <div className={`${row} border-t border-line pt-2 text-base font-semibold`}><dt>Total</dt><dd data-testid="order-total">{formatPaise(o.totals.total)}</dd></div>
      </dl>
      <address className="text-sm not-italic"><strong>Delivering to</strong><br />{o.address.name}, {o.address.mobile}<br />{o.address.line1}{o.address.line2 && `, ${o.address.line2}`}<br />{o.address.city} {o.address.pincode}</address>
    </section>
  );
}

/** Tracking timeline, newest last. */
export function Tracking({ o }: { o: Order }) {
  return (
    <ol className="flex flex-col gap-3 border-l-2 border-line pl-4" aria-label="Order tracking">
      {o.tracking.map((t, i) => <li key={i} className="relative text-sm"><span aria-hidden className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-teal" /><strong>{t.status}</strong><span className="block text-xs text-muted">{new Date(t.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}{t.note && ` · ${t.note}`}</span></li>)}
    </ol>
  );
}
