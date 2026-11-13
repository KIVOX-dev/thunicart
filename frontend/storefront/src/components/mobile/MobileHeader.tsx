'use client';
import Link from 'next/link';
import type { Category } from '@/lib/types';
import { Icon } from '../shared/Icon';
import { useCart } from '../shared/cart-context';
import { useUi } from '../shared/ui-context';

/** Compact mobile header: menu left, logo centered, search and bag right, then horizontal category chips. */
export function MobileHeader({ categories }: { categories: Category[] }) {
  const ui = useUi();
  const cart = useCart();
  return (
    <header className="sticky top-0 z-30 bg-white/95 shadow-soft backdrop-blur md:hidden">
      <div className="grid grid-cols-[auto_1fr_auto] items-center px-2 py-1">
        <button type="button" onClick={() => ui.setMenuOpen(true)} aria-label="Open menu" className="tk-press flex h-11 w-11 items-center justify-center rounded-full bg-navy-50"><Icon name="menu" /></button>
        <Link href="/" aria-label="Thunikart home" className="justify-self-center"><img src="/logo-sidebar.png" alt="Thunikart by Krishnas Orchids" width={140} height={46} className="h-9 w-auto" /></Link>
        <div className="flex">
          <button type="button" onClick={() => ui.setSearchOpen(true)} aria-label="Search" className="tk-press flex h-11 w-11 items-center justify-center rounded-full bg-navy-50"><Icon name="search" /></button>
          <button type="button" onClick={() => cart.setDrawerOpen(true)} aria-label={`Open bag, ${cart.count} items`} className="tk-press relative ml-2 flex h-11 w-11 items-center justify-center rounded-full bg-navy text-white"><Icon name="bag" />{cart.count > 0 && <span className="absolute right-1 top-1 rounded-full bg-orange px-1.5 text-[10px] font-bold text-navy ring-2 ring-white">{cart.count}</span>}</button>
        </div>
      </div>
      <nav aria-label="Categories" className="overflow-x-auto [scrollbar-width:none]">
        <ul className="flex gap-2 px-3 py-2">
          {categories.map((c) => <li key={c.slug} className="shrink-0"><Link href={`/c/${c.slug}`} className="tk-press flex min-h-11 items-center rounded-full bg-navy-50 px-4 text-xs font-bold uppercase tracking-wider active:bg-navy active:text-white">{c.name}</Link></li>)}
          <li className="shrink-0"><Link href="/c/sale" className="tk-press flex min-h-11 items-center rounded-full bg-orange px-4 text-xs font-bold uppercase tracking-wider text-navy">Sale</Link></li>
        </ul>
      </nav>
    </header>
  );
}
