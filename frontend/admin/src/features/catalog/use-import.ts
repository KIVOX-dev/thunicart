import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '../api/http';
import { IMPORT_FIELDS, importBatch, type ImportBatch, type ImportFieldKey } from './types';
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

const BATCHES = ['imports'] as const;
export function useImports() {
  return useQuery({ queryKey: BATCHES, queryFn: async () => (await api.get<unknown[]>('/imports')).map((b) => importBatch.parse(b)) });
}
export function useSavedMapping(target: string) {
  return useQuery({ queryKey: ['import-mapping', target], queryFn: async () => (await api.get<{ mapping: Mapping | null }>(`/import-mappings/${target}`)).mapping });
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
  const [commitKey, setCommitKey] = useState(newIdempotencyKey);
  const saved = useSavedMapping('items');

  const doUpload = useMutation({
    mutationFn: async (file: File) => {
      setUpload({ name: file.name, progress: 0 });
      const key = await uploadFile(file, 'import', (progress) => setUpload({ name: file.name, progress }));
      return importBatch.parse(await api.post('/imports', { fileKey: key, fileName: file.name }, { idempotencyKey: newIdempotencyKey() }));
    },
    onSuccess: (b) => { setBatch(b); setSheet(b.sheets[0]?.name ?? ''); setStep('sheet'); setUpload(null); },
    onError: (e) => setUpload((u) => ({ name: u?.name ?? '', progress: 0, error: (e as Error).message })),
  });

  const columns = batch?.sheets.find((s) => s.name === sheet)?.columns ?? [];
  const chooseSheet = () => {
    // A saved mapping wins when all its columns exist in this sheet, otherwise guess from the names.
    const s = saved.data;
    setMapping(s && Object.values(s).every((c) => columns.includes(c ?? '')) ? s : suggestMapping(columns));
    setStep('mapping');
  };
  const dry = useMutation({
    mutationFn: async () => importBatch.parse(await api.post(`/imports/${batch!.id}/dry-run`, { sheet, target: 'items', mapping, saveMapping })),
    onSuccess: (b) => { setBatch(b); setStep('dry-run'); void qc.invalidateQueries({ queryKey: ['import-mapping'] }); },
  });
  const commit = useMutation({
    mutationFn: async () => importBatch.parse(await api.post(`/imports/${batch!.id}/commit`, {}, { idempotencyKey: commitKey })),
    onSuccess: (b) => { setBatch(b); setStep('commit'); },
  });
  const rollback = useMutation({
    mutationFn: async () => importBatch.parse(await api.post(`/imports/${batch!.id}/rollback`, {})),
    onSuccess: (b) => { setBatch(b); void qc.invalidateQueries(); },
  });

  // Poll the background job while it commits.
  const committing = batch?.status === 'committing';
  useEffect(() => {
    if (!committing || !batch) return;
    const t = setInterval(async () => {
      const b = importBatch.parse(await api.get(`/imports/${batch.id}`));
      setBatch(b);
      if (b.status !== 'committing') { void qc.invalidateQueries(); }
    }, 600);
    return () => clearInterval(t);
  }, [committing, batch, qc]);

  const reset = () => { setBatch(null); setStep('upload'); setMapping({}); setCommitKey(newIdempotencyKey()); setUpload(null); };
  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
  return { step, setStep, batch, sheet, setSheet, mapping, setMapping, columns, saveMapping, setSaveMapping, upload, doUpload, chooseSheet, dry, commit, rollback, reset, missingRequired, hasSaved: !!saved.data };
}

/** Rollback from the history list, for a batch that is not the one open in the wizard. */
export function useRollbackBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => importBatch.parse(await api.post(`/imports/${id}/rollback`, {})),
    onSuccess: () => qc.invalidateQueries(),
  });
}
