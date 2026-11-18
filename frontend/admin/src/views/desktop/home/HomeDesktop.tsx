import { Link } from 'react-router-dom';
import { Badge } from '@thunikart/ui';
import { PageHeader } from '../../../components/PageHeader';
import { useMenu } from '../../../app/use-nav';
import { useGstMode } from '../../../features/auth/permissions';
import { useSession } from '../../../features/auth/use-session';

export function HomeDesktop() {
  const { main, more } = useMenu();
  const { data: me } = useSession();
  const gst = useGstMode();
  const sections = [{ title: 'Menu', items: main }, ...(more.length ? [{ title: 'Catalogue and stock', items: more }] : [])];
  return (
    <div>
      <PageHeader title={`Welcome, ${me?.name ?? ''}`} description={`Signed in as ${me?.role.name}. You see only what your role allows.`} actions={<Badge tone={gst === 'on' ? 'success' : 'neutral'}>{gst === 'on' ? 'GST is on' : 'GST is off'}</Badge>} />
      <div className="grid grid-cols-3 gap-4">
        {sections.map((g) => (
          <section key={g.title} className="rounded border-2 border-navy-100 p-4">
            <h2 className="mb-2 text-xs">{g.title}</h2>
            <ul>{g.items.map((m) => <li key={m.key}><Link className="flex min-h-9 items-center gap-2 text-sm hover:text-muted" to={m.path}><m.icon aria-hidden size={16} />{m.label}</Link></li>)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}
