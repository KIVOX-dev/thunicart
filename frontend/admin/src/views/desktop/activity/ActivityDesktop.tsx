import { useState } from 'react';
import { Badge, Button, EmptyState, ListSkeleton, Select, Table, TBody, Td, Th, THead, Tr } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { ENTITY_OPTIONS, useActivity } from '../../../features/activity/use-activity';

export function ActivityDesktop() {
  const [entity, setEntity] = useState('');
  const q = useActivity({ entity: entity || undefined });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <PageHeader title="Activity log" description="Who changed what. Newest first." />
      <div className="mb-3 w-56"><Select aria-label="Filter by area" value={entity} onChange={(e) => setEntity(e.target.value)}>{ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></div>
      {q.isPending ? <ListSkeleton label="Loading activity" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="No activity yet" body="Changes to users, roles and settings appear here." /> : (
        <>
          <Table caption="Activity log">
            <THead><Tr><Th>When</Th><Th>Who</Th><Th>Area</Th><Th>Action</Th><Th>Request id</Th></Tr></THead>
            <TBody>
              {rows.map((a) => (
                <Tr key={a.id}>
                  <Td className="whitespace-nowrap">{new Date(a.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</Td>
                  <Td>{a.userName ?? 'System'}</Td><Td>{a.entity ? <Badge>{a.entity}</Badge> : '–'}</Td><Td>{a.action ?? `${a.method} ${a.path}`}</Td>
                  <Td className="font-mono text-xs text-muted">{a.requestId}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {q.hasNextPage && <div className="mt-3"><Button onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button></div>}
        </>
      )}
    </div>
  );
}
