import { useState } from 'react';
import { Download } from 'lucide-react';
import { BottomSheet, Button } from '@thunikart/ui';
import { useCan } from '../features/auth/permissions';
import { useExportRun } from '../features/reports/use-reports';
import { ApiError, downloadFile, MOCK_MODE } from '../features/api/http';
import { ErrorBanner } from './ErrorBanner';

/** Keys the export job understands. */
export type ExportDataset = 'items' | 'vendors' | 'customers' | 'sales' | 'purchases' | 'stock' | 'expenses';

/**
 * The download button that sits on a list: Excel or CSV of that list. It replaces the old Export center screen.
 * Hidden for roles without reports.export, because the API refuses them anyway. On a phone the choices open as a bottom sheet.
 */
export function ExportButton({ dataset, label = 'Export', sheet }: { dataset: ExportDataset; label?: string; sheet?: boolean }) {
  const can = useCan();
  const run = useExportRun();
  const [open, setOpen] = useState(false);
  // Against the real backend a list export is the report of the same name, downloaded straight away. The demo server keeps its own job flow.
  const [direct, setDirect] = useState<{ busy: boolean; saved: string | null; error: string | null }>({ busy: false, saved: null, error: null });
  if (!can('reports.export')) return null;
  const item = 'flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-mist';
  const pick = async (fmt: 'xlsx' | 'csv' | 'pdf') => {
    setOpen(false);
    if (MOCK_MODE) return fmt === 'pdf' ? undefined : run.start(dataset, fmt);
    const name = `${dataset}.${fmt}`;
    setDirect({ busy: true, saved: null, error: null });
    try { await downloadFile(`/reports/${dataset}?format=${fmt}`, name); setDirect({ busy: false, saved: name, error: null }); }
    catch (e) { setDirect({ busy: false, saved: null, error: e instanceof ApiError ? e.friendly : 'The download failed. Try again.' }); }
  };
  const choices = [{ f: 'xlsx' as const, t: 'Excel (.xlsx)' }, { f: 'pdf' as const, t: 'PDF (table only)' }, { f: 'csv' as const, t: 'CSV' }].filter((c) => !(MOCK_MODE && c.f === 'pdf')).map((c) => <button key={c.f} type="button" role="menuitem" className={item} onClick={() => pick(c.f)}>{c.t}</button>);
  return (
    <div className="relative inline-block">
      <Button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} disabled={run.running || direct.busy} className={sheet ? 'min-h-12' : ''}><Download aria-hidden size={16} />{label}</Button>
      {open && !sheet && <div role="menu" aria-label={`Export ${dataset} as`} className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded border-2 border-navy-100 bg-white py-1 shadow-overlay">{choices}</div>}
      {sheet && <BottomSheet open={open} onClose={() => setOpen(false)} title="Export as"><div role="menu" className="flex flex-col divide-y divide-line">{choices}</div></BottomSheet>}
      <div className="mt-2 space-y-2" aria-live="polite">
        {(run.error || direct.error) && <ErrorBanner message={(run.error ?? direct.error)!} />}
        {direct.saved && <p role="status" className="text-xs text-muted">Saved {direct.saved}</p>}
        {run.job && (
          <div className="rounded border-2 border-navy-100 p-2 text-sm" data-testid="export-job">
            {run.job.status === 'running' ? <p>Preparing {run.job.title}… {run.job.progress}%</p> : <p>Ready. <button type="button" className="font-semibold underline" onClick={run.download}>Download {run.job.title} ({run.job.format.toUpperCase()})</button></p>}
          </div>
        )}
        {run.saved && <p role="status" className="text-xs text-muted" data-testid="export-saved">Saved {run.saved}</p>}
      </div>
    </div>
  );
}
