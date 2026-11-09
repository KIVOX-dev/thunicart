import { useCan, useGstMode } from '../features/auth/permissions';
import { GROUP_ORDER, MODULES_REGISTRY, type AppModule } from './modules';

/** Modules the logged in user may see, following the permissions and GST mode returned by the API. */
export function useVisibleModules(): AppModule[] {
  const can = useCan();
  const gst = useGstMode();
  return MODULES_REGISTRY.filter((m) => can(m.perm) && (!m.gstOnly || gst === 'on'));
}

export function useMenuGroups() {
  const visible = useVisibleModules().filter((m) => m.key !== 'home' && m.key !== 'profile');
  return GROUP_ORDER.map((g) => ({ group: g, items: visible.filter((m) => m.group === g) })).filter((g) => g.items.length);
}
