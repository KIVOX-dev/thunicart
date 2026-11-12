import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config';
import { sget } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

/** The sitemap lists every product, category, page and article, from the API. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = await sget<{ products: string[]; categories: string[]; pages: string[]; blog: string[] }>('/cms/sitemap');
  const u = (path: string, priority: number) => ({ url: `${SITE_URL}${path}`, lastModified: new Date(), priority });
  return [
    u('/', 1), u('/blog', 0.5),
    ...['all', 'sale', 'bestseller', 'new-arrivals', ...(s?.categories ?? [])].map((c) => u(`/c/${c}`, 0.8)),
    ...(s?.products ?? []).map((p) => u(`/p/${p}`, 0.9)),
    ...(s?.pages ?? []).map((p) => u(`/pages/${p}`, 0.3)),
    ...(s?.blog ?? []).map((p) => u(`/blog/${p}`, 0.4)),
  ];
}
