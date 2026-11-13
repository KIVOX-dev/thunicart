import { Link, useParams } from 'react-router-dom';
import { Badge, Button, ListSkeleton, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { GrnFinishDialog } from '../../../components/GrnFinishDialog';
import { PageHeader } from '../../../components/PageHeader';
import { ScanBox } from '../../../components/ScanBox';
import { ScanLinesTable, ScanMessage } from '../../../components/ScanLines';
import { useGrnReceive } from '../../../features/inventory/use-grn';

/** Receiving at a desk: a large scan box and a running list. A keyboard scanner works anywhere on the page. */
export function GrnReceiveDesktop() {
  const { id } = useParams();
  const r = useGrnReceive(id);
  const { toast } = useToast();
  const g = r.grn;
  if (r.query.isPending) return <ListSkeleton rows={6} label="Loading receipt" />;
  if (r.query.isError || !g) return <QueryError error={r.query.error} onRetry={() => r.query.refetch()} />;
  const lines = [...g.lines].sort((a, b) => (a.id === g.lastLineId ? -1 : b.id === g.lastLineId ? 1 : 0));
  return (
    <div>
      <PageHeader title={`Receipt ${g.number}`} description={`${g.vendorName} · ${g.poNumber ? `Order ${g.poNumber}` : 'No order'} · into ${g.storeName}`}
        actions={<Badge tone={g.status === 'finished' ? 'success' : 'warning'}>{g.status === 'finished' ? 'Finished' : 'Receiving'}</Badge>} />
      {g.status === 'draft' && (
        <div className="mb-4 max-w-2xl"><ScanBox large autoFocus onCode={r.scan} placeholder="Scan each piece, or type a barcode" /><p className="mt-1 text-xs text-muted">Each scan adds one piece. Type a number in the quantity box for bigger counts.</p></div>
      )}
      <div className="mb-3 space-y-2" aria-live="polite"><ScanMessage feedback={r.feedback} />{r.finish.isError && !r.warning && <ErrorBanner message={(r.finish.error as Error).message} />}</div>
      <p className="mb-2 text-sm" role="status">Pieces received: <strong data-testid="grn-pieces">{g.pieces}</strong></p>
      <ScanLinesTable lines={lines.map((l) => ({ id: l.id, code: l.code, name: l.name, size: l.size, expected: l.orderedQty, qty: l.receivedQty, warning: l.warning }))} qtyLabel="Received" expectedLabel="Ordered" flashId={r.feedback.flash} readOnly={!r.canEdit} onSetQty={(lineId, qty) => r.setQty.mutate({ lineId, qty })} />
      <div className="sticky bottom-0 mt-4 flex items-center gap-3 border-t-2 border-navy-100 bg-white py-3">
        {g.status === 'draft' ? <Button variant="primary" size="lg" loading={r.finish.isPending} disabled={g.pieces === 0} onClick={async () => { try { await r.finish.mutateAsync(false); toast('Receipt finished. Stock updated.', 'success'); } catch { /* warnings open the dialog */ } }}>Finish receiving</Button>
          : <Link to="/purchase?tab=bills"><Button variant="primary">Create purchase bill</Button></Link>}
        <Link to="/purchase?tab=receipts"><Button>Back to receipts</Button></Link>
      </div>
      <GrnFinishDialog grn={g} message={r.warning} saving={r.finish.isPending} onCancel={r.clearWarning} onConfirm={async () => { await r.finish.mutateAsync(true); toast('Receipt finished. Stock updated.', 'success'); }} />
    </div>
  );
}
