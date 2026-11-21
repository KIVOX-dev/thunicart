import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ListSkeleton } from '@thunikart/ui';
import { StatusPage } from '../components/StatusPage';
import { setAuthFailureHandler } from '../features/api/http';
import { useIsCounterOnly } from '../features/auth/permissions';
import { useSession } from '../features/auth/use-session';

/** Must be signed in. Counter staff (billing only) are sent to the Billing center. Used by the admin and by the Online store module. */
export function AuthGate() {
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
  if (counterOnly) return <Navigate to="/billing" replace />;
  return <Outlet />;
}
