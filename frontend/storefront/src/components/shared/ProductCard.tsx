'use client';
import Link from 'next/link';
import type { Product } from '@/lib/types';
import { Icon } from './Icon';
import { Price } from './Price';
import { useWish } from './wish-context';
import { Photo } from '@/components/shared/Photo';

/**
 * Large image that swaps to a second image on hover (desktop) or swipe (mobile), a short uppercase code, the name, and the price block.
 * The heart sits on the image. Sold out items stay visible and say so.
 */
export function ProductCard({ p, priority }: { p: Product; priority?: boolean }) {
  const wish = useWish();
  const liked = wish.has(p.id);
  return (
    <article className="tk-lift group relative flex flex-col overflow-hidden rounded-xl bg-white p-2 ring-2 ring-navy-100 hover:ring-teal" data-testid="product-card" aria-label={p.name}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-navy-50">
        {/* Phones: swipe between the two pictures. */}
        <Link href={`/p/${p.slug}`} className="md:hidden" aria-label={p.name}>
          <div className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]">
            {p.images.slice(0, 2).map((src, i) => (
              <Photo key={src} src={src} alt={i === 0 ? p.name : ''} width={600} height={800} loading={priority ? 'eager' : 'lazy'} className="h-full w-full shrink-0 snap-center object-cover" />
            ))}
          </div>
        </Link>
        {/* Desktop: the second picture fades in on hover. */}
        <Link href={`/p/${p.slug}`} className="hidden md:block" tabIndex={-1} aria-hidden>
          
          <Photo src={p.images[0]} alt="" width={600} height={800} loading={priority ? 'eager' : 'lazy'} className="h-full w-full object-cover" />
          
          <Photo src={p.images[1] ?? p.images[0]} alt="" width={600} height={800} loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </Link>
        <button type="button" onClick={() => wish.toggle(p.id)} aria-pressed={liked} aria-label={liked ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`} className="tk-press absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-white text-navy shadow-soft hover:bg-orange">
          <Icon name="heart" size={20} className={liked ? 'fill-orange text-orange' : ''} />
        </button>
        {p.discountPct >= 10 && p.inStock && <span className="absolute left-2 top-2 -rotate-3 rounded-full bg-orange px-3 py-1 text-xs font-extrabold tracking-wide text-navy shadow-soft">SALE</span>}
        {!p.inStock && <span className="absolute inset-x-2 bottom-2 rounded-full bg-white py-1 text-center text-xs font-bold text-danger shadow-soft">Out of stock</span>}
      </div>
      <div className="mt-3 flex flex-col gap-0.5 px-1 pb-1">
        <p className="tk-eyebrow text-[10px] text-teal-700">{p.code}</p>
        <Link href={`/p/${p.slug}`} className="text-[15px] font-semibold leading-snug hover:text-teal-700">{p.name}</Link>
        <Price price={p.fromPrice} mrp={p.fromMrp} />
      </div>
    </article>
  );
}
