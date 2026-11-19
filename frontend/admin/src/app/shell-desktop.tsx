import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Search, Store } from 'lucide-react';
import { ListSkeleton } from '@thunikart/ui';
import { Logo } from '../components/Logo';
import { ProfileMenu } from '../components/ProfileMenu';
import { useCan, useGstMode } from '../features/auth/permissions';
import { useFacets } from '../features/catalog/use-items';
import { useShopId } from '../features/pos/use-pos-data';
import { isEntryActive, useCurrentModule, useMenu, useVisibleModules } from './use-nav';
import type { MenuEntry } from './modules';

function GoTo() {
  const modules = useVisibleModules();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const hits = q.trim() ? modules.filter((m) => !m.hidden && m.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  return (
    <div className="relative w-64">
      <Search aria-hidden size={16} className="pointer-events-none absolute left-3 top-3 text-muted" />
      <input
        aria-label="Go to a screen" placeholder="Go to…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { nav(hits[0].path); setQ(''); } if (e.key === 'Escape') setQ(''); }}
        className="min-h-10 w-full rounded-full border-2 border-navy-100 bg-navy-50 pl-9 pr-4 text-sm placeholder:text-muted focus:border-teal focus:bg-white focus:outline-none"
      />
      {hits.length > 0 && (
        <ul className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border-2 border-navy-100 bg-white py-1 shadow-overlay">
          {hits.map((m) => <li key={m.key}><Link to={m.path} onClick={() => setQ('')} className="block px-4 py-2 text-sm font-medium hover:bg-teal-100">{m.label}</Link></li>)}
        </ul>
      )}
    </div>
  );
}

function Breadcrumbs() {
  const mod = useCurrentModule();
  if (!mod || mod.key === 'home') return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-xs font-medium text-muted">
      <ol className="flex items-center gap-1">
        <li><Link to="/" className="hover:text-navy">Home</Link></li>
        <li aria-hidden>/</li><li>{mod.group}</li><li aria-hidden>/</li>
        <li aria-current="page" className="font-medium text-navy">{mod.label}</li>
      </ol>
    </nav>
  );
}

const linkCls = (active: boolean) => `tk-press flex min-h-10 items-center gap-3 rounded-full px-3 text-sm ${active ? 'bg-orange font-bold text-navy shadow-soft' : 'font-medium text-white hover:bg-white/15'}`;

function MenuLink({ entry, n }: { entry: MenuEntry; n?: number }) {
  const { pathname } = useLocation();
  const active = isEntryActive(entry, pathname);
  return (
    <li>
      <Link to={entry.path} aria-current={active ? 'page' : undefined} className={linkCls(active)}>
        <entry.icon aria-hidden size={16} />{entry.label}{n !== undefined && <span aria-hidden className="sr-only">{n}</span>}
      </Link>
    </li>
  );
}

export function DesktopShell() {
  const { main, more } = useMenu();
  const { pathname } = useLocation();
  const gst = useGstMode();
  const shopId = useShopId().data;
  const shopName = useFacets().data?.stores.find((x) => x.id === shopId)?.name ?? 'Store';
  const can = useCan();
  return (
    <div className="flex min-h-screen bg-navy-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:p-2">Skip to content</a>
      <aside aria-label="Main menu" className="sticky top-0 m-3 mr-0 flex h-[calc(100vh-1.5rem)] w-64 shrink-0 flex-col overflow-y-auto rounded-2xl bg-navy text-white shadow-lift">
        <Link to="/" className="block px-3 py-4" aria-label="Thunikart home"><Logo variant="sidebar" tile className="w-full" /></Link>
        <nav className="flex-1 px-2 pb-4">
          {can('reports.view') && (
            <NavLink to="/dashboard" className={({ isActive }) => `${linkCls(isActive || /^\/(reports|gst)(\/|$)/.test(pathname))} mb-2`}><LayoutDashboard aria-hidden size={16} />Dashboard</NavLink>
          )}
          <ul aria-label="Admin menu">{main.map((e) => <MenuLink key={e.key} entry={e} />)}</ul>
          {more.length > 0 && (
            <div className="mt-3">
              <p className="tk-eyebrow px-3 pb-1 pt-2 text-teal">Catalogue and stock</p>
              <ul>{more.map((e) => <MenuLink key={e.key} entry={e} />)}</ul>
            </div>
          )}
        </nav>
        <p className="m-3 rounded-full bg-white/10 px-4 py-2 text-center text-xs font-semibold text-white">{gst === 'on' ? 'GST is on' : 'GST is off'}</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 bg-navy-50 px-6 pb-3 pt-3">
          <header className="flex items-center gap-4 rounded-full bg-white px-4 py-2 shadow-soft">
            <div className="flex w-56 items-center gap-2 rounded-full border border-navy-100 px-4 py-2 text-sm font-medium text-navy" title="The store this screen works on"><Store aria-hidden size={16} /><span className="truncate">{shopName}</span></div>
            <GoTo />
            <div className="ml-auto"><ProfileMenu /></div>
          </header>
        </div>
        <main id="main" className="flex-1 px-6 py-6">
          <div className="min-h-full rounded-2xl bg-white p-6 shadow-soft">
            <Breadcrumbs />
            <Suspense fallback={<ListSkeleton label="Loading screen" />}><Outlet /></Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
