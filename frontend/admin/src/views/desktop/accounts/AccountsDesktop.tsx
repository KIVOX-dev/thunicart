import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDate, formatPaise } from '@thunikart/shared';
import { Button, EmptyState, ListSkeleton, Modal, Table, TBody, Td, Th, THead, Tabs, Tr, useToast } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { CashEntries, Settlements, VendorOutstanding } from '../../../components/accounts/CashPanels';
import { ReceiptForm } from '../../../components/reports/AccountForms';
import { useCan } from '../../../features/auth/permissions';
import { useReceipts, useReceivables } from '../../../features/reports/use-reports';

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
      <p className="text-sm text-muted">What customers owe, by how late it is. What we owe vendors is under Outstanding to vendors; ageing by vendor is in <Link to="/purchase?tab=ageing" className="underline">Purchase and payment</Link>.</p>
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
      <PageHeader title="Accounts" description="Cashflow: what goes out as expenses and charges, what we owe vendors, and settlements." />
      <Tabs value={sp.get('tab') ?? 'expenses'} onChange={(t) => setSp({ tab: t }, { replace: true })} items={[
        { key: 'expenses', label: 'Expenses', panel: <CashEntries kind="expense" /> },
        { key: 'charges', label: 'Charges', panel: <CashEntries kind="charge" /> },
        { key: 'vendors', label: 'Outstanding to vendors', panel: <VendorOutstanding /> },
        { key: 'settlements', label: 'Settlements', panel: <Settlements /> },
        { key: 'receipts', label: 'Customer receipts', panel: <ReceiptsTab /> },
        { key: 'outstanding', label: 'Customers owe', panel: <OutstandingTab /> },
      ]} />
    </div>
  );
}
