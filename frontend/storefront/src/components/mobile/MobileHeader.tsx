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
    <header className="sticky top-0 z-30 border-b border-line bg-white md:hidden">
      <div className="grid grid-cols-[auto_1fr_auto] items-center px-2 py-1">
        <button type="button" onClick={() => ui.setMenuOpen(true)} aria-label="Open menu" className="flex h-11 w-11 items-center justify-center"><Icon name="menu" /></button>
        <Link href="/" aria-label="Thunikart home" className="justify-self-center"><img src="/logo-sidebar.png" alt="Thunikart by Krishnas Orchids" width={140} height={46} className="h-9 w-auto" /></Link>
        <div className="flex">
          <button type="button" onClick={() => ui.setSearchOpen(true)} aria-label="Search" className="flex h-11 w-11 items-center justify-center"><Icon name="search" /></button>
          <button type="button" onClick={() => cart.setDrawerOpen(true)} aria-label={`Open bag, ${cart.count} items`} className="relative flex h-11 w-11 items-center justify-center"><Icon name="bag" />{cart.count > 0 && <span className="absolute right-1 top-1 rounded-full bg-orange px-1 text-[10px] font-semibold text-navy">{cart.count}</span>}</button>
        </div>
      </div>
      <nav aria-label="Categories" className="overflow-x-auto border-t border-line [scrollbar-width:none]">
        <ul className="flex gap-2 px-3 py-2">
          {categories.map((c) => <li key={c.slug} className="shrink-0"><Link href={`/c/${c.slug}`} className="flex min-h-11 items-center rounded-sm border border-line px-3 text-xs font-medium uppercase tracking-wider">{c.name}</Link></li>)}
          <li className="shrink-0"><Link href="/c/sale" className="flex min-h-11 items-center rounded-sm border-2 border-orange px-3 text-xs font-semibold uppercase tracking-wider">Sale</Link></li>
        </ul>
      </nav>
    </header>
  );
}
