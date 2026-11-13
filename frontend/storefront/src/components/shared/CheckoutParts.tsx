'use client';
import Link from 'next/link';
import { formatPaise } from '@/lib/format';
import type { Checkout } from './use-checkout';
import { MOCK_MODE } from '@/lib/config';
import { Photo } from '@/components/shared/Photo';

const input = 'min-h-12 w-full rounded-md border-2 border-navy-100 px-4 text-base focus:border-teal focus:outline-none aria-[invalid=true]:border-danger';

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><label htmlFor={id} className="text-xs font-medium">{label}</label>{children}{error && <p id={`${id}-err`} role="alert" className="text-xs text-danger">{error}</p>}</div>;
}

/** Address: saved addresses for a signed in shopper, or a form for a guest. The email is for the order updates. */
export function AddressSection({ c }: { c: Checkout }) {
  const f = c.form;
  const e = c.errors;
  const fld = (k: keyof typeof f, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field id={`a-${k}`} label={label} error={e[`address.${k}`]}><input id={`a-${k}`} value={f[k]} onChange={(ev) => c.set(k, ev.target.value)} aria-invalid={!!e[`address.${k}`]} aria-describedby={e[`address.${k}`] ? `a-${k}-err` : undefined} autoComplete={extra.autoComplete} inputMode={extra.inputMode} className={input} /></Field>
  );
  return (
    <section aria-label="Address" className="flex flex-col gap-4">
      <h2 className="text-sm">1. Address</h2>
      {!c.user && c.userReady && <p className="text-sm text-muted">Checking out as a guest. <Link href="/login?next=/checkout" className="underline">Sign in</Link> to use saved addresses and your wallet.</p>}
      {!c.user && <Field id="email" label="Email for order updates" error={e.email}><input id="email" type="email" autoComplete="email" value={c.email} onChange={(ev) => c.setEmail(ev.target.value)} aria-invalid={!!e.email} className={input} /></Field>}
      {c.user && c.saved.length > 0 && (
        <fieldset className="flex flex-col gap-2"><legend className="mb-1 text-xs">Deliver to</legend>
          {c.saved.map((a) => <label key={a.id} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border-2 p-3 text-sm ${c.addressId === a.id ? 'border-teal bg-teal-50' : 'border-navy-100'}`}><input type="radio" name="addr" checked={c.addressId === a.id} onChange={() => c.setAddressId(a.id)} className="mt-1 h-4 w-4 accent-[var(--color-navy)]" /><span><strong>{a.name}</strong>, {a.mobile}<br />{a.line1}{a.line2 && `, ${a.line2}`}, {a.city} {a.pincode}</span></label>)}
          <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 p-3 text-sm ${c.addressId === 'new' ? 'border-teal bg-teal-50' : 'border-navy-100'}`}><input type="radio" name="addr" checked={c.addressId === 'new'} onChange={() => c.setAddressId('new')} className="h-4 w-4 accent-[var(--color-navy)]" />Use a new address</label>
        </fieldset>
      )}
      {c.addressId === 'new' && (
        <div className="grid gap-4 md:grid-cols-2">
          {fld('name', 'Full name', { autoComplete: 'name' })}{fld('mobile', 'Mobile', { inputMode: 'tel', autoComplete: 'tel' })}
          <div className="md:col-span-2">{fld('line1', 'Address line 1', { autoComplete: 'address-line1' })}</div>
          <div className="md:col-span-2">{fld('line2', 'Address line 2 (optional)', { autoComplete: 'address-line2' })}</div>
          {fld('city', 'City', { autoComplete: 'address-level2' })}{fld('pincode', 'Pincode', { inputMode: 'numeric', autoComplete: 'postal-code' })}
        </div>
      )}
    </section>
  );
}

export function DeliverySection({ c }: { c: Checkout }) {
  return (
    <section aria-label="Delivery" className="flex flex-col gap-3">
      <h2 className="text-sm">2. Delivery</h2>
      {c.dc ? <p role="status" className={`rounded-lg border-2 p-3 text-sm ${c.dc.ok ? 'border-line bg-mist' : 'border-danger bg-danger-bg'}`} data-testid="checkout-delivery">{c.dc.ok ? `${c.dc.city}: ${c.dc.message}` : c.dc.message}</p> : <p className="text-sm text-muted">Enter your pincode in the address to see delivery time.</p>}
    </section>
  );
}

export function PaymentSection({ c }: { c: Checkout }) {
  const p = c.cart.pricing;
  return (
    <section aria-label="Payment" className="flex flex-col gap-3">
      <h2 className="text-sm">3. Payment</h2>
      <fieldset className="flex flex-col gap-2"><legend className="sr-only">Payment method</legend>
        <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 p-3 text-sm ${c.method === 'razorpay' ? 'border-teal bg-teal-50' : 'border-navy-100'}`}><input type="radio" name="pm" checked={c.method === 'razorpay'} onChange={() => c.setMethod('razorpay')} className="h-4 w-4 accent-[var(--color-navy)]" />Pay online: UPI, cards, net banking, EMI</label>
        <label className={`flex min-h-12 items-center gap-3 rounded-lg border-2 p-3 text-sm ${c.method === 'cod' ? 'border-teal bg-teal-50' : 'border-navy-100'} ${c.dc?.cod ? 'cursor-pointer' : 'cursor-not-allowed text-muted'}`}><input type="radio" name="pm" disabled={!c.dc?.cod} checked={c.method === 'cod'} onChange={() => c.setMethod('cod')} className="h-4 w-4 accent-[var(--color-navy)]" />Cash on delivery{!c.dc?.cod && <span className="text-xs"> (not available for this pincode)</span>}</label>
      </fieldset>
      {c.user && c.user.wallet > 0 && (
        <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-navy-100 p-3 text-sm"><input type="checkbox" checked={c.cart.useWallet} onChange={(e) => c.cart.setUseWallet(e.target.checked)} className="h-5 w-5 accent-[var(--color-navy)]" />Use my wallet ({formatPaise(c.user.wallet)} available){c.cart.useWallet && p && p.walletUsed > 0 && <strong className="ml-auto">-{formatPaise(p.walletUsed)}</strong>}</label>
      )}
      {MOCK_MODE && <p className="text-xs text-muted">Demo mode: a practice payment window is used instead of Razorpay.</p>}
    </section>
  );
}

/** Coupon box with the API's own success and error messages. */
export function CouponBox({ c }: { c: Checkout }) {
  const p = c.cart.pricing;
  return (
    <form onSubmit={(e) => { e.preventDefault(); c.applyCoupon(); }} className="flex flex-col gap-1" aria-label="Coupon">
      <label htmlFor="coupon" className="text-xs font-medium">Coupon code</label>
      <div className="flex gap-2"><input id="coupon" value={c.couponInput} onChange={(e) => c.setCouponInput(e.target.value)} placeholder="For example SAVE10" className={input} /><button type="submit" className="min-h-12 shrink-0 rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-4 text-sm">Apply</button></div>
      {p?.coupon && <p role="status" className="text-xs font-medium text-navy" data-testid="coupon-ok">{p.coupon.code}: {p.coupon.message}</p>}
      {p?.couponError && <p role="alert" className="text-xs text-danger" data-testid="coupon-error">{p.couponError}</p>}
    </form>
  );
}

/** Order summary: lines and totals exactly as the API priced them. The tax split shows at checkout only, and only while GST is on. */
export function Summary({ c }: { c: Checkout }) {
  const p = c.cart.pricing;
  if (!p) return <p className="text-sm text-muted">Loading your order…</p>;
  const row = 'flex justify-between';
  return (
    <section aria-label="Order summary" className="flex flex-col gap-3">
      <ul className="divide-y divide-line">{p.lines.map((l) => (
        <li key={l.variantId} className="flex gap-3 py-2 text-sm"><Photo src={l.image} alt="" width={48} height={64} className="h-16 w-12 rounded-lg object-cover" />
          <div className="min-w-0 flex-1"><p className="font-medium">{l.name}</p><p className="text-xs text-muted">Size {l.size} · {l.color} · Qty {l.qty}</p>{l.message && <p role="alert" className="text-xs text-danger">{l.message}</p>}</div><strong>{formatPaise(l.lineTotal)}</strong></li>
      ))}</ul>
      <dl className="flex flex-col gap-1 text-sm">
        <div className={row}><dt>Subtotal</dt><dd>{formatPaise(p.subtotal)}</dd></div>
        {p.discount > 0 && <div className={row}><dt>Discount</dt><dd>-{formatPaise(p.discount)}</dd></div>}
        <div className={row}><dt>Shipping</dt><dd>{p.shipping ? formatPaise(p.shipping) : 'Free'}</dd></div>
        {p.tax !== null && <div className={row}><dt>Includes GST</dt><dd data-testid="checkout-tax">{formatPaise(p.tax)}</dd></div>}
        {p.walletUsed > 0 && <div className={row}><dt>Wallet</dt><dd>-{formatPaise(p.walletUsed)}</dd></div>}
        <div className={`${row} border-t-2 border-navy-100 pt-2 text-base font-semibold`}><dt>Total</dt><dd data-testid="checkout-total">{formatPaise(p.total)}</dd></div>
      </dl>
    </section>
  );
}

/** What to do when an item went out of stock: name it and offer to remove it. */
export function Problems({ c }: { c: Checkout }) {
  const gone = c.cart.pricing?.unavailable ?? [];
  return (
    <>
      {c.banner && <div role="alert" className="rounded-lg border-2 border-danger bg-danger-bg p-3 text-sm">{c.banner.message}{c.banner.requestId && <span className="block text-xs text-muted">Request id: {c.banner.requestId}</span>}</div>}
      {gone.length > 0 && (
        <div role="alert" className="rounded-lg border-2 border-danger bg-danger-bg p-3 text-sm" data-testid="unavailable">
          <strong>Some items are not available any more.</strong>
          <ul className="mt-2 flex flex-col gap-2">{gone.map((g) => <li key={g.variantId} className="flex items-center justify-between gap-2"><span>{g.name} (size {g.size}): {g.message}</span><button type="button" onClick={() => c.cart.remove(g.variantId)} className="min-h-11 rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-3 text-xs">Remove</button></li>)}</ul>
        </div>
      )}
    </>
  );
}
