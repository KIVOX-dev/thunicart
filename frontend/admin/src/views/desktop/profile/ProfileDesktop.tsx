import { Badge, Button } from '@thunikart/ui';
import { PageHeader } from '../../../components/PageHeader';
import { useSession, useSessions } from '../../../features/auth/use-session';
import { useView } from '../../../app/view';

export function ProfileDesktop() {
  const { data: me } = useSession();
  const sessions = useSessions();
  const { view, pref, setPref } = useView();
  if (!me) return null;
  return (
    <div className="max-w-3xl">
      <PageHeader title="My profile" />
      <dl className="grid grid-cols-[10rem_1fr] gap-y-3 text-sm">
        <dt className="text-muted">Name</dt><dd>{me.name}</dd>
        <dt className="text-muted">Email</dt><dd>{me.email}</dd>
        <dt className="text-muted">Role</dt><dd>{me.role.name} {me.role.isAdmin && <Badge tone="accent">Admin</Badge>}</dd>
        <dt className="text-muted">Permissions</dt><dd>{me.role.isAdmin ? 'Every permission' : `${me.permissions.length} permissions`}</dd>
        <dt className="text-muted">GST</dt><dd>{me.gst.gstMode === 'on' ? `On (${me.gst.gstin})` : 'Off'}</dd>
      </dl>
      <section className="mt-8 border-t border-line pt-5" aria-label="View">
        <h2 className="mb-2 text-xs">View</h2>
        <p className="mb-3 text-sm text-muted">Showing the {view} view{pref === 'auto' ? ' (automatic, by screen width)' : ' (your choice, remembered on this device)'}.</p>
        <div className="flex gap-2">
          <Button onClick={() => setPref('desktop')} aria-pressed={view === 'desktop'}>Switch to desktop view</Button>
          <Button onClick={() => setPref('mobile')} aria-pressed={view === 'mobile'}>Switch to mobile view</Button>
          {pref !== 'auto' && <Button variant="ghost" onClick={() => setPref('auto')}>Use automatic</Button>}
        </div>
      </section>
      <section className="mt-8 border-t border-line pt-5" aria-label="Sessions">
        <h2 className="mb-2 text-xs">Signed in on</h2>
        {sessions.data?.map((s) => <p key={s.id} className="text-sm">{s.current ? 'This device' : 'Other device'} · {s.ip ?? 'unknown address'}</p>)}
      </section>
    </div>
  );
}
