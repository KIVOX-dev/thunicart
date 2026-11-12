'use client';
import type { Checkout } from '../shared/use-checkout';
import { AddressSection, CouponBox, DeliverySection, PaymentSection, Problems, Summary } from '../shared/CheckoutParts';

/** Desktop checkout: one page, the form on the left and the order summary beside it. */
export function CheckoutDesktop({ c }: { c: Checkout }) {
  const blocked = (c.cart.pricing?.unavailable.length ?? 0) > 0 || !c.cart.pricing;
  return (
    <div className="grid grid-cols-[1fr_26rem] gap-12">
      <form onSubmit={(e) => { e.preventDefault(); void c.place(); }} className="flex flex-col gap-8" noValidate aria-label="Checkout">
        <Problems c={c} />
        <AddressSection c={c} />
        <DeliverySection c={c} />
        <PaymentSection c={c} />
        <section aria-label="Review" className="flex flex-col gap-3"><h2 className="text-sm">4. Review and place the order</h2>
          <button type="submit" disabled={c.placing || blocked} aria-busy={c.placing} className="min-h-12 rounded-sm bg-orange px-8 text-sm font-semibold uppercase tracking-wider text-navy hover:bg-navy hover:text-white disabled:opacity-50">{c.placing ? 'Placing your order…' : c.method === 'cod' ? 'Place order' : 'Place order and pay'}</button>
        </section>
      </form>
      <aside className="sticky top-6 h-fit rounded-sm border border-line p-5" aria-label="Your order"><h2 className="mb-3 text-sm">Your order</h2><CouponBox c={c} /><div className="mt-5"><Summary c={c} /></div></aside>
    </div>
  );
}
