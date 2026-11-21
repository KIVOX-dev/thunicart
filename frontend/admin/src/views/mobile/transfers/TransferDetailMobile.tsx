import { Link, useParams } from 'react-router-dom';
import { Badge, Button, ListSkeleton, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { ScanBox } from '../../../components/ScanBox';
import { ScanLinesCards, ScanMessage } from '../../../components/ScanLines';
import { useCan } from '../../../features/auth/permissions';
import { TRANSFER_LABEL, transferTone } from '../../../features/inventory/types';
import { useTransferDetail } from '../../../features/inventory/use-transfers';

/** Mobile first transfer receiving: scan each piece as the box is opened. */
export function TransferDetailMobile() {
  const { id } = useParams();
  const d = useTransferDetail(id);
  const can = useCan();
  const { toast } = useToast();
  const t = d.transfer;
  if (d.query.isPending) return <ListSkeleton rows={4} label="Loading transfer" />;
  if (d.query.isError || !t) return <QueryError error={d.query.error} onRetry={() => d.query.refetch()} />;
  const err = [d.dispatch, d.receive, d.cancel].find((m) => m.isError)?.error as Error | undefined;
  const received = t.lines.reduce((n, l) => n + l.receivedQty, 0);
  const lines = [...t.lines].sort((a, b) => (a.id === t.lastLineId ? -1 : b.id === t.lastLineId ? 1 : 0));
  return (
    <div className="flex flex-col gap-3 pb-28">
      <div className="flex items-center justify-between text-sm"><span><strong>{t.number}</strong><br /><span className="text-xs text-muted">{t.fromName} to {t.toName}</span></span><Badge tone={transferTone(t.status)}>{TRANSFER_LABEL[t.status]}</Badge></div>
      {err && <ErrorBanner message={err.message} />}
      {t.status === 'in-transit' && (
        <>
          <div className="sticky top-14 z-20 bg-white pb-2"><ScanBox large onCode={d.scan} placeholder="Scan a piece" /></div>
          <div aria-live="polite"><ScanMessage feedback={d.feedback} /></div>
          <p role="status" className="rounded bg-mist p-3 text-center text-sm">Received <strong className="mx-1 text-xl" data-testid="transfer-received">{received}</strong> of {t.pieces}</p>
        </>
      )}
      <ScanLinesCards lines={lines.map((l) => ({ id: l.id, code: l.code, name: l.name, size: l.size, expected: l.qty, qty: t.status === 'requested' ? l.qty : l.receivedQty, warning: t.status === 'in-transit' ? (l.receivedQty < l.qty ? 'SHORT' : l.receivedQty > l.qty ? 'OVER' : null) : null }))} qtyLabel={t.status === 'requested' ? 'Quantity' : 'Received'} expectedLabel={t.status === 'requested' ? undefined : 'Sent'} flashId={d.feedback.flash} readOnly={t.status !== 'in-transit'} onSetQty={(lineId, qty) => d.setReceived.mutate({ lineId, qty })} />
      <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex gap-2 border-t-2 border-navy-100 bg-white p-3">
        {t.status === 'requested' && can('stock.edit') && <Button variant="primary" size="lg" className="min-h-12 flex-1" loading={d.dispatch.isPending} onClick={async () => { await d.dispatch.mutateAsync(); toast('Dispatched. Stock is now in transit.', 'success'); }}>Dispatch</Button>}
        {t.status === 'in-transit' && can('stock.edit') && <Button variant="primary" size="lg" className="min-h-12 flex-1" loading={d.receive.isPending} disabled={received === 0} onClick={async () => { await d.receive.mutateAsync(); toast('Transfer received. Stock updated.', 'success'); }}>Finish receiving</Button>}
        {(t.status === 'received' || t.status === 'cancelled') && <Link to="/stock/transfers" className="flex-1"><Button size="lg" block className="min-h-12">Back to transfers</Button></Link>}
      </div>
    </div>
  );
}
