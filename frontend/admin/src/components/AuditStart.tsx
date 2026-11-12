import { useState } from 'react';
import { Button, Field, Select } from '@thunikart/ui';
import { ErrorBanner } from './ErrorBanner';
import { applyFieldIssues } from '../features/api/field-issues';
import { useFacets } from '../features/catalog/use-items';
import { useStartAudit } from '../features/inventory/use-audit';

/** Start a stock count for a store, for everything or one category. */
export function AuditStart({ onStarted }: { onStarted: (id: string) => void }) {
  const facets = useFacets().data;
  const start = useStartAudit();
  const [storeId, setStoreId] = useState('');
  const [category, setCategory] = useState('');
  const [err, setErr] = useState<ReturnType<typeof applyFieldIssues> | null>(null);
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setErr(null); try { onStarted((await start.mutateAsync({ storeId, category: category || undefined })).id); } catch (x) { setErr(applyFieldIssues(x)); } }} className="flex flex-col gap-4" aria-label="Start stock count">
      {err && <ErrorBanner {...err.banner} />}
      <Field label="Store" required error={err?.errors.storeId}>{(p) => <Select {...p} value={storeId} onChange={(e) => setStoreId(e.target.value)}><option value="">Choose a store</option>{facets?.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
      <Field label="Count" hint="Count one category at a time to keep it short">{(p) => <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All items</option>{facets?.categories.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
      <Button type="submit" variant="primary" loading={start.isPending} disabled={!storeId}>Start counting</Button>
    </form>
  );
}
