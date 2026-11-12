'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { capi } from '@/lib/client-api';
import { formatPaise } from '@/lib/format';
import type { Product, ProductList } from '@/lib/types';
import { useWish } from './wish-context';

/** Compare up to 4 products side by side. Add products with the Compare button on a product page. */
export function ComparePage() {
  const wish = useWish();
  const [items, setItems] = useState<Product[] | null>(null);
  const key = wish.compare.join(',');
  useEffect(() => {
    if (!key) { setItems([]); return; }
    capi<ProductList>('GET', `/catalog/products?ids=${key}&pageSize=4`).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [key]);
  if (items === null) return <p className="py-16 text-center text-sm text-muted">Loading…</p>;
  const rows: Array<[string, (p: Product) => React.ReactNode]> = [
    ['Price', (p) => formatPaise(p.fromPrice)], ['MRP', (p) => formatPaise(p.fromMrp)], ['Brand', (p) => p.brand], ['Fabric', (p) => p.fabric], ['Occasion', (p) => p.occasion],
    ['Sizes', (p) => [...new Set(p.variants.map((v) => v.size))].join(', ')], ['Colours', (p) => p.colors.map((c) => c.name).join(', ')], ['Availability', (p) => (p.inStock ? 'In stock' : 'Out of stock')],
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
      <h1 className="mb-6 text-base md:text-lg">Compare products</h1>
      {items.length === 0 ? <div className="rounded-sm border border-dashed border-line bg-mist p-10 text-center"><p className="text-sm">Nothing to compare yet. Use the Compare button on a product page.</p><Link href="/c/all" className="mt-3 inline-flex min-h-11 items-center underline">Browse products</Link></div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <caption className="sr-only">Product comparison</caption>
            <thead><tr><td />{items.map((p) => <th key={p.id} scope="col" className="p-2 text-left align-top font-medium normal-case tracking-normal"><img src={p.images[0]} alt="" width={120} height={160} className="mb-2 h-40 w-[120px] rounded-sm object-cover" /><Link href={`/p/${p.slug}`} className="hover:underline">{p.name}</Link><button type="button" onClick={() => wish.toggleCompare(p.id)} className="block min-h-11 text-xs underline">Remove</button></th>)}</tr></thead>
            <tbody>{rows.map(([label, f]) => <tr key={label} className="border-t border-line"><th scope="row" className="p-2 text-left text-xs font-medium text-muted">{label}</th>{items.map((p) => <td key={p.id} className="p-2">{f(p)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
