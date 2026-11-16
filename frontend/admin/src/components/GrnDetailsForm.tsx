import { Field, Input } from '@thunikart/ui';

export interface GrnForm {
  invoiceNo: string; invoiceDate: string; freight: string; notes: string;
  set: (patch: Partial<{ invoiceNo: string; invoiceDate: string; freight: string; notes: string }>) => void;
}

/** What the vendor's delivery paper says: invoice number and date, and any freight charged on this delivery. */
export function GrnDetailsForm({ form, compact }: { form: GrnForm; compact?: boolean }) {
  return (
    <section aria-label="Vendor invoice details" className={`mb-4 grid gap-3 rounded border-2 border-navy-100 bg-mist p-3 ${compact ? 'grid-cols-1' : 'max-w-3xl grid-cols-2'}`}>
      <Field label="Vendor invoice number" required>{(p) => <Input {...p} value={form.invoiceNo} onChange={(e) => form.set({ invoiceNo: e.target.value })} placeholder="From the vendor's bill" />}</Field>
      <Field label="Invoice date" required>{(p) => <Input {...p} type="date" value={form.invoiceDate} onChange={(e) => form.set({ invoiceDate: e.target.value })} />}</Field>
      <Field label="Freight on this delivery (₹)" hint="Added to the cost of these goods, shared by value. Leave empty if none.">{(p) => <Input {...p} inputMode="decimal" value={form.freight} onChange={(e) => form.set({ freight: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0.00" />}</Field>
      <Field label="Note">{(p) => <Input {...p} value={form.notes} onChange={(e) => form.set({ notes: e.target.value })} />}</Field>
    </section>
  );
}
