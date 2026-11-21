import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { formatDate, formatPaise } from '@thunikart/shared';
import { Badge, BottomSheet, Button, EmptyState, Input, ListSkeleton, Modal, Select, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { QueryError } from '../ErrorBanner';
import { Pager } from '../Pager';
import { ReceiptForm } from '../reports/AccountForms';
import { StatCard } from '../reports/StatCard';
import { useCan } from '../../features/auth/permissions';
import { api } from '../../features/api/http';
import { usePagedView } from '../../features/api/use-paged-view';

interface Bill { id: string; invoiceNumber: string | null; channel: 'POS' | 'ECM' | 'CNT' | string; status: string; customer?: { name?: string; mobile?: string }; grandTotal: number; creditDue: number; tenders: Array<{ mode: string; amount: number }>; finalizedAt: string | null; createdAt: string }
type Page = { items: Bill[]; total: number; nextPage: number | null };

const CHANNEL: Record<string, string> = { POS: 'Counter', ECM: 'Online', CNT: 'B2B invoice' };
const MODE: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank', bank: 'Bank', wallet: 'Wallet', razorpay: 'Online payment', cod: 'Cash on delivery', credit_note: 'Credit note', credit: 'On credit' };

/** Every bill from the Billing center, with its number: counter (POS), online (ECM) and B2B counter invoices. */
function useBillings(q: string, channel: string) {
  return useInfiniteQuery({
    queryKey: ['billings', q, channel], initialPageParam: 1,
    queryFn: async ({ pageParam }) => api.get<Page>('/sales/invoices', { q: q || undefined, channel: channel || undefined, page: pageParam, pageSize: 20 }),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}

/**
 * Accounts, Billings and receipts: all bills made in the Billing center and on the website, each with its bill number, who paid and how.
 * Money received later from customers who bought on credit is added with Record receipt.
 */
export function Billings({ compact }: { compact?: boolean }) {
  const can = useCan();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('');
  const [open, setOpen] = useState(false);
  const list = useBillings(q, channel);
  const pv = usePagedView(list);
  const Sheet = compact ? BottomSheet : Modal;
  const h = compact ? 'min-h-12' : '';
  return (
    <div className="flex flex-col gap-3">
      <div className={compact ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-3'}>
        <div className={compact ? '' : 'w-64'}><Input aria-label="Search bills" placeholder="Bill number, customer or mobile" className={h} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="Where" className={compact ? h : 'w-44'} value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">All bills</option><option value="POS">Counter (POS)</option><option value="ECM">Online</option><option value="CNT">B2B invoice</option></Select>
        <dl className={compact ? '' : 'w-48'}><StatCard label="Bills" value={pv.total.toLocaleString('en-IN')} testId="bills-total" /></dl>
        {can('accounts.create') && <Button variant="primary" className={`${h} ${compact ? '' : 'ml-auto'}`} onClick={() => setOpen(true)}>Record receipt</Button>}
      </div>
      {list.isPending ? <ListSkeleton label="Loading bills" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : pv.items.length === 0 ? <EmptyState title="No bills yet" body="Bills made in the Billing center and on the website show here with their numbers." /> : compact ? (
        <ul className="flex flex-col gap-2">{pv.items.map((b) => (
          <li key={b.id} className="rounded border-2 border-navy-100 p-3 text-sm">
            <div className="flex items-center justify-between gap-2"><strong>{b.invoiceNumber ?? 'No number yet'}</strong><strong>{formatPaise(b.grandTotal)}</strong></div>
            <p className="text-xs text-muted">{formatDate(b.finalizedAt ?? b.createdAt)} · {CHANNEL[b.channel] ?? b.channel} · {b.customer?.name || 'Walk-in'}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">{b.tenders.map((t) => `${MODE[t.mode] ?? t.mode} ${formatPaise(t.amount)}`).join(' · ')}{b.creditDue > 0 && <Badge tone="warning">On credit {formatPaise(b.creditDue)}</Badge>}</p>
          </li>))}
        </ul>
      ) : (
        <Table caption="Bills">
          <THead><Tr><Th>Bill no.</Th><Th>Date</Th><Th>Customer</Th><Th>Where</Th><Th>Paid by</Th><Th>Status</Th><Th className="text-right">Amount</Th></Tr></THead>
          <TBody>{pv.items.map((b) => (
            <Tr key={b.id}>
              <Td className="font-mono text-xs font-semibold">{b.invoiceNumber ?? '–'}</Td><Td>{formatDate(b.finalizedAt ?? b.createdAt)}</Td>
              <Td>{b.customer?.name || 'Walk-in'}{b.customer?.mobile && <span className="block text-xs text-muted">{b.customer.mobile}</span>}</Td>
              <Td><Badge>{CHANNEL[b.channel] ?? b.channel}</Badge></Td>
              <Td>{b.tenders.length ? b.tenders.map((t) => MODE[t.mode] ?? t.mode).join(', ') : '–'}</Td>
              <Td>{b.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : b.creditDue > 0 ? <Badge tone="warning">On credit {formatPaise(b.creditDue)}</Badge> : <Badge tone="success">Paid</Badge>}</Td>
              <Td className="text-right font-semibold">{formatPaise(b.grandTotal)}</Td>
            </Tr>
          ))}</TBody>
        </Table>
      )}
      <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
      <Sheet open={open} onClose={() => setOpen(false)} title="Record receipt"><ReceiptForm big={compact} onDone={() => { setOpen(false); toast('Receipt recorded', 'success'); }} /></Sheet>
    </div>
  );
}

interface OutRow { party: string; name: string; billed: number; settled: number; outstanding: number; overdue: number }
/** What customers owe, from the Outstanding report: billed, paid or credited, how much is overdue, and what is still owed. */
export function CustomersOwe({ compact }: { compact?: boolean }) {
  const q = useQuery({
    queryKey: ['customers-owe'],
    queryFn: async () => (await api.get<{ rows: OutRow[] }>('/reports/outstanding', { format: 'json', pageSize: 500 })).rows.filter((r) => r.party === 'Customer'),
  });
  if (q.isPending) return <ListSkeleton label="Loading customer dues" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0) return <EmptyState title="Nobody owes anything" body="Customers who buy on credit appear here until they pay." />;
  const total = q.data.reduce((a, r) => a + r.outstanding, 0);
  return (
    <div className="flex flex-col gap-3">
      <dl className="w-full sm:w-64"><StatCard label="Customers owe" value={formatPaise(total)} testId="customers-owe-total" /></dl>
      {compact ? q.data.map((r) => (
        <div key={r.name} className="rounded border-2 border-navy-100 p-3 text-sm"><div className="flex justify-between"><strong>{r.name}</strong><strong>{formatPaise(r.outstanding)}</strong></div><p className="text-xs text-muted">Billed {formatPaise(r.billed)} · paid {formatPaise(r.settled)}{r.overdue ? ` · overdue ${formatPaise(r.overdue)}` : ''}</p></div>
      )) : (
        <Table caption="What customers owe"><THead><Tr><Th>Customer</Th><Th className="text-right">Billed</Th><Th className="text-right">Paid or credited</Th><Th className="text-right">Overdue</Th><Th className="text-right">Owed</Th></Tr></THead>
          <TBody>{q.data.map((r) => <Tr key={r.name}><Td className="font-medium">{r.name}</Td><Td className="text-right">{formatPaise(r.billed)}</Td><Td className="text-right">{formatPaise(r.settled)}</Td><Td className="text-right">{r.overdue ? formatPaise(r.overdue) : '–'}</Td><Td className="text-right font-semibold">{formatPaise(r.outstanding)}</Td></Tr>)}</TBody></Table>
      )}
    </div>
  );
}
