import { useState } from 'react';
import { BottomSheet, Button, EmptyState, ListSkeleton, useToast } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { SeriesForm } from '../../../components/SeriesForm';
import { useCan } from '../../../features/auth/permissions';
import { SERIES_LABELS, useNumberSeries, type NumberSeries } from '../../../features/settings/use-number-series';

export function NumberSeriesMobile() {
  const q = useNumberSeries();
  const canEdit = useCan()('settings.edit');
  const [editing, setEditing] = useState<NumberSeries | null>(null);
  const { toast } = useToast();
  if (q.isPending) return <ListSkeleton label="Loading number series" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.length) return <EmptyState title="No series" />;
  return (
    <>
      <ul className="flex flex-col gap-3">
        {q.data.map((s) => (
          <li key={s.key} className="rounded border border-line p-4">
            <div className="flex items-start justify-between gap-2">
              <div><strong className="text-sm">{SERIES_LABELS[s.key] ?? s.key}</strong><p className="text-xs text-muted">{s.key} · {s.perFinancialYear ? `resets yearly (${s.financialYear})` : 'never resets'}</p></div>
              {canEdit && <Button size="lg" onClick={() => setEditing(s)} aria-label={`Edit ${s.key}`}>Edit</Button>}
            </div>
            <p className="mt-2 text-sm">Next: <span className="font-mono font-semibold">{s.next}</span></p>
          </li>
        ))}
      </ul>
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.key} series` : ''}>
        {editing && <SeriesForm series={editing} onDone={() => { setEditing(null); toast('Number series saved', 'success'); }} />}
      </BottomSheet>
    </>
  );
}
