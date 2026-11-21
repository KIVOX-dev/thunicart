'use client';
import type { Facets } from '@/lib/types';
import { isStandardSize, sortSizes } from '@/lib/sizes';
import { useFilters } from './use-filters';

/**
 * The everyday filters as one scrolling row of chips, on a phone and on a wide screen: sizes, price, discount and in stock.
 * The full set (colour, brand, fabric and so on) is in the Filters button on a phone and the side panel on a wide screen.
 */
export function QuickFilters({ facets }: { facets: Facets }) {
  const f = useFilters();
  const chip = (on: boolean) => `tk-press flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm ${on ? 'bg-navy font-bold text-white' : 'bg-white text-navy ring-2 ring-navy-100 hover:ring-navy-200'}`;
  const sizes = sortSizes(facets.sizes).filter((s) => isStandardSize(s) || f.list('size').includes(s));
  const dot = <span aria-hidden className="mx-1 h-6 w-px shrink-0 self-center bg-navy-100" />;
  return (
    <div role="group" aria-label="Quick filters" className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:none] md:px-6">
      {f.count > 0 && <button type="button" onClick={f.clear} className="tk-press flex min-h-10 shrink-0 items-center rounded-full bg-orange px-4 text-sm font-bold text-navy">Clear all ({f.count})</button>}
      {sizes.map((s) => <button key={s} type="button" aria-pressed={f.list('size').includes(s)} onClick={() => f.toggle('size', s)} className={chip(f.list('size').includes(s))}>{s}</button>)}
      {sizes.length > 0 && dot}
      {facets.priceRanges.map((r) => <button key={r.key} type="button" aria-pressed={f.get('price') === r.key} onClick={() => f.set('price', r.key)} className={chip(f.get('price') === r.key)}>{r.label}</button>)}
      {dot}
      {['10', '20', '30'].map((d) => <button key={d} type="button" aria-pressed={f.get('discount') === d} onClick={() => f.set('discount', d)} className={chip(f.get('discount') === d)}>{d}% off+</button>)}
      <button type="button" aria-pressed={f.get('availability') === 'in'} onClick={() => f.set('availability', 'in')} className={chip(f.get('availability') === 'in')}>In stock</button>
    </div>
  );
}
