import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, downloadFile, MOCK_MODE, newIdempotencyKey } from '../api/http';
import { applyFieldIssues } from '../api/field-issues';
import { rupeesToPaise } from '../api/money';
import { uploadFile } from '../catalog/use-uploads';
import { customerDto, listEnvelope } from '../catalog/types';
import { dashboardDto, jobDto, receiptList, receivableRow, reportData, reportMeta, type Job } from './types';

/** The real backend publishes the dashboard as /dashboard/summary with its own field names. This maps it onto the shape the screens use. */
const CHANNEL_NAMES: Record<string, string> = { POS: 'POS', ECM: 'Online', CNT: 'Counter' };
interface BackendPeriod { total?: number; bills?: number; averageBill?: number; byChannel?: Record<string, number> }
interface BackendDashboard {
  today?: BackendPeriod; monthToDate?: BackendPeriod; grossMargin?: { amount?: number }; lowStockCount?: number; nonMovingStockValue?: number;
  payablesDueThisWeek?: number; receivablesOverdue?: number; last30Days?: Array<{ date: string; sales?: number }>; topItems?: Array<{ name: string; qty: number; netSales?: number }>;
}
function fromBackend(r: BackendDashboard) {
  const period = (p?: BackendPeriod) => ({
    total: p?.total ?? 0, bills: p?.bills ?? 0, average: p?.averageBill ?? 0,
    channels: Object.fromEntries(Object.entries(p?.byChannel ?? {}).filter(([, v]) => v > 0).map(([k, v]) => [CHANNEL_NAMES[k] ?? k, v])),
  });
  return {
    today: period(r.today), month: period(r.monthToDate), margin: { today: 0, month: r.grossMargin?.amount ?? 0 },
    lowStock: r.lowStockCount ?? 0, nonMovingValue: r.nonMovingStockValue ?? 0, payablesDue: r.payablesDueThisWeek ?? 0, receivablesOverdue: r.receivablesOverdue ?? 0,
    salesLine: (r.last30Days ?? []).map((d) => ({ date: d.date, total: d.sales ?? 0 })),
    topItems: (r.topItems ?? []).map((t) => ({ name: t.name, qty: t.qty, amount: t.netSales ?? 0 })),
  };
}
export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: async () => dashboardDto.parse(MOCK_MODE ? await api.get('/dashboard') : fromBackend(await api.get<BackendDashboard>('/dashboard/summary'))) });
}
export function useReportList() { return useQuery({ queryKey: ['report-list'], queryFn: async () => (await api.get<unknown[]>('/reports')).map((r) => reportMeta.parse(r)) }); }

export interface ReportFilters { from: string; to: string; category: string; brand: string; vendor: string; q: string }
export const EMPTY_REPORT_FILTERS: ReportFilters = { from: '', to: '', category: '', brand: '', vendor: '', q: '' };
export const filterQuery = (f: ReportFilters) => Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export function useReport(key: string, f: ReportFilters, sort: string, page: number) {
  return useQuery({ queryKey: ['report', key, f, sort, page], queryFn: async () => reportData.parse(await api.get(`/reports/${key}`, { ...f, sort, page, pageSize: 25 })), placeholderData: (p) => p });
}

/**
 * A download. Small reports download straight away. Big reports start a background job: a progress bar shows while it runs,
 * then a link to download appears.
 */
