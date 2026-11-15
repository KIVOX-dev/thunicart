import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/http';
import { IMPORT_FIELDS, type ImportBatch, type ImportFieldKey } from './types';
import { uploadFile } from './use-uploads';

export type Mapping = Partial<Record<ImportFieldKey, string>>;

/** Guesses a column for each field from its name. The person can change every guess. */
const SYNONYMS: Record<ImportFieldKey, string[]> = {
  code: ['code', 'item code', 'sku'], name: ['item name', 'name', 'description'], category: ['cat', 'category', 'product category', 'group'], brand: ['brand'],
  model: ['model', 'style', 'model/style no'], size: ['size'], hsn: ['hsn', 'hsn code'], qty: ['qty', 'quantity', 'stock'], cost: ['purchase', 'base cost', 'cost'], rate: ['s.rate', 'selling rate', 'rate'], mrp: ['mrp', 'retail mrp'],
};
export function suggestMapping(columns: string[]): Mapping {
  const out: Mapping = {};
  for (const f of IMPORT_FIELDS) {
    const hit = columns.find((c) => SYNONYMS[f.key].includes(c.trim().toLowerCase()));
    if (hit) out[f.key] = hit;
  }
  return out;
}

/* The screen's field names and the API's field names differ for four fields. */
const TO_API: Record<string, string> = { code: 'itemCode', qty: 'openingQty', cost: 'baseCost', rate: 'sellingPrice' };
const FROM_API: Record<string, string> = Object.fromEntries(Object.entries(TO_API).map(([a, b]) => [b, a]));
const SCREEN_KEYS = new Set<string>(IMPORT_FIELDS.map((f) => f.key));

/** The API's mapping split in two: fields this screen shows, and the rest (print name, batch no...) which are passed through untouched. */
function fromApiMapping(m: Record<string, string>): { shown: Mapping; extra: Record<string, string> } {
  const shown: Mapping = {}; const extra: Record<string, string> = {};
  for (const [k, col] of Object.entries(m)) {
    const key = FROM_API[k] ?? k;
    if (SCREEN_KEYS.has(key)) shown[key as ImportFieldKey] = col; else extra[k] = col;
  }
  return { shown, extra };
}
function toApiMapping(shown: Mapping, extra: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...extra };
  for (const [k, col] of Object.entries(shown)) if (col) out[TO_API[k] ?? k] = col;
  return out;
}

interface ApiImport {
  id: string; filename: string; status: string; sheets: { name: string; rows: number; headers: string[] }[];
  suggestedMapping: { name: string; sheet: string | null; mapping: Record<string, string> } | null;
  progress: { processed: number; total: number };
  counts: { new: number; updated: number; skipped: number; failed: number; reviewFlagged: number } | null; createdAt: string;
}
interface ApiPreview { counts: NonNullable<ApiImport['counts']>; totals: { pieces: number }; errors: { row: number; code: string | null; message: string }[] }

const STATUS: Record<string, ImportBatch['status']> = { uploaded: 'uploaded', mapped: 'uploaded', failed: 'uploaded', previewed: 'dry-run', committing: 'committing', committed: 'committed', rolled_back: 'rolled-back' };

/** Turns the API's import batch into the shape the screens use. */
function toBatch(b: ApiImport, pieces = 0, errors: ImportBatch['errors'] = []): ImportBatch {
  const c = b.counts;
  return {
    id: b.id, fileName: b.filename, status: STATUS[b.status] ?? 'uploaded',
    progress: b.progress.total ? Math.min(100, Math.round((b.progress.processed / b.progress.total) * 100)) : 0,
    sheets: b.sheets.map((s) => ({ name: s.name, rows: s.rows, columns: s.headers })),
    counts: c ? { rows: c.new + c.updated + c.skipped + c.failed, ok: c.new + c.updated, warnings: c.reviewFlagged, errors: c.failed + c.skipped, items: c.new + c.updated, pieces } : null,
    errors, createdAt: b.createdAt,
  };
}

const BATCHES = ['imports'] as const;
export function useImports() {
  return useQuery({ queryKey: BATCHES, queryFn: async () => (await api.get<{ items: ApiImport[] }>('/imports')).items.map((b) => toBatch(b)) });
}

