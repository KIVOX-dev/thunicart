import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { api, newIdempotencyKey } from '../api/http';
import { applyApiError } from '../api/apply-field-errors';
import { applyFieldIssues } from '../api/field-issues';
import { rupeesToPaise } from '../api/money';
import { ageingRow, billBody, PAY_MODES, returnBody, type Bill } from './types';
import { PAY_MODE_OUT, toBill, toPayment, toReturn } from './purchase-api';

type Page<T> = { items: T[]; total: number; nextPage: number | null };

type Banner = { message: string; requestId?: string } | null;

export function useBills(opts: { vendorId?: string; open?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: ['bills', opts], initialPageParam: 1,
    queryFn: async ({ pageParam }) => { const r = await api.get<Page<unknown>>('/purchase-bills', { vendorId: opts.vendorId, billStatus: opts.open ? 'open' : undefined, page: pageParam, pageSize: 50 }); return { ...r, items: r.items.map(toBill) }; },
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useReturns() {
  return useInfiniteQuery({
    queryKey: ['returns'], initialPageParam: 1,
    queryFn: async ({ pageParam }) => { const r = await api.get<Page<unknown>>('/purchase-returns', { page: pageParam, pageSize: 20 }); return { ...r, items: r.items.map(toReturn) }; },
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function usePayments() {
  return useInfiniteQuery({
    queryKey: ['payments'], initialPageParam: 1,
    queryFn: async ({ pageParam }) => { const r = await api.get<Page<unknown>>('/vendor-payments', { page: pageParam, pageSize: 20 }); return { ...r, items: r.items.map(toPayment) }; },
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
/** What each vendor is owed, by how late it is. The API gives this one vendor at a time, so every vendor is asked. */
export function useAgeing() {
  return useQuery({
    queryKey: ['ageing'],
    queryFn: async () => {
      const vendors = (await api.get<Page<{ id: string; name: string }>>('/vendors', { pageSize: 100 })).items;
      const rows = await Promise.all(vendors.map(async (v) => {
        const o = await api.get<{ vendorName: string; outstanding: number; ageing: { current: number; d0_30: number; d31_60: number; d61_90: number; over90: number } }>(`/vendors/${v.id}/outstanding`);
        return ageingRow.parse({ vendorId: v.id, vendorName: o.vendorName ?? v.name, current: o.ageing.current, d1to30: o.ageing.d0_30, d31to60: o.ageing.d31_60, d61to90: o.ageing.d61_90, d90plus: o.ageing.over90, total: o.outstanding });
      }));
      return rows.filter((r) => r.total > 0);
    },
  });
}
const refresh = (qc: ReturnType<typeof useQueryClient>) => Promise.all(['bills', 'returns', 'payments', 'ageing', 'vendors', 'items', 'ledger', 'grns'].map((k) => qc.invalidateQueries({ queryKey: [k] })));

export function useBillForm(onDone: (b: Bill) => void) {
  const qc = useQueryClient();
  const form = useForm<z.input<typeof billBody>>({ resolver: zodResolver(billBody), defaultValues: { grnId: '', vendorBillNo: '', freight: '', addFreightToCost: true, date: new Date().toISOString().slice(0, 10), dueDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) } });
  const [banner, setBanner] = useState<Banner>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({
    mutationFn: async (v: z.output<typeof billBody>) => {
      const g = await api.get<{ vendorId: string }>(`/grn/${v.grnId}`);
      return toBill(await api.post('/purchase-bills', { vendorId: g.vendorId, vendorBillNo: v.vendorBillNo, billDate: new Date(`${v.date}T00:00:00.000Z`).toISOString(), grnIds: [v.grnId], freight: rupeesToPaise(v.freight || '0'), addFreightToCost: v.addFreightToCost }, { idempotencyKey: key }));
    },
    onSuccess: () => refresh(qc),
  });
  const submit = form.handleSubmit(async (v) => { try { onDone(await m.mutateAsync(billBody.parse(v))); } catch (e) { setBanner(applyApiError(form, e)); } });
  return { form, submit, banner, saving: m.isPending };
}

export function useReturnForm(onDone: () => void) {
  const qc = useQueryClient();
  const [vendorId, setVendorId] = useState('');
  const [reason, setReason] = useState<(typeof returnBody.shape.reason.options)[number]>('Damaged');
  const [lines, setLines] = useState<Array<{ variantId: string; code: string; name: string; size: string; qty: string }>>([]);
  const [banner, setBanner] = useState<Banner>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({
    // The API returns goods against a receipt or a bill. The vendor's latest receipt is used; if an item was not on it, the API says so.
    mutationFn: async (b: { vendorId: string; reason: string; lines: { variantId: string; qty: number }[] }) => {
      const g = (await api.get<Page<{ id: string }>>('/grn', { vendorId: b.vendorId, pageSize: 1 })).items[0];
      if (!g) throw new Error('This vendor has no goods receipt to return against.');
      return api.post('/purchase-returns', { grnId: g.id, reason: b.reason, lines: b.lines }, { idempotencyKey: key });
    },
    onSuccess: () => refresh(qc),
  });
  const submit = async () => {
    setBanner(null);
    try { await m.mutateAsync({ vendorId, reason, lines: lines.map((l) => ({ variantId: l.variantId, qty: Math.round(Number(l.qty) || 0) })) }); onDone(); } catch (e) { setBanner(applyFieldIssues(e).banner); }
  };
  return {
    vendorId, setVendorId, reason, setReason, lines, banner, saving: m.isPending, submit,
    addItem: (i: { code: string; name: string; variants: Array<{ id: string; size: string }> }, variantId?: string) => setLines((s) => {
      const v = (variantId ? i.variants.find((x) => x.id === variantId) : i.variants[0])!;
      return s.some((l) => l.variantId === v.id) ? s.map((l) => (l.variantId === v.id ? { ...l, qty: String(Number(l.qty) + 1) } : l)) : [...s, { variantId: v.id, code: i.code, name: i.name, size: v.size, qty: '1' }];
    }),
    setQty: (variantId: string, qty: string) => setLines((s) => s.map((l) => (l.variantId === variantId ? { ...l, qty } : l))),
    remove: (variantId: string) => setLines((s) => s.filter((l) => l.variantId !== variantId)),
  };
}

/** Pay a vendor: pick the bills to settle and the amount for each. The total payment is worked out by the API. */
export function usePaymentForm(vendorId: string, onDone: () => void) {
  const qc = useQueryClient();
  const bills = useBills({ vendorId, open: true });
  const open = vendorId ? bills.data?.pages.flatMap((p) => p.items) ?? [] : [];
  const [mode, setMode] = useState<(typeof PAY_MODES)[number]>('UPI');
  const [reference, setReference] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({ mutationFn: (b: { vendorId: string; mode: string; reference: string; settlements: { billId: string; amount: number }[] }) => api.post('/vendor-payments', { vendorId: b.vendorId, date: new Date().toISOString(), mode: PAY_MODE_OUT[b.mode] ?? 'cash', reference: b.reference, amount: b.settlements.reduce((a, x) => a + x.amount, 0), allocations: b.settlements }, { idempotencyKey: key }), onSuccess: () => refresh(qc) });
  const submit = async () => {
    setBanner(null);
    const settlements = Object.entries(amounts).filter(([, v]) => Number(v) > 0).map(([billId, v]) => ({ billId, amount: rupeesToPaise(v) }));
    try { await m.mutateAsync({ vendorId, mode, reference, settlements }); onDone(); } catch (e) { setBanner(applyFieldIssues(e).banner); }
  };
  return { open, loading: bills.isPending, mode, setMode, reference, setReference, amounts, setAmount: (id: string, v: string) => setAmounts((a) => ({ ...a, [id]: v })), banner, saving: m.isPending, submit, selected: Object.values(amounts).filter((v) => Number(v) > 0).length };
}
