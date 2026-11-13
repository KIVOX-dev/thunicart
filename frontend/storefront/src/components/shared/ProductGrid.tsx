import type { Product } from '@/lib/types';
import { ProductCard } from './ProductCard';

/** 2 columns on a phone with 12 px gaps, 3 on a tablet and 4 on desktop with 24 px gaps. */
export function ProductGrid({ items, label }: { items: Product[]; label?: string }) {
  return (
    <ul aria-label={label ?? 'Products'} className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
      {items.map((p, i) => <li key={p.id}><ProductCard p={p} priority={i < 4} /></li>)}
    </ul>
  );
}

/** A horizontal row of cards, for trending and new arrivals. */
export function ProductRow({ title, items, href }: { title: string; items: Product[]; href?: string }) {
  if (!items.length) return null;
  return (
    <section aria-label={title} className="mx-auto max-w-7xl px-4 pt-12 md:px-6">
      <div className="mb-5 flex items-end justify-between gap-3"><h2 className="text-2xl md:text-4xl">{title}<span aria-hidden className="ml-2 inline-block h-3 w-3 rounded-full bg-orange align-middle" /></h2>{href && <a href={href} className="tk-press flex min-h-11 items-center rounded-full bg-navy px-5 text-sm font-bold text-white hover:bg-teal hover:text-navy">View all</a>}</div>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-6 pt-1 [scrollbar-width:none] md:mx-0 md:gap-6 md:px-0">
        {items.map((p) => <li key={p.id} className="w-[44vw] shrink-0 snap-start md:w-[calc(25%-18px)]"><ProductCard p={p} /></li>)}
      </ul>
    </section>
  );
}
