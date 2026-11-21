'use client';
import { useState } from 'react';
import type { Checkout } from '../shared/use-checkout';
import { AddressSection, CouponBox, DeliverySection, PaymentSection, Problems, Summary } from '../shared/CheckoutParts';

const STEPS = ['Address', 'Delivery', 'Payment', 'Review'] as const;

/** Phone checkout: one short step at a time on a single page, with a sticky button for the next action. */
export function CheckoutMobile({ c }: { c: Checkout }) {
  const [step, setStep] = useState(0);
  const blocked = (c.cart.pricing?.unavailable.length ?? 0) > 0 || !c.cart.pricing;
  const needAddress = c.addressId === 'new' && (!c.form.name || !c.form.mobile || !c.form.line1 || !c.form.city || c.form.pincode.length !== 6);
  const canNext = step === 0 ? !needAddress && (c.user || /^\S+@\S+\.\S+$/.test(c.email)) : step === 1 ? !!c.dc?.ok : true;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (step < 3) setStep((s) => s + 1); else void c.place(); }} noValidate aria-label="Checkout" className="flex flex-col gap-5 pb-28">
      <ol className="flex gap-1 text-[11px] font-medium uppercase tracking-wider" aria-label="Steps">{STEPS.map((s, n) => <li key={s} aria-current={n === step ? 'step' : undefined} className={`flex-1 border-b-2 pb-1 ${n === step ? 'border-teal text-navy' : n < step ? 'border-navy text-navy' : 'border-line text-muted'}`}>{n + 1}. {s}</li>)}</ol>
      <Problems c={c} />
      {step === 0 && <AddressSection c={c} />}
      {step === 1 && <><DeliverySection c={c} /><CouponBox c={c} /></>}
      {step === 2 && <PaymentSection c={c} />}
      {step === 3 && <><h2 className="text-sm">4. Review</h2><Summary c={c} /></>}
      <div className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 flex gap-2 rounded-3xl bg-white p-2.5 shadow-overlay ring-2 ring-navy-100">
        {step > 0 && <button type="button" onClick={() => setStep((s) => s - 1)} className="min-h-12 rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-5 text-sm">Back</button>}
        <button type="submit" disabled={step < 3 ? !canNext : c.placing || blocked} aria-busy={c.placing} className="min-h-12 flex-1 rounded-sm bg-orange text-sm font-semibold uppercase tracking-wider text-navy disabled:opacity-50">{step < 3 ? 'Continue' : c.placing ? 'Placing your order…' : c.method === 'cod' ? 'Place order' : 'Place order and pay'}</button>
      </div>
    </form>
  );
}
