import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/http';

type Page<T> = { items: T[]; total: number; nextPage: number | null };
export interface StoreProduct { id: string; name: string; model: string | null; categoryName: string | null; brandName: string | null; images: string[]; active: boolean; showOnWebsite: boolean; onHand: number; variantCount: number; categoryId?: string | null; priceFrom?: number | null; saleToday?: { price: number; until: string } | null }

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
    mutationFn: (v: { id: string; showOnWebsite?: boolean; images?: string[]; categoryId?: string | null }) => { const { id, ...body } = v; return api.put(`/items/${id}`, body); },
    onSuccess: () => Promise.all(['store-products', 'items'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  });
  return { update: m.mutateAsync, saving: m.isPending, error: m.error ? (m.error as { friendly?: string; message: string }).friendly ?? m.error.message : null };
}

export function useStoreCategories() {
  return useQuery({ queryKey: ['store-categories'], queryFn: async () => (await api.get<{ items: { id: string; name: string }[] }>('/categories', { pageSize: 100 })).items });
}

/** Make a new category, or set today's sale price on a product (null ends it). */
export function useProductExtras() {
  const qc = useQueryClient();
  const refresh = () => Promise.all(['store-products', 'store-categories', 'items'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const category = useMutation({ mutationFn: (name: string) => api.post<{ id: string }>('/categories', { name }), onSuccess: refresh });
  const sale = useMutation({ mutationFn: (v: { id: string; price: number | null }) => api.put(`/items/${v.id}/sale-today`, { price: v.price }), onSuccess: refresh });
  return { addCategory: category.mutateAsync, addingCategory: category.isPending, setSale: sale.mutateAsync, savingSale: sale.isPending };
}

/** A short lived link for a photo kept in the private media bucket. Cached for 50 minutes (the link lasts an hour). */
export function useImageUrl(key: string | null | undefined) {
  return useQuery({
    queryKey: ['image-url', key], enabled: !!key, staleTime: 50 * 60_000, retry: false,
    queryFn: async () => (await api.get<{ url: string }>('/uploads/view', { key })).url,
  });
}
