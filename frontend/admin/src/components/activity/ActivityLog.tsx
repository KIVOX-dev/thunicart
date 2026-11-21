import { useState } from 'react';
import { Badge, Button, EmptyState, Input, ListSkeleton, Select } from '@thunikart/ui';
import { QueryError } from '../ErrorBanner';
import { MODULE_OPTIONS, useActivity, type Activity } from '../../features/activity/use-activity';
import { useAllUsers } from '../../features/users/use-users';
import { Pager } from '../Pager';
import { usePagedView } from '../../features/api/use-paged-view';

const when = (a: Activity) => new Date(a.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
const show = (v: unknown) => JSON.stringify(v, null, 1);

function Changes({ a }: { a: Activity }) {
  if (a.before == null && a.after == null) return <p className="text-xs text-muted">No values were recorded for this change.</p>;
  const box = 'max-h-48 overflow-auto rounded bg-mist p-2 text-xs';
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div><p className="mb-1 text-xs font-semibold">Before</p><pre className={box}>{a.before == null ? '(none)' : show(a.before)}</pre></div>
      <div><p className="mb-1 text-xs font-semibold">After</p><pre className={box}>{a.after == null ? '(none)' : show(a.after)}</pre></div>
    </div>
  );
}

/** The activity log: filter by user, module and date; open a row to see before and after. */
export function ActivityLog({ compact }: { compact?: boolean }) {
  const [userId, setUserId] = useState('');
  const [module, setModule] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const users = useAllUsers();
  const q = useActivity({ userId, module, from, to });
  const pv = usePagedView(q);
  const rows = pv.items;
  return (
    <div className="flex flex-col gap-3">
      <div className={compact ? 'flex flex-col gap-2' : 'flex flex-wrap items-end gap-3'}>
        <Select aria-label="User" className={compact ? 'min-h-12' : 'w-48'} value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">All users</option>{(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        <Select aria-label="Module" className={compact ? 'min-h-12' : 'w-56'} value={module} onChange={(e) => setModule(e.target.value)}><option value="">All modules</option>{MODULE_OPTIONS.map((m) => <option key={m}>{m}</option>)}</Select>
        <label className="text-xs text-muted">From<Input type="date" aria-label="From date" className={compact ? 'min-h-12' : 'w-40'} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-muted">To<Input type="date" aria-label="To date" className={compact ? 'min-h-12' : 'w-40'} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {(userId || module || from || to) && <Button onClick={() => { setUserId(''); setModule(''); setFrom(''); setTo(''); }}>Clear</Button>}
      </div>
      {q.isPending ? <ListSkeleton label="Loading activity" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="No activity found" body="Every create, update and delete is recorded here." /> : (
        <ul className="flex flex-col gap-2">{rows.map((a) => (
          <li key={a.id} className="rounded border-2 border-navy-100 p-3 text-sm">
            <button type="button" className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 text-left" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
              <span><strong>{a.userName ?? 'System'}</strong>{a.userRole && <span className="text-xs text-muted"> ({a.userRole})</span>}<span className="block text-xs text-muted">{a.action ?? a.method} {a.entity ?? a.path} · {when(a)}</span></span>
              {a.module && <Badge>{a.module}</Badge>}
            </button>
            {open === a.id && <div className="mt-2 border-t border-line pt-2"><Changes a={a} /></div>}
          </li>
        ))}</ul>
      )}
      <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
    </div>
  );
}
