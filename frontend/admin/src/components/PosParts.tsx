import { useState } from 'react';
import { formatPaise } from '@thunikart/shared';
import { Badge, BottomSheet, Button, Checkbox, Field, Input, Modal, Select } from '@thunikart/ui';
import { ErrorBanner } from './ErrorBanner';
import { useGstMode } from '../features/auth/permissions';
import type { Customer } from '../features/catalog/types';
import type { Cart } from '../features/pos/use-cart';
import { useApproval, useCustomerSearch, useQuickCustomer, useShift, useShiftActions } from '../features/pos/use-pos-data';
import { TENDERS, type Preview } from '../features/pos/types';
import { ApiError } from '../features/api/http';

/** Customer lookup by mobile, with quick add (name and mobile only). */
export function CustomerLookup({ onPick }: { onPick: (c: Customer) => void }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const search = useCustomerSearch(q);
  const quick = useQuickCustomer((c) => { onPick(c); setAdding(false); });
  return (
    <div className="flex flex-col gap-3">
      <Field label="Customer mobile or name">{(p) => <Input {...p} inputMode="tel" autoFocus placeholder="Type at least 3 digits" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-12" />}</Field>
      {search.data?.map((c) => (
        <button key={c.id} type="button" onClick={() => onPick(c)} className="flex min-h-12 items-center justify-between rounded border border-line px-3 text-left text-sm hover:bg-mist" aria-label={`Choose ${c.name}`}>
          <span><strong>{c.name}</strong><span className="block text-xs text-muted">{c.mobile} · {c.accountGroup}</span></span><span className="text-xs text-muted">{c.loyaltyPoints} pts</span>
        </button>
      ))}
      {search.data && search.data.length === 0 && q.trim().length >= 3 && !adding && <p className="text-sm text-muted">No customer found for {q}.</p>}
      {!adding ? <Button onClick={() => setAdding(true)} className="min-h-11">Add new customer</Button> : (
        <form onSubmit={(e) => { e.preventDefault(); void quick.submit({ name, mobile: q.trim() }); }} noValidate className="flex flex-col gap-3 rounded border border-line bg-mist p-3" aria-label="Quick add customer">
          {quick.banner && <ErrorBanner {...quick.banner} />}
          <Field label="Name" required error={quick.errors.name}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} className="min-h-11" />}</Field>
          <Field label="Mobile" required error={quick.errors.mobile}>{(p) => <Input {...p} inputMode="tel" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11" />}</Field>
          <Button type="submit" variant="primary" loading={quick.saving}>Save customer</Button>
        </form>
      )}
    </div>
  );
}

/** Manager approval prompt for a discount above the role limit. */
export function ApprovalDialog({ open, onClose, preview, onToken, sheet }: { open: boolean; onClose: () => void; preview: Preview | null; onToken: (t: string) => void; sheet?: boolean }) {
  const [pin, setPin] = useState('');
  const a = useApproval((t) => { onToken(t); setPin(''); onClose(); });
  const Shell = sheet ? BottomSheet : Modal;
  return (
    <Shell open={open} onClose={onClose} title="Manager approval needed">
      <form onSubmit={(e) => { e.preventDefault(); void a.submit(pin); }} className="flex flex-col gap-3" aria-label="Manager approval">
        <p className="text-sm">This discount is <strong>{preview?.approvalNeeded?.requestedPct}%</strong>, above the limit of {preview?.approvalNeeded?.limitPct}% for your role. A manager enters their PIN to approve it.</p>
        <Field label="Manager PIN" required error={a.error ?? undefined}>{(p) => <Input {...p} type="password" inputMode="numeric" autoFocus autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} className="min-h-12" />}</Field>
        <Button type="submit" variant="primary" size="lg" loading={a.busy} disabled={!pin}>Approve discount</Button>
      </form>
    </Shell>
  );
}

