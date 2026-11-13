import { formatPaise } from '@thunikart/shared';
import { Button, Field, Input, ListSkeleton, Select } from '@thunikart/ui';
import { useVendors } from '../features/catalog/use-parties';
import { PAY_MODES, RETURN_REASONS } from '../features/inventory/types';
import { useGrns } from '../features/inventory/use-grn';
import { useBillForm, usePaymentForm, useReturnForm, useBills } from '../features/inventory/use-billing';
import { ErrorBanner } from './ErrorBanner';
import { ItemPicker } from './ItemPicker';

const useVendorList = () => useVendors('').data?.pages.flatMap((p) => p.items) ?? [];

/** Purchase bill from a finished receipt. Totals and tax are worked out by the API. */
export function BillForm({ onDone }: { onDone: () => void }) {
  const { form, submit, banner, saving } = useBillForm(onDone);
  const grns = useGrns('finished').data?.pages.flatMap((p) => p.items) ?? [];
  const billed = new Set(useBills().data?.pages.flatMap((p) => p.items).map((b) => b.grnId) ?? []);
  const free = grns.filter((g) => !billed.has(g.id));
  const { register, formState: { errors: e } } = form;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Add purchase bill">
      {banner && <ErrorBanner {...banner} />}
      <Field label="Receipt" required error={e.grnId?.message}>{(p) => <Select {...p} {...register('grnId')}><option value="">Choose a finished receipt</option>{free.map((g) => <option key={g.id} value={g.id}>{g.number} · {g.vendorName} · {g.pieces} pieces</option>)}</Select>}</Field>
      <Field label="Vendor bill number" required error={e.vendorBillNo?.message}>{(p) => <Input {...p} {...register('vendorBillNo')} />}</Field>
      <Field label="Bill date" required error={e.date?.message}>{(p) => <Input {...p} type="date" {...register('date')} />}</Field>
      <Field label="Due date" required error={e.dueDate?.message}>{(p) => <Input {...p} type="date" {...register('dueDate')} />}</Field>
      {free.length === 0 && <p className="text-xs text-muted">All finished receipts already have a bill.</p>}
      <Button type="submit" variant="primary" loading={saving}>Add bill</Button>
    </form>
  );
}

/** Purchase return (debit note). Stock goes down and the vendor balance goes down by the amount the API works out. */
export function ReturnForm({ onDone }: { onDone: () => void }) {
  const r = useReturnForm(onDone);
  const vendors = useVendorList();
  return (
    <form onSubmit={(e) => { e.preventDefault(); void r.submit(); }} noValidate className="flex flex-col gap-4" aria-label="New purchase return">
      {r.banner && <ErrorBanner {...r.banner} />}
      <Field label="Vendor" required>{(p) => <Select {...p} value={r.vendorId} onChange={(e) => r.setVendorId(e.target.value)}><option value="">Choose a vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}</Field>
      <Field label="Reason" required>{(p) => <Select {...p} value={r.reason} onChange={(e) => r.setReason(e.target.value as typeof r.reason)}>{RETURN_REASONS.map((x) => <option key={x}>{x}</option>)}</Select>}</Field>
      <ItemPicker onPick={(i, v) => r.addItem(i, v)} />
      <ul className="flex flex-col gap-2" aria-label="Items to return">
        {r.lines.map((l) => (
          <li key={l.variantId} className="flex items-center justify-between gap-2 rounded border-2 border-navy-100 p-2 text-sm">
            <span className="min-w-0"><strong className="block truncate">{l.name}</strong><span className="text-xs text-muted">Size {l.size}</span></span>
            <span className="flex items-center gap-2"><Input type="number" min={1} aria-label={`Return quantity for ${l.name} size ${l.size}`} className="w-20" value={l.qty} onChange={(e) => r.setQty(l.variantId, e.target.value)} /><Button size="sm" variant="ghost" className="min-h-11" onClick={() => r.remove(l.variantId)}>Remove</Button></span>
          </li>
        ))}
      </ul>
      <Button type="submit" variant="primary" loading={r.saving} disabled={!r.vendorId || r.lines.length === 0}>Create return</Button>
    </form>
  );
}

/** Vendor payment: choose the bills it settles. "Pay full" fills the balance the API reports. */
export function PaymentForm({ vendorId, onVendor, onDone }: { vendorId: string; onVendor: (id: string) => void; onDone: () => void }) {
  const f = usePaymentForm(vendorId, onDone);
  const vendors = useVendorList();
  return (
    <form onSubmit={(e) => { e.preventDefault(); void f.submit(); }} noValidate className="flex flex-col gap-4" aria-label="Pay vendor">
      {f.banner && <ErrorBanner {...f.banner} />}
      <Field label="Vendor" required>{(p) => <Select {...p} value={vendorId} onChange={(e) => onVendor(e.target.value)}><option value="">Choose a vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}</Field>
      {vendorId && (f.loading ? <ListSkeleton rows={2} label="Loading bills" /> : f.open.length === 0 ? <p className="text-sm text-muted">This vendor has no open bills.</p> : (
        <ul className="flex flex-col gap-2" aria-label="Open bills">
          {f.open.map((b) => (
            <li key={b.id} className="rounded border-2 border-navy-100 p-2 text-sm">
              <div className="flex items-center justify-between"><strong>{b.number}</strong><span className="text-muted">Balance {formatPaise(b.balance)}</span></div>
              <div className="mt-2 flex items-center gap-2">
                <Input aria-label={`Amount to pay on ${b.number}`} inputMode="decimal" placeholder="Amount" value={f.amounts[b.id] ?? ''} onChange={(e) => f.setAmount(b.id, e.target.value)} />
                <Button size="sm" className="min-h-11 whitespace-nowrap" onClick={() => f.setAmount(b.id, String(b.balance / 100))} aria-label={`Pay ${b.number} in full`}>Pay full</Button>
              </div>
            </li>
          ))}
        </ul>
      ))}
      <Field label="Mode">{(p) => <Select {...p} value={f.mode} onChange={(e) => f.setMode(e.target.value as typeof f.mode)}>{PAY_MODES.map((m) => <option key={m}>{m}</option>)}</Select>}</Field>
      <Field label="Reference" hint="UPI id, cheque number or bank reference">{(p) => <Input {...p} value={f.reference} onChange={(e) => f.setReference(e.target.value)} />}</Field>
      <Button type="submit" variant="primary" loading={f.saving} disabled={f.selected === 0}>Record payment</Button>
    </form>
  );
}
