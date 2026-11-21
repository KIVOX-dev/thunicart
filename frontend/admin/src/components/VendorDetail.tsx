import { formatDate, formatPaise } from '@thunikart/shared';
import { Badge, EmptyState, ListSkeleton, Tabs } from '@thunikart/ui';
import { useState } from 'react';
import { QueryError } from './ErrorBanner';
import { VendorForm } from './PartyForms';
import { useCan } from '../features/auth/permissions';
import type { Vendor } from '../features/catalog/types';
import { useBills, useVendorOutstanding } from '../features/inventory/use-billing';
import { Pager } from './Pager';
import { usePagedView } from '../features/api/use-paged-view';

const TONE = { unpaid: 'danger', 'part-paid': 'warning', paid: 'success' } as const;
const LABEL = { unpaid: 'Unpaid', 'part-paid': 'Partially paid', paid: 'Paid' } as const;

/** Every purchase from this vendor: bill, date, amount, paid and what is still owed. Totals come from the vendor's account, not from this page of the list. */
export function PurchaseHistory({ vendor, compact }: { vendor: Vendor; compact?: boolean }) {
  const bills = useBills({ vendorId: vendor.id });
  const owed = useVendorOutstanding(vendor.id);
  const pv = usePagedView(bills);
  const rows = pv.items;
  const o = owed.data;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        {[['Bought', o?.billed], ['Paid', o?.paid], ['Credits and settled', o ? o.debitNotes + o.settled : undefined], ['Outstanding', o?.outstanding]].map(([k, v]) => (
          <div key={k as string} className="rounded bg-mist p-3"><dt className="text-xs text-muted">{k as string}</dt><dd className="font-semibold">{v === undefined ? '…' : formatPaise(v as number)}</dd></div>
        ))}
      </dl>
      {o && o.advance > 0 && <p className="text-xs text-muted">Advance paid and not yet used: {formatPaise(o.advance)}</p>}
      {bills.isPending ? <ListSkeleton label="Loading purchases" /> : bills.isError ? <QueryError error={bills.error} onRetry={() => bills.refetch()} /> : rows.length === 0 ? <EmptyState title="No purchases yet" body="Bills from this vendor appear here." /> : compact ? (
        <ul className="flex flex-col gap-2">{rows.map((b) => (
          <li key={b.id} className="rounded border-2 border-navy-100 p-3 text-sm">
            <div className="flex items-center justify-between"><strong>{b.number}</strong><Badge tone={TONE[b.status]}>{LABEL[b.status]}</Badge></div>
            <p className="text-xs text-muted">{formatDate(b.date)} · vendor bill {b.vendorBillNo}</p>
            <p>{formatPaise(b.totals.total)} · paid {formatPaise(b.paid)} · owed {formatPaise(b.balance)}</p>
          </li>))}
        </ul>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Purchase history</caption>
          <thead><tr className="border-b-2 border-navy-100 text-left text-xs uppercase text-muted"><th className="py-2">Bill</th><th>Date</th><th className="text-right">Amount</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th><th>Status</th></tr></thead>
          <tbody>{rows.map((b) => (
            <tr key={b.id} className="border-b border-line"><td className="py-2 font-medium">{b.number}<span className="block text-xs font-normal text-muted">{b.vendorBillNo}</span></td><td>{formatDate(b.date)}</td><td className="text-right">{formatPaise(b.totals.total)}</td><td className="text-right">{formatPaise(b.paid)}</td><td className="text-right">{formatPaise(b.balance)}</td><td><Badge tone={TONE[b.status]}>{LABEL[b.status]}</Badge></td></tr>
          ))}</tbody>
        </table>
      )}
      <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
    </div>
  );
}

/** One vendor: the details form and the Purchase history tab. */
export function VendorDetail({ vendor, compact, onSaved }: { vendor: Vendor; compact?: boolean; onSaved: () => void }) {
  const can = useCan();
  const [tab, setTab] = useState('details');
  return (
    <Tabs value={tab} onChange={setTab} items={[
      { key: 'details', label: 'Details', panel: can('vendors.edit') ? <VendorForm key={vendor.id} vendor={vendor} onDone={onSaved} /> : <p className="text-sm text-muted">You can view this vendor but not edit it.</p> },
      ...(can('purchase.view') ? [{ key: 'history', label: 'Purchase history', panel: <PurchaseHistory vendor={vendor} compact={compact} /> }] : []),
    ]} />
  );
}
