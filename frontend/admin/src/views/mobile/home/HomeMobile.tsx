import { Link } from 'react-router-dom';
import { ChevronRight, LayoutDashboard } from 'lucide-react';
import { useMenu } from '../../../app/use-nav';
import type { MenuEntry } from '../../../app/modules';
import { useCan, useGstMode } from '../../../features/auth/permissions';
import { useSession } from '../../../features/auth/use-session';

const Row = ({ to, icon: Icon, label }: { to: string; icon: MenuEntry['icon']; label: string }) => (
  <li><Link to={to} className="flex min-h-12 items-center gap-3 px-4 text-sm"><Icon aria-hidden size={18} />{label}<ChevronRight aria-hidden size={16} className="ml-auto text-muted" /></Link></li>
);

/** The More tab: the same menu as the desktop sidebar, in the same order, plus profile. */
export function HomeMobile() {
  const { main, more } = useMenu();
  const can = useCan();
  const { data: me } = useSession();
  const gst = useGstMode();
  return (
    <div className="flex flex-col gap-5">
      <Link to="/profile" className="flex min-h-14 items-center justify-between rounded border-2 border-navy-100 bg-mist px-4">
        <span><strong className="block text-sm">{me?.name}</strong><span className="text-xs text-muted">{me?.role.name} · {gst === 'on' ? 'GST is on' : 'GST is off'}</span></span>
        <ChevronRight aria-hidden size={18} />
      </Link>
      <section aria-label="Admin menu">
        <ul className="divide-y divide-line rounded border-2 border-navy-100">
          {can('reports.view') && <Row to="/dashboard" icon={LayoutDashboard} label="Dashboard" />}
          {main.map((e) => <Row key={e.key} to={e.path} icon={e.icon} label={e.label} />)}
        </ul>
      </section>
      {more.length > 0 && (
        <section aria-label="Catalogue and stock">
          <h2 className="mb-1 text-xs text-muted">Catalogue and stock</h2>
          <ul className="divide-y divide-line rounded border-2 border-navy-100">{more.map((e) => <Row key={e.key} to={e.path} icon={e.icon} label={e.label} />)}</ul>
        </section>
      )}
    </div>
  );
}
