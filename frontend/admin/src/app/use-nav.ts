import { matchPath, useLocation } from 'react-router-dom';
import { useCan, useGstMode } from '../features/auth/permissions';
import { GROUP_ORDER, MODULES_REGISTRY, type AppModule } from './modules';

/** Modules the logged in user may see, following the permissions and GST mode returned by the API. */
export function useVisibleModules(): AppModule[] {
  const can = useCan();
  const gst = useGstMode();
  return MODULES_REGISTRY.filter((m) => can(m.perm) && (!m.gstOnly || gst === 'on'));
}

export function useMenuGroups() {
  const visible = useVisibleModules().filter((m) => m.key !== 'home' && m.key !== 'profile' && !m.hidden);
  return GROUP_ORDER.map((g) => ({ group: g, items: visible.filter((m) => m.group === g) })).filter((g) => g.items.length);
}

/** The registry entry for the current URL, including detail pages such as /items/:id. */
export function useCurrentModule(): AppModule | undefined {
  const { pathname } = useLocation();
  return MODULES_REGISTRY.find((m) => matchPath({ path: m.path, end: true }, pathname));
}
