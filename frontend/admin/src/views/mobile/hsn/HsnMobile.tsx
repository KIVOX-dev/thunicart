import { formatDate } from '@thunikart/shared';
import { Badge, Button, EmptyState, ListSkeleton, useToast } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { useCan } from '../../../features/auth/permissions';
import { useConfirmHsn, useHsnRules } from '../../../features/catalog/use-hsn';

export function HsnMobile() {
  const can = useCan();
  const { toast } = useToast();
  const q = useHsnRules();
  const confirm = useConfirmHsn();
  const unconfirmed = q.data?.filter((r) => !r.confirmed).length ?? 0;
  if (q.isPending) return <ListSkeleton label="Loading HSN rules" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.length) return <EmptyState title="No HSN rules" />;
  return (
    <div className="flex flex-col gap-3">
      {unconfirmed > 0 && (
        <div role="alert" className="rounded border border-warning bg-warning-bg p-3 text-sm">
          <strong>{unconfirmed} rules are not confirmed.</strong> An Admin must confirm them before bills rely on them.
          {can('gst.approve') && <Button variant="primary" size="lg" block className="mt-3 min-h-12" loading={confirm.isPending} onClick={async () => { await confirm.mutateAsync(); toast('HSN rules confirmed', 'success'); }}>Confirm all rules</Button>}
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {q.data.map((r) => (
          <li key={r.hsn} className="rounded border border-line p-3">
            <div className="flex items-center justify-between"><strong className="font-mono">{r.hsn}</strong><Badge tone={r.confirmed ? 'success' : 'warning'}>{r.confirmed ? 'Confirmed' : 'Not confirmed'}</Badge></div>
            <p className="mt-1 text-sm">{r.description}</p>
            <p className="mt-1 text-xs text-muted">{r.rule} · from {formatDate(r.effectiveFrom)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
