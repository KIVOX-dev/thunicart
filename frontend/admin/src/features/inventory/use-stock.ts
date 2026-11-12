import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/http';
import { ADJUST_REASONS, ledgerList, reorderRow } from './types';

export interface LedgerFilters { q: string; storeId: string; type: string; from: string; to: string }
export const EMPTY_LEDGER: LedgerFilters = { q: '', storeId: '', type: '', from: '', to: '' };

export function useLedger(f: LedgerFilters) {
  return useInfiniteQuery({
    queryKey: ['ledger', f], initialPageParam: 1,
    queryFn: async ({ pageParam }) => ledgerList.parse(await api.get('/stock/ledger', { ...f, page: pageParam, pageSize: 30 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useReorder() {
  return useQuery({ queryKey: ['reorder'], queryFn: async () => (await api.get<unknown[]>('/stock/reorder')).map((r) => reorderRow.parse(r)) });
}

/** Stock adjustment with a reason. Stock changes only through this call, never by typing a quantity into an item. */
export function useAdjustForm(onDone: () => void) {
  const qc = useQueryClient();
  const [variantId, setVariantId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<(typeof ADJUST_REASONS)[number]>('Count correction');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const m = useMutation({
    mutationFn: (b: unknown) => api.post('/stock/adjustments', b),
    onSuccess: () => Promise.all(['ledger', 'items', 'reorder'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  });
  const submit = async () => {
    setErrors({}); setBanner(null);
    try { await m.mutateAsync({ variantId, storeId, delta: Math.round(Number(delta) || 0), reason, note }); setDelta(''); setNote(''); onDone(); } catch (e) {
      const err = e as { fields?: Array<{ path: string; message: string }>; friendly?: string; requestId?: string };
      setErrors(Object.fromEntries((err.fields ?? []).map((f) => [f.path, f.message])));
      setBanner({ message: err.fields?.length ? 'Check the highlighted fields.' : err.friendly ?? 'Could not save.', requestId: err.requestId });
    }
  };
  return { variantId, setVariantId, storeId, setStoreId, delta, setDelta, reason, setReason, note, setNote, errors, banner, saving: m.isPending, submit };
}
