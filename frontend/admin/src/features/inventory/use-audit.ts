import { useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, newIdempotencyKey } from '../api/http';
import { listEnvelope } from '../catalog/types';
import { auditDto, type Audit } from './types';
import { useScanFeedback } from './use-scan-feedback';

const KEY = ['audits'] as const;
const list = listEnvelope(auditDto);

/* The API's audit has its own field names and only two states (counting, approved). The screens also show a review step, which is kept on this device. */
interface ApiAuditLine { variantId: string; itemCode: string; name: string; size: string | null; systemQty: number; countedQty: number | null; variance: number }
interface ApiAudit {
  id: string; auditNumber: string; name: string; storeId: string; storeName: string; categoryId: string | null; binLocation: string | null; status: 'in_progress' | 'approved'; startedAt: string;
  summary?: { lines: number; counted: number; uncounted: number };
  lines?: ApiAuditLine[];
}
function toAudit(a: ApiAudit, reviewing = false, lastCode = ''): Audit {
  const status = a.status === 'approved' ? 'approved' : reviewing ? 'review' : 'counting';
  const lines = (a.lines ?? []).map((l) => {
    const counted = l.countedQty ?? 0;
    // Items never scanned count as 0 once the count is in review, which is what approval does with them.
    const variance = a.status === 'approved' || reviewing ? counted - l.systemQty : l.variance;
    return { variantId: l.variantId, itemId: l.variantId, code: l.itemCode, name: l.name, size: l.size ?? '', expected: l.systemQty, counted, variance };
  });
  return auditDto.parse({
    id: a.id, number: a.auditNumber, storeId: a.storeId, storeName: a.storeName, status, scope: a.name || (a.binLocation ? `Bin ${a.binLocation}` : 'All items'), createdAt: a.startedAt,
    lines, scans: lines.reduce((n, l) => n + l.counted, 0), notCounted: a.summary?.uncounted ?? lines.filter((l) => l.counted === 0).length,
    lastVariantId: lines.find((l) => l.code === lastCode)?.variantId ?? null,
  });
}

export function useAudits() {
  return useInfiniteQuery({
    queryKey: [...KEY, 'list'], initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const r = await api.get<{ items: ApiAudit[]; total: number; nextPage: number | null }>('/stock/audits', { page: pageParam, pageSize: 20 });
      // A list row has no lines, so the number of pieces counted is not known here; "Scans" shows how many items have been counted.
      return list.parse({ ...r, items: r.items.map((a) => ({ ...toAudit(a), scans: a.summary?.counted ?? 0 })) });
    },
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useStartAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { storeId: string; category?: string }) => {
      // Categories are chosen by name on screen and by id in the API.
      const categoryId = v.category ? (await api.get<{ items: { id: string; name: string }[] }>('/categories', { pageSize: 100 })).items.find((c) => c.name === v.category)?.id : undefined;
      return toAudit(await api.post<ApiAudit>('/stock/audits', { storeId: v.storeId, ...(categoryId ? { categoryId } : {}), ...(v.category ? { name: v.category } : {}) }));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** One stock count: scan to count with a live total, undo the last scan, then review the variance and approve. */
export function useAuditCount(id: string | undefined) {
  const qc = useQueryClient();
  const feedback = useScanFeedback();
  const [reviewing, setReviewing] = useState(false);
  const last = useRef({ code: '' });
  const q = useQuery({ queryKey: [...KEY, id], enabled: !!id, queryFn: async () => api.get<ApiAudit>(`/stock/audits/${id}`) });
  const audit = q.data ? toAudit(q.data, reviewing, last.current.code) : undefined;
  const refresh = () => qc.invalidateQueries({ queryKey: [...KEY, id] });
  const done = () => Promise.all([KEY[0], 'items', 'ledger', 'reorder', 'stock-rows'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const countOf = (code: string) => q.data?.lines?.find((l) => l.itemCode === code)?.countedQty ?? 0;
  /** Count one piece of a code, or set the count to a number. */
  const scanCall = async (code: string, opts: { qty?: number; set?: boolean } = {}) => {
    const r = await api.post<{ itemCode: string }>(`/stock/audits/${id}/scan`, { barcode: code, ...opts });
    last.current.code = r.itemCode;
    await refresh();
    return q.data?.lines?.find((l) => l.itemCode === r.itemCode)?.variantId ?? null;
  };
  return {
    query: q, audit, feedback,
    scan: (code: string) => feedback.run(code, (c) => scanCall(c)),
    setCounted: useMutation({ mutationFn: async (v: { variantId: string; counted: number }) => { const code = q.data?.lines?.find((l) => l.variantId === v.variantId)?.itemCode; if (code) await scanCall(code, { qty: v.counted, set: true }); } }),
    undo: useMutation({
      mutationFn: async () => {
        const code = last.current.code;
        if (!code) throw new ApiError(0, 'NOTHING_TO_UNDO', 'Scan an item first. Only the last scan on this screen can be undone.');
        await scanCall(code, { qty: Math.max(0, countOf(code) - 1), set: true });
      },
    }),
    submit: useMutation({ mutationFn: async () => { setReviewing(true); } }),
    approve: useMutation({
      mutationFn: async () => { const r = await api.post<ApiAudit>(`/stock/audits/${id}/approve`, { uncounted: 'zero' }, { idempotencyKey: newIdempotencyKey() }); await refresh(); return toAudit(r); },
      onSuccess: done,
    }),
  };
}
