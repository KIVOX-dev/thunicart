import { useState } from 'react';
import { formatDate, formatPaise } from '@thunikart/shared';
import { BottomSheet, Button, EmptyState, ListSkeleton, Modal, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { QueryError } from '../ErrorBanner';
import { ReturnForm } from '../PurchaseForms';
import { useCan, useGstMode } from '../../features/auth/permissions';
import { useReturns } from '../../features/inventory/use-billing';
import { Pager } from '../Pager';
import { usePagedView } from '../../features/api/use-paged-view';

/**
 * Send stock back to a vendor. Saving a return takes the pieces off stock and makes a debit note, which comes off what the vendor is owed
 * (Accounts, Outstanding to vendors).
 */
export function VendorReturns({ compact }: { compact?: boolean }) {
  const can = useCan();
  const gst = useGstMode();
  const { toast } = useToast();
  const list = useReturns();
  const [open, setOpen] = useState(false);
  const pv = usePagedView(list);
  const data = pv.items;
  const Sheet = compact ? BottomSheet : Modal;
  const add = can('purchase.create') && <Button variant="primary" className={compact ? 'min-h-12' : ''} block={compact} onClick={() => setOpen(true)}>New vendor return</Button>;
  return (
    <div className="flex flex-col gap-3">
      {!compact && <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted">Stock goes down and the vendor gives you credit (a debit note) against what you owe.</p>{add}</div>}
      {list.isPending ? <ListSkeleton label="Loading returns" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : data.length === 0 ? <EmptyState title="No vendor returns" body="Return damaged or wrong goods to a vendor. A debit note is created." /> : compact ? data.map((r) => (
        <div key={r.id} className="rounded border-2 border-navy-100 p-3"><strong className="text-sm">{r.number}</strong><p className="text-sm">{r.vendorName} · {r.reason}</p><p className="text-xs text-muted">{formatDate(r.date)} · {r.lines.reduce((a, l) => a + l.qty, 0)} pieces · credit {formatPaise(r.totals.total)}</p></div>
      )) : (
        <Table caption="Vendor returns (debit notes)">
          <THead><Tr><Th>Debit note</Th><Th>Vendor</Th><Th>Reason</Th><Th>Date</Th><Th className="text-right">Pieces</Th>{gst === 'on' && <Th className="text-right">GST</Th>}<Th className="text-right">Credit</Th></Tr></THead>
          <TBody>{data.map((r) => <Tr key={r.id}><Td className="font-medium">{r.number}</Td><Td>{r.vendorName}</Td><Td>{r.reason}</Td><Td>{formatDate(r.date)}</Td><Td className="text-right">{r.lines.reduce((a, l) => a + l.qty, 0)}</Td>{gst === 'on' && <Td className="text-right">{r.totals.tax !== null ? formatPaise(r.totals.tax) : ''}</Td>}<Td className="text-right">{formatPaise(r.totals.total)}</Td></Tr>)}</TBody>
        </Table>
      )}
      <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
      {compact && add && <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 border-t-2 border-navy-100 bg-white p-3">{add}</div>}
      <Sheet open={open} onClose={() => setOpen(false)} title="New vendor return"><ReturnForm onDone={() => { setOpen(false); toast('Return created. Stock updated and credit noted against the vendor.', 'success'); }} /></Sheet>
    </div>
  );
}
