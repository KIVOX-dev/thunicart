import { useState } from 'react';
import { formatDate } from '@thunikart/shared';
import { Badge, Button, EmptyState, Input, ListSkeleton, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { useCan } from '../../../features/auth/permissions';
import { useConfirmHsn, useHsnRules, useSetEffective } from '../../../features/catalog/use-hsn';

export function HsnDesktop() {
  const can = useCan();
  const { toast } = useToast();
  const q = useHsnRules();
  const confirm = useConfirmHsn();
  const setEff = useSetEffective();
  const [err, setErr] = useState<string | null>(null);
  const unconfirmed = q.data?.filter((r) => !r.confirmed).length ?? 0;
  return (
    <div>
      <PageHeader title="HSN and GST rates" description="Rate rules per HSN code, with the date each rule starts." />
      {unconfirmed > 0 && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-warning bg-warning-bg px-4 py-3 text-sm">
          <span><strong>{unconfirmed} rules are not confirmed.</strong> These rates came from the master sheet. An Admin must confirm them before bills rely on them.</span>
          {can('gst.approve') ? <Button variant="primary" loading={confirm.isPending} onClick={async () => { setErr(null); try { await confirm.mutateAsync(); toast('HSN rules confirmed', 'success'); } catch (e) { setErr((e as Error).message); } }}>Confirm all rules</Button> : <Badge tone="warning">Waiting for an Admin</Badge>}
        </div>
      )}
      {unconfirmed === 0 && q.data && <p role="status" className="mb-4 text-sm"><Badge tone="success">All rules confirmed</Badge></p>}
      {err && <div className="mb-3"><ErrorBanner message={err} /></div>}
      {q.isPending ? <ListSkeleton label="Loading HSN rules" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : q.data.length === 0 ? <EmptyState title="No HSN rules" /> : (
        <Table caption="HSN and GST rate rules">
          <THead><Tr><Th>HSN</Th><Th>Chapter</Th><Th>Description</Th><Th>Rule</Th><Th>Effective from</Th><Th>Status</Th></Tr></THead>
          <TBody>
            {q.data.map((r) => (
              <Tr key={r.hsn}>
                <Td className="font-mono">{r.hsn}</Td><Td>{r.chapter}</Td><Td className="max-w-md">{r.description}</Td><Td className="whitespace-nowrap text-xs">{r.rule}</Td>
                <Td>{can('gst.edit') ? <Input type="date" aria-label={`Effective from for ${r.hsn}`} className="w-40" defaultValue={r.effectiveFrom} onBlur={(e) => { if (e.target.value && e.target.value !== r.effectiveFrom) setEff.mutate({ hsn: r.hsn, effectiveFrom: e.target.value }); }} /> : formatDate(r.effectiveFrom)}</Td>
                <Td><Badge tone={r.confirmed ? 'success' : 'warning'}>{r.confirmed ? 'Confirmed' : 'Not confirmed'}</Badge></Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
