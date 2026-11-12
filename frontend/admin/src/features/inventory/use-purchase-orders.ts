import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey, request } from '../api/http';
import { rupeesToPaise } from '../api/money';
import type { Item } from '../catalog/types';
import { poDto, poList, totalsDto, type Po } from './types';

const KEY = ['pos'] as const;

export function usePos(status: string, q: string) {
  return useInfiniteQuery({
    queryKey: [...KEY, 'list', status, q], initialPageParam: 1,
    queryFn: async ({ pageParam }) => poList.parse(await api.get('/purchase/orders', { status, q, page: pageParam, pageSize: 20 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function usePo(id: string | undefined) {
  return useQuery({ queryKey: [...KEY, id], enabled: !!id, queryFn: async () => poDto.parse(await api.get(`/purchase/orders/${id}`)) });
}
/** Open orders a receipt can be started from. */
export function useReceivablePos() {
  return useQuery({
    queryKey: [...KEY, 'receivable'],
    queryFn: async () => (await Promise.all(['approved', 'sent', 'partially-received'].map((s) => api.get('/purchase/orders', { status: s, pageSize: 50 }).then((r) => poList.parse(r).items)))).flat(),
  });
}

export function usePoAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: 'approve' | 'send' | 'cancel') => poDto.parse(await api.post(`/purchase/orders/${id}/${action}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCreateFromReorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { vendorId: string; variantIds: string[] }) => poDto.parse(await api.post('/purchase/orders/from-reorder', v)),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** The printable purchase order. The API returns HTML, shown in a preview and printed from the browser dialog. */
export function usePoPrint(id: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: [...KEY, id, 'print'], enabled: !!id && enabled, queryFn: () => request<string>('GET', `/purchase/orders/${id}/print`, { text: true }) });
}

export interface PoLineDraft { variantId: string; code: string; name: string; size: string; qty: string; cost: string }

/** Editable purchase order: the line grid, scan or search to add, and live totals that come from the API preview call. */
export function usePoDraft(po: Po | undefined) {
  const [vendorId, setVendorId] = useState(po?.vendorId ?? '');
  const [expectedDate, setExpectedDate] = useState(po?.expectedDate ?? new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
  const [notes, setNotes] = useState(po?.notes ?? '');
  const [lines, setLines] = useState<PoLineDraft[]>(po?.lines.map((l) => ({ variantId: l.variantId, code: l.code, name: l.name, size: l.size, qty: String(l.orderedQty), cost: String(l.unitCost / 100) })) ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const [key] = useState(newIdempotencyKey);
  const qc = useQueryClient();

  const body = {
    vendorId, expectedDate, notes,
    lines: lines.map((l) => ({ variantId: l.variantId, orderedQty: Math.max(0, Math.round(Number(l.qty) || 0)), unitCost: rupeesToPaise(l.cost) })),
  };
  const previewKey = JSON.stringify(body.lines);
  const [totals, setTotals] = useState<ReturnType<typeof totalsDto.parse> | null>(po?.totals ?? null);
  useEffect(() => {
    if (!body.lines.length) { setTotals(null); return; }
    const t = setTimeout(async () => {
      try { setTotals(totalsDto.parse(await api.post('/purchase/orders/preview', { lines: body.lines }))); } catch { /* the totals simply stay as they were */ }
    }, 250);
    return () => clearTimeout(t);
  }, [previewKey]);

  const addItem = (item: Item, variantId?: string) => setLines((s) => {
    const vs = variantId ? item.variants.filter((v) => v.id === variantId) : item.variants;
    const add = vs.filter((v) => !s.some((l) => l.variantId === v.id)).map((v) => ({ variantId: v.id, code: item.code, name: item.name, size: v.size, qty: '1', cost: String(v.cost / 100) }));
    // Scanning an item already on the order adds one piece.
    return [...s.map((l) => (vs.some((v) => v.id === l.variantId) ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l)), ...add];
  });
  const setLine = (variantId: string, patch: Partial<PoLineDraft>) => setLines((s) => s.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)));
  const removeLine = (variantId: string) => setLines((s) => s.filter((l) => l.variantId !== variantId));

  const save = useMutation({
    mutationFn: async () => poDto.parse(po ? await api.put(`/purchase/orders/${po.id}`, body) : await api.post('/purchase/orders', body, { idempotencyKey: key })),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  return { vendorId, setVendorId, expectedDate, setExpectedDate, notes, setNotes, lines, addItem, setLine, removeLine, totals, errors, setErrors, banner, setBanner, save, body };
}
