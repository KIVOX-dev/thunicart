import { useNavigate } from 'react-router-dom';
import { Badge, Button } from '@thunikart/ui';
import { useView } from '../../../app/view';
import { useLogout, useSession } from '../../../features/auth/use-session';

export function ProfileMobile() {
  const { data: me } = useSession();
  const { setPref } = useView();
  const logout = useLogout();
  const nav = useNavigate();
  if (!me) return null;
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded border-2 border-navy-100 bg-mist p-4">
        <strong className="block">{me.name}</strong>
        <span className="text-sm text-muted">{me.email}</span>
        <p className="mt-2 flex items-center gap-2 text-sm">{me.role.name} {me.role.isAdmin && <Badge tone="accent">Admin</Badge>}</p>
        <p className="mt-1 text-sm">{me.role.isAdmin ? 'Every permission' : `${me.permissions.length} permissions`} · GST {me.gst.gstMode === 'on' ? 'on' : 'off'}</p>
      </div>
      <Button size="lg" className="min-h-12" onClick={() => setPref('desktop')}>Switch to desktop view</Button>
      <Button size="lg" variant="danger" className="min-h-12" onClick={async () => { await logout.mutateAsync(); nav('/login'); }}>Sign out</Button>
    </div>
  );
}
