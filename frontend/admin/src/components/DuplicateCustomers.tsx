import { useState } from 'react';
import { Badge, Button, EmptyState, ListSkeleton, useToast } from '@thunikart/ui';
import { QueryError } from './ErrorBanner';
import { useDuplicateCustomers, useMergeCustomers } from '../features/catalog/use-parties';

/**
 * Customers who share a phone number or an email, for example someone who signed up online and was also billed at the counter.
 * Pick the record to keep; everything on the other one (bills, returns, wallet, loyalty, orders) moves across and the other record is removed.
 */
export function DuplicateCustomers({ onDone }: { onDone?: () => void }) {
  const q = useDuplicateCustomers(true);
  const { merge, saving, error } = useMergeCustomers();
  const { toast } = useToast();
  const [keep, setKeep] = useState<Record<string, string>>({});
  if (q.isPending) return <ListSkeleton label="Looking for duplicates" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0) return <EmptyState title="No duplicates" body="No two customers share a phone number or an email." />;
  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {q.data.map((g) => {
        const key = `${g.by}:${g.value}`;
        const keepId = keep[key] ?? g.customers.find((c) => c.source === 'offline')?.id ?? g.customers[0]!.id;
        return (
          <section key={key} aria-label={`Same ${g.by} ${g.value}`} className="rounded border-2 border-navy-100 p-3">
            <p className="mb-2 text-xs text-muted">Same {g.by}: <strong>{g.value}</strong></p>
            <ul className="flex flex-col gap-2">
              {g.customers.map((c) => (
                <li key={c.id} className="flex items-center gap-3 text-sm">
                  <input type="radio" name={key} aria-label={`Keep ${c.name}`} checked={keepId === c.id} onChange={() => setKeep((k) => ({ ...k, [key]: c.id }))} className="h-5 w-5" />
                  <span className="min-w-0 flex-1"><strong>{c.name}</strong><span className="block truncate text-xs text-muted">{c.customerId} · {c.mobile} · {c.email || 'no email'}</span></span>
                  <Badge tone={c.source === 'online' ? 'success' : 'neutral'}>{c.source === 'online' ? 'Online' : 'Offline'}</Badge>
                </li>
              ))}
            </ul>
            <Button className="mt-3" loading={saving} onClick={async () => {
              for (const c of g.customers.filter((x) => x.id !== keepId)) await merge({ keepId, mergeId: c.id });
              toast('Customers merged', 'success'); onDone?.();
            }}>Merge into the one I keep</Button>
          </section>
        );
      })}
    </div>
  );
}
