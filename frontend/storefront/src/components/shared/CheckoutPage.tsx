'use client';
import Link from 'next/link';
import { CheckoutDesktop } from '../desktop/CheckoutDesktop';
import { CheckoutMobile } from '../mobile/CheckoutMobile';
import { useCart } from './cart-context';
import { useCheckout } from './use-checkout';
import { useIsMobile } from './use-mobile';

export function CheckoutPage() {
  const c = useCheckout();
  const mobile = useIsMobile();
  const cart = useCart();
  if (!cart.ready || mobile === null) return <p className="py-16 text-center text-sm text-muted">Loading checkout…</p>;
  if (cart.count === 0) return <div className="py-16 text-center"><h1 className="text-2xl md:text-4xl">Your bag is empty</h1><Link href="/c/new-arrivals" className="mt-4 inline-flex min-h-12 items-center rounded-full tk-press shadow-soft hover:bg-navy hover:text-white hover:shadow-lift bg-orange px-6 text-sm font-bold text-navy">Shop new arrivals</Link></div>;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10">
      <h1 className="mb-6 text-3xl md:text-5xl">Checkout</h1>
      {mobile ? <CheckoutMobile c={c} /> : <CheckoutDesktop c={c} />}
    </div>
  );
}