/** Day open and close: expected cash against counted cash. */
export function ShiftPanel() {
  const shift = useShift();
  const [cash, setCash] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const act = useShiftActions(setErr);
  const s = shift.data;
  return (
    <div className="flex max-w-md flex-col gap-3" aria-label="Day open and close">
      {err && <ErrorBanner message={err} />}
      {!s ? (
        <form onSubmit={async (e) => { e.preventDefault(); setErr(null); await act.open.mutateAsync(cash).catch(() => undefined); setCash(''); }} className="flex flex-col gap-3">
          <p className="text-sm">The day is closed. Count the cash in the drawer and open the day to start billing.</p>
          <Field label="Cash in drawer (rupees)" required>{(p) => <Input {...p} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} className="min-h-12" />}</Field>
          <Button type="submit" variant="primary" size="lg" loading={act.open.isPending}>Open day</Button>
        </form>
      ) : s.closedAt ? null : (
        <form onSubmit={async (e) => { e.preventDefault(); setErr(null); await act.close.mutateAsync(cash).catch(() => undefined); setCash(''); }} className="flex flex-col gap-3">
          <p className="text-sm"><Badge tone="success">Day is open</Badge> {s.bills} bills so far.</p>
          <Field label="Cash counted at close (rupees)" required>{(p) => <Input {...p} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} className="min-h-12" />}</Field>
          <Button type="submit" variant="primary" size="lg" loading={act.close.isPending}>Close day</Button>
        </form>
      )}
      {s?.closedAt && (
        <dl className="rounded border border-line p-3 text-sm" aria-label="Day closed summary">
          <div className="flex justify-between"><dt>Opening cash</dt><dd>{formatPaise(s.openingCash)}</dd></div>
          <div className="flex justify-between"><dt>Expected cash</dt><dd data-testid="expected-cash">{formatPaise(s.expectedCash ?? 0)}</dd></div>
          <div className="flex justify-between"><dt>Counted cash</dt><dd>{formatPaise(s.countedCash ?? 0)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Difference</dt><dd data-testid="cash-difference">{(s.difference ?? 0) < 0 ? '-' : ''}{formatPaise(Math.abs(s.difference ?? 0))}</dd></div>
        </dl>
      )}
    </div>
  );
}

/** Totals block. Every figure is what the API returned. Tax lines show only while GST is on. */
export function BillTotals({ preview }: { preview: Preview | null }) {
  const gst = useGstMode();
  const t = preview?.totals;
  if (!t) return <p className="text-sm text-muted">Scan an item to start the bill.</p>;
  return (
    <dl className="space-y-1 text-sm" aria-label="Bill totals">
      <div className="flex justify-between"><dt>Items / pieces</dt><dd>{preview!.lines.length} / {t.pieces}</dd></div>
      <div className="flex justify-between"><dt>Gross</dt><dd>{formatPaise(t.gross)}</dd></div>
      {t.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>-{formatPaise(t.discount)}</dd></div>}
      {gst === 'on' && t.tax !== null && <div className="flex justify-between text-muted"><dt>{preview!.interState ? 'IGST' : 'CGST + SGST'} included</dt><dd>{formatPaise(t.tax)}</dd></div>}
      {gst === 'on' && <div className="flex justify-between text-muted"><dt>Round off</dt><dd>{t.roundOff < 0 ? '-' : ''}{formatPaise(Math.abs(t.roundOff))}</dd></div>}
      <div className="flex justify-between border-t border-line pt-2 text-lg font-semibold"><dt>Total</dt><dd data-testid="bill-total">{formatPaise(t.grandTotal)}</dd></div>
    </dl>
  );
}

