import { useState } from 'react';
import { formatPaise } from '@thunikart/shared';
import { BottomSheet, Button, EmptyState, Input, ListSkeleton, useToast } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { LedgerPanel } from '../../../components/LedgerPanel';
import { CustomerForm } from '../../../components/PartyForms';
import { useCan } from '../../../features/auth/permissions';
import type { Customer } from '../../../features/catalog/types';
import { useCustomers } from '../../../features/catalog/use-parties';

export function CustomersMobile() {
  const can = useCan();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ customer?: Customer } | null>(null);
  const [view, setView] = useState<Customer | null>(null);
  const list = useCustomers(q);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-3 pb-20">
      <Input aria-label="Search customers" placeholder="Search name or mobile" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-12" />
      {list.isPending ? <ListSkeleton label="Loading customers" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState title="No customers found" /> : (
        <ul className="flex flex-col gap-3">
          {rows.map((c) => (
            <li key={c.id} className="rounded border-2 border-navy-100 p-3">
              <button type="button" onClick={() => setView(c)} className="block min-h-11 w-full text-left" aria-label={`Ledgers for ${c.name}`}>
                <strong className="text-sm">{c.name}</strong>
                <span className="block text-xs text-muted">{c.accountGroup} · {c.mobile}</span>
                <span className="text-sm">Loyalty {c.loyaltyPoints} · Wallet {formatPaise(c.walletBalance)}</span>
              </button>
              {can('customers.edit') && <Button className="mt-2 min-h-11" block onClick={() => setEdit({ customer: c })} aria-label={`Edit ${c.name}`}>Edit</Button>}
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && <Button size="lg" className="min-h-12" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>Load more</Button>}
      {can('customers.create') && <div className="fixed inset-x-0 bottom-14 z-30 border-t-2 border-navy-100 bg-white p-3"><Button variant="primary" size="lg" block className="min-h-12" onClick={() => setEdit({})}>Add customer</Button></div>}
      <BottomSheet open={!!edit} onClose={() => setEdit(null)} title={edit?.customer ? 'Edit customer' : 'Add customer'}>
        {edit && <CustomerForm key={edit.customer?.id ?? 'new'} customer={edit.customer} onDone={() => { setEdit(null); toast('Customer saved', 'success'); }} />}
      </BottomSheet>
      <BottomSheet open={!!view} onClose={() => setView(null)} title={view ? `${view.name}: ledgers` : ''}>{view && <LedgerPanel customer={view} />}</BottomSheet>
    </div>
  );
}