export function useDownload(opts: { key: string; title: string; big: boolean; query: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const run = async (format: string, ext: string) => {
    setError(null); setSaved(null); setBusy(true);
    const name = `${opts.key}.${ext}`;
    try {
      if (opts.big) setJob(jobDto.parse(await api.post('/reports/jobs', { key: opts.key, format, query: opts.query }, { idempotencyKey: newIdempotencyKey() })));
      else { await downloadFile(`/reports/${opts.key}/download?format=${format}${opts.query ? `&${opts.query}` : ''}`, name); setSaved(name); }
    } catch (e) { setError(e instanceof ApiError ? e : null); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (!job || job.status === 'done') return;
    const t = setInterval(async () => { try { setJob(jobDto.parse(await api.get(`/reports/jobs/${job.id}`))); } catch { /* keep polling */ } }, 500);
    return () => clearInterval(t);
  }, [job]);
  const fetchJob = async () => { if (job) { const ext = job.format === 'xlsx' ? 'xlsx' : job.format; await downloadFile(job.path, `${opts.key}.${ext}`); setSaved(`${opts.key}.${ext}`); } };
  return { run, busy, error, job, saved, fetchJob, clearJob: () => setJob(null) };
}

/* Accounts: expenses and charges. Both are the /expenses endpoint; kind tells them apart. */
export type CashKind = 'expense' | 'charge';
export const CASH_MODES = ['cash', 'bank', 'upi', 'cheque', 'card'] as const;
interface ApiExpense { id: string; kind?: CashKind; category: string; payee?: string; date: string; mode: string; amount: number; notes?: string; receiptKey?: string | null }
const toExpense = (e: ApiExpense) => ({ id: e.id, date: e.date, category: e.category, payee: e.payee ?? '', mode: e.mode, amount: e.amount, note: e.notes ?? '', receiptKey: e.receiptKey ?? null });
export type CashEntry = ReturnType<typeof toExpense>;

export function useExpenses(category: string, kind: CashKind = 'expense') {
  return useInfiniteQuery({
    queryKey: ['expenses', kind, category], initialPageParam: 1,
    queryFn: async ({ pageParam }) => { const r = await api.get<{ items: ApiExpense[]; total: number; nextPage: number | null }>('/expenses', { kind, q: category || undefined, page: pageParam, pageSize: 20 }); return { ...r, items: r.items.map(toExpense) }; },
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
/** Total of this calendar month (India time), from the latest 100 entries. */
export function useMonthTotal(kind: CashKind) {
  return useQuery({
    queryKey: ['expenses', kind, 'month'],
    queryFn: async () => {
      const month = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);
      const r = await api.get<{ items: ApiExpense[] }>('/expenses', { kind, pageSize: 100 });
      return r.items.filter((e) => new Date(new Date(e.date).getTime() + 5.5 * 3600e3).toISOString().slice(0, 7) === month).reduce((a, e) => a + e.amount, 0);
    },
  });
}
export function useExpenseForm(onDone: () => void, kind: CashKind = 'expense') {
  const qc = useQueryClient();
  const [category, setCategory] = useState('');
  const [payee, setPayee] = useState('');
  const [mode, setMode] = useState<(typeof CASH_MODES)[number]>('cash');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<{ name: string; key: string | null; progress: number; error?: string; preview?: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({ mutationFn: (b: unknown) => api.post('/expenses', b, { idempotencyKey: key }), onSuccess: () => Promise.all(['expenses', 'report', 'dashboard', 'cashflow'].map((k) => qc.invalidateQueries({ queryKey: [k] }))) });
  const attach = async (file: File) => {
    setReceipt({ name: file.name, key: null, progress: 0, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined });
    try { const k = await uploadFile(file, 'receipt', (progress) => setReceipt((r) => (r ? { ...r, progress } : r))); setReceipt((r) => (r ? { ...r, key: k, progress: 100 } : r)); } catch (e) { setReceipt((r) => (r ? { ...r, error: (e as Error).message } : r)); }
  };
  return {
    kind, category, setCategory, payee, setPayee, mode, setMode, amount, setAmount, date, setDate, note, setNote, receipt, attach, retry: (f: File) => attach(f), clearReceipt: () => setReceipt(null), errors, banner, saving: m.isPending,
    submit: async () => {
      setErrors({}); setBanner(null);
      if (receipt && !receipt.key && !receipt.error) return setBanner({ message: 'Wait for the receipt photo to finish uploading.' });
      try {
        await m.mutateAsync({ kind, date: new Date(`${date}T00:00:00+05:30`).toISOString(), category, payee, mode, amount: rupeesToPaise(amount), notes: note, receiptKey: receipt?.key ?? null });
        setCategory(''); setPayee(''); setAmount(''); setNote(''); setReceipt(null); onDone();
      } catch (e) { const r = applyFieldIssues(e); setErrors(r.errors); setBanner(r.banner); }
    },
  };
}

/* Accounts: what we owe vendors, and settlements */
export interface VendorDue { vendorId: string; vendorName: string; billed: number; paid: number; debitNotes: number; settled: number; outstanding: number; advance: number; bills: Array<{ billId: string; billNumber: string; vendorBillNo: string; dueDate: string; total: number; paid: number; debitNotes: number; settled: number; outstanding: number; daysOverdue: number }> }
/** Live from purchase bills, vendor payments, vendor returns (debit notes) and settlements. One request per vendor, as the API gives it. */
export function useVendorDues() {
  return useQuery({
    queryKey: ['cashflow', 'vendor-dues'],
    queryFn: async () => {
      const vendors = (await api.get<{ items: Array<{ id: string; name: string }> }>('/vendors', { pageSize: 100 })).items;
      const rows = await Promise.all(vendors.map(async (v) => ({ ...(await api.get<Omit<VendorDue, 'vendorId' | 'vendorName'>>(`/vendors/${v.id}/outstanding`)), vendorId: v.id, vendorName: v.name })));
      return rows.filter((r) => r.outstanding > 0 || r.advance > 0).sort((a, b) => b.outstanding - a.outstanding);
    },
  });
}
export interface Settlement { id: string; settlementNumber: string; vendorName: string; billNumber: string; date: string; kind: 'full' | 'partial'; amount: number; reason: string }
export function useSettlements() {
  return useInfiniteQuery({
    queryKey: ['settlements'], initialPageParam: 1,
    queryFn: async ({ pageParam }) => api.get<{ items: Settlement[]; total: number; nextPage: number | null }>('/vendor-settlements', { page: pageParam, pageSize: 20 }),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
/** Mark vendor outstanding on one bill as settled, fully or partly. No cash moves; the bill's balance and the vendor's outstanding drop. */
export function useSettleForm(bill: { billId: string; outstanding: number }, onDone: () => void) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({
    mutationFn: (b: unknown) => api.post('/vendor-settlements', b, { idempotencyKey: key }),
    onSuccess: () => Promise.all(['cashflow', 'settlements', 'bills', 'ageing', 'vendor-outstanding', 'vendors', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  });
  return {
    kind, setKind, amount, setAmount, reason, setReason, errors, banner, saving: m.isPending,
    submit: async () => {
      setErrors({}); setBanner(null);
      try { await m.mutateAsync({ billId: bill.billId, date: new Date().toISOString(), kind, ...(kind === 'partial' ? { amount: rupeesToPaise(amount) } : {}), reason }); onDone(); } catch (e) { const r = applyFieldIssues(e); setErrors(r.errors); setBanner(r.banner); }
    },
  };
}
/** Cashflow this month for the dashboard: money in and out from the day book. */
export function useCashflow() {
  return useQuery({
    queryKey: ['cashflow', 'month'],
    queryFn: async () => {
      const from = new Date(`${new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7)}-01T00:00:00+05:30`).toISOString();
      const r = await api.get<{ totals: { in: number; out: number; net: number } }>('/accounts/daybook', { from });
      return r.totals;
    },
  });
}
export function useReceipts() {
  return useInfiniteQuery({
    queryKey: ['receipts'], initialPageParam: 1,
    queryFn: async ({ pageParam }) => receiptList.parse(await api.get('/accounts/receipts', { page: pageParam, pageSize: 20 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useReceivables() { return useQuery({ queryKey: ['receivables'], queryFn: async () => (await api.get<unknown[]>('/accounts/receivables')).map((r) => receivableRow.parse(r)) }); }
export function useOwingCustomers() {
  return useQuery({ queryKey: ['customers', 'owing'], queryFn: async () => listEnvelope(customerDto).parse(await api.get('/customers', { pageSize: 100 })).items.filter((c) => c.outstanding > 0) });
}
export function useReceiptForm(onDone: () => void) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('UPI');
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({ mutationFn: (b: unknown) => api.post('/accounts/receipts', b, { idempotencyKey: key }), onSuccess: () => Promise.all(['receipts', 'receivables', 'customers', 'report', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] }))) });
  return {
    customerId, setCustomerId, amount, setAmount, mode, setMode, reference, setReference, errors, banner, saving: m.isPending,
    submit: async () => { setErrors({}); setBanner(null); try { await m.mutateAsync({ customerId, amount: rupeesToPaise(amount), mode, reference }); setAmount(''); setReference(''); onDone(); } catch (e) { const r = applyFieldIssues(e); setErrors(r.errors); setBanner(r.banner); } },
  };
}

/* Exports: each list has its own button (components/ExportButton) */
/** One export at a time: start a job, show progress, then download. The history list updates when it finishes. */
export function useExportRun() {
  const qc = useQueryClient();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const start = async (dataset: string, format: 'csv' | 'xlsx') => {
    setError(null); setSaved(null);
    try { setJob(jobDto.parse(await api.post('/exports', { dataset, format }, { idempotencyKey: newIdempotencyKey() }))); } catch (e) { setError(e instanceof ApiError ? e.friendly : 'Could not start the export.'); }
  };
  useEffect(() => {
    if (!job || job.status === 'done') return;
    const t = setInterval(async () => { try { const j = jobDto.parse(await api.get(`/reports/jobs/${job.id}`)); setJob(j); if (j.status === 'done') void qc.invalidateQueries({ queryKey: ['export-history'] }); } catch { /* keep polling */ } }, 500);
    return () => clearInterval(t);
  }, [job, qc]);
  const download = async () => {
    if (!job) return;
    const name = job.dataset === 'all' ? 'thunikart-everything.zip' : `${job.dataset}.${job.format}`;
    try { await downloadFile(job.path, name); setSaved(name); } catch { setError('The download failed. Try again.'); }
  };
  return { job, error, saved, start, download, running: job?.status === 'running' };
}
