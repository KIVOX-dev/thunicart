import { Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { ListSkeleton, StyleGuide } from '@thunikart/ui';
import { LoginDesktop } from '../views/desktop/auth/LoginDesktop';
import { LoginMobile } from '../views/mobile/auth/LoginMobile';
import { ForgotDesktop } from '../views/desktop/auth/ForgotDesktop';
import { ForgotMobile } from '../views/mobile/auth/ForgotMobile';
import { ResetPasswordPage } from '../views/desktop/auth/ResetPasswordPage';
import { ResponsiveView } from './view';

function Public({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

/** Old addresses keep working: bookmarks and links go to where the screen lives now. A query in `to` wins over the one on the old address. */
function Forward({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={to.includes('?') ? to : `${to}${search}`} replace />;
}

const fallback = <div className="p-6"><ListSkeleton label="Loading screen" /></div>;

export const router = createBrowserRouter([
  // The Billing Center and the admin are two separate route groups, each loaded as its own chunk. Opening /billing never loads the admin shell.
  { path: '/billing/*', lazy: async () => ({ Component: (await import('./billing-app')).BillingApp, HydrateFallback: () => fallback }) },
  { path: '/store/*', lazy: async () => ({ Component: (await import('./store-app')).StoreApp, HydrateFallback: () => fallback }) },
  { path: '/pos', element: <Forward to="/billing" /> },
  { path: '/sales', element: <Forward to="/billing/bills" /> },
  { path: '/sales/b2b', element: <Forward to="/billing/b2b" /> },
  { path: '/settings/print', element: <Forward to="/billing/print" /> },
  // Moved or merged screens
  { path: '/settings/roles', element: <Forward to="/settings/users?tab=roles" /> },
  { path: '/exports', element: <Forward to="/reports" /> },
  { path: '/cms', element: <Forward to="/store/content" /> },
  { path: '/orders', element: <Forward to="/store/orders" /> },
  { path: '/stock/transfers', element: <Forward to="/returns?tab=transfers" /> },
  { path: '/login', element: <Public><ResponsiveView desktop={<LoginDesktop />} mobile={<LoginMobile />} /></Public> },
  { path: '/forgot-password', element: <Public><ResponsiveView desktop={<ForgotDesktop />} mobile={<ForgotMobile />} /></Public> },
  { path: '/style-guide', element: <Public><StyleGuide /></Public> },
  { path: '/reset-password', element: <Public><ResetPasswordPage /></Public> },
  { path: '*', lazy: async () => ({ Component: (await import('./admin-app')).AdminApp, HydrateFallback: () => fallback }) },
], {
  // On Vercel the admin is served under /admin/ (VITE_BASE). Locally it stays at the root.
  // The Billing center is also served at /billing (no /admin in the address), so the routes are matched from the root there.
  basename: /^\/billing(\/|$)/.test(window.location.pathname) ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '') || undefined,
});
