import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { ListSkeleton } from '@thunikart/ui';
import { Logo } from '../components/Logo';
import { useCan } from '../features/auth/permissions';
import { MOBILE_TABS } from './modules';
import { useCurrentModule } from './use-nav';

export function MobileShell() {
  const { pathname } = useLocation();
  const can = useCan();
  const mod = useCurrentModule();
  const title = pathname === '/more' ? 'More' : mod?.key === 'home' ? 'More' : mod?.label ?? 'Thunikart';
  const tabs = MOBILE_TABS.filter((t) => can(t.perm));
  const tab = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium';
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:p-2">Skip to content</a>
      <header className="sticky top-0 z-40 flex items-center justify-between bg-navy px-4 py-3 text-white">
        <h1 className="text-sm">{title}</h1>
        <Logo variant="mark" tile className="h-9 w-9 !p-0.5" />
      </header>
      <main id="main" className="flex-1 px-4 pb-24 pt-4"><Suspense fallback={<ListSkeleton label="Loading screen" />}><Outlet /></Suspense></main>
      <nav aria-label="Main tabs" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        {tabs.map((t) => (
          <NavLink key={t.key} to={t.path} className={({ isActive }) => `${tab} ${isActive ? 'border-t-2 border-teal text-navy' : 'border-t-2 border-transparent text-muted'}`}>
            <t.icon aria-hidden size={20} />{t.label}
          </NavLink>
        ))}
        <NavLink to="/more" className={({ isActive }) => `${tab} ${isActive ? 'border-t-2 border-teal text-navy' : 'border-t-2 border-transparent text-muted'}`}>
          <Menu aria-hidden size={20} />More
        </NavLink>
      </nav>
    </div>
  );
}
