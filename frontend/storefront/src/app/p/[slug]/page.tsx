import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/lib/config';
import { sget } from '@/lib/server-api';
import type { Product, ProductList } from '@/lib/types';
import { DetailTabs } from '@/components/shared/DetailTabs';
import { Gallery } from '@/components/shared/Gallery';
import { ProductGrid } from '@/components/shared/ProductGrid';
import { ProductBuy } from '@/components/shared/ProductBuy';
import { RecentlyViewed } from '@/components/shared/RecentlyViewed';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await sget<Product>(`/catalog/products/${slug}`);
  if (!p) return { title: 'Product not found' };
  return {
    title: p.name, description: `${p.name} by ${p.brand}. ${p.description}`, alternates: { canonical: `/p/${p.slug}` },
    openGraph: { title: p.name, description: p.description, type: 'website', images: [{ url: `${SITE_URL}${p.images[0]}` }] },
  };
}

/** Product page, rendered on the server with Product structured data (name, image, price, availability). */
export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const p = await sget<Product>(`/catalog/products/${slug}`);
  if (!p) notFound();
  const related = (await sget<ProductList>('/catalog/products', { category: p.subSlug, pageSize: 5 }))?.items.filter((x) => x.id !== p.id).slice(0, 4) ?? [];
  const look = (await sget<ProductList>('/catalog/products', { category: p.typeSlug === 'accessories' ? 'kurtis' : 'accessories', pageSize: 4 }))?.items ?? [];
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.code, brand: { '@type': 'Brand', name: p.brand }, description: p.description, image: p.images.map((i) => `${SITE_URL}${i}`),
    offers: { '@type': 'Offer', priceCurrency: 'INR', price: (p.fromPrice / 100).toFixed(2), availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: `${SITE_URL}/p/${p.slug}` },
  };
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-32 md:px-6 md:py-10 md:pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <nav aria-label="Breadcrumb" className="mb-4 text-xs font-medium text-muted"><ol className="flex gap-1"><li><Link href="/" className="hover:underline">Home</Link></li><li aria-hidden>/</li><li><Link href={`/c/${p.categorySlug}`} className="hover:underline">{p.category}</Link></li><li aria-hidden>/</li><li><Link href={`/c/${p.subSlug}`} className="hover:underline">{p.typeName}</Link></li><li aria-hidden>/</li><li aria-current="page" className="text-navy">{p.name}</li></ol></nav>
      <div className="grid gap-8 md:grid-cols-[1.2fr_1fr] md:gap-12">
        <Gallery images={p.images} name={p.name} />
        <ProductBuy p={p} />
      </div>
      <div className="mt-12"><DetailTabs p={p} /></div>
      {related.length > 0 && <section aria-label="Related products" className="mt-12"><h2 className="mb-5 text-2xl md:text-4xl">You may also like</h2><ProductGrid items={related} /></section>}
      {look.length > 0 && <section aria-label="Complete the look" className="mt-12"><h2 className="mb-5 text-2xl md:text-4xl">Complete the look</h2><ProductGrid items={look} /></section>}
      <RecentlyViewed excludeId={p.id} />
    </div>
  );
}
