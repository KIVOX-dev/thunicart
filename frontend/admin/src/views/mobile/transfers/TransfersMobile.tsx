import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '@thunikart/shared';
import { Badge, BottomSheet, Button, EmptyState, ListSkeleton } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { TransferRequestForm } from '../../../components/TransferRequestForm';
import { useCan } from '../../../features/auth/permissions';
import { TRANSFER_LABEL, transferTone } from '../../../features/inventory/types';
import { useTransfers } from '../../../features/inventory/use-transfers';

export function TransfersMobile() {
  const can = useCan();
  const nav = useNavigate();
  const q = useTransfers();
  const [open, setOpen] = useState(false);
  const data = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-3 pb-20">
      {q.isPending ? <ListSkeleton label="Loading transfers" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No transfers yet" /> : data.map((t) => (
        <Link key={t.id} to={`/stock/transfers/${t.id}`} className="block rounded border-2 border-navy-100 p-3"><div className="flex items-center justify-between"><strong className="text-sm">{t.number}</strong><Badge tone={transferTone(t.status)}>{TRANSFER_LABEL[t.status]}</Badge></div><p className="text-sm">{t.fromName} to {t.toName}</p><p className="text-xs text-muted">{formatDate(t.createdAt)} · {t.pieces} pieces</p></Link>
      ))}
      {q.hasNextPage && <Button size="lg" className="min-h-12" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button>}
      {can('stock.create') && <div className="fixed inset-x-0 bottom-14 z-30 border-t-2 border-navy-100 bg-white p-3"><Button variant="primary" size="lg" block className="min-h-12" onClick={() => setOpen(true)}>Request transfer</Button></div>}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Request transfer"><TransferRequestForm onDone={(id) => nav(`/stock/transfers/${id}`)} /></BottomSheet>
    </div>
  );
}
