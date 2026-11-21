import Link from 'next/link';
import type { Metadata } from 'next';
import { sget } from '@/lib/server-api';
import type { HomeData } from '@/lib/types';
import { HeroSlider } from '@/components/shared/HeroSlider';
import { PillTabs } from '@/components/shared/PillTabs';
import { TileRow } from '@/components/shared/TileRow';
import { ProductRow } from '@/components/shared/ProductGrid';
import { Photo, isDrawnArt } from '@/components/shared/Photo';
import { isStandardSize, sortSizes } from '@/lib/sizes';

export const metadata: Metadata = { title: 'Thunikart by Krishnas Orchids | Kurtis, innerwear, nightwear and more', alternates: { canonical: '/' } };

const wrap = 'mx-auto max-w-7xl px-4 pt-14 md:px-6 md:pt-20';
const h2 = 'mb-5 text-2xl md:text-4xl';
const DEFAULT_TITLES: Record<string, string> = { strip: 'Free shipping above ₹999 | Easy returns in 7 days', categories: 'Shop by category', sizes: 'Shop by size', trending: 'Trending now', occasions: 'Shop by occasion', newArrivals: 'New arrivals', lookbook: 'Lookbook' };
const SOFT = ['bg-orange-100', 'bg-teal-100', 'bg-navy-100'];

/** Home: hero, colour strip, category tiles, shop by size, trending, shop by occasion, new arrivals and the lookbook. */
export default async function Home() {
  const h = await sget<HomeData>('/cms/home');
  const layout = h?.layout ?? ['strip', 'categories', 'sizes', 'trending', 'occasions', 'newArrivals', 'lookbook'].map((key) => ({ key, enabled: true, title: '' }));
  const title = (k: string) => layout.find((l) => l.key === k)?.title || DEFAULT_TITLES[k] || '';
  if (!h) return <p className="p-10 text-center text-sm">The store is not reachable right now. Please try again in a minute.</p>;
  const sizes = sortSizes((h.sizes ?? []).filter(isStandardSize));
  const occasions = (h.occasions ?? []).filter((o) => !isDrawnArt(o.image));
  const lookbook = (h.lookbook ?? []).filter((l) => !isDrawnArt(l.image));
  const cats = h.categories ?? [];
  // A section with nothing to show is left out, so the page never has a heading over an empty gap.
  const parts: Record<string, React.ReactNode> = {
    strip: (<>
      <div className="mx-3 mt-4 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-orange-100 via-orange-50 to-teal-100 px-4 py-3 md:mx-auto md:max-w-7xl md:px-6">
        <p className="text-sm font-bold md:text-base">{title('strip')}</p>
        {h.stripCards?.[0]?.title && <p className="hidden text-xs text-navy/70 sm:block">{h.stripCards[0].title}</p>}
      </div>
    </>),
    categories: !cats.length ? null : (<>
      <section aria-label="Shop by category" className="mt-6">
        <PillTabs label="Categories" active="all" tabs={[{ key: 'all', label: 'All', href: '/c/all' }, ...cats.map((c) => ({ key: c.slug, label: c.name, href: `/c/${c.slug}` }))]} />
        <TileRow label={title('categories')} tiles={(h.categoryCards ?? cats.map((c) => ({ title: c.name, link: `/c/${c.slug}`, image: c.image }))).map((c, i) => ({ key: `${i}-${c.title}`, label: c.title, href: c.link, image: c.image }))} />
      </section>
    </>),
    sizes: !sizes.length ? null : (<>
      <section aria-label="Shop by size" className={wrap}>
        <h2 className={h2}>{title('sizes')}</h2>
        <ul className="flex flex-wrap gap-3">{sizes.map((s, n) => <li key={s}><Link href={`/c/all?size=${encodeURIComponent(s)}`} className={`tk-press flex h-14 min-w-14 items-center justify-center rounded-full px-5 text-base font-extrabold text-navy ring-2 ring-navy hover:bg-navy hover:text-white ${SOFT[n % 3]}`}>{s}</Link></li>)}</ul>
      </section>
    </>),
    trending: !h.trending?.length ? null : (<>
      <ProductRow title={title('trending')} items={h.trending} href="/c/bestseller" />
    </>),
    occasions: !occasions.length ? null : (<>
      <section aria-label="Shop by occasion" className={wrap}>
        <h2 className={h2}>{title('occasions')}</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-5">
          {occasions.map((o, n) => (
            <li key={o.name}><Link href={o.href} className={`tk-lift block overflow-hidden rounded-xl p-2 ${SOFT[n % 3]}`}><Photo src={o.image} alt="" width={300} height={300} loading="lazy" className="aspect-square w-full rounded-lg object-cover" /><span className="block px-2 pb-2 pt-3 text-center text-sm font-extrabold">{o.name}</span></Link></li>
          ))}
        </ul>
      </section>
    </>),
    newArrivals: !h.newArrivals?.length ? null : (<>
      <ProductRow title={title('newArrivals')} items={h.newArrivals} href="/c/new-arrivals" />
    </>),
    lookbook: !lookbook.length ? null : (<>
      <section aria-label="Lookbook" className={wrap}>
        <div className="mb-5 flex items-end justify-between gap-3"><h2 className="text-2xl md:text-4xl">{title('lookbook')}</h2><Link href="/blog" className="tk-press flex min-h-11 items-center rounded-full bg-teal px-5 text-sm font-bold text-navy hover:bg-navy hover:text-white">Read the blog</Link></div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">{lookbook.map((l) => <li key={l.title}><Link href={l.href} className="tk-lift block overflow-hidden rounded-xl"><Photo src={l.image} alt={l.title} width={300} height={400} loading="lazy" className="aspect-[3/4] w-full object-cover" /></Link></li>)}</ul>
      </section>
    </>),
  };
  return (
    <>
      <HeroSlider banners={h.banners.filter((b) => !isDrawnArt(b.desktopImage) && !isDrawnArt(b.mobileImage))} />
      {layout.filter((l) => l.enabled).map((l) => <div key={l.key} className="contents">{parts[l.key]}</div>)}
    </>
  );
}
