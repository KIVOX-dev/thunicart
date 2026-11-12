import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '../api/http';
import { listEnvelope } from '../catalog/types';
import { auditDto } from './types';
import { useScanFeedback } from './use-scan-feedback';

const KEY = ['audits'] as const;
const list = listEnvelope(auditDto);

export function useAudits() {
  return useInfiniteQuery({
    queryKey: [...KEY, 'list'], initialPageParam: 1,
    queryFn: async ({ pageParam }) => list.parse(await api.get('/stock/audits', { page: pageParam, pageSize: 20 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useStartAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { storeId: string; category?: string }) => auditDto.parse(await api.post('/stock/audits', v, { idempotencyKey: newIdempotencyKey() })),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** One stock count: scan to count with a live total, undo the last scan, then review the variance and approve. */
export function useAuditCount(id: string | undefined) {
  const qc = useQueryClient();
  const feedback = useScanFeedback();
  const q = useQuery({ queryKey: [...KEY, id], enabled: !!id, queryFn: async () => auditDto.parse(await api.get(`/stock/audits/${id}`)) });
  const put = (a: unknown) => { const parsed = auditDto.parse(a); qc.setQueryData([...KEY, id], parsed); return parsed; };
  const done = () => Promise.all([KEY[0], 'items', 'ledger', 'reorder'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  return {
    query: q, audit: q.data, feedback,
    scan: (code: string) => feedback.run(code, async (c) => put(await api.post(`/stock/audits/${id}/scan`, { barcode: c })).lastVariantId),
    setCounted: useMutation({ mutationFn: async (v: { variantId: string; counted: number }) => put(await api.post(`/stock/audits/${id}/set`, v)) }),
    undo: useMutation({ mutationFn: async () => put(await api.post(`/stock/audits/${id}/undo`)) }),
    submit: useMutation({ mutationFn: async () => put(await api.post(`/stock/audits/${id}/submit`)), onSuccess: done }),
    approve: useMutation({ mutationFn: async () => put(await api.post(`/stock/audits/${id}/approve`)), onSuccess: done }),
  };
}
