'use client';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface Ctx { menuOpen: boolean; setMenuOpen: (v: boolean) => void; searchOpen: boolean; setSearchOpen: (v: boolean) => void }
const UiCtx = createContext<Ctx | null>(null);
export const useUi = () => { const c = useContext(UiCtx); if (!c) throw new Error('UiProvider is missing'); return c; };

export function UiProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const value = useMemo(() => ({ menuOpen, setMenuOpen, searchOpen, setSearchOpen }), [menuOpen, searchOpen]);
  return <UiCtx.Provider value={value}>{children}</UiCtx.Provider>;
}
