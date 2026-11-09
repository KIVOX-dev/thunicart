import { useState } from 'react';
import { Badge, Button, EmptyState, ListSkeleton, Modal, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { PageHeader } from '../../../components/PageHeader';
import { QueryError } from '../../../components/ErrorBanner';
import { SeriesForm } from '../../../components/SeriesForm';
import { useCan } from '../../../features/auth/permissions';
import { SERIES_LABELS, useNumberSeries, type NumberSeries } from '../../../features/settings/use-number-series';

export function NumberSeriesDesktop() {
  const q = useNumberSeries();
  const canEdit = useCan()('settings.edit');
  const [editing, setEditing] = useState<NumberSeries | null>(null);
  const { toast } = useToast();
  return (
    <div>
      <PageHeader title="Number series" description="Prefixes and counters for bills, orders and purchase documents." />
      {q.isPending ? <ListSkeleton label="Loading number series" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : q.data.length === 0 ? <EmptyState title="No series" /> : (
        <Table caption="Number series">
          <THead><Tr><Th>Key</Th><Th>Used for</Th><Th>Prefix</Th><Th>Digits</Th><Th>Resets yearly</Th><Th className="text-right">Counter</Th><Th>Next number</Th>{canEdit && <Th><span className="sr-only">Actions</span></Th>}</Tr></THead>
          <TBody>
            {q.data.map((s) => (
              <Tr key={s.key}>
                <Td className="font-medium">{s.key}</Td><Td>{SERIES_LABELS[s.key] ?? s.key}</Td><Td>{s.prefix}</Td><Td>{s.padding}</Td>
                <Td>{s.perFinancialYear ? <Badge tone="success">Yes, {s.financialYear}</Badge> : <Badge>No</Badge>}</Td>
                <Td className="text-right">{s.counter}</Td><Td className="font-mono">{s.next}</Td>
                {canEdit && <Td><Button size="sm" onClick={() => setEditing(s)} aria-label={`Edit ${s.key}`}>Edit</Button></Td>}
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.key} series` : ''}>
        {editing && <SeriesForm series={editing} onDone={() => { setEditing(null); toast('Number series saved', 'success'); }} />}
      </Modal>
    </div>
  );
}
