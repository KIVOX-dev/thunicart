'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatPaise } from '@/lib/format';
import { Icon } from './Icon';
import { useCart } from './cart-context';
import { Photo } from '@/components/shared/Photo';

/** The bag page: lines as the API priced them, a coupon box, and the totals. */
export function CartView() {
  const cart = useCart();
  const [code, setCode] = useState('');
  const p = cart.pricing;
  if (!cart.ready) return <p className="py-16 text-center text-sm text-muted">Loading your bag…</p>;
  if (cart.count === 0) return <div className="py-16 text-center"><h1 className="text-2xl md:text-4xl">Your bag is empty</h1><p className="mt-2 text-sm text-muted">Find something you like.</p><Link href="/c/new-arrivals" className="mt-4 inline-flex min-h-12 items-center rounded-full tk-press shadow-soft hover:bg-navy hover:text-white hover:shadow-lift bg-orange px-6 text-sm font-bold text-navy">Shop new arrivals</Link></div>;
  const blocked = !p || p.unavailable.length > 0;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
      <h1 className="mb-6 text-3xl md:text-5xl">Your bag ({cart.count})</h1>
      {p && p.unavailable.length > 0 && <div role="alert" className="mb-4 rounded-lg border-2 border-danger bg-danger-bg p-3 text-sm" data-testid="unavailable"><strong>Some items are not available any more.</strong><ul className="mt-2 flex flex-col gap-2">{p.unavailable.map((g) => <li key={g.variantId} className="flex items-center justify-between gap-2"><span>{g.name} (size {g.size}): {g.message}</span><button type="button" onClick={() => cart.remove(g.variantId)} className="min-h-11 rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-3 text-xs">Remove</button></li>)}</ul></div>}
      <div className="grid gap-8 md:grid-cols-[1fr_22rem]">
        <ul className="divide-y divide-line" aria-label="Items in your bag">
          {(p?.lines ?? []).map((l) => (
            <li key={l.variantId} className="flex gap-4 py-4">
              
              <Photo src={l.image} alt="" width={88} height={117} className="h-28 w-[84px] rounded-lg object-cover" />
              <div className="min-w-0 flex-1 text-sm">
                <Link href={`/p/${l.slug}`} className="font-medium hover:underline">{l.name}</Link>
                <p className="text-xs text-muted">Size {l.size} · {l.color}</p>
                <p className="mt-1">{formatPaise(l.price)}{l.mrp > l.price && <s className="ml-2 text-xs text-muted">{formatPaise(l.mrp)}</s>}</p>
                <div className="mt-2 flex items-center gap-4">
                  <span className="inline-flex items-center rounded-full border-2 border-navy-100"><button type="button" aria-label={`Fewer ${l.name}`} onClick={() => cart.setQty(l.variantId, l.qty - 1)} className="flex h-11 w-11 items-center justify-center"><Icon name="minus" size={14} /></button><span className="w-8 text-center" data-testid={`cart-qty-${l.variantId}`}>{l.qty}</span><button type="button" aria-label={`More ${l.name}`} onClick={() => cart.setQty(l.variantId, l.qty + 1)} className="flex h-11 w-11 items-center justify-center"><Icon name="plus" size={14} /></button></span>
                  <button type="button" onClick={() => cart.remove(l.variantId)} className="min-h-11 text-xs underline" aria-label={`Remove ${l.name} from your bag`}>Remove</button>
                </div>
              </div>
              <strong className="text-sm">{formatPaise(l.lineTotal)}</strong>
            </li>
          ))}
        </ul>
        <aside className="h-fit rounded-xl border-2 border-navy-100 p-5" aria-label="Order totals">
          <form onSubmit={(e) => { e.preventDefault(); cart.setCoupon(code.trim()); }} className="mb-4 flex flex-col gap-1" aria-label="Coupon">
            <label htmlFor="coupon" className="text-xs font-medium">Coupon code</label>
            <div className="flex gap-2"><input id="coupon" value={code} onChange={(e) => setCode(e.target.value)} className="min-h-12 w-full rounded-md border-2 border-navy-100 px-4 text-base focus:border-teal focus:outline-none" placeholder="For example SAVE10" /><button type="submit" className="min-h-12 shrink-0 rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-4 text-sm">Apply</button></div>
            {p?.coupon && <p role="status" className="text-xs font-medium" data-testid="coupon-ok">{p.coupon.code}: {p.coupon.message}</p>}
            {p?.couponError && <p role="alert" className="text-xs text-danger" data-testid="coupon-error">{p.couponError}</p>}
          </form>
          {p && (
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd data-testid="cart-subtotal">{formatPaise(p.subtotal)}</dd></div>
              {p.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd data-testid="cart-discount">-{formatPaise(p.discount)}</dd></div>}
              <div className="flex justify-between"><dt>Shipping</dt><dd>{p.shipping ? formatPaise(p.shipping) : 'Free'}</dd></div>
              <div className="flex justify-between border-t-2 border-navy-100 pt-2 text-base font-semibold"><dt>Total</dt><dd data-testid="cart-total">{formatPaise(p.total)}</dd></div>
            </dl>
          )}
          <Link href="/checkout" aria-disabled={blocked} className={`mt-5 flex min-h-12 items-center justify-center rounded-sm bg-orange text-sm font-semibold uppercase tracking-wider text-navy hover:bg-navy hover:text-white ${blocked ? 'pointer-events-none opacity-50' : ''}`}>Checkout</Link>
          <p className="mt-2 text-center text-xs text-muted">Free shipping above ₹999</p>
        </aside>
      </div>
    </div>
  );
}
