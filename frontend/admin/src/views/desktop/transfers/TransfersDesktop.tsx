import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '@thunikart/shared';
import { Badge, Button, EmptyState, ListSkeleton, Modal, Table, TBody, Td, Th, THead, Tr } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { TransferRequestForm } from '../../../components/TransferRequestForm';
import { useCan } from '../../../features/auth/permissions';
import { TRANSFER_LABEL, transferTone } from '../../../features/inventory/types';
import { useTransfers } from '../../../features/inventory/use-transfers';

export function TransfersPanel() {
  const can = useCan();
  const nav = useNavigate();
  const q = useTransfers();
  const [open, setOpen] = useState(false);
  const data = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm text-muted">Move stock between the warehouse and the shop.</p>{can('stock.create') && <Button variant="primary" onClick={() => setOpen(true)}>Request transfer</Button>}</div>
      {q.isPending ? <ListSkeleton label="Loading transfers" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No transfers yet" body="Request a transfer, dispatch it, then scan to receive at the other store." /> : (
        <>
          <Table caption="Transfers">
            <THead><Tr><Th>Transfer</Th><Th>From</Th><Th>To</Th><Th>Requested</Th><Th>Status</Th><Th className="text-right">Pieces</Th></Tr></THead>
            <TBody>{data.map((t) => <Tr key={t.id}><Td><Link className="font-medium underline" to={`/stock/transfers/${t.id}`}>{t.number}</Link></Td><Td>{t.fromName}</Td><Td>{t.toName}</Td><Td>{formatDate(t.createdAt)}</Td><Td><Badge tone={transferTone(t.status)}>{TRANSFER_LABEL[t.status]}</Badge></Td><Td className="text-right">{t.pieces}</Td></Tr>)}</TBody>
          </Table>
          {q.hasNextPage && <div className="mt-3"><Button onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button></div>}
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Request transfer"><TransferRequestForm onDone={(id) => nav(`/stock/transfers/${id}`)} /></Modal>
    </div>
  );
}
