import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDate, formatPaise } from '@thunikart/shared';
import { Button, EmptyState, ListSkeleton, Modal, Select, Table, TBody, Td, Th, THead, Tabs, Tr, useToast } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { ExpenseForm, ReceiptForm } from '../../../components/reports/AccountForms';
import { useCan } from '../../../features/auth/permissions';
import { EXPENSE_CATEGORIES } from '../../../features/reports/types';
import { useExpenses, useReceipts, useReceivables } from '../../../features/reports/use-reports';

function ExpensesTab() {
  const can = useCan();
  const { toast } = useToast();
  const [cat, setCat] = useState('');
  const [open, setOpen] = useState(false);
  const q = useExpenses(cat);
  const data = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <Select aria-label="Category" className="w-48" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
        <span className="text-sm text-muted">This month: <strong data-testid="expense-month">{formatPaise(q.data?.pages[0]?.monthTotal ?? 0)}</strong></span>
        {can('accounts.create') && <Button variant="primary" className="ml-auto" onClick={() => setOpen(true)}>Add expense</Button>}
      </div>
      {q.isPending ? <ListSkeleton label="Loading expenses" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No expenses yet" body="Add rent, salaries and other costs with a photo of the receipt." /> : (
        <>
          <Table caption="Expenses"><THead><Tr><Th>Date</Th><Th>Category</Th><Th>Note</Th><Th>Receipt</Th><Th>Entered by</Th><Th className="text-right">Amount</Th></Tr></THead>
            <TBody>{data.map((e) => <Tr key={e.id}><Td>{formatDate(e.date)}</Td><Td>{e.category}</Td><Td>{e.note}</Td><Td>{e.receiptKey ? 'Attached' : '–'}</Td><Td>{e.by}</Td><Td className="text-right">{formatPaise(e.amount)}</Td></Tr>)}</TBody></Table>
          {q.hasNextPage && <div className="mt-3"><Button onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button></div>}
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add expense"><ExpenseForm onDone={() => { setOpen(false); toast('Expense saved', 'success'); }} /></Modal>
    </div>
  );
}

function ReceiptsTab() {
  const can = useCan();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const q = useReceipts();
  const data = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      {can('accounts.create') && <div className="mb-3 flex justify-end"><Button variant="primary" onClick={() => setOpen(true)}>Record receipt</Button></div>}
      {q.isPending ? <ListSkeleton label="Loading receipts" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No customer receipts" body="Record money received from customers who bought on credit." /> : (
        <Table caption="Customer receipts"><THead><Tr><Th>Receipt</Th><Th>Date</Th><Th>Customer</Th><Th>Mode</Th><Th>Reference</Th><Th className="text-right">Amount</Th></Tr></THead>
          <TBody>{data.map((r) => <Tr key={r.id}><Td className="font-medium">{r.number}</Td><Td>{formatDate(r.date)}</Td><Td>{r.customerName}</Td><Td>{r.mode}</Td><Td>{r.reference}</Td><Td className="text-right">{formatPaise(r.amount)}</Td></Tr>)}</TBody></Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Record receipt"><ReceiptForm onDone={() => { setOpen(false); toast('Receipt recorded', 'success'); }} /></Modal>
    </div>
  );
}

function OutstandingTab() {
  const q = useReceivables();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">What customers owe, by how late it is. Vendor payments and vendor ageing are in <Link to="/purchase?tab=ageing" className="underline">Purchase</Link>.</p>
      {q.isPending ? <ListSkeleton label="Loading receivables" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : q.data.length === 0 ? <EmptyState title="Nobody owes anything" /> : (
        <Table caption="Customer receivables"><THead><Tr><Th>Customer</Th><Th className="text-right">Not due</Th><Th className="text-right">1 to 30 days</Th><Th className="text-right">31 to 60</Th><Th className="text-right">61 to 90</Th><Th className="text-right">Over 90</Th><Th className="text-right">Total owed</Th></Tr></THead>
          <TBody>{q.data.map((r) => <Tr key={r.customerId}><Td className="font-medium">{r.customerName}<span className="block text-xs text-muted">{r.mobile}</span></Td>{[r.current, r.d1to30, r.d31to60, r.d61to90, r.d90plus].map((v, i) => <Td key={i} className="text-right">{v ? formatPaise(v) : '–'}</Td>)}<Td className="text-right font-semibold">{formatPaise(r.total)}</Td></Tr>)}</TBody></Table>
      )}
    </div>
  );
}

export function AccountsDesktop() {
  const [sp, setSp] = useSearchParams();
  return (
    <div>
      <PageHeader title="Accounts" description="Expenses, customer receipts and what is owed." />
      <Tabs value={sp.get('tab') ?? 'expenses'} onChange={(t) => setSp({ tab: t }, { replace: true })} items={[
        { key: 'expenses', label: 'Expenses', panel: <ExpensesTab /> }, { key: 'receipts', label: 'Customer receipts', panel: <ReceiptsTab /> }, { key: 'outstanding', label: 'Outstanding and ageing', panel: <OutstandingTab /> },
      ]} />
    </div>
  );
}
