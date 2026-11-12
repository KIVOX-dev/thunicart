import Link from 'next/link';
import { sget } from '@/lib/server-api';
import type { ProductList } from '@/lib/types';
import { FilterSidebar } from '../desktop/FilterSidebar';
import { SortSelect } from '../desktop/SortSelect';
import { FilterSheets } from '../mobile/FilterSheets';
import { ProductGrid } from './ProductGrid';

const KEYS = ['size', 'color', 'fabric', 'brand', 'occasion', 'price', 'discount', 'availability', 'sort', 'q'];

/**
 * Product listing for a category, sale, search and so on. It renders on the server for speed and search ranking. Filters and the number of
 * loaded pages are in the URL, so Load More survives the back button and a filtered page can be shared.
 */
export async function Listing({ category, title, search, basePath }: { category?: string; title: string; search?: Record<string, string | string[] | undefined>; basePath: string }) {
  const sp = search ?? {};
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const pages = Math.max(1, Number(one('pages') ?? 1) || 1);
  const query: Record<string, string> = { pages: String(pages) };
  for (const k of KEYS) { const v = one(k); if (v) query[k] = v; }
  if (category) query.category = category;
  const data = await sget<ProductList>('/catalog/products', query);
  if (!data) return <p className="p-10 text-center text-sm">We could not load the products. Please try again.</p>;
  const next = new URLSearchParams(Object.entries(query).filter(([k]) => k !== 'category' && k !== 'pages'));
  next.set('pages', String((data.nextPage ?? pages)));
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div><h1 className="text-base md:text-lg">{title}</h1><p className="mt-1 text-sm text-muted" data-testid="result-count">{data.total} {data.total === 1 ? 'product' : 'products'}</p></div>
        <SortSelect />
      </div>
      <FilterSheets facets={data.facets} total={data.total} />
      <div className="flex gap-8 pt-4 md:pt-0">
        <FilterSidebar facets={data.facets} />
        <div className="min-w-0 flex-1">
          {data.items.length === 0 ? (
            <div className="rounded-sm border border-dashed border-line bg-mist p-10 text-center"><p className="text-sm">No products match these filters.</p><Link href={basePath} className="mt-3 inline-flex min-h-11 items-center text-sm underline">Clear all filters</Link></div>
          ) : (
            <>
              <ProductGrid items={data.items} />
              <div className="mt-8 flex flex-col items-center gap-2">
                <p className="text-xs text-muted" aria-live="polite">Showing {data.items.length} of {data.total}</p>
                {data.nextPage && <Link href={`${basePath}?${next}`} scroll={false} className="flex min-h-12 items-center rounded-sm border border-navy px-8 text-sm font-medium uppercase tracking-wider hover:bg-mist">Load more</Link>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
