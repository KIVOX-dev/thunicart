import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/http';
import { rupeesToPaise } from '../api/money';
import { dataQuality, listEnvelope, reviewRow } from './types';

export interface ReviewFilters { issue: string; category: string; q: string }
const KEY = ['review'] as const;

export function useReviewQueue(f: ReviewFilters) {
  return useInfiniteQuery({
    queryKey: [...KEY, f], initialPageParam: 1,
    queryFn: async ({ pageParam }) => listEnvelope(reviewRow).parse(await api.get('/review-queue', { ...f, page: pageParam, pageSize: 25 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useDataQuality() {
  return useQuery({ queryKey: ['data-quality'], queryFn: async () => dataQuality.parse(await api.get('/reports/data-quality')) });
}
const refresh = (qc: ReturnType<typeof useQueryClient>) => Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: ['data-quality'] }), qc.invalidateQueries({ queryKey: ['items'] })]);

export function useFixRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { itemId: string; size?: string; hsn?: string; mrp?: string }) => api.patch(`/review-queue/${v.itemId}`, { size: v.size, hsn: v.hsn, mrp: v.mrp !== undefined ? rupeesToPaise(v.mrp) : undefined }),
    onSuccess: () => refresh(qc),
  });
}
export function useBulkFix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { action: 'accept-hsn-suggestions' | 'set-size'; category?: string; value?: string }) => api.post<{ updated: number }>('/review-queue/bulk-fix', v),
    onSuccess: () => refresh(qc),
  });
}
