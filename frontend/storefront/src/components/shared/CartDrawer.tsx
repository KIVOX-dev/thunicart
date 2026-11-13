'use client';
import Link from 'next/link';
import { Drawer } from '@thunikart/ui';
import { formatPaise } from '@/lib/format';
import { Icon } from './Icon';
import { useCart } from './cart-context';
import { Photo } from '@/components/shared/Photo';

/** Cart drawer: the lines as priced by the API, quantity steppers, quick links and a Checkout button. */
export function CartDrawer() {
  const cart = useCart();
  const p = cart.pricing;
  const close = () => cart.setDrawerOpen(false);
  return (
    <Drawer side="right" open={cart.drawerOpen} onClose={close} title={`Your bag (${cart.count})`}
      footer={cart.count > 0 ? <div className="flex w-full flex-col gap-2"><p className="flex justify-between text-sm"><span>Subtotal</span><strong data-testid="drawer-subtotal">{p ? formatPaise(p.subtotal) : '…'}</strong></p><Link href="/checkout" onClick={close} className="flex min-h-12 items-center justify-center rounded-sm bg-orange text-sm font-semibold uppercase tracking-wider text-navy hover:bg-navy hover:text-white">Checkout</Link><Link href="/cart" onClick={close} className="flex min-h-11 items-center justify-center text-sm underline">View bag</Link></div> : undefined}>
      {cart.count === 0 ? (
        <div className="py-10 text-center"><p className="text-sm text-muted">Your bag is empty.</p><div className="mt-4 flex flex-col gap-2 text-sm"><Link href="/c/new-arrivals" onClick={close} className="underline">New arrivals</Link><Link href="/c/bestseller" onClick={close} className="underline">Bestsellers</Link></div></div>
      ) : (
        <ul className="divide-y divide-line" aria-label="Items in your bag">
          {(p?.lines ?? []).map((l) => (
            <li key={l.variantId} className="flex gap-3 py-3">
              
              <Photo src={l.image} alt="" width={72} height={96} className="h-24 w-[72px] rounded-lg object-cover" />
              <div className="min-w-0 flex-1 text-sm">
                <Link href={`/p/${l.slug}`} onClick={close} className="font-medium hover:underline">{l.name}</Link>
                <p className="text-xs text-muted">Size {l.size} · {l.color}</p>
                {l.message && <p role="alert" className="text-xs text-danger">{l.message}</p>}
                <div className="mt-2 flex items-center justify-between">
                  <span className="inline-flex items-center rounded-full border-2 border-navy-100">
                    <button type="button" aria-label={`Fewer ${l.name}`} onClick={() => cart.setQty(l.variantId, l.qty - 1)} className="flex h-11 w-11 items-center justify-center"><Icon name="minus" size={14} /></button>
                    <span className="w-8 text-center" aria-live="polite">{l.qty}</span>
                    <button type="button" aria-label={`More ${l.name}`} onClick={() => cart.setQty(l.variantId, l.qty + 1)} className="flex h-11 w-11 items-center justify-center"><Icon name="plus" size={14} /></button>
                  </span>
                  <strong>{formatPaise(l.lineTotal)}</strong>
                </div>
                <button type="button" onClick={() => cart.remove(l.variantId)} className="mt-1 min-h-11 text-xs underline" aria-label={`Remove ${l.name} from your bag`}>Remove</button>
              </div>
            </li>
          ))}
          {!p && <li className="py-6 text-sm text-muted">Loading your bag…</li>}
        </ul>
      )}
    </Drawer>
  );
}
