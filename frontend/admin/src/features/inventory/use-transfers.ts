import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '../api/http';
import { applyFieldIssues } from '../api/field-issues';
import type { Item } from '../catalog/types';
import { listEnvelope } from '../catalog/types';
import { transferDto } from './types';
import { useScanFeedback } from './use-scan-feedback';

const KEY = ['transfers'] as const;
const list = listEnvelope(transferDto);
const refreshStock = (qc: ReturnType<typeof useQueryClient>) => Promise.all([KEY[0], 'items', 'ledger', 'reorder'].map((k) => qc.invalidateQueries({ queryKey: [k] })));

export function useTransfers() {
  return useInfiniteQuery({
    queryKey: [...KEY, 'list'], initialPageParam: 1,
    queryFn: async ({ pageParam }) => list.parse(await api.get('/stock/transfers', { page: pageParam, pageSize: 20 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}

/** Request form: from, to and a line grid. Scan or search adds a line, and scanning an item already listed adds one piece. */
export function useTransferRequest(onDone: (id: string) => void) {
  const qc = useQueryClient();
  const [fromStoreId, setFrom] = useState('');
  const [toStoreId, setTo] = useState('');
  const [lines, setLines] = useState<Array<{ variantId: string; code: string; name: string; size: string; qty: string }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({ mutationFn: async (b: unknown) => transferDto.parse(await api.post('/stock/transfers', b, { idempotencyKey: key })), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
  const submit = async () => {
    setErrors({}); setBanner(null);
    try { onDone((await m.mutateAsync({ fromStoreId, toStoreId, lines: lines.map((l) => ({ variantId: l.variantId, qty: Math.round(Number(l.qty) || 0) })) })).id); } catch (e) {
      const r = applyFieldIssues(e); setErrors(r.errors); setBanner(r.banner);
    }
  };
  return {
    fromStoreId, setFrom, toStoreId, setTo, lines, errors, banner, saving: m.isPending, submit,
    addItem: (i: Item, variantId?: string) => setLines((s) => {
      const v = (variantId ? i.variants.find((x) => x.id === variantId) : i.variants[0])!;
      return s.some((l) => l.variantId === v.id) ? s.map((l) => (l.variantId === v.id ? { ...l, qty: String(Number(l.qty) + 1) } : l)) : [...s, { variantId: v.id, code: i.code, name: i.name, size: v.size, qty: '1' }];
    }),
    setQty: (variantId: string, qty: string) => setLines((s) => s.map((l) => (l.variantId === variantId ? { ...l, qty } : l))),
    remove: (variantId: string) => setLines((s) => s.filter((l) => l.variantId !== variantId)),
  };
}

/** One transfer: dispatch, then receive by scanning at the other store. */
export function useTransferDetail(id: string | undefined) {
  const qc = useQueryClient();
  const feedback = useScanFeedback();
  const q = useQuery({ queryKey: [...KEY, id], enabled: !!id, queryFn: async () => transferDto.parse(await api.get(`/stock/transfers/${id}`)) });
  const put = (t: unknown) => { const parsed = transferDto.parse(t); qc.setQueryData([...KEY, id], parsed); return parsed; };
  const act = (action: 'dispatch' | 'receive' | 'cancel') => ({ mutationFn: async () => put(await api.post(`/stock/transfers/${id}/${action}`)), onSuccess: () => refreshStock(qc) });
  return {
    query: q, transfer: q.data, feedback,
    scan: (code: string) => feedback.run(code, async (c) => put(await api.post(`/stock/transfers/${id}/scan-receive`, { barcode: c })).lastLineId),
    setReceived: useMutation({ mutationFn: async (v: { lineId: string; qty: number }) => put(await api.patch(`/stock/transfers/${id}/lines/${v.lineId}`, { receivedQty: v.qty })) }),
    dispatch: useMutation(act('dispatch')),
    receive: useMutation(act('receive')),
    cancel: useMutation(act('cancel')),
  };
}
