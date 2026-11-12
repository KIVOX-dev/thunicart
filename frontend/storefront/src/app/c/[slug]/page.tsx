import type { Metadata } from 'next';
import { Listing } from '@/components/shared/Listing';
import { sget } from '@/lib/server-api';
import type { Category } from '@/lib/types';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const SPECIAL: Record<string, string> = { all: 'All products', sale: 'Sale', bestseller: 'Bestsellers', 'new-arrivals': 'New arrivals' };

async function nameOf(slug: string): Promise<string> {
  if (SPECIAL[slug]) return SPECIAL[slug]!;
  const cats = (await sget<Category[]>('/catalog/categories')) ?? [];
  const hit = cats.find((c) => c.slug === slug) ?? cats.flatMap((c) => c.children).find((c) => c.slug === slug);
  return hit?.name ?? 'Products';
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const name = await nameOf(slug);
  return { title: name, description: `Shop ${name} at Thunikart. Easy returns and free shipping above ₹999.`, alternates: { canonical: `/c/${slug}` }, robots: Object.keys(sp).length ? { index: false, follow: true } : undefined, openGraph: { title: `${name} | Thunikart` } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  return <Listing category={slug} title={await nameOf(slug)} search={await searchParams} basePath={`/c/${slug}`} />;
}
