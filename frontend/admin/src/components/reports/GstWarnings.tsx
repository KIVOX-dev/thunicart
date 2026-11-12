import { AlertTriangle } from 'lucide-react';
import type { ReportData } from '../../features/reports/types';

/** Problems that would make a GST return wrong. Shown before any export, with a plain fix for each. */
export function GstWarnings({ warnings }: { warnings: ReportData['warnings'] }) {
  if (!warnings.length) return <p role="status" className="rounded border border-teal bg-success-bg p-3 text-sm" data-testid="gst-clean">No problems found. This report is ready to export.</p>;
  return (
    <section aria-label="Fix before exporting" className="rounded border border-warning bg-warning-bg p-3 text-sm" data-testid="gst-warnings">
      <h2 className="mb-1 flex items-center gap-2 text-xs"><AlertTriangle aria-hidden size={14} />Check these before you export</h2>
      <ul className="list-disc space-y-1 pl-5">{warnings.map((w) => <li key={w.code}><strong>{w.count}</strong> {w.message}</li>)}</ul>
    </section>
  );
}
