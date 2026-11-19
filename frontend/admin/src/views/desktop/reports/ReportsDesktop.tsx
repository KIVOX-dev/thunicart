import { Link } from 'react-router-dom';
import { Badge, EmptyState, ListSkeleton } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { ReportQuickButtons } from '../../../components/reports/DownloadMenu';
import { useReportList } from '../../../features/reports/use-reports';

/** Every report in one list, grouped. GST reports show only while GST is on. */
export function ReportsDesktop() {
  const q = useReportList();
  if (q.isPending) return <div><PageHeader title="Reports" /><ListSkeleton label="Loading reports" /></div>;
  if (q.isError) return <div><PageHeader title="Reports" /><QueryError error={q.error} onRetry={() => q.refetch()} /></div>;
  const groups = [...new Set(q.data.map((r) => r.group))];
  return (
    <div>
      <PageHeader title="Reports" description="Pick a report, filter it, and download it as Excel, CSV or PDF." />
      {q.data.length === 0 ? <EmptyState title="No reports" /> : (
        <div className="grid grid-cols-2 gap-6">
          {groups.map((g) => (
            <section key={g} aria-label={g} className="rounded border-2 border-navy-100 p-4">
              <h2 className="mb-2 text-xs">{g}</h2>
              <ul className="divide-y divide-line">{q.data.filter((r) => r.group === g).map((r) => (
                <li key={r.key} className="flex flex-wrap items-center justify-between gap-2"><Link to={`/reports/${r.key}`} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:text-muted"><span><strong className="block text-sm">{r.title}</strong><span className="text-xs text-muted">{r.description}</span></span>{r.big && <Badge>Big report</Badge>}</Link><ReportQuickButtons reportKey={r.key} title={r.title} /></li>
              ))}</ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
