import { useState } from 'react';
import { formatPaise } from '@thunikart/shared';
import { Button, Drawer, EmptyState, Input, ListSkeleton, Modal, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { LedgerPanel } from '../../../components/LedgerPanel';
import { PageHeader } from '../../../components/PageHeader';
import { CustomerForm } from '../../../components/PartyForms';
import { useCan } from '../../../features/auth/permissions';
import type { Customer } from '../../../features/catalog/types';
import { useCustomers } from '../../../features/catalog/use-parties';

export function CustomersDesktop() {
  const can = useCan();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ customer?: Customer } | null>(null);
  const [view, setView] = useState<Customer | null>(null);
  const list = useCustomers(q);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <PageHeader title="Customers" description="Walk-in, online and trade customers." actions={can('customers.create') ? <Button variant="primary" onClick={() => setEdit({})}>Add customer</Button> : undefined} />
      <div className="mb-3 w-72"><Input aria-label="Search customers" placeholder="Search name, mobile or code" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list.isPending ? <ListSkeleton label="Loading customers" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState title="No customers found" /> : (
        <>
          <Table caption="Customers">
            <THead><Tr><Th>Code</Th><Th>Name</Th><Th>Group</Th><Th>Mobile</Th><Th>City</Th><Th className="text-right">Loyalty</Th><Th className="text-right">Wallet</Th><Th><span className="sr-only">Actions</span></Th></Tr></THead>
            <TBody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-mono text-xs">{c.code}</Td><Td className="font-medium">{c.name}</Td><Td>{c.accountGroup}</Td><Td>{c.mobile}</Td><Td>{c.city}</Td>
                  <Td className="text-right">{c.loyaltyPoints}</Td><Td className="text-right">{formatPaise(c.walletBalance)}</Td>
                  <Td className="text-right"><span className="inline-flex gap-2"><Button size="sm" onClick={() => setView(c)} aria-label={`Ledgers for ${c.name}`}>Ledgers</Button>{can('customers.edit') && <Button size="sm" onClick={() => setEdit({ customer: c })} aria-label={`Edit ${c.name}`}>Edit</Button>}</span></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {list.hasNextPage && <div className="mt-3"><Button onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>Load more</Button></div>}
        </>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.customer ? 'Edit customer' : 'Add customer'}>
        {edit && <CustomerForm key={edit.customer?.id ?? 'new'} customer={edit.customer} onDone={() => { setEdit(null); toast('Customer saved', 'success'); }} />}
      </Modal>
      <Drawer side="right" open={!!view} onClose={() => setView(null)} title={view ? `${view.name}: ledgers` : ''}>{view && <LedgerPanel customer={view} />}</Drawer>
    </div>
  );
}
