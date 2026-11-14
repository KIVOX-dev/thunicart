import { Suspense, useEffect, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation, useNavigate, type RouteObject } from 'react-router-dom';
import { ListSkeleton } from '@thunikart/ui';
import { StyleGuide } from '@thunikart/ui';
import { ComingSoon } from '../components/ComingSoon';
import { ForbiddenPage, NotFoundPage, StatusPage } from '../components/StatusPage';
import { setAuthFailureHandler } from '../features/api/http';
import { useCan, useGstMode, useIsCounterOnly } from '../features/auth/permissions';
import { BILLING_ROUTES, BillingGate, BillingLogin, BillingScreen } from './billing';
import { useSession } from '../features/auth/use-session';
import { LoginDesktop } from '../views/desktop/auth/LoginDesktop';
import { LoginMobile } from '../views/mobile/auth/LoginMobile';
import { ForgotDesktop } from '../views/desktop/auth/ForgotDesktop';
import { ForgotMobile } from '../views/mobile/auth/ForgotMobile';
import { MODULES_REGISTRY, type AppModule } from './modules';
import { DesktopShell } from './shell-desktop';
import { MobileShell } from './shell-mobile';
import { ResponsiveView, useView } from './view';

function AuthGate() {
  const { data: me, isPending, error } = useSession();
  const counterOnly = useIsCounterOnly();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    setAuthFailureHandler(() => nav('/login', { state: { from: loc.pathname }, replace: true }));
    return () => setAuthFailureHandler(null);
  }, [nav, loc.pathname]);
  if (isPending) return <div className="p-6"><ListSkeleton label="Signing you in" /></div>;
  if (error) return <StatusPage code="Oops" title="Cannot load your account" body="We could not reach the server. Check your connection and reload." />;
  if (!me) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  // Counter staff only ever see the billing area.
  if (counterOnly) return <Navigate to="/billing" replace />;
  return <Outlet />;
}

function Shell() {
  return useView().view === 'mobile' ? <MobileShell /> : <DesktopShell />;
}

/** Permission and GST mode guard for one module screen. A 403 from the API is handled by each screen too. */
function ModuleRoute({ mod }: { mod: AppModule }) {
  const can = useCan();
  const gst = useGstMode();
  if (!can(mod.perm)) return <ForbiddenPage />;
  if (mod.gstOnly && gst === 'off') return <StatusPage code="GST" title="GST is not switched on" body="Save a valid GSTIN in the Business profile to turn GST on." />;
  if (mod.later) return <ComingSoon label={mod.label} phase={mod.later} />;
  const D = mod.desktop!;
  const M = mod.mobile!;
  return <Suspense fallback={<ListSkeleton label="Loading screen" />}><ResponsiveView desktop={<D />} mobile={<M />} /></Suspense>;
}

function Public({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

/** The start page is the Dashboard for anyone who may view reports, and the Home links for everyone else. */
function StartPage() {
  const can = useCan();
  return can('reports.view') ? <Navigate to="/dashboard" replace /> : <ModuleRoute mod={MODULES_REGISTRY[0]!} />;
}
function Forward({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}
function Guard({ perm, children }: { perm: string; children: ReactNode }) {
  return useCan()(perm) ? <>{children}</> : <ForbiddenPage />;
}
const billingPaths = ['/billing', '/billing/bills', '/billing/lookup', '/billing/b2b', '/billing/print'];
const billingChildren: RouteObject[] = billingPaths.map((path) => {
  const r = BILLING_ROUTES.find((x) => x.path === path && !x.tab)!;
  return { path: path === '/billing' ? undefined : path.replace('/billing/', ''), index: path === '/billing', element: <Guard perm={r.perm}><BillingScreen route={r} /></Guard> };
});
const moduleRoutes: RouteObject[] = MODULES_REGISTRY.map((m) => ({ path: m.path === '/' ? undefined : m.path, index: m.path === '/', element: m.path === '/' ? <StartPage /> : <ModuleRoute mod={m} /> }));

export const router = createBrowserRouter([
  { path: '/billing/login', element: <Public><BillingLogin /></Public> },
  { path: '/billing', element: <BillingGate />, children: billingChildren },
  { path: '/pos', element: <Forward to="/billing" /> },
  { path: '/sales', element: <Forward to="/billing/bills" /> },
  { path: '/sales/b2b', element: <Forward to="/billing/b2b" /> },
  { path: '/settings/print', element: <Forward to="/billing/print" /> },
  { path: '/login', element: <Public><ResponsiveView desktop={<LoginDesktop />} mobile={<LoginMobile />} /></Public> },
  { path: '/forgot-password', element: <Public><ResponsiveView desktop={<ForgotDesktop />} mobile={<ForgotMobile />} /></Public> },
  { path: '/style-guide', element: <Public><StyleGuide /></Public> },
  {
    element: <AuthGate />,
    children: [{
      element: <Shell />,
      children: [
        ...moduleRoutes,
        { path: '/more', element: <ModuleRoute mod={MODULES_REGISTRY[0]!} /> },
        { path: '/forbidden', element: <ForbiddenPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    }],
  },
], {
  // On Vercel the admin is served under /admin/ (VITE_BASE). Locally it stays at the root.
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || undefined,
});
