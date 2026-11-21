import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/http';
import { dataQuality, listEnvelope, reviewRow } from './types';

/* The review rows from the API, turned into the rows the screen uses. */
interface ApiReview { id: string; itemId: string | null; itemCode: string; name: string; category: string | null; reasons: string[]; detail: Record<string, unknown>; suggestion: { hsn: string } | null }
const toRow = (r: ApiReview) => reviewRow.parse({
  id: r.id, itemId: r.itemId ?? r.id, code: r.itemCode, name: r.name, category: r.category ?? '', issue: r.reasons[0] ?? '',
  size: String(r.detail.size ?? ''), hsn: String(r.detail.hsn ?? ''), mrp: Number(r.detail.mrp ?? 0) | 0, onHand: Number(r.detail.onHand ?? 0) | 0, batch: String(r.detail.batchRef ?? ''), suggestedHsn: r.suggestion?.hsn ?? null,
  sizes: Array.isArray(r.detail.sizes) ? (r.detail.sizes as unknown[]).map(String) : [],
});

export interface ReviewFilters { issue: string; category: string; q: string }
const KEY = ['review'] as const;

export const REVIEW_PAGE_SIZE = 25;
/** The same queue one numbered page at a time (1 2 3 >), for the desktop screen. */
export function useReviewQueuePage(f: ReviewFilters, page: number) {
  return useQuery({
    queryKey: [...KEY, 'page', f, page], placeholderData: (prev) => prev,
    queryFn: async () => {
      const r = await api.get<{ items: ApiReview[]; total: number; nextPage: number | null }>('/imports/review-queue', { q: f.q || undefined, reason: f.issue || undefined, reviewStatus: 'open', page, pageSize: REVIEW_PAGE_SIZE });
      return listEnvelope(reviewRow).parse({ items: r.items.map(toRow), total: r.total, nextPage: r.nextPage });
    },
  });
}
export function useReviewQueue(f: ReviewFilters) {
  return useInfiniteQuery({
    queryKey: [...KEY, f], initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const r = await api.get<{ items: ApiReview[]; total: number; nextPage: number | null }>('/imports/review-queue', { q: f.q || undefined, reason: f.issue || undefined, reviewStatus: 'open', page: pageParam, pageSize: 25 });
      return listEnvelope(reviewRow).parse({ items: r.items.map(toRow), total: r.total, nextPage: r.nextPage });
    },
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useDataQuality() {
  return useQuery({ queryKey: ['data-quality'], queryFn: async () => {
    const r = await api.get<{ summary: Record<string, number>; rows: ApiReview[]; totalVariants: number; flagged: number }>('/imports/data-quality');
    const byCat = new Map<string, { items: number; issues: number }>();
    for (const x of r.rows) { const c = byCat.get(x.category ?? 'No category') ?? { items: 0, issues: 0 }; c.items += 1; c.issues += x.reasons.length; byCat.set(x.category ?? 'No category', c); }
    return dataQuality.parse({ total: r.totalVariants, flagged: r.flagged, byIssue: r.summary, byCategory: [...byCat].map(([category, v]) => ({ category, ...v })) });
  } });
}
const refresh = (qc: ReturnType<typeof useQueryClient>) => Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: ['data-quality'] }), qc.invalidateQueries({ queryKey: ['items'] })]);

export type FixAction = { action: 'apply_suggestion' | 'dismiss' } | { action: 'split_sizes'; sizes?: string[]; quantities?: number[] } | { action: 'set'; set: { hsn?: string; size?: string; category?: string; brand?: string; model?: string; mrp?: number; sellingPrice?: number } };
/** One fix on one review row. `id` is the review row's id. */
export function useFixRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string } & FixAction) => { const { id, ...body } = v; return api.patch('/imports/review-queue/bulk', { ids: [id], ...body }); },
    onSuccess: () => refresh(qc),
  });
}
export function useBulkFix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { action: 'accept-hsn-suggestions' | 'set-size'; category?: string; value?: string }) => api.patch<{ updated: number }>('/imports/review-queue/bulk', v.action === 'accept-hsn-suggestions' ? { reason: 'MISSING_HSN', action: 'apply_suggestion' } : { reason: 'MISSING_SIZE', action: 'set', set: { size: v.value } }),
    onSuccess: () => refresh(qc),
  });
}
