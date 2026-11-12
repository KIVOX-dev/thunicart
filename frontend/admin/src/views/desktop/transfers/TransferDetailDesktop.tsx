import { Link, useParams } from 'react-router-dom';
import { Badge, Button, ListSkeleton, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { ScanBox } from '../../../components/ScanBox';
import { ScanLinesTable, ScanMessage } from '../../../components/ScanLines';
import { useCan } from '../../../features/auth/permissions';
import { TRANSFER_LABEL, transferTone } from '../../../features/inventory/types';
import { useTransferDetail } from '../../../features/inventory/use-transfers';

export function TransferDetailDesktop() {
  const { id } = useParams();
  const d = useTransferDetail(id);
  const can = useCan();
  const { toast } = useToast();
  const t = d.transfer;
  if (d.query.isPending) return <ListSkeleton rows={5} label="Loading transfer" />;
  if (d.query.isError || !t) return <QueryError error={d.query.error} onRetry={() => d.query.refetch()} />;
  const err = [d.dispatch, d.receive, d.cancel].find((m) => m.isError)?.error as Error | undefined;
  const received = t.lines.reduce((n, l) => n + l.receivedQty, 0);
  return (
    <div>
      <PageHeader title={`Transfer ${t.number}`} description={`${t.fromName} to ${t.toName}`} actions={<Badge tone={transferTone(t.status)}>{TRANSFER_LABEL[t.status]}</Badge>} />
      {err && <div className="mb-3"><ErrorBanner message={err.message} /></div>}
      {t.status === 'in-transit' && (
        <>
          <div className="mb-3 max-w-2xl"><ScanBox large autoFocus onCode={d.scan} placeholder="Scan each piece as it arrives" /></div>
          <div className="mb-3" aria-live="polite"><ScanMessage feedback={d.feedback} /></div>
          <p className="mb-2 text-sm" role="status">Pieces received: <strong data-testid="transfer-received">{received}</strong> of {t.pieces}</p>
          <ScanLinesTable lines={t.lines.map((l) => ({ id: l.id, code: l.code, name: l.name, size: l.size, expected: l.qty, qty: l.receivedQty, warning: l.receivedQty < l.qty ? 'SHORT' : l.receivedQty > l.qty ? 'OVER' : null }))} qtyLabel="Received" expectedLabel="Sent" flashId={d.feedback.flash} onSetQty={(lineId, qty) => d.setReceived.mutate({ lineId, qty })} />
        </>
      )}
      {t.status !== 'in-transit' && (
        <Table caption="Transfer lines">
          <THead><Tr><Th>Code</Th><Th>Item</Th><Th>Size</Th><Th className="text-right">Quantity</Th>{t.status === 'received' && <Th className="text-right">Received</Th>}</Tr></THead>
          <TBody>{t.lines.map((l) => <Tr key={l.id}><Td className="font-mono text-xs">{l.code}</Td><Td className="font-medium">{l.name}</Td><Td>{l.size}</Td><Td className="text-right">{l.qty}</Td>{t.status === 'received' && <Td className="text-right">{l.receivedQty}</Td>}</Tr>)}</TBody>
        </Table>
      )}
      <div className="sticky bottom-0 mt-4 flex gap-3 border-t border-line bg-white py-3">
        {t.status === 'requested' && can('stock.edit') && <><Button variant="primary" size="lg" loading={d.dispatch.isPending} onClick={async () => { await d.dispatch.mutateAsync(); toast('Dispatched. Stock is now in transit.', 'success'); }}>Dispatch</Button><Button variant="danger" onClick={() => d.cancel.mutate()}>Cancel request</Button></>}
        {t.status === 'in-transit' && can('stock.edit') && <Button variant="primary" size="lg" loading={d.receive.isPending} disabled={received === 0} onClick={async () => { await d.receive.mutateAsync(); toast('Transfer received. Stock updated.', 'success'); }}>Finish receiving</Button>}
        <Link to="/stock/transfers"><Button>Back to transfers</Button></Link>
      </div>
    </div>
  );
}
