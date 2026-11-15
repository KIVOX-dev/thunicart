import { useState } from 'react';
import { formatDate, formatPaise } from '@thunikart/shared';
import { Badge, Button, EmptyState, Field, Input, ListSkeleton, Modal, Select, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { ApiError } from '../../features/api/http';
import { rupeesToPaise } from '../../features/api/money';
import { useCan, useGstMode } from '../../features/auth/permissions';
import { MEMO_PAGE_SIZE, newIdempotencyKey, REFUND_MODES, SETTLE_LABEL, useCreateCreditMemo, useCreditMemos, useCustomerInvoices, useMemoCustomers, type CreditMemo } from '../../features/pos/use-credit-memos';
import { ErrorBanner, QueryError } from '../ErrorBanner';
import { Pager } from '../Pager';

const GST_RATES = [0, 5, 12, 18, 28];

/** A credit to a customer without goods coming back: a price correction, a late discount or goodwill. It is a credit note and takes the next number. */
function MemoForm({ onDone }: { onDone: (m: CreditMemo) => void }) {
  const gst = useGstMode();
  const create = useCreateCreditMemo();
  const [q, setQ] = useState('');
  const [customer, setCustomer] = useState<{ id: string; name: string; mobile: string } | null>(null);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [settle, setSettle] = useState<CreditMemo['settle']>('wallet');
  const [refundMode, setRefundMode] = useState('cash');
  const [rate, setRate] = useState('');
  const [key] = useState(newIdempotencyKey);
  const [err, setErr] = useState<{ message: string; requestId?: string } | null>(null);
  const found = useMemoCustomers(customer ? '' : q);
  const invoices = useCustomerInvoices(customer?.id ?? '');
  const inv = invoices.data?.find((i) => i.id === invoiceId);
  const paise = rupeesToPaise(amount || '0');
  const ready = !!customer && paise > 0 && reason.trim().length >= 2 && (settle !== 'reduce_due' || !!invoiceId) && (gst === 'off' || rate !== '');

  const submit = async () => {
    setErr(null);
    try {
      onDone(await create.mutateAsync({ key, input: { customerId: customer!.id, ...(invoiceId ? { invoiceId } : {}), amount: paise, reason: reason.trim(), note: note.trim(), settle, ...(settle === 'refund' ? { refundMode } : {}), ...(gst === 'on' ? { gstRate: Number(rate) } : {}) } }));
    } catch (e) { setErr({ message: e instanceof ApiError ? (e.fields[0]?.message ?? e.message) : 'Could not save the credit memo.', requestId: e instanceof ApiError ? e.requestId : undefined }); }
  };

  return (
    <form noValidate className="flex flex-col gap-4" aria-label="New credit memo" onSubmit={(e) => { e.preventDefault(); if (ready) void submit(); }}>
      {err && <ErrorBanner {...err} />}
      {!customer ? (
        <div className="flex flex-col gap-2">
          <Field label="Customer" required>{(p) => <Input {...p} autoFocus placeholder="Type a name or mobile, at least 3 characters" value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
          {found.data?.map((c) => <button key={c.id} type="button" onClick={() => setCustomer(c)} className="flex min-h-11 items-center justify-between rounded border-2 border-navy-100 px-3 text-left text-sm hover:bg-mist"><strong>{c.name}</strong><span className="text-xs text-muted">{c.mobile}</span></button>)}
          {found.data && found.data.length === 0 && <p className="text-sm text-muted">No customer found.</p>}
        </div>
      ) : (
        <div className="flex items-center justify-between rounded border-2 border-navy-100 bg-mist px-3 py-2 text-sm"><span><strong>{customer.name}</strong> <span className="text-muted">{customer.mobile}</span></span><Button size="sm" onClick={() => { setCustomer(null); setInvoiceId(''); }}>Change</Button></div>
      )}

      {customer && (<>
        <Field label="Invoice" hint={settle === 'reduce_due' ? 'Needed to take the amount off what they owe' : 'Optional. Say which bill this credit is about'}>
          {(p) => <Select {...p} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}><option value="">Not about one bill</option>{invoices.data?.map((i) => <option key={i.id} value={i.id}>{i.invoiceNumber} · {formatPaise(i.grandTotal)}{i.creditDue > 0 ? ` · owes ${formatPaise(i.creditDue)}` : ''}</option>)}</Select>}
        </Field>
        <Field label="Amount (₹)" required hint="The full amount including GST">{(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />}</Field>
        {gst === 'on' && <Field label="GST rate" required hint="So the credit note shows the tax inside the amount">{(p) => <Select {...p} value={rate} onChange={(e) => setRate(e.target.value)}><option value="">Choose a rate</option>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</Select>}</Field>}
        <Field label="Reason" required>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example price correction, late discount, goodwill" />}</Field>
        <Field label="What happens to the money" required>
          {(p) => <Select {...p} value={settle} onChange={(e) => setSettle(e.target.value as CreditMemo['settle'])}><option value="wallet">Add to the customer's wallet</option><option value="refund">Pay it back now</option><option value="reduce_due">Take it off what they owe on the invoice</option></Select>}
        </Field>
        {settle === 'refund' && <Field label="Paid back by" required>{(p) => <Select {...p} value={refundMode} onChange={(e) => setRefundMode(e.target.value)}>{REFUND_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select>}</Field>}
        {settle === 'reduce_due' && inv && <p className="text-xs text-muted">This invoice has {formatPaise(inv.creditDue)} left to pay.</p>}
        <Field label="Note">{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </>)}
      <Button type="submit" variant="primary" loading={create.isPending} disabled={!ready}>Save credit memo</Button>
    </form>
  );
}

export function CreditMemoPanel() {
  const can = useCan();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const q = useCreditMemos(page);
  const data = q.data?.items ?? [];
  return (
    <div>
      <div className="mb-3 flex items-center gap-3"><p className="text-sm text-muted">A credit to a customer without goods coming back. Each one is a credit note.</p>{can('sales.create') && <Button variant="primary" className="ml-auto" onClick={() => setOpen(true)}>New credit memo</Button>}</div>
      {q.isPending ? <ListSkeleton label="Loading credit memos" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No credit memos yet" body="Use New credit memo for a price correction, a late discount or goodwill." /> : (
        <>
          <Table caption="Credit memos">
            <THead><Tr><Th>Credit note</Th><Th>Customer</Th><Th>Bill</Th><Th>Date</Th><Th>Reason</Th><Th>Settled</Th><Th className="text-right">Amount</Th></Tr></THead>
            <TBody>{data.map((m) => <Tr key={m.id}><Td className="font-medium">{m.creditNoteNumber}</Td><Td>{m.customerName}</Td><Td>{m.invoiceNumber ?? ''}</Td><Td>{formatDate(m.createdAt)}</Td><Td className="max-w-xs truncate">{m.reason}</Td><Td><Badge>{SETTLE_LABEL[m.settle]}</Badge></Td><Td className="text-right font-semibold">{formatPaise(m.amount)}</Td></Tr>)}</TBody>
          </Table>
          <Pager page={page} total={q.data?.total ?? 0} pageSize={MEMO_PAGE_SIZE} onPage={setPage} />
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New credit memo"><MemoForm onDone={(m) => { setOpen(false); toast(`Credit note ${m.creditNoteNumber} saved`, 'success'); }} /></Modal>
    </div>
  );
}
