import { formatPaise } from '@thunikart/shared';
import { Button, Field, Input, Select } from '@thunikart/ui';
import { EXPENSE_CATEGORIES } from '../../features/reports/types';
import { useExpenseForm, useOwingCustomers, useReceiptForm } from '../../features/reports/use-reports';
import { ErrorBanner } from '../ErrorBanner';

/** Expense entry with a receipt photo. On a phone the file box opens the camera. */
export function ExpenseForm({ onDone, big }: { onDone: () => void; big?: boolean }) {
  const f = useExpenseForm(onDone);
  const h = big ? 'min-h-12' : '';
  return (
    <form onSubmit={(e) => { e.preventDefault(); void f.submit(); }} noValidate className="flex flex-col gap-4" aria-label="Add expense">
      {f.banner && <ErrorBanner {...f.banner} />}
      <Field label="Category" required error={f.errors.category}>{(p) => <Select {...p} className={h} value={f.category} onChange={(e) => f.setCategory(e.target.value)}><option value="">Choose a category</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
      <Field label="Amount (₹)" required error={f.errors.amount}>{(p) => <Input {...p} inputMode="decimal" className={h} value={f.amount} onChange={(e) => f.setAmount(e.target.value)} />}</Field>
      <Field label="Date" required error={f.errors.date}>{(p) => <Input {...p} type="date" className={h} value={f.date} onChange={(e) => f.setDate(e.target.value)} />}</Field>
      <Field label="Note">{(p) => <Input {...p} className={h} value={f.note} onChange={(e) => f.setNote(e.target.value)} />}</Field>
      <div>
        <label className={`inline-flex ${big ? 'min-h-12' : 'min-h-11'} cursor-pointer items-center rounded border border-navy px-4 text-sm font-medium uppercase tracking-wider hover:bg-mist focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal`}>
          Add receipt photo
          <input type="file" accept="image/*" capture="environment" aria-label="Add receipt photo" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) void f.attach(file); e.target.value = ''; }} />
        </label>
        {f.receipt && (
          <div className="mt-2 flex items-center gap-3 rounded border-2 border-navy-100 p-2 text-sm" aria-live="polite">
            {f.receipt.preview && <img src={f.receipt.preview} alt="Receipt preview" className="h-12 w-12 rounded object-cover" />}
            <span className="min-w-0 flex-1 truncate">{f.receipt.name}</span>
            {f.receipt.error ? <span role="alert" className="text-xs text-danger">{f.receipt.error}</span> : f.receipt.key ? <span className="text-xs" data-testid="receipt-uploaded">Uploaded</span> : <span role="progressbar" aria-valuenow={f.receipt.progress} aria-valuemin={0} aria-valuemax={100} className="text-xs text-muted">Uploading {f.receipt.progress}%</span>}
            <button type="button" className="min-h-11 px-2 text-xs underline" onClick={f.clearReceipt}>Remove</button>
          </div>
        )}
      </div>
      <Button type="submit" variant="primary" size="lg" className={h} loading={f.saving}>Save expense</Button>
    </form>
  );
}

/** Money received from a customer who owes on credit. */
export function ReceiptForm({ onDone, big }: { onDone: () => void; big?: boolean }) {
  const f = useReceiptForm(onDone);
  const owing = useOwingCustomers().data ?? [];
  const h = big ? 'min-h-12' : '';
  const chosen = owing.find((c) => c.id === f.customerId);
  return (
    <form onSubmit={(e) => { e.preventDefault(); void f.submit(); }} noValidate className="flex flex-col gap-4" aria-label="Customer receipt">
      {f.banner && <ErrorBanner {...f.banner} />}
      <Field label="Customer" required error={f.errors.customerId}>{(p) => <Select {...p} className={h} value={f.customerId} onChange={(e) => f.setCustomerId(e.target.value)}><option value="">Choose a customer who owes</option>{owing.map((c) => <option key={c.id} value={c.id}>{c.name} owes {formatPaise(c.outstanding)}</option>)}</Select>}</Field>
      {owing.length === 0 && <p className="text-sm text-muted">No customer owes anything right now.</p>}
      <Field label="Amount received (₹)" required error={f.errors.amount}>{(p) => (
        <span className="flex gap-2"><Input {...p} inputMode="decimal" className={h} value={f.amount} onChange={(e) => f.setAmount(e.target.value)} />{chosen && <Button className={h} onClick={() => f.setAmount(String(chosen.outstanding / 100))}>Full</Button>}</span>
      )}</Field>
      <Field label="Mode">{(p) => <Select {...p} className={h} value={f.mode} onChange={(e) => f.setMode(e.target.value)}>{['UPI', 'Cash', 'Bank Transfer', 'Cheque', 'Card'].map((m) => <option key={m}>{m}</option>)}</Select>}</Field>
      <Field label="Reference">{(p) => <Input {...p} className={h} value={f.reference} onChange={(e) => f.setReference(e.target.value)} />}</Field>
      <Button type="submit" variant="primary" size="lg" className={h} loading={f.saving} disabled={!f.customerId}>Record receipt</Button>
    </form>
  );
}
