import { Link } from 'react-router-dom';
import { Badge } from '@thunikart/ui';
import { PageHeader } from '../../../components/PageHeader';
import { useMenuGroups } from '../../../app/use-nav';
import { useGstMode } from '../../../features/auth/permissions';
import { useSession } from '../../../features/auth/use-session';

export function HomeDesktop() {
  const groups = useMenuGroups();
  const { data: me } = useSession();
  const gst = useGstMode();
  return (
    <div>
      <PageHeader title={`Welcome, ${me?.name ?? ''}`} description={`Signed in as ${me?.role.name}. You see only what your role allows.`} actions={<Badge tone={gst === 'on' ? 'success' : 'neutral'}>{gst === 'on' ? 'GST is on' : 'GST is off'}</Badge>} />
      <div className="grid grid-cols-3 gap-4">
        {groups.map((g) => (
          <section key={g.group} className="rounded border-2 border-navy-100 p-4">
            <h2 className="mb-2 text-xs">{g.group}</h2>
            <ul>{g.items.map((m) => <li key={m.key}><Link className="flex min-h-9 items-center gap-2 text-sm hover:text-muted" to={m.path}><m.icon aria-hidden size={16} />{m.label}</Link></li>)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}
