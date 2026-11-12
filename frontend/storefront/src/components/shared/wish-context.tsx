'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const KEY = 'tk_wish';
const RECENT = 'tk_recent';
interface Ctx { ids: string[]; has: (id: string) => boolean; toggle: (id: string) => void; recent: string[]; seen: (id: string) => void; compare: string[]; toggleCompare: (id: string) => void }
const WishCtx = createContext<Ctx | null>(null);
export const useWish = () => { const c = useContext(WishCtx); if (!c) throw new Error('WishProvider is missing'); return c; };

const read = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) ?? '[]') as string[]; } catch { return []; } };
const write = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

/** Wishlist, recently viewed and the compare list. Kept on this device so they work before signing in. */
export function WishProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  useEffect(() => { setIds(read(KEY)); setRecent(read(RECENT)); setCompare(read('tk_compare')); }, []);
  const value = useMemo<Ctx>(() => ({
    ids, recent, compare, has: (id) => ids.includes(id),
    toggle: (id) => setIds((s) => { const n = s.includes(id) ? s.filter((x) => x !== id) : [...s, id]; write(KEY, n); return n; }),
    seen: (id) => setRecent((s) => { const n = [id, ...s.filter((x) => x !== id)].slice(0, 12); write(RECENT, n); return n; }),
    toggleCompare: (id) => setCompare((s) => { const n = s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-4); write('tk_compare', n); return n; }),
  }), [ids, recent, compare]);
  return <WishCtx.Provider value={value}>{children}</WishCtx.Provider>;
}
