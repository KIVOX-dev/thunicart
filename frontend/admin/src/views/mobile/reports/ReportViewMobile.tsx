import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { formatPaise } from '@thunikart/shared';
import { BottomSheet, Button, EmptyState, ListSkeleton } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { DownloadMenu } from '../../../components/reports/DownloadMenu';
import { fmtCell } from '../../../components/reports/format';
import { GstWarnings } from '../../../components/reports/GstWarnings';
import { ReportFilterBar } from '../../../components/reports/ReportFilterBar';
import { StatCard } from '../../../components/reports/StatCard';
import { EMPTY_REPORT_FILTERS, filterQuery, useReport } from '../../../features/reports/use-reports';

/** Mobile: summary cards, rows as cards with the key columns (no sideways scroll), filters in a sheet and a Download button. */
export function ReportViewMobile() {
  const { key = '' } = useParams();
  const [f, setF] = useState(EMPTY_REPORT_FILTERS);
  const [page, setPage] = useState(1);
  const [sheet, setSheet] = useState(false);
  const q = useReport(key, f, '', page);
  const r = q.data;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (!r) return <ListSkeleton rows={4} label="Loading report" />;
  const cols = r.columns;
  const money = cols.filter((c) => c.type === 'money');
  const titleCol = cols[0]!;
  const keyCols = cols.slice(1, 4);
  return (
    <div className="flex flex-col gap-3 pb-6">
      <h2 className="text-lg">{r.title}</h2>
      {r.gstOnly && <GstWarnings warnings={r.warnings} />}
      <div className="flex gap-2"><Button className="min-h-12 flex-1" onClick={() => setSheet(true)}>Filters</Button><DownloadMenu sheet reportKey={r.key} title={r.title} big={r.big} gst={r.gstOnly} query={filterQuery(f)} /></div>
      {Object.keys(r.totals).length > 0 && <dl className="grid grid-cols-2 gap-2" aria-label="Totals">{cols.filter((c) => c.key in r.totals && c.type !== 'text').slice(0, 4).map((c) => <StatCard key={c.key} label={`Total ${c.label.toLowerCase()}`} value={c.type === 'money' ? formatPaise(r.totals[c.key]!) : r.totals[c.key]!.toLocaleString('en-IN')} testId={`total-${c.key}`} />)}</dl>}
      {r.items.length === 0 ? <EmptyState title="Nothing to show" /> : (
        <ul className="flex flex-col gap-2">
          {r.items.map((row, i) => (
            <li key={i} className="rounded border-2 border-navy-100 p-3 text-sm">
              <div className="flex items-start justify-between gap-2"><strong>{fmtCell(titleCol, row[titleCol.key])}</strong>{money.length > 0 && <strong>{fmtCell(money[money.length - 1]!, row[money[money.length - 1]!.key])}</strong>}</div>
              <p className="mt-1 text-xs text-muted">{keyCols.filter((c) => c.key !== money[money.length - 1]?.key).map((c) => `${c.label}: ${fmtCell(c, row[c.key])}`).join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between text-sm"><Button className="min-h-11" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><span>{page} of {Math.max(1, Math.ceil(r.total / 25))}</span><Button className="min-h-11" disabled={!r.nextPage} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Filters" footer={<><Button onClick={() => setF(EMPTY_REPORT_FILTERS)}>Clear</Button><Button variant="primary" onClick={() => setSheet(false)}>Show</Button></>}><ReportFilterBar big allowed={r.filters} value={f} onChange={(v) => { setF(v); setPage(1); }} /></BottomSheet>
    </div>
  );
}
