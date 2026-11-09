import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from '../features/auth/use-session';

export type ViewName = 'mobile' | 'desktop';
type Pref = 'auto' | ViewName;
const QUERY = '(min-width: 768px)';

interface Ctx { view: ViewName; pref: Pref; setPref: (p: Pref) => void; naturalView: ViewName }
const ViewCtx = createContext<Ctx>({ view: 'desktop', pref: 'auto', setPref: () => {}, naturalView: 'desktop' });

function readPref(userId: string): Pref {
  try {
    const v = localStorage.getItem(`tk.view.${userId}`);
    return v === 'mobile' || v === 'desktop' ? v : 'auto';
  } catch { return 'auto'; }
}

/** Chooses the mobile or desktop view by screen width (768 px), with a per user override remembered on the device. */
export function ViewProvider({ children }: { children: ReactNode }) {
  const { data: me } = useSession();
  const userId = me?.id ?? 'anon';
  const [wide, setWide] = useState(() => window.matchMedia(QUERY).matches);
  const [pref, setPrefState] = useState<Pref>(() => readPref(userId));
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => setPrefState(readPref(userId)), [userId]);
  const setPref = useCallback((p: Pref) => {
    setPrefState(p);
    try { if (p === 'auto') localStorage.removeItem(`tk.view.${userId}`); else localStorage.setItem(`tk.view.${userId}`, p); } catch { /* storage blocked */ }
  }, [userId]);
  const naturalView: ViewName = wide ? 'desktop' : 'mobile';
  const view = pref === 'auto' ? naturalView : pref;
  const value = useMemo(() => ({ view, pref, setPref, naturalView }), [view, pref, setPref, naturalView]);
  return <ViewCtx.Provider value={value}>{children}</ViewCtx.Provider>;
}

export const useView = () => useContext(ViewCtx);

/** Renders the desktop or mobile component for the active view. */
export function ResponsiveView({ desktop, mobile }: { desktop: ReactNode; mobile: ReactNode }) {
  return <>{useView().view === 'mobile' ? mobile : desktop}</>;
}
