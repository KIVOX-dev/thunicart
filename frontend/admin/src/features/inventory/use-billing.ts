import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { api, newIdempotencyKey } from '../api/http';
import { applyApiError } from '../api/apply-field-errors';
import { applyFieldIssues } from '../api/field-issues';
import { rupeesToPaise } from '../api/money';
import { ageingRow, billBody, billDto, billList, PAY_MODES, paymentList, returnBody, returnList, type Bill } from './types';

type Banner = { message: string; requestId?: string } | null;

export function useBills(opts: { vendorId?: string; open?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: ['bills', opts], initialPageParam: 1,
    queryFn: async ({ pageParam }) => billList.parse(await api.get('/purchase/bills', { vendorId: opts.vendorId, open: opts.open ? '1' : undefined, page: pageParam, pageSize: 50 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useReturns() {
  return useInfiniteQuery({
    queryKey: ['returns'], initialPageParam: 1,
    queryFn: async ({ pageParam }) => returnList.parse(await api.get('/purchase/returns', { page: pageParam, pageSize: 20 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function usePayments() {
  return useInfiniteQuery({
    queryKey: ['payments'], initialPageParam: 1,
    queryFn: async ({ pageParam }) => paymentList.parse(await api.get('/purchase/payments', { page: pageParam, pageSize: 20 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useAgeing() {
  return useQuery({ queryKey: ['ageing'], queryFn: async () => (await api.get<unknown[]>('/purchase/ageing')).map((r) => ageingRow.parse(r)) });
}
const refresh = (qc: ReturnType<typeof useQueryClient>) => Promise.all(['bills', 'returns', 'payments', 'ageing', 'vendors', 'items', 'ledger', 'grns'].map((k) => qc.invalidateQueries({ queryKey: [k] })));

export function useBillForm(onDone: (b: Bill) => void) {
  const qc = useQueryClient();
  const form = useForm<z.input<typeof billBody>>({ resolver: zodResolver(billBody), defaultValues: { grnId: '', vendorBillNo: '', date: new Date().toISOString().slice(0, 10), dueDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) } });
  const [banner, setBanner] = useState<Banner>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({ mutationFn: async (v: z.output<typeof billBody>) => billDto.parse(await api.post('/purchase/bills', v, { idempotencyKey: key })), onSuccess: () => refresh(qc) });
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
  const m = useMutation({ mutationFn: (b: unknown) => api.post('/purchase/returns', b, { idempotencyKey: key }), onSuccess: () => refresh(qc) });
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
  const m = useMutation({ mutationFn: (b: unknown) => api.post('/purchase/payments', b, { idempotencyKey: key }), onSuccess: () => refresh(qc) });
  const submit = async () => {
    setBanner(null);
    const settlements = Object.entries(amounts).filter(([, v]) => Number(v) > 0).map(([billId, v]) => ({ billId, amount: rupeesToPaise(v) }));
    try { await m.mutateAsync({ vendorId, mode, reference, settlements }); onDone(); } catch (e) { setBanner(applyFieldIssues(e).banner); }
  };
  return { open, loading: bills.isPending, mode, setMode, reference, setReference, amounts, setAmount: (id: string, v: string) => setAmounts((a) => ({ ...a, [id]: v })), banner, saving: m.isPending, submit, selected: Object.values(amounts).filter((v) => Number(v) > 0).length };
}
