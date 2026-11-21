import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '@thunikart/shared';
import { Badge, Button, EmptyState, ListSkeleton, Modal, Table, TBody, Td, Th, THead, Tr } from '@thunikart/ui';
import { AuditStart } from '../../../components/AuditStart';
import { QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { useCan } from '../../../features/auth/permissions';
import { auditLabel, auditTone } from '../../../features/inventory/types';
import { useAudits } from '../../../features/inventory/use-audit';
import { Pager } from '../../../components/Pager';
import { usePagedView } from '../../../features/api/use-paged-view';

export function AuditsDesktop() {
  const can = useCan();
  const nav = useNavigate();
  const q = useAudits();
  const [open, setOpen] = useState(false);
  const pv = usePagedView(q);
  const data = pv.items;
  return (
    <div>
      <PageHeader title="Stock audit" description="Count stock by scanning, check the differences, then approve." actions={can('stock.create') ? <Button variant="primary" onClick={() => setOpen(true)}>Start a count</Button> : undefined} />
      {q.isPending ? <ListSkeleton label="Loading counts" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : data.length === 0 ? <EmptyState title="No stock counts yet" body="Start a count for a store. On a phone, scan each piece as you count." /> : (
        <>
          <Table caption="Stock counts">
            <THead><Tr><Th>Count</Th><Th>Store</Th><Th>Scope</Th><Th>Started</Th><Th>Status</Th><Th className="text-right">Scans</Th></Tr></THead>
            <TBody>{data.map((a) => <Tr key={a.id}><Td><Link className="font-medium underline" to={`/stock/audits/${a.id}`}>{a.number}</Link></Td><Td>{a.storeName}</Td><Td>{a.scope}</Td><Td>{formatDate(a.createdAt)}</Td><Td><Badge tone={auditTone(a.status)}>{auditLabel(a.status)}</Badge></Td><Td className="text-right">{a.scans}</Td></Tr>)}</TBody>
          </Table>
          <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Start a stock count"><AuditStart onStarted={(id) => nav(`/stock/audits/${id}`)} /></Modal>
    </div>
  );
}
