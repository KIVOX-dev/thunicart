import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ListSkeleton } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { GstWarnings } from '../../../components/reports/GstWarnings';
import { EMPTY_REPORT_FILTERS, useReport, useReportList } from '../../../features/reports/use-reports';

export function GstMobile() {
  const list = useReportList();
  const check = useReport('gstr1', EMPTY_REPORT_FILTERS, '', 1);
  const gst = list.data?.filter((r) => r.gstOnly) ?? [];
  if (list.isPending) return <ListSkeleton label="Loading GST reports" />;
  if (list.isError) return <QueryError error={list.error} onRetry={() => list.refetch()} />;
  return (
    <div className="flex flex-col gap-3">
      {check.data && <GstWarnings warnings={check.data.warnings} />}
      <ul className="divide-y divide-line rounded border border-line">{gst.map((r) => (
        <li key={r.key}><Link to={`/reports/${r.key}`} className="flex min-h-14 items-center gap-3 px-4 text-sm"><span className="min-w-0 flex-1"><strong className="block">{r.title}</strong><span className="text-xs text-muted">{r.description}</span></span><ChevronRight aria-hidden size={16} className="text-muted" /></Link></li>
      ))}</ul>
    </div>
  );
}
