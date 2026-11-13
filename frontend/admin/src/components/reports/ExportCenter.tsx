import { formatDate } from '@thunikart/shared';
import { Button, Checkbox, EmptyState, ListSkeleton } from '@thunikart/ui';
import { useDatasets, useExportHistory, useExportRun, useMonthlyEmail } from '../../features/reports/use-reports';
import { ErrorBanner, QueryError } from '../ErrorBanner';

/** One button per dataset, a Download everything button that gives the zip, the export history, and the monthly email switch. */
export function ExportCenter({ big }: { big?: boolean }) {
  const ds = useDatasets();
  const hist = useExportHistory();
  const run = useExportRun();
  const email = useMonthlyEmail();
  const h = big ? 'min-h-12' : '';
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <section aria-label="Download everything" className="rounded border-2 border-navy-100 bg-mist p-4">
        <h2 className="text-xs">Everything</h2>
        <p className="mt-1 text-sm text-muted">One zip with items, vendors, customers, sales, purchases, stock and expenses.</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button variant="primary" className={h} disabled={run.running} onClick={() => run.start('all', 'xlsx')}>Download everything (zip of Excel)</Button><Button className={h} disabled={run.running} onClick={() => run.start('all', 'csv')}>Zip of CSV</Button></div>
      </section>
      <section aria-label="Datasets"><h2 className="mb-2 text-xs">One dataset at a time</h2>
        {ds.isPending ? <ListSkeleton rows={3} label="Loading datasets" /> : ds.isError ? <QueryError error={ds.error} onRetry={() => ds.refetch()} /> : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">{ds.data.map((d) => (
            <li key={d.key} className="flex items-center justify-between gap-2 rounded border-2 border-navy-100 p-3 text-sm"><strong>{d.label}</strong>
              <span className="flex gap-2"><Button size="sm" className={big ? 'min-h-11' : ''} disabled={run.running} onClick={() => run.start(d.key, 'xlsx')} aria-label={`Export ${d.label} as Excel`}>Excel</Button><Button size="sm" className={big ? 'min-h-11' : ''} disabled={run.running} onClick={() => run.start(d.key, 'csv')} aria-label={`Export ${d.label} as CSV`}>CSV</Button></span></li>
          ))}</ul>
        )}
      </section>
      <div aria-live="polite" className="space-y-2">
        {run.error && <ErrorBanner message={run.error} />}
        {run.job && (
          <div className="rounded border-2 border-navy-100 p-3 text-sm" data-testid="export-job">
            {run.job.status === 'running' ? (<><p>Preparing {run.job.title}… {run.job.progress}%</p><div className="mt-1 h-2 overflow-hidden rounded bg-mist" role="progressbar" aria-valuenow={run.job.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Export progress"><div className="h-full bg-teal transition-all" style={{ width: `${run.job.progress}%` }} /></div></>)
              : <p>Ready. <button type="button" className="font-semibold underline" onClick={run.download}>Download {run.job.title} ({run.job.format.toUpperCase()}{run.job.dataset === 'all' ? ', zip' : ''})</button></p>}
          </div>
        )}
        {run.saved && <p role="status" className="text-xs text-muted" data-testid="export-saved">Saved {run.saved}</p>}
      </div>
      <section aria-label="Monthly email" className="rounded border-2 border-navy-100 p-4">
        <Checkbox label="Email me everything on the 1st of every month" checked={email.on} disabled={email.busy} onChange={(e) => email.set(e.target.checked)} />
        <p className="mt-1 text-xs text-muted">The zip is sent to the Admin email address.</p>
      </section>
      <section aria-label="Export history"><h2 className="mb-2 text-xs">Export history</h2>
        {hist.isPending ? <ListSkeleton rows={2} label="Loading history" /> : hist.isError ? <QueryError error={hist.error} onRetry={() => hist.refetch()} /> : hist.data.length === 0 ? <EmptyState title="No exports yet" /> : (
          <ul className="divide-y divide-line rounded border-2 border-navy-100 text-sm" data-testid="export-history">{hist.data.map((x) => <li key={x.id} className="flex justify-between gap-3 p-3"><span><strong>{x.dataset === 'all' ? 'Everything' : x.dataset}</strong> as {x.format.toUpperCase()}</span><span className="text-xs text-muted">{x.by} · {formatDate(x.at)} {new Date(x.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}
