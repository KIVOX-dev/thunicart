import { Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Barcode, FileText, LogOut, Printer, Receipt, ScanLine, PauseCircle, WalletCards } from 'lucide-react';
import { ListSkeleton, Button } from '@thunikart/ui';
import { Logo } from '../components/Logo';
import { StatusPage } from '../components/StatusPage';
import { ErrorBanner } from '../components/ErrorBanner';
import { useCan, useIsCounterOnly } from '../features/auth/permissions';
import { useLoginForm } from '../features/auth/login-forms';
import { useLogout, useSession } from '../features/auth/use-session';
import { Field, Input } from '@thunikart/ui';
import { view } from './modules';
import { ResponsiveView, useView } from './view';

/**
 * The store counter. It is a separate area for employees on the shop floor: barcode billing, held bills, bills and returns, item lookup,
 * counter invoices and print settings. It has no link to the admin app, and a counter only role cannot open the admin app at all.
 */
interface BillingRoute { path: string; label: string; icon: typeof ScanLine; perm: string; desktop: LazyExoticComponent<ComponentType>; mobile: LazyExoticComponent<ComponentType>; tab?: string; mobileNav?: boolean; deskOnly?: boolean }
export const BILLING_ROUTES: BillingRoute[] = [
  { path: '/billing', label: 'Bill', icon: ScanLine, perm: 'pos.view', desktop: view('desktop', 'pos', 'PosDesktop'), mobile: view('mobile', 'pos', 'PosMobile'), mobileNav: true },
  { path: '/billing/bills', label: 'Bills and returns', icon: Receipt, perm: 'pos.view', desktop: view('desktop', 'sales', 'SalesDesktop'), mobile: view('mobile', 'sales', 'SalesMobile'), mobileNav: true },
  { path: '/billing/bills', tab: 'held', label: 'Held bills', icon: PauseCircle, perm: 'pos.view', desktop: view('desktop', 'sales', 'SalesDesktop'), mobile: view('mobile', 'sales', 'SalesMobile'), mobileNav: true },
  { path: '/billing/bills', tab: 'day', label: 'Day close', icon: WalletCards, perm: 'pos.create', desktop: view('desktop', 'sales', 'SalesDesktop'), mobile: view('mobile', 'sales', 'SalesMobile'), mobileNav: true },
  { path: '/billing/lookup', label: 'Item lookup', icon: Barcode, perm: 'items.view', desktop: view('desktop', 'stock', 'LookupDesktop'), mobile: view('mobile', 'stock', 'LookupMobile') },
  { path: '/billing/b2b', label: 'Counter invoice', icon: FileText, perm: 'pos.create', desktop: view('desktop', 'b2b', 'B2bDesktop'), mobile: view('mobile', 'b2b', 'B2bMobile'), deskOnly: true },
  { path: '/billing/print', label: 'Print settings', icon: Printer, perm: 'pos.view', desktop: view('desktop', 'print', 'PrintSettingsDesktop'), mobile: view('mobile', 'print', 'PrintSettingsMobile') },
];

/** Staff must be signed in and allowed to bill. Everyone else goes to the counter sign in. */
export function BillingGate() {
  const { data: me, isPending } = useSession();
  const can = useCan();
  const loc = useLocation();
  const logout = useLogout();
  if (isPending) return <div className="p-6"><ListSkeleton label="Signing you in" /></div>;
  if (!me) return <Navigate to="/billing/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (!can('pos.view')) {
    return <StatusPage code="403" title="Not set up for billing" body="This account cannot use the billing counter. Ask the shop owner to give your role billing access." action={<Button onClick={() => logout.mutate()}>Sign out</Button>} />;
  }
  return <BillingShell />;
}

const isOn = (r: BillingRoute, path: string, search: string) => (r.tab ? path === r.path && new URLSearchParams(search).get('tab') === r.tab : path === r.path && (r.path !== '/billing/bills' || !new URLSearchParams(search).get('tab') || ['bills', 'returns', 'credit'].includes(new URLSearchParams(search).get('tab')!)));

