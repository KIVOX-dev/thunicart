import { useState } from 'react';
import { formatPaise } from '@thunikart/shared';
import { Badge, Button, Drawer, EmptyState, Input, ListSkeleton, Modal, Select, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { ExportButton } from '../../../components/ExportButton';
import { DuplicateCustomers } from '../../../components/DuplicateCustomers';
import { QueryError } from '../../../components/ErrorBanner';
import { LedgerPanel } from '../../../components/LedgerPanel';
import { PageHeader } from '../../../components/PageHeader';
import { CustomerForm } from '../../../components/PartyForms';
import { useCan } from '../../../features/auth/permissions';
import type { Customer, CustomerSource } from '../../../features/catalog/types';
import { sourceOf, useCustomers } from '../../../features/catalog/use-parties';
import { Pager } from '../../../components/Pager';
import { usePagedView } from '../../../features/api/use-paged-view';

/** onlyOnline: used inside the Online store module, where only website customers are shown. */
export function CustomersDesktop({ onlyOnline }: { onlyOnline?: boolean } = {}) {
  const can = useCan();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ customer?: Customer } | null>(null);
  const [view, setView] = useState<Customer | null>(null);
  const [source, setSource] = useState<CustomerSource | ''>(onlyOnline ? 'online' : '');
  const [dupes, setDupes] = useState(false);
  const list = useCustomers(q, source);
  const pv = usePagedView(list);
  const rows = pv.items;
  return (
    <div>
      <PageHeader title="Customers" description="One list for online (website sign ups) and offline (counter) customers." actions={<><ExportButton dataset="customers" />{can('customers.create') && <Button variant="primary" onClick={() => setEdit({})}>Add customer</Button>}</>} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="w-72"><Input aria-label="Search customers" placeholder="Search name, mobile or code" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {!onlyOnline && <Select aria-label="Source" className="w-40" value={source} onChange={(e) => setSource(e.target.value as CustomerSource | '')}><option value="">All customers</option><option value="online">Online</option><option value="offline">Offline</option></Select>}
        {can('customers.edit') && <Button className="ml-auto" onClick={() => setDupes(true)}>Find duplicates</Button>}
      </div>
      {list.isPending ? <ListSkeleton label="Loading customers" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState title="No customers found" /> : (
        <>
          <Table caption="Customers">
            <THead><Tr><Th>Code</Th><Th>Name</Th><Th>Source</Th><Th>Group</Th><Th>Mobile</Th><Th>City</Th><Th className="text-right">Loyalty</Th><Th className="text-right">Wallet</Th><Th><span className="sr-only">Actions</span></Th></Tr></THead>
            <TBody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-mono text-xs">{c.code}</Td><Td className="font-medium">{c.name}</Td><Td><Badge tone={sourceOf(c) === 'online' ? 'success' : 'neutral'}>{sourceOf(c) === 'online' ? 'Online' : 'Offline'}</Badge></Td><Td>{c.accountGroup}</Td><Td>{c.mobile}</Td><Td>{c.city}</Td>
                  <Td className="text-right">{c.loyaltyPoints}</Td><Td className="text-right">{formatPaise(c.walletBalance)}</Td>
                  <Td className="text-right"><span className="inline-flex gap-2"><Button size="sm" onClick={() => setView(c)} aria-label={`Ledgers for ${c.name}`}>Ledgers</Button>{can('customers.edit') && <Button size="sm" onClick={() => setEdit({ customer: c })} aria-label={`Edit ${c.name}`}>Edit</Button>}</span></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
        </>
      )}
      <Modal className="!w-[min(94vw,46rem)] !max-h-[calc(100dvh-2rem)]" open={!!edit} onClose={() => setEdit(null)} title={edit?.customer ? 'Edit customer' : 'Add customer'}>
        {edit && <CustomerForm key={edit.customer?.id ?? 'new'} customer={edit.customer} onDone={() => { setEdit(null); toast('Customer saved', 'success'); }} />}
      </Modal>
      <Modal open={dupes} onClose={() => setDupes(false)} title="Duplicate customers"><DuplicateCustomers onDone={() => setDupes(false)} /></Modal>
      <Drawer side="right" open={!!view} onClose={() => setView(null)} title={view ? `${view.name}: ledgers` : ''}>{view && <LedgerPanel customer={view} />}</Drawer>
    </div>
  );
}