/** Tender buttons, amounts and references. Amount left and change due come from the API preview. */
export function PaymentPanel({ cart, big }: { cart: Cart; big?: boolean }) {
  const pv = cart.preview;
  const h = big ? 'min-h-12' : '';
  return (
    <div className="flex flex-col gap-3" aria-label="Payment">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Add a payment">
        {TENDERS.map((m) => <Button key={m} size="sm" className={big ? 'min-h-12 flex-1' : 'min-h-10'} onClick={() => cart.addPayment(m, m === 'Cash' || !cart.cart.payments.length ? '' : '')}>{m}</Button>)}
      </div>
      {cart.cart.payments.length === 0 && <p className="text-xs text-muted">Choose how the customer pays. You can split across several.</p>}
      <ul className="flex flex-col gap-2">
        {cart.cart.payments.map((p) => (
          <li key={p.id} className="rounded border border-line p-2">
            <div className="flex items-center gap-2">
              <span className="w-28 text-sm font-medium">{p.mode}</span>
              <Input aria-label={`${p.mode} amount`} inputMode="decimal" placeholder="Amount" value={p.amount} onChange={(e) => cart.setPayment(p.id, { amount: e.target.value })} className={h} />
              {pv && Number(p.amount) === 0 && pv.payment.left > 0 && <Button size="sm" className="min-h-10 whitespace-nowrap" aria-label={`Fill ${p.mode} with the amount left`} onClick={() => cart.setPayment(p.id, { amount: String(pv.payment.left / 100) })}>Rest</Button>}
              <Button size="sm" variant="ghost" className="min-h-10" aria-label={`Remove ${p.mode}`} onClick={() => cart.removePayment(p.id)}>×</Button>
            </div>
            {p.mode !== 'Cash' && p.mode !== 'Credit' && <Input aria-label={`${p.mode} reference`} placeholder="Reference (UPI id, card last 4, bank ref)" value={p.reference} onChange={(e) => cart.setPayment(p.id, { reference: e.target.value })} className={`mt-2 ${h}`} />}
          </li>
        ))}
      </ul>
      {pv && (
        <dl className="rounded bg-mist p-3 text-sm" role="status" aria-label="Payment status">
          <div className="flex justify-between"><dt>Paid</dt><dd>{formatPaise(pv.payment.paid)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Amount left</dt><dd data-testid="amount-left">{formatPaise(pv.payment.left)}</dd></div>
          {pv.payment.changeDue > 0 && <div className="flex justify-between text-navy"><dt>Change to give</dt><dd data-testid="change-due">{formatPaise(pv.payment.changeDue)}</dd></div>}
        </dl>
      )}
    </div>
  );
}

/** Line and bill discount type. Amount is in rupees, percent is a number. */
export function DiscountInput({ type, value, onChange, label }: { type: 'amount' | 'percent'; value: string; onChange: (t: 'amount' | 'percent', v: string) => void; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Input aria-label={label} inputMode="decimal" placeholder="0" className="w-20 text-right" value={value} onChange={(e) => onChange(type, e.target.value)} />
      <Select aria-label={`${label} type`} className="w-16" value={type} onChange={(e) => onChange(e.target.value as 'amount' | 'percent', value)}><option value="amount">₹</option><option value="percent">%</option></Select>
    </span>
  );
}

/** A 409 stock conflict names the item and offers to remove it. */
export function ConflictNotice({ cart }: { cart: Cart }) {
  const err = cart.finalize.error;
  if (!(err instanceof ApiError) || err.code !== 'STOCK_CONFLICT') return null;
  const ids = Object.keys(cart.conflicts);
  return (
    <div role="alert" className="rounded border border-danger bg-danger-bg p-3 text-sm">
      <p>{err.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">{ids.map((id) => { const l = cart.cart.lines.find((x) => x.variantId === id); return l ? <Button key={id} size="sm" className="min-h-11" onClick={() => { cart.remove(id); cart.finalize.reset(); }}>Remove {l.name} {l.size}</Button> : null; })}</div>
      {err.requestId && <p className="mt-1 text-xs text-muted">Request id: {err.requestId}</p>}
    </div>
  );
}
export { Checkbox };
