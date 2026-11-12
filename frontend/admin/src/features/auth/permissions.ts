import { useSession } from './use-session';

/** True when the logged in user holds the permission. Hiding is a convenience only: the backend is the real gate. */
export function useCan() {
  const { data: me } = useSession();
  return (perm?: string) => !perm || !!me && (me.role.isAdmin || me.permissions.includes(perm));
}

export function useGstMode(): 'on' | 'off' {
  const { data: me } = useSession();
  return me?.gst.gstMode ?? 'off';
}

/** What a store counter employee may hold. A role with billing and nothing beyond this never sees the admin app. */
export const COUNTER_PERMISSIONS = new Set(['pos.view', 'pos.create', 'sales.view', 'sales.create', 'customers.view', 'customers.create', 'customers.edit', 'items.view', 'stock.view', 'orders.view']);
export function useIsCounterOnly(): boolean {
  const { data: me } = useSession();
  return !!me && !me.role.isAdmin && me.permissions.includes('pos.view') && me.permissions.every((k) => COUNTER_PERMISSIONS.has(k));
}
