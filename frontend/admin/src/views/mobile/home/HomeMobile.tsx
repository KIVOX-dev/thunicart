import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useMenuGroups } from '../../../app/use-nav';
import { useGstMode } from '../../../features/auth/permissions';
import { useSession } from '../../../features/auth/use-session';

/** The More tab: every module the role may open, plus profile. */
export function HomeMobile() {
  const groups = useMenuGroups();
  const { data: me } = useSession();
  const gst = useGstMode();
  return (
    <div className="flex flex-col gap-5">
      <Link to="/profile" className="flex min-h-14 items-center justify-between rounded border border-line bg-mist px-4">
        <span><strong className="block text-sm">{me?.name}</strong><span className="text-xs text-muted">{me?.role.name} · {gst === 'on' ? 'GST is on' : 'GST is off'}</span></span>
        <ChevronRight aria-hidden size={18} />
      </Link>
      {groups.map((g) => (
        <section key={g.group} aria-label={g.group}>
          <h2 className="mb-1 text-xs text-muted">{g.group}</h2>
          <ul className="divide-y divide-line rounded border border-line">
            {g.items.map((m) => (
              <li key={m.key}><Link to={m.path} className="flex min-h-12 items-center gap-3 px-4 text-sm"><m.icon aria-hidden size={18} />{m.label}<ChevronRight aria-hidden size={16} className="ml-auto text-muted" /></Link></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
