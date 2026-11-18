import { Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ListSkeleton } from '@thunikart/ui';
import { ForbiddenPage, NotFoundPage, StatusPage } from '../components/StatusPage';
import { setAuthFailureHandler } from '../features/api/http';
import { useCan, useGstMode, useIsCounterOnly } from '../features/auth/permissions';
import { useSession } from '../features/auth/use-session';
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
  const D = mod.desktop!;
  const M = mod.mobile!;
  return <Suspense fallback={<ListSkeleton label="Loading screen" />}><ResponsiveView desktop={<D />} mobile={<M />} /></Suspense>;
}

/** The start page is the Dashboard for anyone who may view reports, and the Home links for everyone else. */
function StartPage() {
  const can = useCan();
  return can('reports.view') ? <Navigate to="/dashboard" replace /> : <ModuleRoute mod={MODULES_REGISTRY[0]!} />;
}

/** Every admin screen, behind sign in and the admin shell (desktop sidebar or mobile tabs). Loaded as its own chunk. */
export function AdminApp() {
  return (
    <Routes>
      <Route element={<AuthGate />}>
        <Route element={<Shell />}>
          {MODULES_REGISTRY.map((m) => (m.path === '/' ? <Route key={m.key} index element={<StartPage />} /> : <Route key={m.key} path={m.path} element={<ModuleRoute mod={m} />} />))}
          <Route path="/more" element={<ModuleRoute mod={MODULES_REGISTRY[0]!} />} />
          <Route path="/forbidden" element={<ForbiddenPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
