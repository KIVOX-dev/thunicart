'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, capi } from '@/lib/client-api';
import type { Order } from '@/lib/types';
import { HoldCountdown, OrderSummary, STATUS_LABEL, Tracking } from './OrderParts';
import { PaymentDialog } from './PaymentDialog';

/**
 * After checkout. While the payment is being confirmed this screen polls the order until the backend says it is paid.
 * It never marks an order paid from the browser's payment result alone.
 */
export function OrderView({ id }: { id: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [payOpen, setPayOpen] = useState(sp.get('pay') === '1');
  const [confirming, setConfirming] = useState(sp.get('confirming') === '1');
  const [tries, setTries] = useState(0);
  const [push, setPush] = useState<'idle' | 'on' | 'off'>('idle');

  const load = useCallback(async () => { try { setOrder(await capi<Order>('GET', `/orders/${id}`)); setError(null); } catch (e) { setError(e instanceof ApiError ? e : null); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!order || order.status !== 'pending-payment' || !confirming) return;
    const t = setInterval(() => { setTries((n) => n + 1); void load(); }, 1000);
    return () => clearInterval(t);
  }, [order, confirming, load]);

  if (error) return <div className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-2xl md:text-4xl">We could not open this order</h1><p role="alert" className="mt-2 text-sm">{error.friendly}</p>{error.requestId && <p className="text-xs text-muted">Request id: {error.requestId}</p>}<Link href="/account/orders" className="mt-4 inline-flex min-h-11 items-center underline">My orders</Link></div>;
  if (!order) return <p className="py-16 text-center text-sm text-muted">Loading your order…</p>;

  const pending = order.status === 'pending-payment';
  const timedOut = confirming && pending && tries > 60;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
      {pending && confirming && (
        <div role="status" aria-live="polite" className="mb-6 rounded-xl border-2 border-navy-100 bg-navy-50 p-6 text-center" data-testid="confirming">
          <h1 className="text-2xl md:text-4xl">Confirming your payment</h1>
          <p className="mt-2 text-sm">{timedOut ? 'We have not heard back from the bank yet. Your order is safe and your items are held. Refresh in a minute, or check My orders.' : 'Please wait. We are waiting for the bank to confirm. Do not close this page.'}</p>
          {!timedOut && <div aria-hidden className="mx-auto mt-4 h-8 w-8 animate-spin rounded-full border-4 border-line border-t-teal" />}
        </div>
      )}
      {pending && !confirming && (
        <div className="mb-6 rounded-xl border-2 border-navy-100 p-5" data-testid="pay-pending">
          <h1 className="text-2xl md:text-4xl">Complete your payment</h1>
          <p className="mt-1 text-sm">Your items are held for <strong><HoldCountdown until={order.holdUntil ?? new Date().toISOString()} /></strong>. After that the order is cancelled and the stock goes back.</p>
          <button type="button" onClick={() => setPayOpen(true)} className="mt-4 min-h-12 rounded-full tk-press shadow-soft hover:bg-navy hover:text-white hover:shadow-lift bg-orange px-6 text-sm font-bold text-navy hover:bg-navy hover:text-white">Pay now</button>
        </div>
      )}
      {order.status === 'cancelled' && <div role="alert" className="mb-6 rounded-lg border-2 border-danger bg-danger-bg p-5"><h1 className="text-2xl md:text-4xl">This order was cancelled</h1><p className="mt-1 text-sm">{order.tracking.at(-1)?.note}</p><Link href="/" className="mt-3 inline-flex min-h-11 items-center underline">Continue shopping</Link></div>}
      {!pending && order.status !== 'cancelled' && (
        <div className="mb-6 rounded-xl border-2 border-teal bg-teal-50 p-6 text-center" data-testid="order-success">
          <h1 className="text-2xl md:text-4xl">Thank you. Your order is confirmed.</h1>
          <p className="mt-2 text-sm">Order <strong data-testid="order-number">{order.number}</strong> · {STATUS_LABEL[order.status]}</p>
          {order.emailSent && <p className="mt-1 text-sm" data-testid="email-notice">We have sent a confirmation email with your order details.</p>}
          {order.payment.method === 'cod' && <p className="mt-1 text-sm">Pay {`when it arrives`}.</p>}
          {typeof Notification !== 'undefined' && push === 'idle' && Notification.permission === 'default' && (
            <div className="mt-4 rounded-sm bg-white p-3 text-sm"><p>Want an alert when your order ships?</p><div className="mt-2 flex justify-center gap-2"><button type="button" onClick={async () => setPush((await Notification.requestPermission()) === 'granted' ? 'on' : 'off')} className="min-h-11 rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-4 text-xs">Turn on alerts</button><button type="button" onClick={() => setPush('off')} className="min-h-11 px-3 text-xs underline">Not now</button></div></div>
          )}
          {push === 'on' && <p role="status" className="mt-3 text-sm">Alerts are on.</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-3"><Link href={`/account/orders/${order.id}`} className="inline-flex min-h-11 items-center rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-5 text-sm">Track my order</Link><Link href="/" className="inline-flex min-h-11 items-center px-3 text-sm underline">Continue shopping</Link></div>
        </div>
      )}
      <div className="grid gap-8 md:grid-cols-2"><OrderSummary o={order} /><div><h2 className="mb-3 text-xs">Tracking</h2><Tracking o={order} /></div></div>
      <PaymentDialog order={order} open={payOpen && pending} onClose={() => setPayOpen(false)} onDone={() => { setPayOpen(false); setConfirming(true); router.replace(`/order/${order.id}?confirming=1`); }} />
    </div>
  );
}
