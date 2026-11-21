import { Suspense, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, Home, Image, Menu, ShoppingBag, Tag, Undo2, Users, type LucideIcon } from 'lucide-react';
import { ListSkeleton } from '@thunikart/ui';
import { Logo } from '../components/Logo';
import { PageHeader } from '../components/PageHeader';
import { ProfileMenu } from '../components/ProfileMenu';
import { ForbiddenPage, NotFoundPage } from '../components/StatusPage';
import { OnlineReturns } from '../components/returns/CustomerReturns';
import { HomeLayoutEditor } from '../components/store/HomeLayoutEditor';
import { StoreBanners, StoreContent, StoreOrders, StoreProducts } from '../components/store/StorePanels';
import { useCan } from '../features/auth/permissions';
import { CustomersDesktop } from '../views/desktop/customers/CustomersDesktop';
import { CustomersMobile } from '../views/mobile/customers/CustomersMobile';
import { AuthGate } from './auth-gate';
import { ResponsiveView, useView } from './view';

interface Section { key: string; label: string; icon: LucideIcon; perm: string; title: string; about: string }
/** What the Online store needs, and nothing else. Everything else stays in the admin. */
const SECTIONS: Section[] = [
  { key: 'orders', label: 'Orders', icon: ShoppingBag, perm: 'orders.view', title: 'Online orders', about: 'Orders placed on the website. Move them along: packed, shipped, delivered.' },
  { key: 'returns', label: 'Returns', icon: Undo2, perm: 'orders.view', title: 'Online returns', about: 'Return requests from website orders: approve, mark received, refund.' },
  { key: 'products', label: 'Products', icon: Tag, perm: 'items.view', title: 'Products and photos', about: 'What is shown on the website, with photos. Prices and sizes are in the admin.' },
  { key: 'home', label: 'Home page', icon: Home, perm: 'cms.view', title: 'Home page', about: 'Every section and card of the website home page. Change headings, pictures and links, hide a section, or move it.' },
  { key: 'banners', label: 'Banners', icon: Image, perm: 'cms.view', title: 'Banners', about: 'Pictures at the top of the website home page.' },
  { key: 'content', label: 'Content', icon: FileText, perm: 'cms.view', title: 'Website pages', about: 'About, Contact, Privacy, Terms and Refund pages.' },
  { key: 'customers', label: 'Customers', icon: Users, perm: 'customers.view', title: 'Online customers', about: 'People who signed up on the website.' },
];

function useSections() {
  const can = useCan();
  return SECTIONS.filter((s) => can(s.perm));
}

function Body({ k, compact }: { k: string; compact: boolean }) {
  switch (k) {
    case 'orders': return <StoreOrders />;
    case 'returns': return <OnlineReturns />;
    case 'products': return <StoreProducts compact={compact} />;
    case 'home': return <HomeLayoutEditor />;
    case 'banners': return <StoreBanners compact={compact} />;
    case 'content': return <StoreContent compact={compact} />;
    default: return <ResponsiveView desktop={<CustomersDesktop onlyOnline />} mobile={<CustomersMobile onlyOnline />} />;
  }
}

function Page({ section }: { section: Section }) {
  const { view } = useView();
  const compact = view === 'mobile';
  return (
    <div>
      {section.key === 'customers' ? null : <PageHeader title={section.title} description={section.about} />}
      <Suspense fallback={<ListSkeleton label="Loading" />}><Body k={section.key} compact={compact} /></Suspense>
    </div>
  );
}

const link = (on: boolean) => `tk-press flex min-h-10 items-center gap-3 rounded-full px-3 text-sm ${on ? 'bg-orange font-bold text-navy shadow-soft' : 'font-medium text-white hover:bg-white/15'}`;

