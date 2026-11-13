import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { EmptyState, ListSkeleton } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { useReportList } from '../../../features/reports/use-reports';

export function ReportsMobile() {
  const q = useReportList();
  if (q.isPending) return <ListSkeleton label="Loading reports" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.length) return <EmptyState title="No reports" />;
  const groups = [...new Set(q.data.map((r) => r.group))];
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g} aria-label={g}><h2 className="mb-1 text-xs text-muted">{g}</h2>
          <ul className="divide-y divide-line rounded border-2 border-navy-100">{q.data.filter((r) => r.group === g).map((r) => (
            <li key={r.key}><Link to={`/reports/${r.key}`} className="flex min-h-14 items-center gap-3 px-4 text-sm"><span className="min-w-0 flex-1"><strong className="block">{r.title}</strong><span className="text-xs text-muted">{r.description}</span></span><ChevronRight aria-hidden size={16} className="text-muted" /></Link></li>
          ))}</ul>
        </section>
      ))}
    </div>
  );
}
