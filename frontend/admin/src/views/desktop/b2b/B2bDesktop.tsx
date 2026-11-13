import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { formatPaise } from '@thunikart/shared';
import { Badge, Button, Field, Input, Modal, Select, Table, TBody, Td, Th, THead, Tr } from '@thunikart/ui';
import { ErrorBanner } from '../../../components/ErrorBanner';
import { ItemPicker } from '../../../components/ItemPicker';
import { PageHeader } from '../../../components/PageHeader';
import { ApprovalDialog } from '../../../components/pos/ApprovalDialog';
import { CustomerLookup } from '../../../components/pos/CustomerLookup';
import { InvoiceViewer } from '../../../components/pos/InvoiceViewer';
import { PosTotals } from '../../../components/pos/PosTotals';
import { usePosScreen } from '../../../features/pos/use-pos-screen';

/** Counter invoice for a trade customer: customer GSTIN, due date, credit by default and an A4 print. */
export function B2bDesktop() {
  const s = usePosScreen('tk.b2b.cart');
  const { cart } = s;
  const [custOpen, setCustOpen] = useState(false);
  const [due, setDue] = useState(new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
  const [payMode, setPayMode] = useState<'Credit' | 'UPI' | 'Bank Transfer' | 'Cash'>('Credit');
  const pv = cart.preview;
  const c = cart.cart.customer;
  const payAll = () => { cart.patch((x) => ({ ...x, payments: [] })); cart.addPayment(payMode, pv ? String(pv.totals.grandTotal / 100) : ''); };
  return (
    <div className="max-w-6xl">
      <PageHeader title="Counter invoice (B2B)" description="For trade customers. Credit by default, A4 print." actions={<Link to="/billing/bills"><Button variant="ghost">Back to bills</Button></Link>} />
      <div className="grid grid-cols-[1fr_22rem] gap-6">
        <section aria-label="Invoice items">
          <ItemPicker autoFocus onPick={(i, v) => cart.addItem(i, v)} />
          {cart.cart.lines.length > 0 && (
            <div className="mt-4">
              <Table caption="Invoice items">
                <THead><Tr><Th>Item</Th><Th>Size</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th>{pv && pv.totals.tax !== null && <Th className="text-right">GST %</Th>}<Th className="text-right">Net</Th><Th><span className="sr-only">Remove</span></Th></Tr></THead>
                <TBody>{cart.cart.lines.map((l) => {
                  const pl = pv?.lines.find((x) => x.variantId === l.variantId);
                  return (
                    <Tr key={l.variantId}><Td><strong>{l.name}</strong><span className="block font-mono text-xs text-muted">{l.code}</span></Td><Td>{l.size}</Td>
                      <Td className="text-right"><Input type="number" min={1} aria-label={`Quantity for ${l.name}`} className="ml-auto w-24 text-right" value={l.qty} onChange={(e) => cart.setQty(l.variantId, Math.round(Number(e.target.value)))} /></Td>
                      <Td className="text-right">{pl ? formatPaise(pl.rate) : '…'}</Td>{pv && pv.totals.tax !== null && <Td className="text-right">{pl?.taxRate ?? ''}</Td>}<Td className="text-right font-semibold">{pl ? formatPaise(pl.net) : '…'}</Td>
                      <Td><button type="button" aria-label={`Remove ${l.name}`} onClick={() => cart.remove(l.variantId)} className="flex h-9 w-9 items-center justify-center text-danger"><Trash2 size={16} /></button></Td></Tr>
                  );
                })}</TBody>
              </Table>
            </div>
          )}
        </section>
        <aside className="flex flex-col gap-4 rounded border-2 border-navy-100 p-4" aria-label="Customer and totals">
          <div>
            <div className="flex items-center justify-between"><h2 className="text-xs">Customer</h2><Button size="sm" onClick={() => setCustOpen(true)}>{c ? 'Change' : 'Choose'}</Button></div>
            {c ? <p className="mt-1 text-sm"><strong>{c.name}</strong><span className="block text-xs text-muted">{c.mobile}</span><span className="block text-xs" data-testid="b2b-gstin">{c.gstin ? `GSTIN ${c.gstin}` : <Badge tone="warning">No GSTIN</Badge>}</span></p> : <p className="mt-1 text-sm text-muted">Choose a trade customer.</p>}
          </div>
          <Field label="Due date" required>{(p) => <Input {...p} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}</Field>
          <PosTotals cart={cart} />
          <Field label="Payment">{(p) => <Select {...p} value={payMode} onChange={(e) => setPayMode(e.target.value as typeof payMode)}>{['Credit', 'UPI', 'Bank Transfer', 'Cash'].map((m) => <option key={m}>{m}</option>)}</Select>}</Field>
          <Button onClick={payAll} disabled={!pv}>Apply payment to full amount</Button>
          <p className="text-sm" data-testid="b2b-left">Left to pay: {pv ? formatPaise(pv.payment.left) : '–'}</p>
          {s.err && <ErrorBanner message={s.err.friendly} requestId={s.err.requestId} />}
          <Button variant="primary" size="lg" disabled={!s.canPay} loading={cart.finalize.isPending} onClick={() => s.pay({ channel: 'Counter', dueDate: due })}>Create invoice</Button>
        </aside>
      </div>
      <Modal open={custOpen} onClose={() => setCustOpen(false)} title="Customer"><CustomerLookup onPick={(x) => { cart.setCustomer(x); setCustOpen(false); }} /></Modal>
      <ApprovalDialog screen={s} />
      <InvoiceViewer invoice={s.invoice} onClose={s.closeInvoice} title="Invoice" />
    </div>
  );
}