function DesktopStoreShell() {
  const sections = useSections();
  return (
    <div className="flex min-h-screen bg-navy-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:p-2">Skip to content</a>
      <aside aria-label="Online store menu" className="sticky top-0 m-3 mr-0 flex h-[calc(100vh-1.5rem)] w-60 shrink-0 flex-col overflow-y-auto rounded-2xl bg-navy text-white shadow-lift">
        <Link to="/store" className="block px-3 py-4" aria-label="Online store home"><Logo variant="sidebar" tile className="w-full" /></Link>
        <p className="tk-eyebrow px-5 pb-2 text-teal">Online store</p>
        <nav className="flex-1 px-2 pb-4"><ul>{sections.map((s) => <li key={s.key}><NavLink to={`/store/${s.key}`} className={({ isActive }) => link(isActive)}><s.icon aria-hidden size={16} />{s.label}</NavLink></li>)}</ul></nav>
        <Link to="/" className="tk-press m-3 flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-white/60 text-sm font-semibold hover:bg-white hover:text-navy"><ArrowLeft aria-hidden size={14} />Back to admin</Link>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 bg-navy-50 px-6 pb-3 pt-3"><header className="flex items-center justify-between gap-4 rounded-full bg-white px-5 py-2 shadow-soft"><span className="text-sm font-bold">Online store</span><ProfileMenu /></header></div>
        <main id="main" className="flex-1 px-6 py-6"><div className="min-h-full rounded-2xl bg-white p-6 shadow-soft"><Suspense fallback={<ListSkeleton label="Loading screen" />}><Outlet /></Suspense></div></main>
      </div>
    </div>
  );
}

function MobileStoreShell() {
  const sections = useSections();
  const { pathname } = useLocation();
  const main = sections.slice(0, 4);
  const more = pathname === '/store/more' || sections.slice(4).some((s) => pathname.startsWith(`/store/${s.key}`));
  const tab = 'tk-press flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold';
  return (
    <div className="flex min-h-screen flex-col bg-navy-50">
      <header className="sticky top-0 z-40 flex items-center justify-between rounded-b-3xl bg-navy px-5 py-3 text-white shadow-lift"><h1 className="text-xl">Online store</h1><Logo variant="mark" tile className="h-9 w-9 !p-0.5" /></header>
      <main id="main" className="flex-1 px-4 pb-44 pt-4"><Suspense fallback={<ListSkeleton label="Loading screen" />}><Outlet /></Suspense></main>
      <nav aria-label="Online store tabs" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex gap-1 rounded-full bg-white p-1.5 shadow-lift ring-2 ring-navy-100">
        {main.map((s) => <NavLink key={s.key} to={`/store/${s.key}`} className={({ isActive }) => `${tab} ${isActive ? 'bg-navy text-white' : 'text-navy'}`}><s.icon aria-hidden size={20} />{s.label}</NavLink>)}
        <NavLink to="/store/more" className={() => `${tab} ${more ? 'bg-navy text-white' : 'text-navy'}`}><Menu aria-hidden size={20} />More</NavLink>
      </nav>
    </div>
  );
}

function StoreShell() {
  return useView().view === 'mobile' ? <MobileStoreShell /> : <DesktopStoreShell />;
}

function More() {
  const sections = useSections().slice(4);
  return (
    <ul className="divide-y divide-line rounded border-2 border-navy-100">
      {sections.map((s) => <li key={s.key}><Link to={`/store/${s.key}`} className="flex min-h-12 items-center gap-3 px-4 text-sm"><s.icon aria-hidden size={18} />{s.label}</Link></li>)}
      <li><Link to="/" className="flex min-h-12 items-center gap-3 px-4 text-sm"><ArrowLeft aria-hidden size={18} />Back to admin</Link></li>
    </ul>
  );
}

/** Old links: /store?tab=orders and so on land on the right section. */
function StoreHome() {
  const [sp] = useSearchParams();
  const sections = useSections();
  const want = sp.get('tab');
  const first = sections.find((s) => s.key === want) ?? sections[0];
  return first ? <Navigate to={`/store/${first.key}`} replace /> : <ForbiddenPage />;
}

function Guard({ section, children }: { section: Section; children: ReactNode }) {
  return useCan()(section.perm) ? <>{children}</> : <ForbiddenPage />;
}

/**
 * The Online store module: its own route group (/store/*), its own sidebar and its own layout, with the same sign in as the admin.
 * Stock, prices and costs are the same records as the admin's: an online sale reduces the same stock. Loaded as its own chunk.
 */
export function StoreApp() {
  return (
    <Routes>
      {/* This app is mounted on the splat route /store/*, so these paths are relative to /store (the same as in billing-app.tsx). */}
      <Route element={<AuthGate />}>
        <Route element={<StoreShell />}>
          <Route index element={<StoreHome />} />
          <Route path="more" element={<More />} />
          {SECTIONS.map((s) => <Route key={s.key} path={s.key} element={<Guard section={s}><Page section={s} /></Guard>} />)}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
