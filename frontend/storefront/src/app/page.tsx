import Link from 'next/link';
import type { Metadata } from 'next';
import { sget } from '@/lib/server-api';
import type { HomeData } from '@/lib/types';
import { HeroSlider } from '@/components/shared/HeroSlider';
import { ProductRow } from '@/components/shared/ProductGrid';

export const metadata: Metadata = { title: 'Thunikart by Krishnas Orchids | Kurtis, innerwear, nightwear and more', alternates: { canonical: '/' } };

const tile = 'group block';
const label = 'mt-2 block text-center text-xs font-medium uppercase tracking-heading';

/** Home: hero slideshow, category tiles, shop by size, shop by occasion, trending and new arrival rows, lookbook strip. */
export default async function Home() {
  const h = await sget<HomeData>('/cms/home');
  if (!h) return <p className="p-10 text-center text-sm">The store is not reachable right now. Please try again in a minute.</p>;
  return (
    <>
      <HeroSlider banners={h.banners} />
      <section aria-label="Shop by category" className="mx-auto max-w-7xl px-4 pt-12 md:px-6">
        <h2 className="mb-4 text-sm md:text-base">Shop by category</h2>
        <ul className="grid grid-cols-3 gap-3 md:grid-cols-6 md:gap-6">
          {h.categories.map((c) => (
            <li key={c.slug}><Link href={`/c/${c.slug}`} className={tile}><img src={c.image} alt="" width={240} height={240} loading="lazy" className="aspect-square w-full rounded-sm object-cover" /><span className={label}>{c.name}</span></Link></li>
          ))}
        </ul>
      </section>
      <section aria-label="Shop by size" className="mx-auto max-w-7xl px-4 pt-12 md:px-6">
        <h2 className="mb-4 text-sm md:text-base">Shop by size</h2>
        <ul className="flex flex-wrap gap-2">{h.sizes.map((s) => <li key={s}><Link href={`/c/all?size=${encodeURIComponent(s)}`} className="flex h-14 min-w-14 items-center justify-center rounded-sm border border-navy px-3 text-sm font-semibold hover:bg-navy hover:text-white">{s}</Link></li>)}</ul>
      </section>
      <ProductRow title="Trending now" items={h.trending} href="/c/bestseller" />
      <section aria-label="Shop by occasion" className="mx-auto max-w-7xl px-4 pt-12 md:px-6">
        <h2 className="mb-4 text-sm md:text-base">Shop by occasion</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-6">
          {h.occasions.map((o) => <li key={o.name}><Link href={o.href} className={tile}><img src={o.image} alt="" width={300} height={300} loading="lazy" className="aspect-square w-full rounded-sm object-cover" /><span className={label}>{o.name}</span></Link></li>)}
        </ul>
      </section>
      <ProductRow title="New arrivals" items={h.newArrivals} href="/c/new-arrivals" />
      <section aria-label="Lookbook" className="mx-auto max-w-7xl px-4 pt-12 md:px-6">
        <div className="mb-4 flex items-end justify-between"><h2 className="text-sm md:text-base">Lookbook</h2><Link href="/blog" className="flex min-h-11 items-center text-xs font-medium uppercase tracking-wider underline">Read the blog</Link></div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">{h.lookbook.map((l) => <li key={l.title}><Link href={l.href}><img src={l.image} alt={l.title} width={300} height={400} loading="lazy" className="aspect-[3/4] w-full rounded-sm object-cover" /></Link></li>)}</ul>
      </section>
    </>
  );
}
