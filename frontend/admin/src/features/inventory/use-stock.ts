import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '../api/http';
import { ADJUST_REASONS, ledgerList, reorderRow } from './types';

export interface LedgerFilters { q: string; storeId: string; type: string; from: string; to: string }
export const EMPTY_LEDGER: LedgerFilters = { q: '', storeId: '', type: '', from: '', to: '' };

interface ApiLedger { id: string; at: string; type: string; variantId: string; itemCode: string | null; storeId: string; storeName: string | null; qty: number; docNumber: string | null; note: string | null }
const LEDGER_PAGE_SIZE = 30;
async function fetchLedgerPage(f: LedgerFilters, page: number) {
    const r = await api.get<{ items: ApiLedger[]; total: number; nextPage: number | null }>('/stock/ledger', { q: f.q || undefined, storeId: f.storeId || undefined, type: f.type || undefined, from: f.from || undefined, to: f.to || undefined, page, pageSize: 30 });
      // The API has no running balance and no item name on a movement, so those columns show the movement itself.
      return ledgerList.parse({ ...r, items: r.items.map((x) => ({ id: x.id, at: x.at, variantId: x.variantId, itemId: x.variantId, code: x.itemCode ?? '', name: x.itemCode ?? '', size: '', storeId: x.storeId, storeName: x.storeName ?? '', type: x.type, qty: x.qty, balance: 0, ref: x.docNumber ?? '', note: x.note ?? '' })) });
}
export function useLedger(f: LedgerFilters) {
  return useInfiniteQuery({
    queryKey: ['ledger', f], initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchLedgerPage(f, pageParam),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
/** The same list one numbered page at a time, for the desktop screen. */
export const LEDGER_PAGE = LEDGER_PAGE_SIZE;
export function useLedgerPage(f: LedgerFilters, page: number) {
  return useQuery({ queryKey: ['ledger', 'page', f, page], placeholderData: (prev) => prev, queryFn: () => fetchLedgerPage(f, page) });
}
export interface StockRow { variantId: string; itemId: string; itemCode: string; name: string; size: string | null; storeId: string | null; storeName: string | null; onHand: number; reserved: number; available: number; reorderLevel: number; stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock' }
export interface StockFilters { q: string; storeId: string; stockStatus: string }
/** Stock on hand per item and size, from the stock endpoint. One row per size and store. */
export const STOCK_PAGE_SIZE = 50;
export function useStockRows(f: StockFilters, page: number) {
  return useQuery({
    queryKey: ['stock-rows', f, page], placeholderData: (prev) => prev,
    queryFn: async () => api.get<{ items: StockRow[]; total: number; nextPage: number | null; totals: { onHand: number } }>('/stock', { q: f.q || undefined, storeId: f.storeId || undefined, stockStatus: f.stockStatus || undefined, page, pageSize: STOCK_PAGE_SIZE }),
  });
}
export function useReorder() {
  return useQuery({
    queryKey: ['reorder'],
    queryFn: async () => {
      const r = await api.get<{ groups: { vendorId: string | null; items: { variantId: string; itemCode: string; name: string; size: string | null; available: number; reorderLevel: number }[] }[] }>('/stock/reorder-alerts');
      return r.groups.flatMap((g) => g.items.map((i) => reorderRow.parse({ variantId: i.variantId, itemId: i.variantId, code: i.itemCode, name: i.name, size: i.size ?? '', onHand: i.available, reorderLevel: i.reorderLevel, vendorId: g.vendorId })));
    },
  });
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
    mutationFn: (b: { variantId: string; storeId: string; delta: number; reason: string; note: string }) => api.post('/stock/adjustments', { storeId: b.storeId, reason: b.note ? `${b.reason}: ${b.note}` : b.reason, lines: [{ variantId: b.variantId, qty: b.delta }] }, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: () => Promise.all(['ledger', 'items', 'reorder', 'stock-rows'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
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