/** Wizard state and actions: upload, choose sheet, map columns, dry run, commit with progress, rollback. */
export function useImportWizard() {
  const qc = useQueryClient();
  const [step, setStep] = useState<'upload' | 'sheet' | 'mapping' | 'dry-run' | 'commit'>('upload');
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [sheet, setSheet] = useState('');
  const [mapping, setMapping] = useState<Mapping>({});
  const [saveMapping, setSaveMapping] = useState(true);
  const [upload, setUpload] = useState<{ name: string; progress: number; error?: string } | null>(null);
  const suggested = useRef<ApiImport['suggestedMapping']>(null);
  const extra = useRef<Record<string, string>>({});
  const pieces = useRef(0);

  const doUpload = useMutation({
    mutationFn: async (file: File) => {
      setUpload({ name: file.name, progress: 0 });
      const key = await uploadFile(file, 'import', (progress) => setUpload({ name: file.name, progress }));
      return api.post<ApiImport>('/imports', { fileKey: key, filename: file.name, target: 'opening_stock' });
    },
    onSuccess: (b) => {
      suggested.current = b.suggestedMapping; pieces.current = 0;
      setBatch(toBatch(b));
      setSheet(b.suggestedMapping?.sheet ?? b.sheets.find((s) => /^STOCKSUMMARY/i.test(s.name))?.name ?? b.sheets[0]?.name ?? '');
      setStep('sheet'); setUpload(null);
    },
    onError: (e) => setUpload((u) => ({ name: u?.name ?? '', progress: 0, error: (e as Error).message })),
  });

  const columns = batch?.sheets.find((s) => s.name === sheet)?.columns ?? [];
  const chooseSheet = () => {
    // The ready-made mapping for the Krishnas Orchids stock sheet wins when all its columns exist in this sheet, otherwise guess from the names.
    const s = suggested.current;
    const have = new Set(columns.map((c) => c.trim()));
    if (s && Object.values(s.mapping).every((c) => have.has(c.trim()))) {
      const split = fromApiMapping(s.mapping);
      extra.current = split.extra; setMapping(split.shown);
    } else { extra.current = {}; setMapping(suggestMapping(columns)); }
    setStep('mapping');
  };
  const dry = useMutation({
    mutationFn: async () => {
      await api.put(`/imports/${batch!.id}/mapping`, { sheet, headerRow: 1, mapping: toApiMapping(mapping, extra.current), ...(saveMapping ? { saveMappingAs: 'My stock sheet' } : {}) });
      const p = await api.get<ApiPreview>(`/imports/${batch!.id}/preview`);
      pieces.current = p.totals.pieces;
      const base = await api.get<ApiImport>(`/imports/${batch!.id}`);
      return toBatch({ ...base, counts: p.counts, status: 'previewed' }, p.totals.pieces, p.errors.map((e) => ({ row: e.row, code: e.code ?? '', field: '', message: e.message })));
    },
    onSuccess: (b) => { setBatch(b); setStep('dry-run'); },
  });
  const commit = useMutation({
    mutationFn: async () => {
      setStep('commit');
      // Each call works for up to 20 seconds and can be repeated until the API says it is done.
      let r: { processed: number; total: number; done: boolean };
      do {
        r = await api.post(`/imports/${batch!.id}/commit`, { maxSeconds: 20 });
        setBatch((b) => (b ? { ...b, status: 'committing', progress: r.total ? Math.round((r.processed / r.total) * 100) : 0 } : b));
      } while (!r.done);
      return toBatch(await api.get<ApiImport>(`/imports/${batch!.id}`), pieces.current);
    },
    onSuccess: (b) => { setBatch(b); void qc.invalidateQueries(); },
    onError: () => setStep('dry-run'),
  });
  const rollback = useMutation({
    mutationFn: async () => { await api.post(`/imports/${batch!.id}/rollback`, {}); return toBatch(await api.get<ApiImport>(`/imports/${batch!.id}`)); },
    onSuccess: (b) => { setBatch(b); void qc.invalidateQueries(); },
  });

  const reset = () => { setBatch(null); setStep('upload'); setMapping({}); setUpload(null); };
  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
  return { step, setStep, batch, sheet, setSheet, mapping, setMapping, columns, saveMapping, setSaveMapping, upload, doUpload, chooseSheet, dry, commit, rollback, reset, missingRequired, hasSaved: !!suggested.current };
}

/** Rollback from the history list, for a batch that is not the one open in the wizard. */
export function useRollbackBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await api.post(`/imports/${id}/rollback`, {}); },
    onSuccess: () => qc.invalidateQueries(),
  });
}
