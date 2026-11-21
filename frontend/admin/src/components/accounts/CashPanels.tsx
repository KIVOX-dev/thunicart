import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatPaise } from '@thunikart/shared';
import { Badge, BottomSheet, Button, EmptyState, ListSkeleton, Modal, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { ExportButton } from '../ExportButton';
import { StatCard } from '../reports/StatCard';
import { QueryError } from '../ErrorBanner';
import { ExpenseForm, SettleForm } from '../reports/AccountForms';
import { useCan } from '../../features/auth/permissions';
import { useExpenses, useMonthTotal, useSettlements, useVendorDues, type CashKind, type VendorDue } from '../../features/reports/use-reports';
import { Pager } from '../Pager';
import { usePagedView } from '../../features/api/use-paged-view';

/** Money going out that is not a vendor payment: Expenses (rent, salary) or Charges (bank, gateway, delivery). */
export function CashEntries({ kind, compact }: { kind: CashKind; compact?: boolean }) {
  const can = useCan();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const q = useExpenses('', kind);
  const month = useMonthTotal(kind);
  const pv = usePagedView(q);
  const data = pv.items;
  const word = kind === 'charge' ? 'charge' : 'expense';
  const Sheet = compact ? BottomSheet : Modal;
  const add = can('accounts.create') && <Button variant="primary" className={compact ? 'min-h-12' : ''} block={compact} onClick={() => setOpen(true)}>Add {word}</Button>;
  return (
    <div className="flex flex-col gap-3 pb-2">
      <div className="flex flex-wrap items-start gap-3">
        <dl className="w-full sm:w-64"><StatCard label={`${word === 'charge' ? 'Charges' : 'Expenses'} this month`} value={formatPaise(month.data ?? 0)} testId={`${word}-month`} /></dl>
        <span className="ml-auto flex items-start gap-2">{kind === 'expense' && <ExportButton dataset="expenses" sheet={compact} />}{!compact && add}</span>
      </div>
      {q.isPending ? <ListSkeleton label={`Loading ${word}s`} /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title={`No ${word}s yet`} body={kind === 'charge' ? 'Add bank charges, gateway fees, delivery charges and penalties.' : 'Add rent, salaries and other costs with a photo of the receipt.'} /> : compact ? data.map((e) => (
        <div key={e.id} className="rounded border-2 border-navy-100 p-3 text-sm"><div className="flex justify-between"><strong>{e.category}</strong><strong>{formatPaise(e.amount)}</strong></div><p className="text-xs text-muted">{formatDate(e.date)} · {e.mode}{e.payee ? ` · ${e.payee}` : ''}{e.note ? ` · ${e.note}` : ''}</p></div>
      )) : (
        <Table caption={`${word}s`}><THead><Tr><Th>Date</Th><Th>Category</Th><Th>{kind === 'charge' ? 'Charged by' : 'Paid to'}</Th><Th>Paid by</Th><Th>Note</Th><Th>Receipt</Th><Th className="text-right">Amount</Th></Tr></THead>
          <TBody>{data.map((e) => <Tr key={e.id}><Td>{formatDate(e.date)}</Td><Td>{e.category}</Td><Td>{e.payee}</Td><Td>{e.mode}</Td><Td>{e.note}</Td><Td>{e.receiptKey ? 'Attached' : '–'}</Td><Td className="text-right">{formatPaise(e.amount)}</Td></Tr>)}</TBody></Table>
      )}
      <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
      {compact && add && <div className="fixed inset-x-0 bottom-14 z-30 border-t-2 border-navy-100 bg-white p-3">{add}</div>}
      <Sheet open={open} onClose={() => setOpen(false)} title={`Add ${word}`}><ExpenseForm big={compact} kind={kind} onDone={() => { setOpen(false); toast(`${word[0]!.toUpperCase()}${word.slice(1)} saved`, 'success'); }} /></Sheet>
    </div>
  );
}

function VendorRow({ v, compact, onSettle }: { v: VendorDue; compact?: boolean; onSettle: (b: VendorDue['bills'][number]) => void }) {
  const can = useCan();
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded border-2 border-navy-100 p-3 text-sm">
      <button type="button" className="flex w-full min-h-11 items-center justify-between gap-3 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span><strong>{v.vendorName}</strong><span className="block text-xs text-muted">Bought {formatPaise(v.billed)} · paid {formatPaise(v.paid)} · returns {formatPaise(v.debitNotes)}{v.settled ? ` · settled ${formatPaise(v.settled)}` : ''}</span></span>
        <span className="text-right"><strong>{formatPaise(v.outstanding)}</strong>{v.advance > 0 && <span className="block text-xs text-muted">advance {formatPaise(v.advance)}</span>}</span>
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-line border-t border-line">
          {v.bills.length === 0 ? <li className="py-2 text-xs text-muted">No open bills.</li> : v.bills.map((b) => (
            <li key={b.billId} className={`flex ${compact ? 'flex-col' : 'items-center'} justify-between gap-2 py-2`}>
              <span>{b.billNumber}<span className="block text-xs text-muted">Due {formatDate(b.dueDate)}{b.daysOverdue > 0 ? ` · ${b.daysOverdue} days late` : ''}</span></span>
              <span className="flex items-center gap-2"><strong>{formatPaise(b.outstanding)}</strong>
                {can('accounts.create') && <Link to="/purchase?tab=payments"><Button size="sm">Pay</Button></Link>}
                {can('accounts.approve') && <Button size="sm" onClick={() => onSettle(b)} aria-label={`Settle ${b.billNumber}`}>Settle</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Outstanding to vendors, live: bills less payments, vendor returns (debit notes) and settlements. */
export function VendorOutstanding({ compact }: { compact?: boolean }) {
  const q = useVendorDues();
  const { toast } = useToast();
  const [bill, setBill] = useState<VendorDue['bills'][number] | null>(null);
  const Sheet = compact ? BottomSheet : Modal;
  const total = q.data?.reduce((a, v) => a + v.outstanding, 0) ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded bg-mist p-3 text-sm">We owe vendors <strong className="ml-1 text-lg" data-testid="vendor-outstanding-total">{formatPaise(total)}</strong><span className="block text-xs text-muted">Updates as purchases are billed, paid or returned. Pay from Purchase and payment; settle here.</span></p>
      {q.isPending ? <ListSkeleton label="Loading vendor outstanding" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : q.data.length === 0 ? <EmptyState title="Nothing is owed to vendors" /> : (
        <ul className="flex flex-col gap-3">{q.data.map((v) => <VendorRow key={v.vendorId} v={v} compact={compact} onSettle={setBill} />)}</ul>
      )}
      <Sheet open={!!bill} onClose={() => setBill(null)} title="Settle outstanding">
        {bill && <SettleForm big={compact} bill={bill} onDone={() => { setBill(null); toast('Marked as settled', 'success'); }} />}
      </Sheet>
    </div>
  );
}

/** Every outstanding amount that was marked settled, with who and why. */
export function Settlements({ compact }: { compact?: boolean }) {
  const q = useSettlements();
  const pv = usePagedView(q);
  const data = pv.items;
  return (
    <div className="flex flex-col gap-3">
      {q.isPending ? <ListSkeleton label="Loading settlements" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No settlements yet" body="Settle an open vendor bill from Outstanding to vendors." /> : compact ? data.map((s) => (
        <div key={s.id} className="rounded border-2 border-navy-100 p-3 text-sm"><div className="flex justify-between"><strong>{s.vendorName}</strong><strong>{formatPaise(s.amount)}</strong></div><p className="text-xs text-muted">{s.settlementNumber} · {s.billNumber} · {formatDate(s.date)} · {s.kind === 'full' ? 'Full' : 'Partial'}</p><p className="text-xs">{s.reason}</p></div>
      )) : (
        <Table caption="Settlements"><THead><Tr><Th>Settlement</Th><Th>Date</Th><Th>Vendor</Th><Th>Bill</Th><Th>Type</Th><Th>Reason</Th><Th className="text-right">Amount</Th></Tr></THead>
          <TBody>{data.map((s) => <Tr key={s.id}><Td className="font-medium">{s.settlementNumber}</Td><Td>{formatDate(s.date)}</Td><Td>{s.vendorName}</Td><Td>{s.billNumber}</Td><Td><Badge tone={s.kind === 'full' ? 'success' : 'warning'}>{s.kind === 'full' ? 'Full' : 'Partial'}</Badge></Td><Td>{s.reason}</Td><Td className="text-right">{formatPaise(s.amount)}</Td></Tr>)}</TBody></Table>
      )}
      <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
    </div>
  );
}
