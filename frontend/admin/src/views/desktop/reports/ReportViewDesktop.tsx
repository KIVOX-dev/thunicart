import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatPaise } from '@thunikart/shared';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button, EmptyState, ListSkeleton, Table, TBody, Td, Th, THead, Tr } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { StatCard } from '../../../components/reports/StatCard';
import { DownloadMenu } from '../../../components/reports/DownloadMenu';
import { fmtCell } from '../../../components/reports/format';
import { GstWarnings } from '../../../components/reports/GstWarnings';
import { ReportFilterBar } from '../../../components/reports/ReportFilterBar';
import { EMPTY_REPORT_FILTERS, filterQuery, useReport } from '../../../features/reports/use-reports';

/** One report: filter bar, totals on top, a sortable paginated table, and a Download menu. */
export function ReportViewDesktop() {
  const { key = '' } = useParams();
  const [f, setF] = useState(EMPTY_REPORT_FILTERS);
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const q = useReport(key, f, sort, page);
  const r = q.data;
  const toggle = (k: string) => { setPage(1); setSort((s) => (s === k ? `-${k}` : s === `-${k}` ? '' : k)); };
  return (
    <div>
      <PageHeader title={r?.title ?? 'Report'} actions={<Link to={r?.gstOnly ? '/gst' : '/reports'}><Button variant="ghost">All reports</Button></Link>} />
      {q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : !r ? <ListSkeleton rows={6} label="Loading report" /> : (
        <>
          {r.gstOnly && <div className="mb-4"><GstWarnings warnings={r.warnings} /></div>}
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <ReportFilterBar allowed={r.filters} value={f} onChange={(v) => { setF(v); setPage(1); }} />
            <DownloadMenu reportKey={r.key} title={r.title} big={r.big} gst={r.gstOnly} query={filterQuery(f)} />
          </div>
          {Object.keys(r.totals).length > 0 && (
            <dl className="mb-4 grid grid-cols-5 gap-3" aria-label="Totals">
              {r.columns.filter((c) => c.key in r.totals && c.type !== 'text').map((c) => <StatCard key={c.key} label={`Total ${c.label.toLowerCase()}`} value={c.type === 'money' ? formatPaise(r.totals[c.key]!) : r.totals[c.key]!.toLocaleString('en-IN')} testId={`total-${c.key}`} />)}
            </dl>
          )}
          {r.items.length === 0 ? <EmptyState title="Nothing to show" body="Change the filters, or there is no data for this report yet." /> : (
            <>
              <Table caption={r.title}>
                <THead><Tr>{r.columns.map((c) => (
                  <Th key={c.key} className={c.type === 'money' || c.type === 'number' ? 'text-right' : ''} aria-sort={sort === c.key ? 'ascending' : sort === `-${c.key}` ? 'descending' : 'none'}>
                    <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 uppercase hover:underline" aria-label={`Sort by ${c.label}`}>{c.label}{sort === c.key && <ArrowUp aria-hidden size={12} />}{sort === `-${c.key}` && <ArrowDown aria-hidden size={12} />}</button>
                  </Th>
                ))}</Tr></THead>
                <TBody>{r.items.map((row, i) => <Tr key={i}>{r.columns.map((c) => <Td key={c.key} className={c.type === 'money' || c.type === 'number' ? 'text-right' : ''}>{fmtCell(c, row[c.key])}</Td>)}</Tr>)}</TBody>
              </Table>
              <nav aria-label="Pages" className="mt-3 flex items-center gap-3 text-sm">
                <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span data-testid="page-info">Page {page} of {Math.max(1, Math.ceil(r.total / 25))} · {r.total.toLocaleString('en-IN')} rows</span>
                <Button size="sm" disabled={!r.nextPage} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </nav>
            </>
          )}
        </>
      )}
    </div>
  );
}
