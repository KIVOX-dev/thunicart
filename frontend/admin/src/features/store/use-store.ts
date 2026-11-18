import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '../api/http';
import { uploadFile } from '../catalog/use-uploads';

type Page<T> = { items: T[]; total: number; nextPage: number | null };
const msg = (e: unknown) => (e as { friendly?: string; message?: string })?.friendly ?? (e as Error)?.message ?? 'Something went wrong.';

/* ---- orders ---- */
export interface StoreOrder { id: string; orderNumber: string; status: string; createdAt: string; paymentMethod: string; total: number; mobile?: string }
export const ORDER_FLOW: Record<string, { label: string; next?: { status: string; label: string } }> = {
  created: { label: 'Created' }, payment_pending: { label: 'Waiting for payment' },
  confirmed: { label: 'Confirmed', next: { status: 'packed', label: 'Mark packed' } },
  packed: { label: 'Packed', next: { status: 'shipped', label: 'Ship' } },
  shipped: { label: 'Shipped', next: { status: 'out_for_delivery', label: 'Out for delivery' } },
  out_for_delivery: { label: 'Out for delivery', next: { status: 'delivered', label: 'Mark delivered' } },
  delivered: { label: 'Delivered' }, cancelled: { label: 'Cancelled' },
  return_requested: { label: 'Return requested' }, return_approved: { label: 'Return approved' }, returned: { label: 'Returned' }, refunded: { label: 'Refunded' },
};
export function useStoreOrders(status: string) {
  return useInfiniteQuery({
    queryKey: ['store-orders', status], initialPageParam: 1,
    queryFn: async ({ pageParam }) => api.get<Page<StoreOrder>>('/admin/orders', { orderStatus: status || undefined, page: pageParam, pageSize: 20 }),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useMoveOrder() {
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: (v: { id: string; status: string }) => api.patch(`/admin/orders/${v.id}`, { status: v.status, note: '' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['store-orders'] }) });
  return { move: m.mutateAsync, saving: m.isPending, error: m.error ? msg(m.error) : null };
}

/* ---- banners and content pages: the same simple list + save ---- */
export interface Banner { id: string; title: string; imageKey: string; link: string; order: number; active: boolean }
export interface CmsPage { id: string; slug: string; title: string; body: string; active: boolean }
function useCrud<T extends { id: string }>(path: string, key: string) {
  const qc = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: [key], initialPageParam: 1,
    queryFn: async ({ pageParam }) => api.get<Page<T>>(path, { page: pageParam, pageSize: 50 }),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
  const done = () => qc.invalidateQueries({ queryKey: [key] });
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); await done(); return true; } catch (e) { setError(msg(e)); return false; } };
  return {
    list, error,
    create: (body: unknown) => run(() => api.post(path, body, { idempotencyKey: newIdempotencyKey() })),
    update: (id: string, body: unknown) => run(() => api.put(`${path}/${id}`, body)),
    remove: (id: string) => run(() => api.delete(`${path}/${id}`)),
  };
}
export const useBanners = () => useCrud<Banner>('/banners', 'banners');
export const useCmsPages = () => useCrud<CmsPage>('/cms/pages', 'cms-pages');
export const uploadBannerImage = (file: File, onProgress: (n: number) => void) => uploadFile(file, 'image', onProgress);
