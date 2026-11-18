import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ForbiddenPage } from '../components/StatusPage';
import { useCan } from '../features/auth/permissions';
import { BILLING_ROUTES, BillingGate, BillingLogin, BillingScreen } from './billing';

function Guard({ perm, children }: { perm: string; children: ReactNode }) {
  return useCan()(perm) ? <>{children}</> : <ForbiddenPage />;
}

const paths = ['/billing', '/billing/bills', '/billing/lookup', '/billing/b2b', '/billing/print'];

/**
 * The Billing Center. Its own route group, layout (BillingGate and its shell) and permissions (pos.*). It is loaded as a separate chunk and never
 * imports the admin shell, the menu or the module registry, so the counter opens full screen without the rest of the admin.
 */
export function BillingApp() {
  return (
    <Routes>
      <Route path="/billing/login" element={<BillingLogin />} />
      <Route path="/billing" element={<BillingGate />}>
        {paths.map((path) => {
          const r = BILLING_ROUTES.find((x) => x.path === path && !x.tab)!;
          const element = <Guard perm={r.perm}><BillingScreen route={r} /></Guard>;
          return path === '/billing' ? <Route key={path} index element={element} /> : <Route key={path} path={path.replace('/billing/', '')} element={element} />;
        })}
      </Route>
    </Routes>
  );
}
