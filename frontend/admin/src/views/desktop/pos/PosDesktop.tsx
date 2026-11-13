import { useEffect, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatPaise } from '@thunikart/shared';
import { Badge, Button, EmptyState, ListSkeleton, Modal, Select, Table, TBody, Td, Th, THead, Tr } from '@thunikart/ui';
import { ErrorBanner } from '../../../components/ErrorBanner';
import { ItemPicker } from '../../../components/ItemPicker';
import { ApprovalDialog } from '../../../components/pos/ApprovalDialog';
import { MobileCapture } from '../../../components/pos/MobileCapture';
import { CustomerLookup } from '../../../components/pos/CustomerLookup';
import { DayOpen } from '../../../components/pos/DayOpen';
import { InvoiceViewer } from '../../../components/pos/InvoiceViewer';
import { BillDiscount, PosTotals } from '../../../components/pos/PosTotals';
import { TenderPanel } from '../../../components/pos/TenderPanel';
import { useCan } from '../../../features/auth/permissions';
import { usePrint } from '../../../features/pos/use-print';
import { usePosScreen } from '../../../features/pos/use-pos-screen';

/** Counter billing. Left: scan box and cart. Right: customer, totals and payment. F2 new bill, F4 hold, F8 pay, Esc clear. */
export function PosDesktop() {
  const can = useCan();
  const s = usePosScreen();
  const { cart } = s;
  const [custOpen, setCustOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const pv = cart.preview;
  const { print, size: printSize } = usePrint();
  // Print automatically after each paid bill (per device choice).
  const [autoPrint, setAutoPrint] = useState(() => { try { return localStorage.getItem('tk.print.auto') === '1'; } catch { return false; } });
  const toggleAuto = (v: boolean) => { setAutoPrint(v); try { localStorage.setItem('tk.print.auto', v ? '1' : '0'); } catch { /* storage blocked */ } };
  const [lastInvoice, setLastInvoice] = useState<typeof s.invoice>(null);
  useEffect(() => {
    if (!s.invoice) return;
    setLastInvoice(s.invoice);
    if (autoPrint) print(s.invoice, s.invoice.channel === 'Counter' ? 'a4' : printSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.invoice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); cart.clear(); }
      if (e.key === 'F4') { e.preventDefault(); void s.holdBill(); }
      if (e.key === 'F8') { e.preventDefault(); void s.pay(); }
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { const el = document.activeElement as HTMLInputElement | null; if (el && el.tagName === 'INPUT' && el.value) el.value = ''; else if (cart.cart.lines.length) setClearOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (s.shift.isPending) return <ListSkeleton label="Loading POS" />;
  if (!s.shift.data) return <div className="pt-8">{can('pos.create') ? <DayOpen /> : <EmptyState title="The day is not open" body="Ask someone with POS access to open the day." />}</div>;

  return (
    <div className="grid grid-cols-[1fr_24rem] gap-6" aria-label="Point of sale">
      <section aria-label="Cart" className="min-w-0">
        <div className="mb-3 flex items-center justify-between"><h1 className="text-2xl md:text-3xl">POS billing</h1><span className="text-xs text-muted">F2 new · F4 hold · F8 pay · Esc clear</span></div>
        <ItemPicker large autoFocus onPick={(i, v) => cart.addItem(i, v)} hint="Scan an item, or type a name or code. Scanning an item already in the bill adds one." />
        {s.notice && <p role="status" className="mt-2 rounded border border-teal bg-success-bg p-2 text-sm">{s.notice}</p>}
        <div className="mt-4">
          {cart.cart.lines.length === 0 ? <EmptyState title="The bill is empty" body="Scan the first item." /> : (
            <Table caption="Bill items">
              <THead><Tr><Th>Item</Th><Th>Size</Th><Th>Color</Th><Th className="text-center">Qty</Th><Th className="text-right">Rate</Th><Th>Discount</Th><Th className="text-right">Net</Th><Th><span className="sr-only">Remove</span></Th></Tr></THead>
              <TBody>
                {cart.cart.lines.map((l) => {
                  const pl = pv?.lines.find((x) => x.variantId === l.variantId);
                  const conflict = cart.conflicts[l.variantId];
                  return (
                    <Tr key={l.variantId} className={conflict ? '!bg-danger-bg' : ''}>
                      <Td><strong>{l.name}</strong><span className="block font-mono text-xs text-muted">{l.code}</span>{conflict && <span role="alert" className="block text-xs text-danger">{conflict}</span>}</Td>
                      <Td>{l.size}</Td><Td>{l.color}</Td>
                      <Td className="text-center"><span className="inline-flex items-center gap-1">
                        <button type="button" aria-label={`Fewer ${l.name}`} onClick={() => cart.setQty(l.variantId, l.qty - 1)} className="flex h-9 w-9 items-center justify-center rounded border-2 border-navy-100 hover:bg-mist"><Minus size={14} /></button>
                        <span className="w-8 text-center" data-testid={`qty-${l.code}`}>{l.qty}</span>
                        <button type="button" aria-label={`More ${l.name}`} onClick={() => cart.setQty(l.variantId, l.qty + 1)} className="flex h-9 w-9 items-center justify-center rounded border-2 border-navy-100 hover:bg-mist"><Plus size={14} /></button></span></Td>
                      <Td className="text-right">{pl ? formatPaise(pl.rate) : '…'}</Td>
                      <Td><span className="flex items-center gap-1"><Select aria-label={`Discount type for ${l.name}`} className="w-16" value={l.discType} onChange={(e) => cart.setLineDiscount(l.variantId, e.target.value as 'amount' | 'percent', l.discValue)}><option value="amount">₹</option><option value="percent">%</option></Select>
                        <input aria-label={`Discount for ${l.name}`} inputMode="decimal" className="h-10 w-20 rounded border-2 border-navy-100 px-2 text-right text-sm" value={l.discValue} onChange={(e) => cart.setLineDiscount(l.variantId, l.discType, e.target.value)} placeholder="0" /></span></Td>
                      <Td className="text-right font-semibold">{pl ? formatPaise(pl.net) : '…'}</Td>
                      <Td><button type="button" aria-label={`Remove ${l.name}`} onClick={() => cart.remove(l.variantId)} className="flex h-9 w-9 items-center justify-center text-danger"><Trash2 size={16} /></button></Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </div>
      </section>

      <aside aria-label="Customer and payment" className="flex flex-col gap-4 rounded border-2 border-navy-100 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-sm">{cart.cart.customer ? <><strong className="block truncate">{cart.cart.customer.name}</strong><span className="text-xs text-muted">{cart.cart.customer.code} · {cart.cart.customer.mobile} · wallet {formatPaise(cart.cart.customer.walletBalance)}</span></> : <span className="text-muted">Walk-in customer</span>}</div>
          <span className="flex gap-1"><Button size="sm" onClick={() => setCustOpen(true)}>{cart.cart.customer ? 'Change' : 'Add customer'}</Button>{cart.cart.customer && <Button size="sm" variant="ghost" onClick={() => cart.setCustomer(null)}>Remove</Button>}</span>
        </div>
        {!cart.cart.customer && <MobileCapture onPick={(c) => cart.setCustomer(c)} />}
        <PosTotals cart={cart} />
        <BillDiscount cart={cart} />
        {pv?.approvalNeeded && <Badge tone="warning">Discount above your limit. A manager must approve.</Badge>}
        {cart.cart.approverToken && <Badge tone="success">Approved by a manager</Badge>}
        {cart.previewError && <ErrorBanner message={cart.previewError.message} requestId={cart.previewError.requestId} />}
        <TenderPanel cart={cart} />
        {s.err && s.err.code !== 'STOCK_CONFLICT' && <ErrorBanner message={s.err.friendly} requestId={s.err.requestId} />}
        {s.err?.code === 'STOCK_CONFLICT' && (
          <div role="alert" className="rounded border border-danger bg-danger-bg p-3 text-sm">
            <strong>Stock changed.</strong> {s.err.message}
            <div className="mt-2 flex flex-wrap gap-2">{Object.keys(cart.conflicts).map((id) => { const l = cart.cart.lines.find((x) => x.variantId === id); return l ? <Button key={id} size="sm" onClick={() => cart.remove(id)}>Remove {l.name}</Button> : null; })}</div>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="primary" size="lg" className="flex-1" disabled={!s.canPay && !pv?.approvalNeeded} loading={cart.finalize.isPending} onClick={() => s.pay()}>{pv?.approvalNeeded && !cart.cart.approverToken ? 'Get approval (F8)' : 'Pay (F8)'}</Button>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={autoPrint} onChange={(e) => toggleAuto(e.target.checked)} />Print after payment</label>
          <Button size="sm" disabled={!lastInvoice} onClick={() => lastInvoice && print(lastInvoice, lastInvoice.channel === 'Counter' ? 'a4' : printSize)}>Print last bill</Button>
        </div>
        <div className="flex gap-2"><Button className="flex-1" disabled={!cart.cart.lines.length} onClick={() => s.holdBill()}>Hold (F4)</Button><Button className="flex-1" onClick={() => cart.clear()}>New bill (F2)</Button></div>
      </aside>

      <Modal open={custOpen} onClose={() => setCustOpen(false)} title="Customer"><CustomerLookup onPick={(c) => { cart.setCustomer(c); setCustOpen(false); }} /></Modal>
      <Modal open={clearOpen} onClose={() => setClearOpen(false)} title="Clear this bill?" footer={<><Button onClick={() => setClearOpen(false)}>Keep it</Button><Button variant="danger" onClick={() => { cart.clear(); setClearOpen(false); }}>Clear bill</Button></>}><p className="text-sm">All items on this bill will be removed.</p></Modal>
      <ApprovalDialog screen={s} />
      <InvoiceViewer invoice={s.invoice} onClose={s.closeInvoice} title="Bill" />
    </div>
  );
}
