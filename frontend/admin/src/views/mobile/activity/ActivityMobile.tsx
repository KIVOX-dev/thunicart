import { useState } from 'react';
import { Badge, Button, EmptyState, ListSkeleton, Select } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { ENTITY_OPTIONS, describe, useActivity } from '../../../features/activity/use-activity';

export function ActivityMobile() {
  const [entity, setEntity] = useState('');
  const q = useActivity({ entity: entity || undefined });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-3">
      <Select aria-label="Filter by area" className="min-h-12" value={entity} onChange={(e) => setEntity(e.target.value)}>{ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
      {q.isPending ? <ListSkeleton label="Loading activity" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="No activity yet" /> : (
        <ul className="flex flex-col gap-2">
          {rows.map((a) => (
            <li key={a.id} className="rounded border border-line p-3">
              <p className="text-sm">{describe(a)}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted">{a.entity && <Badge>{a.entity}</Badge>}{new Date(a.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && <Button size="lg" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button>}
    </div>
  );
}
