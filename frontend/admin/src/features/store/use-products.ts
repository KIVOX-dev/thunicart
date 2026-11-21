import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/http';

type Page<T> = { items: T[]; total: number; nextPage: number | null };
export interface StoreProduct { id: string; name: string; model: string | null; categoryName: string | null; brandName: string | null; images: string[]; active: boolean; showOnWebsite: boolean; onHand: number; variantCount: number }

/** Items for the Online store, straight from the item list: photos, whether they are switched on for the website, and stock. */
export function useStoreProducts(q: string, show: '' | 'on' | 'off') {
  return useInfiniteQuery({
    queryKey: ['store-products', q, show], initialPageParam: 1,
    queryFn: async ({ pageParam }) => api.get<Page<StoreProduct>>('/items', { q: q || undefined, showOnWebsite: show === 'on' ? 'true' : show === 'off' ? 'false' : undefined, page: pageParam, pageSize: 25 }),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}

/** Switch an item on or off for the website, or save its photo list. Only the fields given are changed. */
export function useUpdateProduct() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (v: { id: string; showOnWebsite?: boolean; images?: string[] }) => { const { id, ...body } = v; return api.put(`/items/${id}`, body); },
    onSuccess: () => Promise.all(['store-products', 'items'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  });
  return { update: m.mutateAsync, saving: m.isPending, error: m.error ? (m.error as { friendly?: string; message: string }).friendly ?? m.error.message : null };
}

/** A short lived link for a photo kept in the private media bucket. Cached for 50 minutes (the link lasts an hour). */
export function useImageUrl(key: string | null | undefined) {
  return useQuery({
    queryKey: ['image-url', key], enabled: !!key, staleTime: 50 * 60_000, retry: false,
    queryFn: async () => (await api.get<{ url: string }>('/uploads/view', { key })).url,
  });
}
