import { matchPath, useLocation } from 'react-router-dom';
import { useCan, useGstMode } from '../features/auth/permissions';
import { MENU, MENU_MORE, MODULES_REGISTRY, type AppModule, type MenuEntry } from './modules';

/** Modules the logged in user may see, following the permissions and GST mode returned by the API. */
export function useVisibleModules(): AppModule[] {
  const can = useCan();
  const gst = useGstMode();
  return MODULES_REGISTRY.filter((m) => can(m.perm) && (!m.gstOnly || gst === 'on'));
}

/** The sidebar and the More page: the owner's menu in order, then the small extras section. Entries the role cannot open are left out. */
export function useMenu(): { main: MenuEntry[]; more: MenuEntry[] } {
  const can = useCan();
  const ok = (e: MenuEntry) => (Array.isArray(e.perm) ? e.perm.some((k) => can(k)) : can(e.perm));
  return { main: MENU.filter(ok), more: MENU_MORE.filter(ok) };
}

/** True when the URL belongs to this menu entry. Longer matches win, so Stock levels (/stock) is not lit while Stock audit (/stock/audits) is open. */
export function isEntryActive(entry: MenuEntry, pathname: string): boolean {
  const hit = (e: MenuEntry) => e.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
  if (!hit(entry)) return false;
  const longest = (e: MenuEntry) => Math.max(0, ...e.match.filter((m) => pathname === m || pathname.startsWith(`${m}/`)).map((m) => m.length));
  return ![...MENU, ...MENU_MORE].some((o) => o.key !== entry.key && hit(o) && longest(o) > longest(entry));
}

/** The registry entry for the current URL, including detail pages such as /items/:id. */
export function useCurrentModule(): AppModule | undefined {
  const { pathname } = useLocation();
  return MODULES_REGISTRY.find((m) => matchPath({ path: m.path, end: true }, pathname));
}