function BillingShell() {
  const { view: v } = useView();
  const { data: me } = useSession();
  const can = useCan();
  const loc = useLocation();
  const nav = useNavigate();
  const logout = useLogout();
  const all = BILLING_ROUTES.filter((r) => can(r.perm) && (v === 'desktop' || !r.deskOnly));
  const title = BILLING_ROUTES.find((r) => isOn(r, loc.pathname, loc.search))?.label ?? 'Billing';
  const signOut = async () => { await logout.mutateAsync(); nav('/billing/login'); };
  const tab = 'tk-press flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold';
  return (
    <div className="flex min-h-screen flex-col bg-navy-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:p-2">Skip to content</a>
      <header className="sticky top-0 z-40 flex items-center gap-4 rounded-b-3xl bg-navy px-5 py-3 text-white shadow-lift">
        <Link to="/billing" aria-label="Billing home"><Logo variant="mark" tile className="h-9 w-9 !p-0.5" /></Link>
        <div className="min-w-0"><p className="tk-eyebrow text-teal">Store billing</p><h1 className="truncate text-sm md:hidden">{title}</h1></div>
        {v === 'desktop' && (
          <nav aria-label="Billing" className="ml-4 flex flex-1 gap-1">
            {all.map((r) => <Link key={r.label} to={r.tab ? `${r.path}?tab=${r.tab}` : r.path} aria-current={isOn(r, loc.pathname, loc.search) ? 'page' : undefined} className={`tk-press flex min-h-10 items-center gap-2 rounded-full px-4 text-sm ${isOn(r, loc.pathname, loc.search) ? 'bg-orange font-bold text-navy shadow-soft' : 'font-medium text-white hover:bg-white/15'}`}><r.icon aria-hidden size={16} />{r.label}</Link>)}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3"><span className="hidden text-xs md:block">{me?.name}<span className="block text-white/70">{me?.role.name}</span></span>
          <button type="button" onClick={signOut} className="tk-press flex min-h-11 items-center gap-1 rounded-full border-2 border-white/60 px-4 text-sm font-semibold hover:bg-white hover:text-navy"><LogOut aria-hidden size={14} />Sign out</button></div>
      </header>
      <main id="main" className="flex-1 px-3 py-4 pb-28 md:px-6 md:pb-6"><div className="min-h-full rounded-2xl bg-white p-4 shadow-soft md:p-6"><Suspense fallback={<ListSkeleton label="Loading screen" />}><Outlet /></Suspense></div></main>
      {v === 'mobile' && (
        <nav aria-label="Billing tabs" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex gap-1 rounded-full bg-white p-1.5 shadow-lift ring-2 ring-navy-100">
          {all.filter((r) => r.mobileNav).map((r) => <NavLink key={r.label} to={r.tab ? `${r.path}?tab=${r.tab}` : r.path} className={() => `${tab} ${isOn(r, loc.pathname, loc.search) ? 'bg-navy text-white' : 'text-navy'}`}><r.icon aria-hidden size={20} />{r.label.replace(' and returns', '').replace(' bills', '')}</NavLink>)}
          <NavLink to="/billing/lookup" className={() => `${tab} ${loc.pathname === '/billing/lookup' ? 'bg-navy text-white' : 'text-navy'}`}><Barcode aria-hidden size={20} />Lookup</NavLink>
        </nav>
      )}
    </div>
  );
}

/** One billing screen: the desktop or the phone version. */
export function BillingScreen({ route }: { route: BillingRoute }) {
  const D = route.desktop;
  const M = route.mobile;
  return <ResponsiveView desktop={<D />} mobile={<M />} />;
}

/** Employee sign in for the counter. It signs in to the same account system, and then only the billing area opens. */
export function BillingLogin() {
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? '/billing';
  const { data: me } = useSession();
  const counterOnly = useIsCounterOnly();
  const { form, submit, banner, busy, demoHint } = useLoginForm(() => nav(from, { replace: true }));
  const { register, formState: { errors } } = form;
  if (me) return <Navigate to={counterOnly || from.startsWith('/billing') ? from : '/billing'} replace />;
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy p-4"><span aria-hidden className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-orange" /><span aria-hidden className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-teal" />
      <form onSubmit={submit} noValidate aria-label="Billing sign in" className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-7 shadow-overlay">
        <Logo variant="primary" className="mx-auto w-40" />
        <h1 className="text-center text-2xl">Store billing sign in</h1>
        <p className="text-center text-xs text-muted">For shop employees. Billing only.</p>
        {banner && <ErrorBanner {...banner} />}
        <Field label="Employee email" required error={errors.email?.message}>{(p) => <Input {...p} type="email" autoComplete="username" autoFocus className="min-h-12" {...register('email')} />}</Field>
        <Field label="Password" required error={errors.password?.message}>{(p) => <Input {...p} type="password" autoComplete="current-password" className="min-h-12" {...register('password')} />}</Field>
        <Button type="submit" variant="primary" size="lg" className="min-h-12" loading={busy}>Sign in to billing</Button>
        {demoHint && <p className="rounded border-2 border-navy-100 bg-mist p-2 text-xs text-muted">Demo mode. Employee: <strong>sales@thunikart.test</strong> with password <strong>Thunikart@123</strong>.</p>}
      </form>
    </div>
  );
}
