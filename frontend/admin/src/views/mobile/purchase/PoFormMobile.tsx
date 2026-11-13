import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Field, Input, ListSkeleton, Select, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { ItemPicker } from '../../../components/ItemPicker';
import { PoPreview } from '../../../components/PoPreview';
import { PoTotals } from '../../../components/PoTotals';
import { applyFieldIssues } from '../../../features/api/field-issues';
import { useCan } from '../../../features/auth/permissions';
import { useVendors } from '../../../features/catalog/use-parties';
import { PO_STATUS_LABEL, poTone, type Po } from '../../../features/inventory/types';
import { useStartGrn } from '../../../features/inventory/use-grn';
import { usePo, usePoAction, usePoDraft } from '../../../features/inventory/use-purchase-orders';

function Editor({ po }: { po?: Po }) {
  const nav = useNavigate();
  const { toast } = useToast();
  const can = useCan();
  const d = usePoDraft(po);
  const vendors = useVendors('').data?.pages.flatMap((p) => p.items) ?? [];
  const action = usePoAction(po?.id ?? '');
  const startGrn = useStartGrn();
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState<{ message: string; requestId?: string } | null>(null);
  const draft = !po || po.status === 'draft';
  const fail = (e: unknown) => { const r = applyFieldIssues(e); d.setErrors(r.errors); setErr(r.banner); };
  const save = async () => { setErr(null); d.setErrors({}); try { const s = await d.save.mutateAsync(); toast(po ? 'Order saved' : 'Order created', 'success'); if (!po) nav(`/purchase/orders/${s.id}`, { replace: true }); } catch (e) { fail(e); } };
  const run = async (a: 'approve' | 'send' | 'cancel') => { setErr(null); try { await action.mutateAsync(a); toast(a === 'approve' ? 'Order approved' : a === 'send' ? 'Order sent' : 'Order cancelled', 'success'); } catch (e) { fail(e); } };
  const big = 'min-h-12';
  return (
    <div className="flex flex-col gap-4 pb-28">
      {po && <p className="flex items-center gap-2"><Badge tone={poTone(po.status)}>{PO_STATUS_LABEL[po.status]}</Badge><span className="text-sm text-muted">{po.receivedPieces} of {po.pieces} pieces received</span></p>}
      {err && <ErrorBanner {...err} />}
      <fieldset disabled={!draft} className="flex flex-col gap-3">
        <Field label="Vendor" required error={d.errors.vendorId}>{(p) => <Select {...p} className={big} value={d.vendorId} onChange={(e) => d.setVendorId(e.target.value)}><option value="">Choose a vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}</Field>
        <Field label="Expected date" required error={d.errors.expectedDate}>{(p) => <Input {...p} type="date" className={big} value={d.expectedDate} onChange={(e) => d.setExpectedDate(e.target.value)} />}</Field>
        <Field label="Notes">{(p) => <Input {...p} className={big} value={d.notes} onChange={(e) => d.setNotes(e.target.value)} />}</Field>
      </fieldset>
      {draft && <ItemPicker large onPick={(i, v) => d.addItem(i, v)} />}
      {d.errors.lines && <p role="alert" className="text-sm text-danger">{d.errors.lines}</p>}
      <ul className="flex flex-col gap-2" aria-label="Order lines">
        {d.lines.map((l) => {
          const pl = po?.lines.find((x) => x.variantId === l.variantId);
          return (
            <li key={l.variantId} className="rounded border-2 border-navy-100 p-3">
              <div className="flex items-start justify-between gap-2"><span><strong className="text-sm">{l.name}</strong><span className="block font-mono text-xs text-muted">{l.code} · Size {l.size}</span></span>{draft && <Button size="sm" variant="danger" className="min-h-11" onClick={() => d.removeLine(l.variantId)} aria-label={`Remove ${l.name} size ${l.size}`}>Remove</Button>}</div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Field label="Quantity">{(p) => draft ? <Input {...p} type="number" min={1} className={big} value={l.qty} onChange={(e) => d.setLine(l.variantId, { qty: e.target.value })} /> : <p className="text-sm">{l.qty}{pl ? ` (received ${pl.receivedQty})` : ''}</p>}</Field>
                <Field label="Unit cost">{(p) => draft ? <Input {...p} inputMode="decimal" className={big} value={l.cost} onChange={(e) => d.setLine(l.variantId, { cost: e.target.value })} /> : <p className="text-sm">{l.cost}</p>}</Field>
              </div>
            </li>
          );
        })}
      </ul>
      <PoTotals totals={d.totals} />
      <div className="fixed inset-x-0 bottom-14 z-30 flex gap-2 border-t-2 border-navy-100 bg-white p-3">
        {draft && can(po ? 'purchase.edit' : 'purchase.create') && <Button variant={po?.status === 'draft' ? 'secondary' : 'primary'} size="lg" className="min-h-12 flex-1" loading={d.save.isPending} onClick={save}>{po ? 'Save' : 'Create order'}</Button>}
        {po?.status === 'draft' && can('purchase.approve') && <Button variant="primary" size="lg" className="min-h-12 flex-1" loading={action.isPending} onClick={() => run('approve')}>Approve</Button>}
        {po?.status === 'approved' && <Button variant="primary" size="lg" className="min-h-12 flex-1" loading={action.isPending} onClick={() => run('send')}>Send</Button>}
        {po && ['approved', 'sent', 'partially-received'].includes(po.status) && can('purchase.create') && <Button variant="primary" size="lg" className="min-h-12 flex-1" loading={startGrn.isPending} onClick={async () => { try { const g = await startGrn.mutateAsync({ poId: po.id }); nav(`/purchase/grn/${g.id}`); } catch (e) { fail(e); } }}>Receive</Button>}
        {po && <Button size="lg" className="min-h-12" onClick={() => setPreview(true)}>PDF</Button>}
      </div>
      {po && <PoPreview sheet poId={po.id} open={preview} onClose={() => setPreview(false)} />}
      <Link to="/purchase" className="text-sm underline">Back to orders</Link>
    </div>
  );
}

export function PoFormMobile() {
  const { id } = useParams();
  const q = usePo(id);
  if (!id) return <Editor />;
  if (q.isPending) return <ListSkeleton rows={5} label="Loading order" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  return <Editor key={`${q.data.id}-${q.data.status}`} po={q.data} />;
}
