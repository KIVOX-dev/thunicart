import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, newIdempotencyKey } from '../api/http';
import { grnDto, grnList, type Grn } from './types';
import { useScanFeedback } from './use-scan-feedback';

const KEY = ['grns'] as const;

export function useGrns(status: string) {
  return useInfiniteQuery({
    queryKey: [...KEY, 'list', status], initialPageParam: 1,
    queryFn: async ({ pageParam }) => grnList.parse(await api.get('/purchase/grns', { status, page: pageParam, pageSize: 20 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useStartGrn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { poId: string; storeId?: string }) => grnDto.parse(await api.post('/purchase/grns', v, { idempotencyKey: newIdempotencyKey() })),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** One receiving session: scan, change quantities, finish. Quantities and warnings are computed by the API. */
export function useGrnReceive(id: string | undefined) {
  const qc = useQueryClient();
  const feedback = useScanFeedback();
  const q = useQuery({ queryKey: [...KEY, id], enabled: !!id, queryFn: async () => grnDto.parse(await api.get(`/purchase/grns/${id}`)) });
  const put = (g: unknown) => { const parsed = grnDto.parse(g); qc.setQueryData([...KEY, id], parsed); return parsed; };

  const scan = (code: string) => feedback.run(code, async (c) => put(await api.post(`/purchase/grns/${id}/scan`, { barcode: c })).lastLineId);
  const setQty = useMutation({
    mutationFn: async (v: { lineId: string; qty: number }) => put(await api.patch(`/purchase/grns/${id}/lines/${v.lineId}`, { receivedQty: v.qty })),
  });

  // One idempotency key for this finish action. It is reused when the person confirms warnings or retries.
  const [finishKey] = useState(newIdempotencyKey);
  const [warning, setWarning] = useState<string | null>(null);
  const finish = useMutation({
    mutationFn: async (confirmWarnings: boolean) => put(await api.post(`/purchase/grns/${id}/finish`, { confirmWarnings }, { idempotencyKey: finishKey })),
    onSuccess: () => { setWarning(null); void qc.invalidateQueries({ queryKey: ['pos'] }); void qc.invalidateQueries({ queryKey: ['items'] }); void qc.invalidateQueries({ queryKey: ['ledger'] }); },
    onError: (e) => { if (e instanceof ApiError && e.code === 'GRN_WARNINGS') setWarning(e.message); },
  });
  const g: Grn | undefined = q.data;
  return { query: q, grn: g, scan, setQty, finish, warning, clearWarning: () => setWarning(null), feedback, canEdit: g?.status === 'draft' };
}
