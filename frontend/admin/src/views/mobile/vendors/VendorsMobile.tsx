import { useState } from 'react';
import { formatPaise } from '@thunikart/shared';
import { Badge, BottomSheet, Button, EmptyState, Input, ListSkeleton, useToast } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { VendorForm } from '../../../components/PartyForms';
import { useCan } from '../../../features/auth/permissions';
import type { Vendor } from '../../../features/catalog/types';
import { useVendors } from '../../../features/catalog/use-parties';

export function VendorsMobile() {
  const can = useCan();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [dlg, setDlg] = useState<{ vendor?: Vendor } | null>(null);
  const list = useVendors(q);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-3 pb-20">
      <Input aria-label="Search vendors" placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-12" />
      {list.isPending ? <ListSkeleton label="Loading vendors" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState title="No vendors found" /> : (
        <ul className="flex flex-col gap-3">
          {rows.map((v) => (
            <li key={v.id}>
              <button type="button" disabled={!can('vendors.edit')} onClick={() => setDlg({ vendor: v })} className="block min-h-14 w-full rounded border border-line p-3 text-left" aria-label={`Edit ${v.name}`}>
                <strong className="text-sm">{v.name}</strong>
                <span className="block text-xs text-muted">{v.code} · {v.city} · {v.mobile}</span>
                <span className="mt-1 flex items-center gap-2 text-sm">Outstanding {v.outstanding ? <Badge tone="warning">{formatPaise(v.outstanding)}</Badge> : formatPaise(0)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && <Button size="lg" className="min-h-12" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>Load more</Button>}
      {can('vendors.create') && <div className="fixed inset-x-0 bottom-14 z-30 border-t border-line bg-white p-3"><Button variant="primary" size="lg" block className="min-h-12" onClick={() => setDlg({})}>Add vendor</Button></div>}
      <BottomSheet open={!!dlg} onClose={() => setDlg(null)} title={dlg?.vendor ? 'Edit vendor' : 'Add vendor'}>
        {dlg && <VendorForm key={dlg.vendor?.id ?? 'new'} vendor={dlg.vendor} onDone={() => { setDlg(null); toast('Vendor saved', 'success'); }} />}
      </BottomSheet>
    </div>
  );
}
