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
  const tab = 'tk-press flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold';
  return (
    <div className="flex min-h-screen flex-col bg-navy-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:p-2">Skip to content</a>
      <header className="sticky top-0 z-40 flex items-center justify-between rounded-b-3xl bg-navy px-5 py-3 text-white shadow-lift">
        <h1 className="text-xl">{title}</h1>
        <Logo variant="mark" tile className="h-9 w-9 !p-0.5" />
      </header>
      <main id="main" className="flex-1 px-4 pb-24 pt-4"><Suspense fallback={<ListSkeleton label="Loading screen" />}><Outlet /></Suspense></main>
      <nav aria-label="Main tabs" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex gap-1 rounded-full bg-white p-1.5 shadow-lift ring-2 ring-navy-100">
        {tabs.map((t) => (
          <NavLink key={t.key} to={t.path} className={({ isActive }) => `${tab} ${isActive ? 'bg-navy text-white' : 'text-navy'}`}>
            <t.icon aria-hidden size={20} />{t.label}
          </NavLink>
        ))}
        <NavLink to="/more" className={({ isActive }) => `${tab} ${isActive ? 'bg-navy text-white' : 'text-navy'}`}>
          <Menu aria-hidden size={20} />More
        </NavLink>
      </nav>
    </div>
  );
}
