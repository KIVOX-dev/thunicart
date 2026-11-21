import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '@thunikart/shared';
import { Badge, BottomSheet, Button, EmptyState, ListSkeleton } from '@thunikart/ui';
import { AuditStart } from '../../../components/AuditStart';
import { QueryError } from '../../../components/ErrorBanner';
import { useCan } from '../../../features/auth/permissions';
import { auditLabel, auditTone } from '../../../features/inventory/types';
import { useAudits } from '../../../features/inventory/use-audit';

export function AuditsMobile() {
  const can = useCan();
  const nav = useNavigate();
  const q = useAudits();
  const [open, setOpen] = useState(false);
  const data = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-3 pb-20">
      {q.isPending ? <ListSkeleton label="Loading counts" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No stock counts yet" body="Start a count, then scan each piece." /> : data.map((a) => (
        <Link key={a.id} to={`/stock/audits/${a.id}`} className="block rounded border-2 border-navy-100 p-3"><div className="flex items-center justify-between"><strong className="text-sm">{a.number}</strong><Badge tone={auditTone(a.status)}>{auditLabel(a.status)}</Badge></div><p className="text-sm">{a.storeName} · {a.scope}</p><p className="text-xs text-muted">{formatDate(a.createdAt)} · {a.scans} scans</p></Link>
      ))}
      {q.hasNextPage && <Button size="lg" className="min-h-12" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button>}
      {can('stock.create') && <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 border-t-2 border-navy-100 bg-white p-3"><Button variant="primary" size="lg" block className="min-h-12" onClick={() => setOpen(true)}>Start a count</Button></div>}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Start a stock count"><AuditStart onStarted={(id) => nav(`/stock/audits/${id}`)} /></BottomSheet>
    </div>
  );
}
