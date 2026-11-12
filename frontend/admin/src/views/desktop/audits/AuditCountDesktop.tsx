import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, EmptyState, ListSkeleton, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { ScanBox } from '../../../components/ScanBox';
import { ScanLinesTable, ScanMessage } from '../../../components/ScanLines';
import { useCan } from '../../../features/auth/permissions';
import { auditLabel, auditTone } from '../../../features/inventory/types';
import { useAuditCount } from '../../../features/inventory/use-audit';

/** Count at a desk (or with a keyboard scanner): live count, undo, then the variance sheet and approval. */
export function AuditCountDesktop() {
  const { id } = useParams();
  const c = useAuditCount(id);
  const can = useCan();
  const { toast } = useToast();
  const [showAll, setShowAll] = useState(false);
  const a = c.audit;
  if (c.query.isPending) return <ListSkeleton rows={6} label="Loading count" />;
  if (c.query.isError || !a) return <QueryError error={c.query.error} onRetry={() => c.query.refetch()} />;
  const counted = a.lines.filter((l) => l.counted > 0).sort((x, y) => (x.variantId === a.lastVariantId ? -1 : y.variantId === a.lastVariantId ? 1 : 0));
  const piecesCounted = counted.reduce((n, l) => n + l.counted, 0);
  const varianceRows = a.lines.filter((l) => showAll || l.variance !== 0);
  const err = [c.submit, c.approve, c.undo].find((m) => m.isError)?.error as Error | undefined;
  return (
    <div>
      <PageHeader title={`Count ${a.number}`} description={`${a.storeName} · ${a.scope}`} actions={<Badge tone={auditTone(a.status)}>{auditLabel(a.status)}</Badge>} />
      {err && <div className="mb-3"><ErrorBanner message={err.message} /></div>}

      {a.status === 'counting' && (
        <>
          <div className="mb-3 max-w-2xl"><ScanBox large autoFocus onCode={c.scan} placeholder="Scan each piece to count it" /></div>
          <div className="mb-3 space-y-2" aria-live="polite"><ScanMessage feedback={c.feedback} /></div>
          <div className="mb-3 flex items-center gap-3 text-sm"><span role="status">Pieces counted: <strong data-testid="audit-count">{piecesCounted}</strong></span><span className="text-muted">{a.notCounted} items not counted yet</span>
            <Button className="ml-auto" disabled={a.scans === 0} loading={c.undo.isPending} onClick={() => c.undo.mutate()}>Undo last scan</Button></div>
          {counted.length === 0 ? <EmptyState title="Nothing counted yet" body="Scan an item to start." /> : <ScanLinesTable lines={counted.map((l) => ({ id: l.variantId, code: l.code, name: l.name, size: l.size, expected: l.expected, qty: l.counted }))} qtyLabel="Counted" expectedLabel="Expected" flashId={c.feedback.flash ?? a.lastVariantId} onSetQty={(variantId, qty) => c.setCounted.mutate({ variantId, counted: qty })} />}
          <div className="sticky bottom-0 mt-4 flex gap-3 border-t border-line bg-white py-3"><Button variant="primary" size="lg" loading={c.submit.isPending} disabled={a.scans === 0} onClick={() => c.submit.mutate()}>Finish counting and review</Button><Link to="/stock/audits"><Button>Back to counts</Button></Link></div>
        </>
      )}

      {a.status !== 'counting' && (
        <section aria-label="Variance sheet">
          <div className="mb-3 flex items-center gap-3 text-sm"><span>{a.lines.filter((l) => l.variance !== 0).length} items differ.</span>{a.notCounted > 0 && <Badge tone="warning">{a.notCounted} items were not counted and will be set to 0</Badge>}
            <Button size="sm" className="ml-auto" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Show only differences' : 'Show all lines'}</Button></div>
          {varianceRows.length === 0 ? <EmptyState title="No differences" body="The count matches the system." /> : (
            <Table caption="Variance sheet">
              <THead><Tr><Th>Code</Th><Th>Item</Th><Th>Size</Th><Th className="text-right">Expected</Th><Th className="text-right">Counted</Th><Th className="text-right">Difference</Th></Tr></THead>
              <TBody>{varianceRows.map((l) => <Tr key={l.variantId}><Td className="font-mono text-xs">{l.code}</Td><Td className="font-medium">{l.name}</Td><Td>{l.size}</Td><Td className="text-right">{l.expected}</Td><Td className="text-right">{l.counted}</Td><Td className={`text-right font-semibold ${l.variance < 0 ? 'text-danger' : l.variance > 0 ? 'text-navy' : ''}`}>{l.variance > 0 ? `+${l.variance}` : l.variance}</Td></Tr>)}</TBody>
            </Table>
          )}
          <div className="sticky bottom-0 mt-4 flex gap-3 border-t border-line bg-white py-3">
            {a.status === 'review' && (can('stock.approve') ? <Button variant="primary" size="lg" loading={c.approve.isPending} onClick={async () => { await c.approve.mutateAsync(); toast('Count approved. Stock updated.', 'success'); }}>Approve and update stock</Button> : <Badge tone="warning">Waiting for an approver</Badge>)}
            <Link to="/stock/audits"><Button>Back to counts</Button></Link>
          </div>
        </section>
      )}
    </div>
  );
}
