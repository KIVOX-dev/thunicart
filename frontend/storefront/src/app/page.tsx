import Link from 'next/link';
import type { Metadata } from 'next';
import { sget } from '@/lib/server-api';
import type { HomeData } from '@/lib/types';
import { HeroSlider } from '@/components/shared/HeroSlider';
import { ProductRow } from '@/components/shared/ProductGrid';
import { Photo, isDrawnArt } from '@/components/shared/Photo';

export const metadata: Metadata = { title: 'Thunikart by Krishnas Orchids | Kurtis, innerwear, nightwear and more', alternates: { canonical: '/' } };

const wrap = 'mx-auto max-w-7xl px-4 pt-14 md:px-6 md:pt-20';
const h2 = 'mb-5 text-2xl md:text-4xl';
/** Colour blocks cycle through the three brand colours. Navy text sits on orange and teal, white text only on navy. */
const BLOCKS = [
  { bg: 'bg-navy text-white', chip: 'bg-orange text-navy' },
  { bg: 'bg-orange text-navy', chip: 'bg-navy text-white' },
  { bg: 'bg-teal text-navy', chip: 'bg-navy text-white' },
];
const SOFT = ['bg-orange-100', 'bg-teal-100', 'bg-navy-100'];
const STRIP = ['Free shipping above ₹999', 'Easy returns in 7 days', 'New arrivals every week', 'Made for everyday comfort', 'Pattanam, Coimbatore'];

/** Home: hero, colour strip, category tiles, shop by size, trending, shop by occasion, new arrivals and the lookbook. */
export default async function Home() {
  const h = await sget<HomeData>('/cms/home');
  if (!h) return <p className="p-10 text-center text-sm">The store is not reachable right now. Please try again in a minute.</p>;
  return (
    <>
      <HeroSlider banners={h.banners.filter((b) => !isDrawnArt(b.desktopImage) && !isDrawnArt(b.mobileImage))} />
      <div aria-hidden className="mt-6 overflow-hidden bg-navy py-3 text-white md:mt-10">
        <div className="tk-marquee">
          {[...STRIP, ...STRIP, ...STRIP, ...STRIP].map((t, i) => <span key={i} className="mx-6 flex items-center gap-6 whitespace-nowrap text-sm font-extrabold uppercase tracking-widest md:text-base">{t}<span className={`h-3 w-3 rounded-full ${i % 2 ? 'bg-teal' : 'bg-orange'}`} /></span>)}
        </div>
      </div>
      <section aria-label="Shop by category" className={wrap}>
        <h2 className={h2}>Shop by category</h2>
        <ul className="grid gap-4 md:grid-cols-2 md:gap-6">
          {h.categories.map((c, n) => {
            const b = BLOCKS[n % BLOCKS.length]!;
            return (
              <li key={c.slug}>
                <Link href={`/c/${c.slug}`} className={`tk-lift group relative flex min-h-48 items-end justify-between overflow-hidden rounded-2xl p-6 md:min-h-72 md:p-8 ${b.bg}`}>
                  <Photo src={c.image} alt="" width={480} height={480} loading="lazy" className="absolute inset-y-0 right-0 h-full w-2/5 object-cover opacity-90 transition-transform duration-500 group-hover:scale-105" />
                  <span className="relative">
                    <span className="tk-display block">{c.name}</span>
                    <span className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-bold ${b.chip}`}>Shop {c.name.toLowerCase()} <span aria-hidden>→</span></span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-label="Shop by size" className={wrap}>
        <h2 className={h2}>Shop by size</h2>
        <ul className="flex flex-wrap gap-3">{h.sizes.map((s, n) => <li key={s}><Link href={`/c/all?size=${encodeURIComponent(s)}`} className={`tk-press flex h-14 min-w-14 items-center justify-center rounded-full px-5 text-base font-extrabold text-navy ring-2 ring-navy hover:bg-navy hover:text-white ${SOFT[n % 3]}`}>{s}</Link></li>)}</ul>
      </section>
      <ProductRow title="Trending now" items={h.trending} href="/c/bestseller" />
      <section aria-label="Shop by occasion" className={wrap}>
        <h2 className={h2}>Shop by occasion</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-5">
          {h.occasions.filter((o) => !isDrawnArt(o.image)).map((o, n) => (
            <li key={o.name}><Link href={o.href} className={`tk-lift block overflow-hidden rounded-xl p-2 ${SOFT[n % 3]}`}><Photo src={o.image} alt="" width={300} height={300} loading="lazy" className="aspect-square w-full rounded-lg object-cover" /><span className="block px-2 pb-2 pt-3 text-center text-sm font-extrabold">{o.name}</span></Link></li>
          ))}
        </ul>
      </section>
      <ProductRow title="New arrivals" items={h.newArrivals} href="/c/new-arrivals" />
      <section aria-label="Lookbook" className={wrap}>
        <div className="mb-5 flex items-end justify-between gap-3"><h2 className="text-2xl md:text-4xl">Lookbook</h2><Link href="/blog" className="tk-press flex min-h-11 items-center rounded-full bg-teal px-5 text-sm font-bold text-navy hover:bg-navy hover:text-white">Read the blog</Link></div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">{h.lookbook.filter((l) => !isDrawnArt(l.image)).map((l) => <li key={l.title}><Link href={l.href} className="tk-lift block overflow-hidden rounded-xl"><Photo src={l.image} alt={l.title} width={300} height={400} loading="lazy" className="aspect-[3/4] w-full object-cover" /></Link></li>)}</ul>
      </section>
    </>
  );
}
