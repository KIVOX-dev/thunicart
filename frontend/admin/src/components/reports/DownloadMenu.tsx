import { useState } from 'react';
import { Download } from 'lucide-react';
import { BottomSheet, Button } from '@thunikart/ui';
import { FORMATS } from '../../features/reports/types';
import { useDownload } from '../../features/reports/use-reports';
import { ErrorBanner } from '../ErrorBanner';

/**
 * Download menu: Excel, CSV and PDF (plus JSON for GST returns). Big reports run as a background job with a progress bar and then
 * offer a download link. On a phone the menu is a bottom sheet with big buttons.
 */
export function DownloadMenu({ reportKey, title, big, gst, query, sheet, disabled }: { reportKey: string; title: string; big: boolean; gst?: boolean; query: string; sheet?: boolean; disabled?: boolean }) {
  const d = useDownload({ key: reportKey, title, big, query });
  const [open, setOpen] = useState(false);
  const formats = [...FORMATS.map((f) => ({ key: f.key as string, label: f.label, ext: f.ext as string })), ...(gst ? [{ key: 'json', label: 'JSON (for the GST portal)', ext: 'json' }] : [])];
  const item = 'flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-mist';
  const list = formats.map((f) => <button key={f.key} type="button" role="menuitem" className={item} onClick={async () => { setOpen(false); await d.run(f.key, f.ext); }}>{f.label}</button>);
  return (
    <div className="relative inline-block">
      <Button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} disabled={disabled} className={sheet ? 'min-h-12' : ''}><Download aria-hidden size={16} />Download</Button>
      {open && !sheet && <div role="menu" aria-label="Download as" className="absolute right-0 z-40 mt-1 w-60 overflow-hidden rounded border-2 border-navy-100 bg-white py-1 shadow-overlay">{list}</div>}
      {sheet && <BottomSheet open={open} onClose={() => setOpen(false)} title="Download as"><div role="menu" className="flex flex-col divide-y divide-line">{list}</div></BottomSheet>}
      <div className="mt-2 space-y-2" aria-live="polite">
        {d.error && <ErrorBanner message={d.error.friendly} requestId={d.error.requestId} />}
        {d.job && (
          <div className="rounded border-2 border-navy-100 p-2 text-sm" data-testid="download-job">
            {d.job.status === 'running' ? (<><p>Preparing {d.job.title}… {d.job.progress}%</p><div className="mt-1 h-2 overflow-hidden rounded bg-mist" role="progressbar" aria-valuenow={d.job.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Report progress"><div className="h-full bg-teal transition-all" style={{ width: `${d.job.progress}%` }} /></div></>) : (
              <p>Ready. <button type="button" className="font-semibold underline" onClick={d.fetchJob}>Download {d.job.title} ({d.job.format.toUpperCase()})</button></p>
            )}
          </div>
        )}
        {d.saved && <p role="status" className="text-xs text-muted" data-testid="download-saved">Saved {d.saved}</p>}
      </div>
    </div>
  );
}

/** One click Excel and PDF buttons for a report (the Download menu still has CSV). Works from the report list and the report page. */
export function ReportQuickButtons({ reportKey, title, query = '', compact }: { reportKey: string; title: string; query?: string; compact?: boolean }) {
  const d = useDownload({ key: reportKey, title, big: false, query });
  const size = compact ? 'min-h-11' : '';
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" className={size} disabled={d.busy} onClick={() => d.run('xlsx', 'xlsx')} aria-label={`Download ${title} as Excel`}><Download aria-hidden size={14} />Excel</Button>
      <Button size="sm" className={size} disabled={d.busy} onClick={() => d.run('pdf', 'pdf')} aria-label={`Download ${title} as PDF`}><Download aria-hidden size={14} />PDF</Button>
      {d.error && <span role="alert" className="text-xs text-danger">{d.error.friendly}</span>}
      {d.saved && <span role="status" className="text-xs text-muted">Saved {d.saved}</span>}
    </span>
  );
}
