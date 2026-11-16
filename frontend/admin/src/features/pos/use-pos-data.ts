/* eslint-disable @typescript-eslint/no-explicit-any -- these functions turn the API's documents into the shapes the screens use; each result is checked by its zod schema (parse) before the screen sees it */
import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useShopId } from './use-shop';
export { useShopId };
import { api, ApiError, newIdempotencyKey } from '../api/http';
import { applyFieldIssues } from '../api/field-issues';
import { rupeesToPaise } from '../api/money';
import { customerDto, listEnvelope, type Customer } from '../catalog/types';
import type { Cart } from './use-cart';
import { apiBill } from './use-cart';
import { billList, creditNoteDto, creditNoteList, heldDto, invoiceDto, returnPreviewDto, shiftDto, type Invoice, type ReturnPreview } from './types';

const refreshAll = (qc: ReturnType<typeof useQueryClient>, keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));

/** Find a customer by mobile or name for the bill. */
export function useCustomerSearch(q: string) {
  return useQuery({
    queryKey: ['customers', 'pos-search', q], enabled: q.trim().length >= 3,
    queryFn: async () => listEnvelope(customerDto).parse(await api.get('/customers', { q, pageSize: 6 })).items,
  });
}
export function useQuickCustomer(onDone: (c: Customer) => void) {
  const qc = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const m = useMutation({ mutationFn: async (v: { name: string; mobile: string }) => customerDto.parse(await api.post('/customers/quick', v, { idempotencyKey: newIdempotencyKey() })), onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) });
  return {
    errors, banner, saving: m.isPending,
    submit: async (v: { name: string; mobile: string }) => { setErrors({}); setBanner(null); try { onDone(await m.mutateAsync(v)); } catch (e) { const r = applyFieldIssues(e); setErrors(r.errors); setBanner(r.banner); } },
  };
}

/** Manager approval by PIN. The token goes back with the bill. */
export function useApproval(onToken: (t: string) => void) {
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({ mutationFn: (pin: string) => api.post<{ token: string }>('/pos/approvals', { pin }) });
  return { error, busy: m.isPending, submit: async (pin: string) => { setError(null); try { onToken((await m.mutateAsync(pin)).token); return true; } catch (e) { setError(e instanceof ApiError ? (e.fields[0]?.message ?? e.message) : 'Could not check the PIN.'); return false; } } };
}

/* Day open and close. */
const toShift = (r: any) => shiftDto.parse({
  id: r.id, openedAt: r.openedAt ?? r.createdAt ?? new Date().toISOString(), openingCash: r.openingCash ?? 0, closedAt: r.closedAt ?? null, bills: r.bills ?? 0, cashSales: r.cashSales ?? 0, cashRefunds: r.cashRefunds ?? 0,
  expectedCash: r.expectedCash ?? null, countedCash: r.countedCash ?? null, difference: r.difference ?? null,
});
export function useShift() {
  const shop = useShopId();
  return useQuery({ queryKey: ['shift', shop.data], enabled: !!shop.data, queryFn: async () => { const r = await api.get<{ shift: unknown | null }>('/pos/shifts/current', { storeId: shop.data }); return r.shift ? toShift(r.shift) : null; } });
}
/** The API has no shift history list yet. */
export function useShifts() { return useQuery({ queryKey: ['shift', 'history'], queryFn: async () => [] as ReturnType<typeof toShift>[] }); }
export function useShiftActions(onError: (m: string) => void) {
  const qc = useQueryClient();
  const shop = useShopId();
  const fail = (e: unknown) => onError(e instanceof ApiError ? (e.fields[0]?.message ?? e.message) : 'Something went wrong.');
  return {
    open: useMutation({ mutationFn: async (cash: string) => toShift(await api.post('/pos/shifts/open', { storeId: shop.data, openingCash: rupeesToPaise(cash || '0') })), onSuccess: () => refreshAll(qc, ['shift']), onError: fail }),
    close: useMutation({
      mutationFn: async (cash: string) => {
        const cur = await api.get<{ shift: { id: string } | null }>('/pos/shifts/current', { storeId: shop.data });
        if (!cur.shift) throw new ApiError(404, 'NOT_FOUND', 'There is no open day to close.');
        return toShift(await api.post(`/pos/shifts/${cur.shift.id}/close`, { countedCash: rupeesToPaise(cash || '0') }));
      },
      onSuccess: () => refreshAll(qc, ['shift']), onError: fail,
    }),
  };
}

