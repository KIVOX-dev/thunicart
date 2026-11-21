import { Link, useParams } from 'react-router-dom';
import { Badge, Button, EmptyState, ListSkeleton, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { ScanBox } from '../../../components/ScanBox';
import { ScanLinesCards, ScanMessage } from '../../../components/ScanLines';
import { useCan } from '../../../features/auth/permissions';
import { auditLabel, auditTone } from '../../../features/inventory/types';
import { useAuditCount } from '../../../features/inventory/use-audit';

/** Mobile first counting: big scan button, a live total, undo within reach, newest scan first. */
export function AuditCountMobile() {
  const { id } = useParams();
  const c = useAuditCount(id);
  const can = useCan();
  const { toast } = useToast();
  const a = c.audit;
  if (c.query.isPending) return <ListSkeleton rows={4} label="Loading count" />;
  if (c.query.isError || !a) return <QueryError error={c.query.error} onRetry={() => c.query.refetch()} />;
  const counted = a.lines.filter((l) => l.counted > 0).sort((x, y) => (x.variantId === a.lastVariantId ? -1 : y.variantId === a.lastVariantId ? 1 : 0));
  const piecesCounted = counted.reduce((n, l) => n + l.counted, 0);
  const err = [c.submit, c.approve, c.undo].find((m) => m.isError)?.error as Error | undefined;
  return (
    <div className="flex flex-col gap-3 pb-28">
      <div className="flex items-center justify-between text-sm"><span><strong>{a.number}</strong><br /><span className="text-xs text-muted">{a.storeName} · {a.scope}</span></span><Badge tone={auditTone(a.status)}>{auditLabel(a.status)}</Badge></div>
      {err && <ErrorBanner message={err.message} />}
      {a.status === 'counting' && (
        <>
          <div className="sticky top-14 z-20 bg-white pb-2"><ScanBox large onCode={c.scan} placeholder="Scan a piece" /></div>
          <div aria-live="polite"><ScanMessage feedback={c.feedback} /></div>
          <div className="flex items-center justify-between rounded bg-mist p-3"><span className="text-sm" role="status">Counted <strong className="ml-1 text-xl" data-testid="audit-count">{piecesCounted}</strong><span className="block text-xs text-muted">{a.notCounted} items not counted yet</span></span>
            <Button size="lg" className="min-h-12" disabled={a.scans === 0} loading={c.undo.isPending} onClick={() => c.undo.mutate()}>Undo</Button></div>
          {counted.length === 0 ? <EmptyState title="Nothing counted yet" body="Scan an item to start." /> : <ScanLinesCards lines={counted.map((l) => ({ id: l.variantId, code: l.code, name: l.name, size: l.size, expected: l.expected, qty: l.counted }))} qtyLabel="Counted" expectedLabel="Expected" flashId={c.feedback.flash ?? a.lastVariantId} onSetQty={(variantId, qty) => c.setCounted.mutate({ variantId, counted: qty })} />}
          <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 border-t-2 border-navy-100 bg-white p-3"><Button variant="primary" size="lg" block className="min-h-12" disabled={a.scans === 0} loading={c.submit.isPending} onClick={() => c.submit.mutate()}>Finish counting</Button></div>
        </>
      )}
      {a.status !== 'counting' && (
        <section aria-label="Variance sheet" className="flex flex-col gap-2">
          {a.notCounted > 0 && <Badge tone="warning" className="self-start">{a.notCounted} items not counted will be set to 0</Badge>}
          {a.lines.filter((l) => l.variance !== 0).length === 0 ? <EmptyState title="No differences" /> : a.lines.filter((l) => l.variance !== 0).map((l) => (
            <div key={l.variantId} className="rounded border-2 border-navy-100 p-3 text-sm"><div className="flex justify-between"><strong>{l.name}</strong><span className={`font-semibold ${l.variance < 0 ? 'text-danger' : ''}`}>{l.variance > 0 ? `+${l.variance}` : l.variance}</span></div><p className="text-xs text-muted">Size {l.size} · expected {l.expected} · counted {l.counted}</p></div>
          ))}
          <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 border-t-2 border-navy-100 bg-white p-3">
            {a.status === 'review' && can('stock.approve') ? <Button variant="primary" size="lg" block className="min-h-12" loading={c.approve.isPending} onClick={async () => { await c.approve.mutateAsync(); toast('Count approved. Stock updated.', 'success'); }}>Approve and update stock</Button> : <Link to="/stock/audits"><Button size="lg" block className="min-h-12">Back to counts</Button></Link>}
          </div>
        </section>
      )}
    </div>
  );
}
