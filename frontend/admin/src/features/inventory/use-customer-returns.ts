import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '../api/http';

type Page<T> = { items: T[]; total: number; nextPage: number | null };
export interface OnlineReturn { id: string; orderNumber: string; status: string; createdAt: string; total: number; mobile?: string; returnRequest?: { reason?: string; at?: string } | null; refund?: { amount?: number; to?: string } | null }
export interface OfflineReturn { id: string; creditNoteNumber: string; refundTotal: number; createdAt?: string; invoiceNumber?: string; customerName?: string }

export const ONLINE_RETURN_STATUSES = [
  { key: 'return_requested', label: 'Waiting for approval' },
  { key: 'return_approved', label: 'Approved, goods on the way' },
  { key: 'returned', label: 'Received, refund due' },
  { key: 'refunded', label: 'Refunded' },
] as const;

/** Return requests on website orders, by stage. */
export function useOnlineReturns(status: string) {
  return useInfiniteQuery({
    queryKey: ['customer-returns', 'online', status], initialPageParam: 1,
    queryFn: async ({ pageParam }) => api.get<Page<OnlineReturn>>('/admin/orders', { orderStatus: status, page: pageParam, pageSize: 20 }),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
/** Returns taken at the counter. Each one has a credit note. */
export function useOfflineReturns() {
  return useInfiniteQuery({
    queryKey: ['customer-returns', 'offline'], initialPageParam: 1,
    queryFn: async ({ pageParam }) => api.get<Page<OfflineReturn>>('/sales/returns', { page: pageParam, pageSize: 20 }),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}

type Step = { id: string; action: 'approve' | 'reject' | 'received' | 'refund'; note?: string; refundTo?: 'wallet' | 'original'; condition?: 'restock' | 'damaged' };
/** Move an online return one step. Refund puts the pieces back in stock (or marks them damaged) and pays the customer by wallet credit or the original method. */
export function useReturnStep() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (s: Step) => api.post(`/admin/returns/${s.id}/${s.action}`, s.action === 'approve' || s.action === 'reject' ? { note: s.note ?? '' } : s.action === 'refund' ? { refundTo: s.refundTo ?? 'wallet', condition: s.condition ?? 'restock' } : {}, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: () => Promise.all(['customer-returns', 'stock', 'items'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  });
  return { run: m.mutateAsync, saving: m.isPending, error: m.error ? (m.error as { friendly?: string; message: string }).friendly ?? m.error.message : null };
}
