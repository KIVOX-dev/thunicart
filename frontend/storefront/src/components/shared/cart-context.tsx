'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { capi } from '@/lib/client-api';
import type { CartLine, CartPricing } from '@/lib/types';

const COOKIE = 'tk_cart';
const readCookie = (): CartLine[] => {
  try {
    const m = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`));
    return m ? (JSON.parse(decodeURIComponent(m.slice(COOKIE.length + 1))) as CartLine[]) : [];
  } catch { return []; }
};
const writeCookie = (lines: CartLine[]) => { document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(lines))}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`; };

interface Ctx {
  lines: CartLine[]; pricing: CartPricing | null; loading: boolean; count: number; ready: boolean;
  coupon: string; setCoupon: (c: string) => void; useWallet: boolean; setUseWallet: (v: boolean) => void;
  add: (variantId: string, qty?: number) => void; setQty: (variantId: string, qty: number) => void; remove: (variantId: string) => void; clear: () => void;
  drawerOpen: boolean; setDrawerOpen: (v: boolean) => void;
}
const CartCtx = createContext<Ctx | null>(null);
export const useCart = () => { const c = useContext(CartCtx); if (!c) throw new Error('CartProvider is missing'); return c; };

/** The guest cart lives in a cookie so the server can read it, and is priced by the API. Nothing is added up in the browser. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [pricing, setPricing] = useState<CartPricing | null>(null);
  const [loading, setLoading] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [useWallet, setUseWallet] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => { setLines(readCookie()); setReady(true); }, []);
  const commit = useCallback((fn: (l: CartLine[]) => CartLine[]) => setLines((l) => { const next = fn(l); writeCookie(next); return next; }), []);

  useEffect(() => {
    if (!ready) return;
    if (!lines.length) { setPricing(null); return; }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const p = await capi<CartPricing>('POST', '/cart/price', { lines, coupon: coupon || null, useWallet }); if (id === seq.current) setPricing(p); } catch { /* keep the last prices */ } finally { if (id === seq.current) setLoading(false); }
    }, 120);
    return () => clearTimeout(t);
  }, [lines, coupon, useWallet, ready]);

  const value = useMemo<Ctx>(() => ({
    lines, pricing, loading, ready, count: lines.reduce((a, l) => a + l.qty, 0), coupon, setCoupon, useWallet, setUseWallet, drawerOpen, setDrawerOpen,
    add: (variantId, qty = 1) => { commit((l) => (l.some((x) => x.variantId === variantId) ? l.map((x) => (x.variantId === variantId ? { ...x, qty: x.qty + qty } : x)) : [...l, { variantId, qty }])); setDrawerOpen(true); },
    setQty: (variantId, qty) => commit((l) => (qty < 1 ? l.filter((x) => x.variantId !== variantId) : l.map((x) => (x.variantId === variantId ? { ...x, qty } : x)))),
    remove: (variantId) => commit((l) => l.filter((x) => x.variantId !== variantId)),
    clear: () => { commit(() => []); setCoupon(''); setUseWallet(false); },
  }), [lines, pricing, loading, ready, coupon, useWallet, drawerOpen, commit]);
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}
