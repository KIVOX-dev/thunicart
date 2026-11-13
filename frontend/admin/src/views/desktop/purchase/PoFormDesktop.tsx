import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Badge, Button, Field, Input, ListSkeleton, Select, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { ItemPicker } from '../../../components/ItemPicker';
import { PageHeader } from '../../../components/PageHeader';
import { PoPreview } from '../../../components/PoPreview';
import { PoTotals } from '../../../components/PoTotals';
import { ApiError } from '../../../features/api/http';
import { useCan, useGstMode } from '../../../features/auth/permissions';
import { useVendors } from '../../../features/catalog/use-parties';
import { applyFieldIssues } from '../../../features/api/field-issues';
import { PO_STATUS_LABEL, poTone, type Po } from '../../../features/inventory/types';
import { useStartGrn } from '../../../features/inventory/use-grn';
import { usePo, usePoAction, usePoDraft } from '../../../features/inventory/use-purchase-orders';

function Editor({ po }: { po?: Po }) {
  const nav = useNavigate();
  const { toast } = useToast();
  const can = useCan();
  const gst = useGstMode();
  const d = usePoDraft(po);
  const vendors = useVendors('').data?.pages.flatMap((p) => p.items) ?? [];
  const action = usePoAction(po?.id ?? '');
  const startGrn = useStartGrn();
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState<{ message: string; requestId?: string } | null>(null);
  const draft = !po || po.status === 'draft';
  const fail = (e: unknown) => { const r = applyFieldIssues(e); d.setErrors(r.errors); setErr(r.banner); };

  const save = async () => {
    setErr(null); d.setErrors({});
    try { const saved = await d.save.mutateAsync(); toast(po ? 'Order saved' : 'Order created', 'success'); if (!po) nav(`/purchase/orders/${saved.id}`, { replace: true }); } catch (e) { fail(e); }
  };
  const run = async (a: 'approve' | 'send' | 'cancel') => { setErr(null); try { await action.mutateAsync(a); toast(a === 'approve' ? 'Order approved' : a === 'send' ? 'Order sent to the vendor' : 'Order cancelled', 'success'); } catch (e) { fail(e); } };

  return (
    <div className="max-w-6xl space-y-6">
      {err && <ErrorBanner {...err} />}
      <fieldset disabled={!draft} className="grid grid-cols-3 gap-4">
        <Field label="Vendor" required error={d.errors.vendorId}>{(p) => <Select {...p} value={d.vendorId} onChange={(e) => d.setVendorId(e.target.value)}><option value="">Choose a vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}</Field>
        <Field label="Expected date" required error={d.errors.expectedDate}>{(p) => <Input {...p} type="date" value={d.expectedDate} onChange={(e) => d.setExpectedDate(e.target.value)} />}</Field>
        <Field label="Notes">{(p) => <Input {...p} value={d.notes} onChange={(e) => d.setNotes(e.target.value)} />}</Field>
      </fieldset>
      {draft && <div className="max-w-xl"><ItemPicker onPick={(i, v) => d.addItem(i, v)} hint="Scanning an item that is already on the order adds one piece." /></div>}
      {d.errors.lines && <p role="alert" className="text-sm text-danger">{d.errors.lines}</p>}
      {d.lines.length > 0 && (
        <Table caption="Order lines">
          <THead><Tr><Th>Code</Th><Th>Item</Th><Th>Size</Th><Th className="text-right">Ordered</Th>{po && <Th className="text-right">Received</Th>}<Th className="text-right">Unit cost</Th>{gst === 'on' && po && <Th className="text-right">GST %</Th>}<Th><span className="sr-only">Remove</span></Th></Tr></THead>
          <TBody>
            {d.lines.map((l) => {
              const pl = po?.lines.find((x) => x.variantId === l.variantId);
              return (
                <Tr key={l.variantId}>
                  <Td className="font-mono text-xs">{l.code}</Td><Td className="font-medium">{l.name}</Td><Td>{l.size}</Td>
                  <Td className="text-right">{draft ? <Input type="number" min={1} aria-label={`Quantity for ${l.name} size ${l.size}`} className="ml-auto w-24 text-right" value={l.qty} onChange={(e) => d.setLine(l.variantId, { qty: e.target.value })} /> : l.qty}</Td>
                  {po && <Td className="text-right">{pl?.receivedQty ?? 0}</Td>}
                  <Td className="text-right">{draft ? <Input inputMode="decimal" aria-label={`Unit cost for ${l.name} size ${l.size}`} className="ml-auto w-24 text-right" value={l.cost} onChange={(e) => d.setLine(l.variantId, { cost: e.target.value })} /> : l.cost}</Td>
                  {gst === 'on' && po && <Td className="text-right">{pl?.taxRate ?? ''}</Td>}
                  <Td>{draft && <button type="button" aria-label={`Remove ${l.name} size ${l.size}`} onClick={() => d.removeLine(l.variantId)} className="flex h-9 w-9 items-center justify-center text-danger"><Trash2 size={16} /></button>}</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}
      <PoTotals totals={d.totals} />
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t-2 border-navy-100 bg-white py-3">
        {draft && can(po ? 'purchase.edit' : 'purchase.create') && <Button variant={po ? 'secondary' : 'primary'} size="lg" loading={d.save.isPending} onClick={save}>{po ? 'Save changes' : 'Create order'}</Button>}
        {po?.status === 'draft' && can('purchase.approve') && <Button variant="primary" size="lg" loading={action.isPending} onClick={() => run('approve')}>Approve</Button>}
        {po?.status === 'approved' && can('purchase.edit') && <Button variant="primary" size="lg" loading={action.isPending} onClick={() => run('send')}>Send to vendor</Button>}
        {po && ['approved', 'sent', 'partially-received'].includes(po.status) && can('purchase.create') && (
          <Button variant="primary" size="lg" loading={startGrn.isPending} onClick={async () => { try { const g = await startGrn.mutateAsync({ poId: po.id }); nav(`/purchase/grn/${g.id}`); } catch (e) { fail(e); } }}>Receive goods</Button>
        )}
        {po && <Button onClick={() => setPreview(true)}>PDF preview</Button>}
        {po && ['draft', 'approved', 'sent'].includes(po.status) && can('purchase.edit') && <Button variant="danger" onClick={() => run('cancel')}>Cancel order</Button>}
        <Link to="/purchase"><Button variant="ghost">Back to orders</Button></Link>
      </div>
      {po && <PoPreview poId={po.id} open={preview} onClose={() => setPreview(false)} />}
    </div>
  );
}

export function PoFormDesktop() {
  const { id } = useParams();
  const q = usePo(id);
  const title = id ? (q.data ? q.data.number : 'Purchase order') : 'New purchase order';
  return (
    <div>
      <PageHeader title={title} actions={q.data ? <Badge tone={poTone(q.data.status)}>{PO_STATUS_LABEL[q.data.status]}</Badge> : undefined} />
      {!id ? <Editor /> : q.isPending ? <ListSkeleton rows={6} label="Loading order" /> : q.isError ? <QueryError error={q.error as ApiError} onRetry={() => q.refetch()} /> : <Editor key={`${q.data.id}-${q.data.status}`} po={q.data} />}
    </div>
  );
}
