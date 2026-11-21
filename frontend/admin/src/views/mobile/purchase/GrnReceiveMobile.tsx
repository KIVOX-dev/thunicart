import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, ListSkeleton, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { GrnDetailsForm } from '../../../components/GrnDetailsForm';
import { GrnFinishDialog } from '../../../components/GrnFinishDialog';
import { ScanBox } from '../../../components/ScanBox';
import { ScanLinesCards, ScanMessage } from '../../../components/ScanLines';
import { useGrnReceive } from '../../../features/inventory/use-grn';

/** Mobile first receiving: a big scan button stays at the top, the newest scan is first, Finish is always at the bottom. */
export function GrnReceiveMobile() {
  const { id } = useParams();
  const r = useGrnReceive(id);
  const { toast } = useToast();
  const nav = useNavigate();
  const done = (saved: { id: string }) => { toast('Receipt finished. Stock updated.', 'success'); nav(`/purchase/grn/${saved.id}`, { replace: true }); };
  const g = r.grn;
  if (r.query.isPending) return <ListSkeleton rows={4} label="Loading receipt" />;
  if (r.query.isError || !g) return <QueryError error={r.query.error} onRetry={() => r.query.refetch()} />;
  const lines = [...g.lines].sort((a, b) => (a.id === g.lastLineId ? -1 : b.id === g.lastLineId ? 1 : 0));
  return (
    <div className="flex flex-col gap-3 pb-28">
      <div className="flex items-center justify-between text-sm"><span><strong>{g.number}</strong><br /><span className="text-xs text-muted">{g.vendorName}</span></span><Badge tone={g.status === 'finished' ? 'success' : 'warning'}>{g.status === 'finished' ? 'Finished' : 'Receiving'}</Badge></div>
      {g.batch && <p className="rounded bg-mist p-2 text-center text-sm">Batch <strong>{g.batch}</strong></p>}
      {r.form && g.status === 'draft' && <GrnDetailsForm form={r.form} compact />}
      {g.status === 'draft' && <div className="sticky top-14 z-20 bg-white pb-2"><ScanBox large onCode={r.scan} placeholder="Scan a piece" /></div>}
      <div aria-live="polite" className="space-y-2"><ScanMessage feedback={r.feedback} />{r.finish.isError && !r.warning && <ErrorBanner message={(r.finish.error as Error).message} />}</div>
      <p role="status" className="rounded bg-mist p-3 text-center text-sm">Pieces received <strong className="ml-1 text-xl" data-testid="grn-pieces">{g.pieces}</strong></p>
      <ScanLinesCards lines={lines.map((l) => ({ id: l.id, code: l.code, name: l.name, size: l.size, expected: l.orderedQty, qty: l.receivedQty, warning: l.warning }))} qtyLabel="Received" expectedLabel="Ordered" flashId={r.feedback.flash} readOnly={!r.canEdit} onSetQty={(lineId, qty) => r.setQty.mutate({ lineId, qty })} />
      <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 border-t-2 border-navy-100 bg-white p-3">
        {g.status === 'draft'
          ? <Button variant="primary" size="lg" block className="min-h-12" disabled={g.pieces === 0} loading={r.finish.isPending} onClick={async () => { try { done(await r.finish.mutateAsync(false)); } catch { /* warnings open the sheet */ } }}>Finish receiving</Button>
          : <Link to="/purchase?tab=receipts"><Button size="lg" block className="min-h-12">Back to receipts</Button></Link>}
      </div>
      <GrnFinishDialog sheet grn={g} message={r.warning} saving={r.finish.isPending} onCancel={r.clearWarning} onConfirm={async () => { done(await r.finish.mutateAsync(true)); }} />
    </div>
  );
}
