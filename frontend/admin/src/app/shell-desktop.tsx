import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { ListSkeleton, Select } from '@thunikart/ui';
import { Logo } from '../components/Logo';
import { ProfileMenu } from '../components/ProfileMenu';
import { useGstMode } from '../features/auth/permissions';
import { MODULES_REGISTRY } from './modules';
import { useMenuGroups, useVisibleModules } from './use-nav';

function GoTo() {
  const modules = useVisibleModules();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const hits = q.trim() ? modules.filter((m) => m.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  return (
    <div className="relative w-64">
      <Search aria-hidden size={16} className="pointer-events-none absolute left-3 top-3 text-muted" />
      <input
        aria-label="Go to a screen" placeholder="Go to…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { nav(hits[0].path); setQ(''); } if (e.key === 'Escape') setQ(''); }}
        className="min-h-10 w-full rounded border border-line pl-9 pr-3 text-sm placeholder:text-muted"
      />
      {hits.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded border border-line bg-white py-1 shadow-overlay">
          {hits.map((m) => <li key={m.key}><Link to={m.path} onClick={() => setQ('')} className="block px-3 py-2 text-sm hover:bg-mist">{m.label}</Link></li>)}
        </ul>
      )}
    </div>
  );
}

function Breadcrumbs() {
  const { pathname } = useLocation();
  const mod = MODULES_REGISTRY.find((m) => m.path === pathname);
  if (!mod || mod.key === 'home') return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-xs text-muted">
      <ol className="flex items-center gap-1">
        <li><Link to="/" className="hover:text-navy">Home</Link></li>
        <li aria-hidden>/</li><li>{mod.group}</li><li aria-hidden>/</li>
        <li aria-current="page" className="font-medium text-navy">{mod.label}</li>
      </ol>
    </nav>
  );
}

export function DesktopShell() {
  const groups = useMenuGroups();
  const gst = useGstMode();
  return (
    <div className="flex min-h-screen bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:p-2">Skip to content</a>
      <aside aria-label="Main menu" className="sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-y-auto bg-navy text-white">
        <Link to="/" className="px-4 py-4"><Logo light /></Link>
        <nav className="flex-1 px-2 pb-4">
          {groups.map((g) => (
            <div key={g.group} className="mb-3">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-heading text-white/70">{g.group}</p>
              <ul>
                {g.items.map((m) => (
                  <li key={m.key}>
                    <NavLink to={m.path} className={({ isActive }) => `flex min-h-9 items-center gap-2 rounded px-3 text-sm ${isActive ? 'bg-white font-semibold text-navy' : 'text-white hover:bg-white/10'}`}>
                      <m.icon aria-hidden size={16} />{m.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="border-t border-white/20 px-4 py-3 text-xs text-white/80">{gst === 'on' ? 'GST is on' : 'GST is off'}</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-line bg-white px-6 py-2">
          <div className="w-52"><Select aria-label="Store" defaultValue="main"><option value="main">Thunikart, Pattanam</option></Select></div>
          <GoTo />
          <div className="ml-auto"><ProfileMenu /></div>
        </header>
        <main id="main" className="flex-1 px-6 py-5">
          <Breadcrumbs />
          <Suspense fallback={<ListSkeleton label="Loading screen" />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
