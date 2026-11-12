import { useEffect, useState } from 'react';
import { formatPaise } from '@thunikart/shared';
import { Button, Field, Input, Select } from '@thunikart/ui';
import { ApiError } from '../../features/api/http';
import { REFUND_MODES, RETURN_REASONS_SALE, type CreditNote, type Invoice } from '../../features/pos/types';
import { fetchBillByNumber, useReturnFlow } from '../../features/pos/use-pos-data';
import { ErrorBanner } from '../ErrorBanner';
import { ItemPicker } from '../ItemPicker';
import { ScanBox } from '../ScanBox';
import { InvoiceViewer } from './InvoiceViewer';

/**
 * Returns and exchanges: scan the invoice barcode or type its number, pick lines and quantities, choose the reason and refund method,
 * and for an exchange add the new items on the same screen. The difference shown comes from the API preview.
 */
export function ReturnPanel({ big, sheet }: { big?: boolean; sheet?: boolean }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ creditNote: CreditNote; exchangeInvoice: Invoice | null } | null>(null);
  const [show, setShow] = useState<Invoice | null>(null);
  const r = useReturnFlow(invoice);
  const h = big ? 'min-h-12' : '';

  const find = async (code: string) => {
    setLookupErr(null); setDone(null);
    try { const inv = await fetchBillByNumber(code.trim()); setInvoice(inv); } catch (e) { setInvoice(null); setLookupErr(e instanceof ApiError && e.status === 404 ? `No bill with the number ${code.trim()}.` : 'Could not look up the bill.'); }
  };
  // The difference is worked out by the API whenever the choices change.
  useEffect(() => { const t = setTimeout(() => r.refresh(), 200); return () => clearTimeout(t); }, [r.bodyKey]);
  const pv = r.preview;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <ScanBox large={big} onCode={find} placeholder="Scan the invoice barcode or type the bill number" />
      {lookupErr && <p role="alert" className="rounded border border-danger bg-danger-bg p-2 text-sm">{lookupErr}</p>}
      {done && (
        <div role="status" className="rounded border border-teal bg-success-bg p-4 text-sm" data-testid="return-done">
          <strong>Credit note {done.creditNote.number}</strong> for {formatPaise(done.creditNote.total)} created.
          {done.creditNote.refunded > 0 && <> Refund {formatPaise(done.creditNote.refunded)} by {done.creditNote.refundMode}.</>}
          {done.creditNote.collected > 0 && <> Collected {formatPaise(done.creditNote.collected)} for the exchange.</>}
          {done.exchangeInvoice && <div className="mt-2"><Button size="sm" onClick={() => setShow(done.exchangeInvoice)}>View exchange bill {done.exchangeInvoice.number}</Button></div>}
        </div>
      )}
      {invoice && !done && (
        <div className="flex flex-col gap-4">
          <section aria-label="Bill to return from" className="rounded border border-line p-3 text-sm">
            <div className="flex justify-between"><strong data-testid="return-invoice">{invoice.number}</strong><span>{formatPaise(invoice.totals.grandTotal)}</span></div>
            <p className="text-xs text-muted">{invoice.customer?.name ?? 'Walk-in'} · {invoice.date}</p>
          </section>
          <ul className="flex flex-col gap-2" aria-label="Items sold">
            {invoice.lines.map((l, i) => {
              const left = l.qty - (invoice.returned[i] ?? 0);
              return (
                <li key={i} className="flex items-center justify-between gap-3 rounded border border-line p-2 text-sm">
                  <span className="min-w-0"><strong className="block truncate">{l.name}</strong><span className="text-xs text-muted">Size {l.size} · sold {l.qty} · paid {formatPaise(l.net)} · {left} can be returned</span></span>
                  <Input type="number" min={0} max={left} aria-label={`Return quantity for ${l.name} size ${l.size}`} disabled={left === 0} className={`w-20 ${h}`} value={r.qtys[i] ?? 0} onChange={(e) => r.setQty(i, Math.max(0, Math.min(left, Math.round(Number(e.target.value)))))} />
                </li>
              );
            })}
          </ul>
          {r.errors.lines && <p role="alert" className="text-xs text-danger">{r.errors.lines}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Reason" required error={r.errors.reason}>{(p) => <Select {...p} className={h} value={r.reason} onChange={(e) => r.setReason(e.target.value)}><option value="">Choose a reason</option>{RETURN_REASONS_SALE.map((x) => <option key={x}>{x}</option>)}</Select>}</Field>
            <Field label="Refund method" required>{(p) => <Select {...p} className={h} value={r.refundMode} onChange={(e) => r.setRefundMode(e.target.value)}>{REFUND_MODES.map((x) => <option key={x}>{x}</option>)}</Select>}</Field>
          </div>
          <section aria-label="Exchange" className="rounded border border-line p-3">
            <h3 className="mb-2 text-xs">Exchange for new items (optional)</h3>
            <ItemPicker large={big} onPick={(i, v) => r.addExchange(i, v)} />
            <ul className="mt-2 flex flex-col gap-1" aria-label="Exchange items">{r.exchange.map((e) => <li key={e.variantId} className="flex items-center justify-between text-sm"><span>{e.name} {e.size} x {e.qty}</span><Button size="sm" variant="ghost" className="min-h-11" onClick={() => r.removeExchange(e.variantId)}>Remove</Button></li>)}</ul>
          </section>
          {pv && (
            <dl className="grid grid-cols-2 gap-2 rounded bg-mist p-3 text-sm" aria-label="Return summary" aria-live="polite">
              <dt>Returned items</dt><dd className="text-right" data-testid="return-total">{formatPaise(pv.returnTotal)}</dd>
              {pv.exchangeTotal > 0 && <><dt>New items</dt><dd className="text-right" data-testid="exchange-total">{formatPaise(pv.exchangeTotal)}</dd></>}
              {pv.refundDue > 0 && <><dt className="font-semibold">Refund to customer</dt><dd className="text-right font-semibold" data-testid="refund-due">{formatPaise(pv.refundDue)}</dd></>}
              {pv.collectDue > 0 && <><dt className="font-semibold">Collect from customer</dt><dd className="text-right font-semibold" data-testid="collect-due">{formatPaise(pv.collectDue)}</dd></>}
            </dl>
          )}
          {pv && pv.collectDue > 0 && (
            <div className="flex flex-col gap-2" aria-label="Collect the difference">
              {r.collect.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Select aria-label="Collect with" className={`w-36 ${h}`} value={c.mode} onChange={(e) => r.setCollect(r.collect.map((x, n) => (n === i ? { ...x, mode: e.target.value } : x)))}>{['Cash', 'UPI', 'Card'].map((m) => <option key={m}>{m}</option>)}</Select>
                  <Input aria-label="Amount collected" inputMode="decimal" className={`text-right ${h}`} value={c.amount} onChange={(e) => r.setCollect(r.collect.map((x, n) => (n === i ? { ...x, amount: e.target.value } : x)))} />
                  <Button className={h} onClick={() => r.setCollect(r.collect.map((x, n) => (n === i ? { ...x, amount: String(pv.collectDue / 100) } : x)))}>Full</Button>
                </div>
              ))}
              <p className="text-xs text-muted">Still to collect: {formatPaise(pv.payment.left)}</p>
            </div>
          )}
          {r.banner && <ErrorBanner {...r.banner} />}
          <Button variant="primary" size="lg" className={h} loading={r.saving} disabled={r.lines.length === 0 || !r.reason || (pv?.payment.left ?? 0) > 0} onClick={async () => { const out = await r.confirm(); if (out) setDone(out); }}>{r.exchange.length ? 'Confirm exchange' : 'Confirm return'}</Button>
        </div>
      )}
      <InvoiceViewer sheet={sheet} invoice={show} onClose={() => setShow(null)} title="Exchange bill" />
    </div>
  );
}
