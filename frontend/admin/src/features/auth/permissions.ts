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
