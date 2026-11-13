import { Link } from 'react-router-dom';
import { Badge, ListSkeleton } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { GstWarnings } from '../../../components/reports/GstWarnings';
import { EMPTY_REPORT_FILTERS, useReport, useReportList } from '../../../features/reports/use-reports';

/** GST reports. Shown only while GST is on. Problems that would make a return wrong are listed before anything is exported. */
export function GstDesktop() {
  const list = useReportList();
  const check = useReport('gstr1', EMPTY_REPORT_FILTERS, '', 1);
  const gst = list.data?.filter((r) => r.gstOnly) ?? [];
  return (
    <div>
      <PageHeader title="GST reports" description="GSTR-1, GSTR-3B summary, HSN summary and input versus output tax. Download as Excel or JSON." />
      {check.data && <div className="mb-5"><GstWarnings warnings={check.data.warnings} /></div>}
      {list.isPending ? <ListSkeleton label="Loading GST reports" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : (
        <ul className="grid grid-cols-2 gap-4">{gst.map((r) => (
          <li key={r.key}><Link to={`/reports/${r.key}`} className="block rounded border-2 border-navy-100 p-4 hover:bg-mist"><strong className="block text-sm">{r.title}</strong><span className="text-sm text-muted">{r.description}</span><Badge className="mt-2">Excel and JSON</Badge></Link></li>
        ))}</ul>
      )}
    </div>
  );
}
