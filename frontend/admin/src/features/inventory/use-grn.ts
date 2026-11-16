/* eslint-disable @typescript-eslint/no-explicit-any -- these functions turn the API's documents into the shapes the screens use; each result is checked by its zod schema (parse) before the screen sees it */
import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, newIdempotencyKey } from '../api/http';
import { rupeesToPaise } from '../api/money';
import { lookupBarcode } from '../catalog/use-items';
import { grnDto, type Grn } from './types';
import { toGrn } from './purchase-api';
import { useScanFeedback } from './use-scan-feedback';

const KEY = ['grns'] as const;

export function useGrns(status: string) {
  void status; // every receipt in the API is a finished receipt
  return useInfiniteQuery({
    queryKey: [...KEY, 'list', status], initialPageParam: 1,
    queryFn: async ({ pageParam }) => { const r = await api.get<{ items: unknown[]; total: number; nextPage: number | null }>('/grn', { page: pageParam, pageSize: 20 }); return { ...r, items: r.items.map(toGrn) }; },
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}

/* ---------------------------------------------------------------------------------------------------------------
 * Receiving goods. The API takes a whole receipt in one call, so the count is kept on this device while the person
 * scans (it survives a reload) and is sent once when they finish. A new receipt's id starts with "draft-".
 * --------------------------------------------------------------------------------------------------------------- */
interface DraftLine { poLineId: string; variantId: string; code: string; name: string; ordered: number; received: number; unitCost: number }
interface Draft {
  id: string; poId: string; poNumber: string; vendorId: string; vendorName: string; storeId: string; storeName: string; lines: DraftLine[];
  invoiceNo: string; invoiceDate: string; freight: string; notes: string; lastLineId: string | null;
}
const DRAFT_PREFIX = 'draft-';
const draftKey = (id: string) => `tk.grn.${id}`;
const loadDraft = (id: string): Draft | null => { try { const raw = sessionStorage.getItem(draftKey(id)); return raw ? (JSON.parse(raw) as Draft) : null; } catch { return null; } };
const saveDraft = (d: Draft) => { try { sessionStorage.setItem(draftKey(d.id), JSON.stringify(d)); } catch { /* storage blocked: the count stays on screen only */ } };
const dropDraft = (id: string) => { try { sessionStorage.removeItem(draftKey(id)); } catch { /* nothing to remove */ } };
export const isDraftId = (id: string | undefined) => !!id && id.startsWith(DRAFT_PREFIX);

const lineWarning = (l: DraftLine) => (l.received > l.ordered ? ('OVER' as const) : l.received < l.ordered ? ('SHORT' as const) : null);
const warningText = (d: Draft) => {
  const short = d.lines.filter((l) => lineWarning(l) === 'SHORT').length;
  const over = d.lines.filter((l) => lineWarning(l) === 'OVER').length;
  return [short ? `${short} ${short === 1 ? 'item was' : 'items were'} received less than ordered or not at all.` : '', over ? `${over} ${over === 1 ? 'item was' : 'items were'} received more than ordered.` : ''].filter(Boolean).join(' ');
};

function draftToGrn(d: Draft): Grn {
  const lines = d.lines.map((l) => ({ id: l.poLineId, variantId: l.variantId, itemId: l.variantId, code: l.code, name: l.name, size: '', orderedQty: l.ordered, receivedQty: l.received, unitCost: l.unitCost, warning: l.received > 0 ? lineWarning(l) : null }));
  return grnDto.parse({
    id: d.id, number: 'New receipt', poId: d.poId, poNumber: d.poNumber, vendorId: d.vendorId, vendorName: d.vendorName, storeId: d.storeId, storeName: d.storeName, status: 'draft', lines,
    createdAt: new Date().toISOString(), finishedAt: null, lastLineId: d.lastLineId, pieces: lines.reduce((a, l) => a + l.receivedQty, 0),
  });
}

/** Start receiving against an order: nothing is saved on the server until the receipt is finished. */
export function useStartGrn() {
  return useMutation({
    mutationFn: async (v: { poId: string; storeId?: string }): Promise<Grn> => {
      const po = await api.get<any>(`/purchase-orders/${v.poId}`);
      const lines: DraftLine[] = (po.lines ?? []).filter((l: any) => (l.pendingQty ?? l.qty - (l.receivedQty ?? 0)) > 0)
        .map((l: any) => ({ poLineId: l.id, variantId: l.variantId, code: l.itemCode ?? '', name: l.description ?? '', ordered: l.pendingQty ?? l.qty - (l.receivedQty ?? 0), received: 0, unitCost: l.unitCost ?? 0 }));
      if (!lines.length) throw new ApiError(422, 'NOTHING_TO_RECEIVE', 'Everything on this order has already been received.');
      const d: Draft = {
        id: `${DRAFT_PREFIX}${newIdempotencyKey()}`, poId: v.poId, poNumber: po.poNumber, vendorId: po.vendorId, vendorName: po.vendorName, storeId: v.storeId ?? po.storeId, storeName: po.storeName ?? '',
        lines, invoiceNo: '', invoiceDate: new Date().toISOString().slice(0, 10), freight: '', notes: '', lastLineId: null,
      };
      saveDraft(d);
      return draftToGrn(d);
    },
  });
}

type QueryState = { isPending: boolean; isError: boolean; error: Error | null; refetch: () => void };

/** One receiving session: scan, change quantities, fill in the vendor's invoice details, finish. */
export function useGrnReceive(id: string | undefined) {
  const qc = useQueryClient();
  const feedback = useScanFeedback();
  const isDraft = isDraftId(id);
  const [draft, setDraft] = useState<Draft | null>(() => (isDraft && id ? loadDraft(id) : null));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => { if (isDraft && id) setDraft(loadDraft(id)); }, [id, isDraft]);
  const update = (fn: (d: Draft) => Draft) => setDraft((cur) => { if (!cur) return cur; const next = fn(cur); saveDraft(next); return next; });

  const q = useQuery({ queryKey: [...KEY, id], enabled: !!id && !isDraft, queryFn: async () => toGrn(await api.get(`/grn/${id}`)) });
  const query: QueryState = isDraft
    ? { isPending: false, isError: !draft, error: draft ? null : new ApiError(404, 'NOT_FOUND', 'This receipt was not found on this device. Start receiving again from the order.'), refetch: () => undefined }
    : { isPending: q.isPending, isError: q.isError, error: q.error as Error | null, refetch: () => void q.refetch() };

  const scan = (code: string) => feedback.run(code, async (c) => {
    const { variantId } = await lookupBarcode(c);
    const cur = draftRef.current;
    const line = cur?.lines.find((l) => l.variantId === variantId);
    // Only what is on the order can be received against it. An item that is not on it is reported as a miss.
    if (!line) throw new ApiError(404, 'NOT_ON_PO', 'This item is not on the order.');
    update((d) => ({ ...d, lines: d.lines.map((l) => (l.poLineId === line.poLineId ? { ...l, received: l.received + 1 } : l)), lastLineId: line.poLineId }));
    return line.poLineId;
  });
  const setQty = useMutation({
    mutationFn: async (v: { lineId: string; qty: number }) => { update((d) => ({ ...d, lines: d.lines.map((l) => (l.poLineId === v.lineId ? { ...l, received: Math.max(0, Math.round(v.qty) || 0) } : l)) })); },
  });

  // One idempotency key for this finish action. It is reused when the person confirms warnings or retries.
  const [finishKey] = useState(newIdempotencyKey);
  const [warning, setWarning] = useState<string | null>(null);
  const finish = useMutation({
    mutationFn: async (confirmWarnings: boolean): Promise<Grn> => {
      const d = draftRef.current;
      if (!d) throw new ApiError(404, 'NOT_FOUND', 'This receipt was not found on this device.');
      if (!d.invoiceNo.trim()) throw new ApiError(400, 'VALIDATION', "Enter the vendor's invoice number first.");
      const text = warningText(d);
      if (text && !confirmWarnings) throw new ApiError(409, 'GRN_WARNINGS', text);
      const over = d.lines.some((l) => l.received > l.ordered);
      const body = {
        poId: d.poId, storeId: d.storeId, vendorInvoiceNo: d.invoiceNo.trim(), vendorInvoiceDate: new Date(`${d.invoiceDate || new Date().toISOString().slice(0, 10)}T00:00:00.000Z`).toISOString(),
        freight: rupeesToPaise(d.freight || '0'), approveOverReceipt: over, notes: d.notes.trim(),
        lines: d.lines.filter((l) => l.received > 0).map((l) => ({ poLineId: l.poLineId, variantId: l.variantId, receivedQty: l.received })),
      };
      if (!body.lines.length) throw new ApiError(400, 'VALIDATION', 'Scan or enter at least one piece first.');
      return toGrn(await api.post('/grn', body, { idempotencyKey: finishKey }));
    },
    onSuccess: (g) => {
      setWarning(null);
      if (id) dropDraft(id);
      qc.setQueryData([...KEY, g.id], g);
      for (const k of ['grns', 'pos', 'items', 'ledger', 'stock-rows']) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => { if (e instanceof ApiError && e.code === 'GRN_WARNINGS') setWarning(e.message); },
  });

  const grn: Grn | undefined = isDraft ? (draft ? draftToGrn(draft) : undefined) : q.data;
  const form = draft ? {
    invoiceNo: draft.invoiceNo, invoiceDate: draft.invoiceDate, freight: draft.freight, notes: draft.notes,
    set: (patch: Partial<Pick<Draft, 'invoiceNo' | 'invoiceDate' | 'freight' | 'notes'>>) => update((d) => ({ ...d, ...patch })),
  } : null;
  return { query, grn, scan, setQty, finish, warning, clearWarning: () => setWarning(null), feedback, canEdit: isDraft && !!draft, form };
}
