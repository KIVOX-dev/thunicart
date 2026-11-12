import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import { formatPaise } from '@thunikart/shared';
import { Badge, BottomSheet, Button, EmptyState, ListSkeleton, Select } from '@thunikart/ui';
import { ErrorBanner } from '../../../components/ErrorBanner';
import { ItemPicker } from '../../../components/ItemPicker';
import { ApprovalDialog } from '../../../components/pos/ApprovalDialog';
import { CustomerLookup } from '../../../components/pos/CustomerLookup';
import { DayOpen } from '../../../components/pos/DayOpen';
import { InvoiceViewer } from '../../../components/pos/InvoiceViewer';
import { BillDiscount, PosTotals } from '../../../components/pos/PosTotals';
import { SwipeRow } from '../../../components/pos/SwipeRow';
import { TenderPanel } from '../../../components/pos/TenderPanel';
import { useCan } from '../../../features/auth/permissions';
import { usePosScreen } from '../../../features/pos/use-pos-screen';

/** Scan first billing on a phone: a big Scan button, a card list you swipe to remove, a sticky Pay bar, and a full screen payment sheet. */
export function PosMobile() {
  const can = useCan();
  const s = usePosScreen();
  const { cart } = s;
  const [payOpen, setPayOpen] = useState(false);
  const [custOpen, setCustOpen] = useState(false);
  const pv = cart.preview;
  if (s.shift.isPending) return <ListSkeleton label="Loading POS" />;
  if (!s.shift.data) return <div className="pt-4">{can('pos.create') ? <DayOpen big /> : <EmptyState title="The day is not open" body="Ask someone with POS access to open the day." />}</div>;

  return (
    <div className="flex flex-col gap-3 pb-40" aria-label="Point of sale">
      <ItemPicker large onPick={(i, v) => cart.addItem(i, v)} />
      {s.notice && <p role="status" className="rounded border border-teal bg-success-bg p-2 text-sm">{s.notice}</p>}
      <div className="flex gap-2">
        <Button className="min-h-12 flex-1" onClick={() => setCustOpen(true)}>{cart.cart.customer ? cart.cart.customer.name : 'Add customer'}</Button>
        <Button className="min-h-12" disabled={!cart.cart.lines.length} onClick={() => s.holdBill()}>Hold</Button>
        <Link to="/billing/bills?tab=held"><Button className="min-h-12">Held</Button></Link>
      </div>
      {cart.cart.lines.length === 0 ? <EmptyState title="The bill is empty" body="Tap the scan button, or search for an item." /> : (
        <ul className="flex flex-col gap-2" aria-label="Bill items">
          {cart.cart.lines.map((l) => {
            const pl = pv?.lines.find((x) => x.variantId === l.variantId);
            const conflict = cart.conflicts[l.variantId];
            return (
              <li key={l.variantId}>
                <SwipeRow onRemove={() => cart.remove(l.variantId)} label={`Remove ${l.name}`}>
                  <div className={`rounded border p-3 ${conflict ? 'border-danger bg-danger-bg' : 'border-line'}`}>
                    <div className="flex items-start justify-between gap-2"><span><strong className="text-sm">{l.name}</strong><span className="block text-xs text-muted">{l.code} · Size {l.size}{l.color && ` · ${l.color}`}</span></span><strong>{pl ? formatPaise(pl.net) : '…'}</strong></div>
                    {conflict && <p role="alert" className="mt-1 text-xs text-danger">{conflict}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2">
                        <button type="button" aria-label={`Fewer ${l.name}`} onClick={() => cart.setQty(l.variantId, l.qty - 1)} className="flex h-11 w-11 items-center justify-center rounded border border-navy"><Minus size={18} /></button>
                        <span className="w-8 text-center text-lg" data-testid={`qty-${l.code}`}>{l.qty}</span>
                        <button type="button" aria-label={`More ${l.name}`} onClick={() => cart.setQty(l.variantId, l.qty + 1)} className="flex h-11 w-11 items-center justify-center rounded border border-navy bg-navy text-white"><Plus size={18} /></button>
                      </span>
                      <span className="flex items-center gap-1"><Select aria-label={`Discount type for ${l.name}`} className="w-16 min-h-11" value={l.discType} onChange={(e) => cart.setLineDiscount(l.variantId, e.target.value as 'amount' | 'percent', l.discValue)}><option value="amount">₹</option><option value="percent">%</option></Select>
                        <input aria-label={`Discount for ${l.name}`} inputMode="decimal" placeholder="Disc" className="h-11 w-20 rounded border border-line px-2 text-right text-base" value={l.discValue} onChange={(e) => cart.setLineDiscount(l.variantId, l.discType, e.target.value)} /></span>
                    </div>
                  </div>
                </SwipeRow>
              </li>
            );
          })}
        </ul>
      )}
      {cart.cart.lines.length > 0 && <div className="rounded border border-line p-3"><PosTotals cart={cart} /><div className="mt-3"><BillDiscount cart={cart} big /></div></div>}
      {pv?.approvalNeeded && <Badge tone="warning" className="self-start">Discount above your limit. A manager must approve.</Badge>}
      {cart.previewError && <ErrorBanner message={cart.previewError.message} requestId={cart.previewError.requestId} />}

      <div className="fixed inset-x-0 bottom-14 z-30 flex items-center gap-3 border-t border-line bg-white p-3">
        <div className="min-w-0 flex-1"><p className="text-xs text-muted">Total</p><p className="text-xl font-semibold" data-testid="bar-total">{pv ? formatPaise(pv.totals.grandTotal) : formatPaise(0)}</p></div>
        <Button variant="primary" size="lg" className="min-h-12 min-w-32" disabled={!pv || pv.totals.grandTotal === 0} onClick={() => setPayOpen(true)}>Pay</Button>
      </div>

      <BottomSheet open={payOpen} onClose={() => setPayOpen(false)} title={`Pay ${pv ? formatPaise(pv.totals.grandTotal) : ''}`} className="!h-full !max-h-none !rounded-none"
        footer={<Button variant="primary" size="lg" block className="min-h-12" loading={cart.finalize.isPending} disabled={!s.canPay && !pv?.approvalNeeded} onClick={async () => { const inv = await s.pay(); if (inv) setPayOpen(false); }}>{pv?.approvalNeeded && !cart.cart.approverToken ? 'Get approval' : 'Finish bill'}</Button>}>
        <div className="flex flex-col gap-4">
          <TenderPanel cart={cart} big />
          {s.err && s.err.code !== 'STOCK_CONFLICT' && <ErrorBanner message={s.err.friendly} requestId={s.err.requestId} />}
          {s.err?.code === 'STOCK_CONFLICT' && (
            <div role="alert" className="rounded border border-danger bg-danger-bg p-3 text-sm"><strong>Stock changed.</strong> {s.err.message}
              <div className="mt-2 flex flex-wrap gap-2">{Object.keys(cart.conflicts).map((id) => { const l = cart.cart.lines.find((x) => x.variantId === id); return l ? <Button key={id} className="min-h-11" onClick={() => { cart.remove(id); setPayOpen(false); }}>Remove {l.name}</Button> : null; })}</div></div>
          )}
        </div>
      </BottomSheet>
      <BottomSheet open={custOpen} onClose={() => setCustOpen(false)} title="Customer"><CustomerLookup big onPick={(c) => { cart.setCustomer(c); setCustOpen(false); }} />{cart.cart.customer && <Button className="mt-3 min-h-12" block variant="ghost" onClick={() => { cart.setCustomer(null); setCustOpen(false); }}>Use walk-in customer</Button>}</BottomSheet>
      <ApprovalDialog sheet screen={s} />
      <InvoiceViewer sheet invoice={s.invoice} onClose={s.closeInvoice} title="Bill" />
    </div>
  );
}
