'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, useToast } from '@thunikart/ui';
import { capi } from '@/lib/client-api';
import { formatPaise } from '@/lib/format';
import type { DeliveryCheck, Product } from '@/lib/types';
import { Icon } from './Icon';
import { Price } from './Price';
import { useCart } from './cart-context';
import { useWish } from './wish-context';

/**
 * The buying panel: colour swatches, size buttons (sold out sizes are crossed out, never hidden), the price block, a delivery check by
 * pincode, the stock message, Add to cart, Buy now, wishlist and compare. On phones Add to cart is a sticky bar.
 */
export function ProductBuy({ p }: { p: Product }) {
  const cart = useCart();
  const wish = useWish();
  const router = useRouter();
  const { toast } = useToast();
  const [color, setColor] = useState(p.colors[0]!.name);
  const [size, setSize] = useState<string>('');
  const [pin, setPin] = useState('');
  const [dc, setDc] = useState<DeliveryCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [chart, setChart] = useState(false);
  const [notify, setNotify] = useState('');
  const [notified, setNotified] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  useEffect(() => { wish.seen(p.id); }, [p.id]);
  const sizes = useMemo(() => [...new Set(p.variants.map((v) => v.size))], [p]);
  const variantFor = (s: string, c = color) => p.variants.find((v) => v.size === s && v.color === c);
  const only = sizes.length === 1 ? sizes[0]! : '';
  const chosen = size || only ? variantFor(size || only) : undefined;
  const shown = chosen ?? p.variants.filter((v) => v.color === color && v.stock > 0)[0] ?? p.variants[0]!;
  const colorSoldOut = !p.variants.some((v) => v.color === color && v.stock > 0);
  const liked = wish.has(p.id);
  const compared = wish.compare.includes(p.id);

  const check = async () => { setChecking(true); try { setDc(await capi<DeliveryCheck>('GET', `/delivery/check?pincode=${pin}`)); } finally { setChecking(false); } };
  const requireSize = () => { if (!chosen) { setWarn('Choose a size first.'); toast('Choose a size first', 'error'); document.getElementById('size-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return null; } if (chosen.stock < 1) { setWarn('This size is sold out.'); return null; } setWarn(null); return chosen; };
  const add = () => { const v = requireSize(); if (v) { cart.add(v.id); toast(`Added ${p.name} to your bag`, 'success'); } };
  const buy = () => { const v = requireSize(); if (v) { cart.add(v.id); cart.setDrawerOpen(false); router.push('/checkout'); } };
  const stockMsg = chosen ? (chosen.stock < 1 ? 'Out of stock' : chosen.stock <= 3 ? `Only ${chosen.stock} left` : 'In stock') : colorSoldOut ? 'Out of stock in this colour' : p.lowStock ? 'Selling fast' : 'In stock';
  const stockTone = stockMsg.startsWith('Out') ? 'text-danger' : stockMsg.startsWith('Only') || stockMsg === 'Selling fast' ? 'text-warning' : 'text-navy';

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-navy-50 p-5 md:sticky md:top-28 md:h-fit md:p-8">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{p.code}</p>
        <h1 className="mt-1 text-2xl md:text-4xl">{p.name}</h1>
        <p className="text-sm text-muted">{p.brand} · {p.fabric}</p>
      </div>
      <Price large price={shown.offer ?? shown.price} mrp={shown.mrp} />
      <p role="status" className={`flex items-center gap-1 text-sm font-medium ${stockTone}`} data-testid="stock-message"><Icon name={stockMsg.startsWith('Out') ? 'close' : 'check'} size={16} />{stockMsg}</p>

      <fieldset><legend className="mb-2 text-xs">Colour: <span className="font-semibold normal-case tracking-normal">{color}</span></legend>
        <ul className="flex flex-wrap gap-2">{p.colors.map((c) => <li key={c.name}><button type="button" aria-pressed={color === c.name} aria-label={`Colour ${c.name}`} onClick={() => { setColor(c.name); setSize(''); }} className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${color === c.name ? 'border-navy' : 'border-navy-100'}`}><span className="h-7 w-7 rounded-full border-2 border-navy-100" style={{ background: c.hex }} /></button></li>)}</ul></fieldset>

      <fieldset id="size-picker"><div className="mb-2 flex items-center justify-between"><legend className="text-xs">Size</legend><button type="button" onClick={() => setChart(true)} className="min-h-11 text-xs underline">Size chart</button></div>
        <ul className="flex flex-wrap gap-2">{sizes.map((s) => { const v = variantFor(s); const out = !v || v.stock < 1; return (
          <li key={s}><button type="button" aria-pressed={(size || only) === s} aria-disabled={out} aria-label={out ? `Size ${s}, sold out` : `Size ${s}`} onClick={() => { if (!out) { setSize(s); setWarn(null); } }} className={`relative flex h-12 min-w-12 items-center justify-center rounded-full border-2 px-4 text-sm tk-press ${size === s ? 'border-navy bg-navy text-white font-bold' : 'border-navy-100'} ${out ? 'cursor-not-allowed text-muted line-through decoration-2' : 'hover:border-navy'}`}>{s}</button></li>
        ); })}</ul>
        {warn && <p role="alert" className="mt-2 text-sm text-danger">{warn}</p>}
      </fieldset>

      {stockMsg.startsWith('Out') && (
        <form onSubmit={(e) => { e.preventDefault(); if (/^\S+@\S+\.\S+$/.test(notify)) setNotified(true); }} className="rounded-xl border-2 border-navy-100 bg-navy-50 p-3" aria-label="Notify me">
          <label htmlFor="notify" className="text-xs font-medium">Tell me when it is back</label>
          <div className="mt-2 flex gap-2"><input id="notify" type="email" value={notify} onChange={(e) => setNotify(e.target.value)} className="min-h-11 w-full rounded-md border-2 border-navy-100 px-4 text-base focus:border-teal focus:outline-none" placeholder="Your email" /><button type="submit" className="min-h-11 rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-4 text-sm">Notify me</button></div>
          {notified && <p role="status" className="mt-1 text-xs">Thank you. We will email you when it is back.</p>}
        </form>
      )}

      <div className="hidden gap-3 md:flex">
        <button type="button" onClick={add} className="min-h-12 flex-1 rounded-full tk-press shadow-soft hover:bg-navy hover:text-white hover:shadow-lift bg-orange px-6 text-sm font-bold text-navy hover:bg-navy hover:text-white">Add to cart</button>
        <button type="button" onClick={buy} className="min-h-12 flex-1 rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-6 text-sm font-semibold hover:bg-mist">Buy now</button>
      </div>
      <div className="flex gap-4 text-sm">
        <button type="button" onClick={() => wish.toggle(p.id)} aria-pressed={liked} className="flex min-h-11 items-center gap-2"><Icon name="heart" size={18} className={liked ? 'fill-orange text-orange' : ''} />{liked ? 'In your wishlist' : 'Add to wishlist'}</button>
        <button type="button" onClick={() => wish.toggleCompare(p.id)} aria-pressed={compared} className="flex min-h-11 items-center gap-2"><Icon name="compare" size={18} />{compared ? 'Added to compare' : 'Compare'}</button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void check(); }} className="rounded-xl border-2 border-navy-100 p-3" aria-label="Delivery check">
        <label htmlFor="pin" className="flex items-center gap-2 text-xs font-medium"><Icon name="truck" size={16} />Check delivery</label>
        <div className="mt-2 flex gap-2"><input id="pin" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="Pincode" className="min-h-11 w-32 rounded-md border-2 border-navy-100 px-4 text-base focus:border-teal focus:outline-none" /><button type="submit" disabled={checking || pin.length !== 6} className="min-h-11 rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-4 text-sm disabled:opacity-50">Check</button></div>
        {dc && <p role="status" className={`mt-2 text-sm ${dc.ok ? '' : 'text-danger'}`} data-testid="delivery-message">{dc.ok ? `${dc.city}: ${dc.message}` : dc.message}</p>}
      </form>

      {/* Phones: the sticky Add to cart bar sits above the bottom bar. */}
      <div aria-hidden className="h-20 md:hidden" />
      <div className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 flex items-center gap-2 rounded-3xl bg-white p-2.5 shadow-overlay ring-2 ring-navy-100 md:hidden">
        <p className="min-w-0 shrink-0 pl-1 leading-tight"><span className="block text-lg font-extrabold">{formatPaise(shown.offer ?? shown.price)}</span><span className="block text-[11px] text-muted">{chosen ? `Size ${chosen.size}` : 'Pick a size'}</span></p>
        <button type="button" onClick={add} className="tk-press min-h-12 flex-1 rounded-full bg-orange px-3 text-base font-extrabold text-navy shadow-lift">Add to cart</button>
        <button type="button" onClick={buy} className="min-h-12 rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-4 text-sm font-semibold">Buy now</button>
      </div>

      <Modal open={chart} onClose={() => setChart(false)} title="Size chart">
        {p.sizeChart.length === 0 ? <p className="text-sm">This item is one size.</p> : (
          <table className="w-full text-sm"><caption className="sr-only">Size chart</caption><thead><tr className="border-b-2 border-navy-100 text-left"><th className="py-2">Size</th><th>Chest</th><th>Length</th></tr></thead><tbody>{p.sizeChart.map((r) => <tr key={r.size} className="border-b-2 border-navy-100"><td className="py-2 font-medium">{r.size}</td><td>{r.chest}</td><td>{r.length}</td></tr>)}</tbody></table>
        )}
      </Modal>
    </div>
  );
}
