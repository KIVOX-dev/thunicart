'use client';
import { useEffect, useState } from 'react';
import { capi } from '@/lib/client-api';
import type { Product, ProductList } from '@/lib/types';
import { ProductCard } from './ProductCard';
import { useWish } from './wish-context';

/** Products this visitor looked at lately, kept on this device. */
export function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const { recent } = useWish();
  const [items, setItems] = useState<Product[]>([]);
  const ids = recent.filter((x) => x !== excludeId).slice(0, 4);
  const key = ids.join(',');
  useEffect(() => {
    if (!key) { setItems([]); return; }
    capi<ProductList>('GET', `/catalog/products?ids=${key}&pageSize=8`).then((r) => setItems(key.split(',').map((id) => r.items.find((p) => p.id === id)).filter(Boolean) as Product[])).catch(() => setItems([]));
  }, [key]);
  if (!items.length) return null;
  return (
    <section aria-label="Recently viewed" className="mt-12">
      <h2 className="mb-4 text-xl md:text-2xl">Recently viewed</h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">{items.map((p) => <li key={p.id}><ProductCard p={p} /></li>)}</ul>
    </section>
  );
}
