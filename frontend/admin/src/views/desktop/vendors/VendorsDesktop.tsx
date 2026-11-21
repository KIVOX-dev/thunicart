import { useState } from 'react';
import { formatPaise } from '@thunikart/shared';
import { Badge, Button, Drawer, EmptyState, Input, ListSkeleton, Modal, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { ExportButton } from '../../../components/ExportButton';
import { QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { VendorForm } from '../../../components/PartyForms';
import { VendorDetail } from '../../../components/VendorDetail';
import { useCan } from '../../../features/auth/permissions';
import type { Vendor } from '../../../features/catalog/types';
import { useVendors } from '../../../features/catalog/use-parties';

export function VendorsDesktop() {
  const can = useCan();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [dlg, setDlg] = useState<{ vendor?: Vendor } | null>(null);
  const [open, setOpen] = useState<Vendor | null>(null);
  const list = useVendors(q);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <PageHeader title="Vendors" description="Suppliers you buy from." actions={<><ExportButton dataset="vendors" />{can('vendors.create') && <Button variant="primary" onClick={() => setDlg({})}>Add vendor</Button>}</>} />
      <div className="mb-3 w-72"><Input aria-label="Search vendors" placeholder="Search name, code or GSTIN" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list.isPending ? <ListSkeleton label="Loading vendors" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState title="No vendors found" /> : (
        <>
          <Table caption="Vendors">
            <THead><Tr><Th>Code</Th><Th>Name</Th><Th>Contact</Th><Th>City</Th><Th>GSTIN</Th><Th>Terms</Th><Th className="text-right">Outstanding</Th><Th><span className="sr-only">Actions</span></Th></Tr></THead>
            <TBody>
              {rows.map((v) => (
                <Tr key={v.id}>
                  <Td className="font-mono text-xs">{v.code}</Td>
                  <Td className="font-medium">{v.name}</Td>
                  <Td>{v.contactPerson}<span className="block text-xs text-muted">{v.mobile}</span></Td>
                  <Td>{v.city}</Td>
                  <Td className="font-mono text-xs">{v.gstin}</Td>
                  <Td>{v.paymentTerms}</Td>
                  <Td className="text-right">{v.outstanding ? <Badge tone="warning">{formatPaise(v.outstanding)}</Badge> : formatPaise(0)}</Td>
                  <Td className="text-right"><span className="inline-flex gap-2"><Button size="sm" onClick={() => setOpen(v)} aria-label={`Purchase history for ${v.name}`}>Purchases</Button>{can('vendors.edit') && <Button size="sm" onClick={() => setDlg({ vendor: v })} aria-label={`Edit ${v.name}`}>Edit</Button>}</span></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {list.hasNextPage && <div className="mt-3"><Button onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>Load more</Button></div>}
        </>
      )}
      <Drawer side="right" open={!!open} onClose={() => setOpen(null)} title={open ? open.name : ''}>{open && <VendorDetail vendor={open} onSaved={() => { setOpen(null); toast('Vendor saved', 'success'); }} />}</Drawer>
      <Modal className="!w-[min(94vw,46rem)] !max-h-[calc(100dvh-2rem)]" open={!!dlg} onClose={() => setDlg(null)} title={dlg?.vendor ? 'Edit vendor' : 'Add vendor'}>
        {dlg && <VendorForm key={dlg.vendor?.id ?? 'new'} vendor={dlg.vendor} onDone={() => { setDlg(null); toast('Vendor saved', 'success'); }} />}
      </Modal>
    </div>
  );
}
