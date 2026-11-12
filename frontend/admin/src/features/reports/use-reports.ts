import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, downloadFile, newIdempotencyKey } from '../api/http';
import { applyFieldIssues } from '../api/field-issues';
import { rupeesToPaise } from '../api/money';
import { uploadFile } from '../catalog/use-uploads';
import { customerDto, listEnvelope } from '../catalog/types';
import { dashboardDto, exportRecord, expenseList, jobDto, receiptList, receivableRow, reportData, reportMeta, type Job } from './types';

export function useDashboard() { return useQuery({ queryKey: ['dashboard'], queryFn: async () => dashboardDto.parse(await api.get('/dashboard')) }); }
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

/* Accounts */
export function useExpenses(category: string) {
  return useInfiniteQuery({
    queryKey: ['expenses', category], initialPageParam: 1,
    queryFn: async ({ pageParam }) => expenseList.parse(await api.get('/accounts/expenses', { category, page: pageParam, pageSize: 20 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useExpenseForm(onDone: () => void) {
  const qc = useQueryClient();
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<{ name: string; key: string | null; progress: number; error?: string; preview?: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({ mutationFn: (b: unknown) => api.post('/accounts/expenses', b, { idempotencyKey: key }), onSuccess: () => Promise.all(['expenses', 'report', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] }))) });
  const attach = async (file: File) => {
    setReceipt({ name: file.name, key: null, progress: 0, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined });
    try { const k = await uploadFile(file, 'receipt', (progress) => setReceipt((r) => (r ? { ...r, progress } : r))); setReceipt((r) => (r ? { ...r, key: k, progress: 100 } : r)); } catch (e) { setReceipt((r) => (r ? { ...r, error: (e as Error).message } : r)); }
  };
  return {
    category, setCategory, amount, setAmount, date, setDate, note, setNote, receipt, attach, retry: (f: File) => attach(f), clearReceipt: () => setReceipt(null), errors, banner, saving: m.isPending,
    submit: async () => {
      setErrors({}); setBanner(null);
      if (receipt && !receipt.key && !receipt.error) return setBanner({ message: 'Wait for the receipt photo to finish uploading.' });
      try { await m.mutateAsync({ date, category, amount: rupeesToPaise(amount), note, receiptKey: receipt?.key ?? null }); setCategory(''); setAmount(''); setNote(''); setReceipt(null); onDone(); } catch (e) { const r = applyFieldIssues(e); setErrors(r.errors); setBanner(r.banner); }
    },
  };
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

/* Export center */
export function useDatasets() { return useQuery({ queryKey: ['export-datasets'], queryFn: () => api.get<Array<{ key: string; label: string }>>('/exports/datasets') }); }
export function useExportHistory() { return useQuery({ queryKey: ['export-history'], queryFn: async () => (await api.get<unknown[]>('/exports')).map((r) => exportRecord.parse(r)) }); }
export function useMonthlyEmail() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['export-settings'], queryFn: () => api.get<{ monthlyEmail: boolean }>('/exports/settings') });
  // The switch moves at once and goes back if the API refuses.
  const m = useMutation({
    mutationFn: (v: boolean) => api.put<{ monthlyEmail: boolean }>('/exports/settings', { monthlyEmail: v }),
    onMutate: (v) => { const prev = qc.getQueryData(['export-settings']); qc.setQueryData(['export-settings'], { monthlyEmail: v }); return { prev }; },
    onError: (_e, _v, ctx) => qc.setQueryData(['export-settings'], ctx?.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['export-settings'] }),
  });
  return { on: q.data?.monthlyEmail ?? false, set: (v: boolean) => m.mutate(v), busy: m.isPending };
}
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
