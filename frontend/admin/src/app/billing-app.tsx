import { useEffect, type ReactNode } from 'react';
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
  // While billing is open, installing the app (Android "Install app", iOS "Add to Home Screen") names it "Thunikart Billing" and starts it on billing.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const ios = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]') ?? Object.assign(document.createElement('meta'), { name: 'apple-mobile-web-app-title' });
    const before = { href: link?.getAttribute('href') ?? null, title: document.title, ios: ios.content };
    link?.setAttribute('href', `${import.meta.env.BASE_URL}billing.webmanifest`);
    ios.content = 'Thunikart Billing'; document.head.appendChild(ios); document.title = 'Thunikart Billing';
    return () => { if (before.href) link?.setAttribute('href', before.href); ios.content = before.ios || 'Thunikart Admin'; document.title = before.title; };
  }, []);
  return (
    <Routes>
      {/* Paths are relative to /billing: this app is mounted on the splat route /billing/*. */}
      <Route path="login" element={<BillingLogin />} />
      <Route element={<BillingGate />}>
        {paths.map((path) => {
          const r = BILLING_ROUTES.find((x) => x.path === path && !x.tab)!;
          const element = <Guard perm={r.perm}><BillingScreen route={r} /></Guard>;
          return path === '/billing' ? <Route key={path} index element={element} /> : <Route key={path} path={path.replace('/billing/', '')} element={element} />;
        })}
      </Route>
    </Routes>
  );
}