/* Held and draft bills */
export function useHeld() { return useQuery({ queryKey: ['held'], queryFn: async () => (await api.get<unknown[]>('/pos/held')).map((h) => heldDto.parse(h)) }); }
export function useHold(cart: Cart) {
  const qc = useQueryClient();
  const shop = useShopId();
  return useMutation({
    mutationFn: async (_v: { kind?: 'hold' | 'draft'; name?: string } = {}) => {
      if (!shop.data) throw new Error('No store is selected yet.');
      const bill = await api.post<{ id: string }>('/pos/bills', { ...apiBill(cart.cart, shop.data), hold: true });
      return { id: bill.id, name: `at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` };
    },
    onSuccess: () => refreshAll(qc, ['held']),
  });
}
export function useDeleteHeld() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => api.delete<{ ok: true }>(`/pos/held/${id}`), onSuccess: () => refreshAll(qc, ['held']) }); }

/* Bills */
export function useBills(q: string) {
  return useInfiniteQuery({
    queryKey: ['bills', q], initialPageParam: 1,
    queryFn: async ({ pageParam }) => billList.parse(await api.get('/pos/bills', { q, page: pageParam, pageSize: 20 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export const fetchBill = async (id: string): Promise<Invoice> => invoiceDto.parse(await api.get(`/pos/bills/${id}`));
export const fetchBillByNumber = async (number: string): Promise<Invoice> => invoiceDto.parse(await api.get('/pos/bills/by-number', { number }));
export function useCreditNotes() {
  return useInfiniteQuery({
    queryKey: ['credit-notes'], initialPageParam: 1,
    queryFn: async ({ pageParam }) => creditNoteList.parse(await api.get('/pos/credit-notes', { page: pageParam, pageSize: 20 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}

/** Return or exchange against one bill: pick lines and quantities, a reason, a refund method, and optionally new items. */
export function useReturnFlow(invoice: Invoice | null) {
  const qc = useQueryClient();
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [refundMode, setRefundMode] = useState('Cash');
  const [exchange, setExchange] = useState<Array<{ variantId: string; name: string; size: string; qty: number }>>([]);
  const [collect, setCollect] = useState<Array<{ mode: string; amount: string; reference: string }>>([{ mode: 'Cash', amount: '', reference: '' }]);
  const [preview, setPreview] = useState<ReturnPreview | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const [key] = useState(newIdempotencyKey);

  const lines = Object.entries(qtys).filter(([, q]) => q > 0).map(([i, q]) => ({ lineIndex: Number(i), qty: q }));
  const payments = collect.filter((c) => Number(c.amount) > 0).map((c) => ({ mode: c.mode, amount: rupeesToPaise(c.amount), reference: c.reference }));
  const body = invoice ? { invoiceId: invoice.id, lines, exchangeLines: exchange.map((e) => ({ variantId: e.variantId, qty: e.qty })), payments } : null;
  const bodyKey = JSON.stringify(body);
  const prev = useMutation({ mutationFn: async () => returnPreviewDto.parse(await api.post('/pos/returns/preview', body)) });
  const refresh = () => { if (body && lines.length) prev.mutate(undefined, { onSuccess: (p) => { setPreview(p); setErrors({}); }, onError: (e) => setErrors(applyFieldIssues(e).errors) }); else setPreview(null); };
  const submit = useMutation({
    mutationFn: async () => api.post<{ creditNote: unknown; exchangeInvoice: unknown }>('/pos/returns', { ...body, reason, refundMode }, { idempotencyKey: key }),
    onSuccess: () => refreshAll(qc, ['bills', 'credit-notes', 'items', 'ledger', 'shift', 'customers']),
  });
  return {
    qtys, setQty: (i: number, q: number) => setQtys((s) => ({ ...s, [i]: q })), reason, setReason, refundMode, setRefundMode, exchange, collect, setCollect, preview, errors, banner, saving: submit.isPending, lines, bodyKey, refresh,
    addExchange: (item: { name: string; variants: Array<{ id: string; size: string }> }, variantId?: string) => setExchange((s) => { const v = (variantId ? item.variants.find((x) => x.id === variantId) : item.variants[0])!; return s.some((e) => e.variantId === v.id) ? s.map((e) => (e.variantId === v.id ? { ...e, qty: e.qty + 1 } : e)) : [...s, { variantId: v.id, name: item.name, size: v.size, qty: 1 }]; }),
    removeExchange: (variantId: string) => setExchange((s) => s.filter((e) => e.variantId !== variantId)),
    confirm: async () => { setBanner(null); try { const r = await submit.mutateAsync(); return { creditNote: creditNoteDto.parse(r.creditNote), exchangeInvoice: r.exchangeInvoice ? invoiceDto.parse(r.exchangeInvoice) : null }; } catch (e) { const r = applyFieldIssues(e); setErrors(r.errors); setBanner(r.banner); return null; } },
  };
}
