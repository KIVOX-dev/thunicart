'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

export const MULTI = ['size', 'color', 'fabric', 'brand', 'occasion'] as const;
export const SINGLE = ['price', 'discount', 'availability'] as const;
export const SORTS = [{ key: 'popular', label: 'Popularity' }, { key: 'new', label: 'New' }, { key: 'price-asc', label: 'Price: low to high' }, { key: 'price-desc', label: 'Price: high to low' }, { key: 'discount', label: 'Discount' }];

/** Filters live in the URL so a filtered page can be shared. Changing a filter goes back to page 1. */
export function useFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  // Two quick taps must both count: the second builds on the first, even before the page has re-rendered with the new address.
  const pending = useRef<string | null>(null);
  const spKey = sp.toString();
  useEffect(() => { pending.current = null; }, [spKey]);
  const base = () => new URLSearchParams(pending.current ?? spKey);
  const go = useCallback((next: URLSearchParams) => { next.delete('pages'); next.delete('page'); const qs = next.toString(); pending.current = qs; router.push(qs ? `${path}?${qs}` : path, { scroll: false }); }, [router, path]);
  const list = (k: string) => (sp.get(k) ?? '').split(',').filter(Boolean);
  const count = [...MULTI, ...SINGLE].reduce((n, k) => n + (MULTI.includes(k as never) ? list(k).length : sp.get(k) ? 1 : 0), 0);
  return {
    sp, count, sort: sp.get('sort') ?? 'popular', list, get: (k: string) => sp.get(k) ?? '',
    toggle: (k: string, v: string) => { const n = base(); const cur = (n.get(k) ?? '').split(',').filter(Boolean); const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]; if (next.length) n.set(k, next.join(',')); else n.delete(k); go(n); },
    set: (k: string, v: string) => { const n = base(); if (v && n.get(k) !== v) n.set(k, v); else n.delete(k); go(n); },
    apply: (draft: URLSearchParams) => go(draft),
    clear: () => { const n = new URLSearchParams(); const q = sp.get('q'); if (q) n.set('q', q); go(n); },
  };
}
