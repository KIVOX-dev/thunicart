'use client';
import Link from 'next/link';
import type { Product } from '@/lib/types';
import { Icon } from './Icon';
import { Price } from './Price';
import { useWish } from './wish-context';

/**
 * Large image that swaps to a second image on hover (desktop) or swipe (mobile), a short uppercase code, the name, and the price block.
 * The heart sits on the image. Sold out items stay visible and say so.
 */
export function ProductCard({ p, priority }: { p: Product; priority?: boolean }) {
  const wish = useWish();
  const liked = wish.has(p.id);
  return (
    <article className="group relative" data-testid="product-card" aria-label={p.name}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-mist">
        {/* Phones: swipe between the two pictures. */}
        <Link href={`/p/${p.slug}`} className="md:hidden" aria-label={p.name}>
          <div className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]">
            {p.images.slice(0, 2).map((src, i) => (
              <img key={src} src={src} alt={i === 0 ? p.name : ''} width={600} height={800} loading={priority ? 'eager' : 'lazy'} className="h-full w-full shrink-0 snap-center object-cover" />
            ))}
          </div>
        </Link>
        {/* Desktop: the second picture fades in on hover. */}
        <Link href={`/p/${p.slug}`} className="hidden md:block" tabIndex={-1} aria-hidden>
          
          <img src={p.images[0]} alt="" width={600} height={800} loading={priority ? 'eager' : 'lazy'} className="h-full w-full object-cover" />
          
          <img src={p.images[1] ?? p.images[0]} alt="" width={600} height={800} loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </Link>
        <button type="button" onClick={() => wish.toggle(p.id)} aria-pressed={liked} aria-label={liked ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`} className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-navy hover:bg-white">
          <Icon name="heart" size={20} className={liked ? 'fill-orange text-orange' : ''} />
        </button>
        {p.discountPct >= 10 && p.inStock && <span className="absolute left-2 top-2 rounded-sm bg-orange px-2 py-0.5 text-xs font-semibold text-navy">SALE</span>}
        {!p.inStock && <span className="absolute inset-x-0 bottom-0 bg-white/90 py-1 text-center text-xs font-semibold uppercase tracking-wider text-danger">Out of stock</span>}
      </div>
      <div className="mt-2 flex flex-col gap-0.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{p.code}</p>
        <Link href={`/p/${p.slug}`} className="text-[15px] leading-snug hover:underline">{p.name}</Link>
        <Price price={p.fromPrice} mrp={p.fromMrp} />
      </div>
    </article>
  );
}
