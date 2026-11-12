'use client';
import Link from 'next/link';
import type { Category } from '@/lib/types';
import { Icon } from '../shared/Icon';
import { useCart } from '../shared/cart-context';
import { useUi } from '../shared/ui-context';
import { useWish } from '../shared/wish-context';

/** Desktop header: menu button left, centered logo, search and bag on the right, and a row of uppercase category links with a mega menu. */
export function DesktopHeader({ categories }: { categories: Category[] }) {
  const ui = useUi();
  const cart = useCart();
  const wish = useWish();
  const link = 'relative flex min-h-11 items-center text-[13px] font-medium uppercase tracking-heading text-navy hover:text-muted';
  return (
    <header className="hidden border-b border-line bg-white md:block">
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-6 py-3">
        <button type="button" onClick={() => ui.setMenuOpen(true)} aria-label="Open menu" className="flex h-11 w-11 items-center justify-center"><Icon name="menu" /></button>
        <Link href="/" aria-label="Thunikart home"><picture><img src="/logo-sidebar.png" alt="Thunikart by Krishnas Orchids" width={180} height={60} className="h-12 w-auto" /></picture></Link>
        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={() => ui.setSearchOpen(true)} aria-label="Search" className="flex h-11 w-11 items-center justify-center"><Icon name="search" /></button>
          <Link href="/account/wishlist" aria-label={`Wishlist, ${wish.ids.length} items`} className="relative flex h-11 w-11 items-center justify-center"><Icon name="heart" />{wish.ids.length > 0 && <span className="absolute right-1 top-1 rounded-full bg-orange px-1 text-[10px] font-semibold text-navy">{wish.ids.length}</span>}</Link>
          <Link href="/account" aria-label="Account" className="flex h-11 w-11 items-center justify-center"><Icon name="user" /></Link>
          <button type="button" onClick={() => cart.setDrawerOpen(true)} aria-label={`Open bag, ${cart.count} items`} className="relative flex h-11 w-11 items-center justify-center"><Icon name="bag" />{cart.count > 0 && <span data-testid="bag-count" className="absolute right-1 top-1 rounded-full bg-orange px-1 text-[10px] font-semibold text-navy">{cart.count}</span>}</button>
        </div>
      </div>
      <nav aria-label="Categories" className="mx-auto max-w-7xl px-6">
        <ul className="flex items-center justify-center gap-8">
          {categories.map((c) => (
            <li key={c.slug} className="group relative">
              <Link href={`/c/${c.slug}`} className={link}>{c.name}</Link>
              <div className="invisible absolute left-1/2 top-full z-30 w-[34rem] -translate-x-1/2 border border-line bg-white p-5 opacity-0 shadow-overlay transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="grid grid-cols-[1fr_10rem] gap-6">
                  <ul>{c.children.map((s) => <li key={s.slug}><Link href={`/c/${s.slug}`} className="flex min-h-11 items-center text-sm hover:underline">{s.name}</Link></li>)}<li><Link href={`/c/${c.slug}`} className="flex min-h-11 items-center text-sm font-semibold">Shop all {c.name}</Link></li></ul>
                  
                  <img src={c.image} alt="" width={160} height={200} className="h-40 w-40 rounded-sm object-cover" />
                </div>
              </div>
            </li>
          ))}
          <li><Link href="/c/sale" className={`${link} border-b-2 border-orange`}>Sale</Link></li>
          <li><Link href="/c/bestseller" className={`${link} border-b-2 border-orange`}>Bestseller</Link></li>
        </ul>
      </nav>
    </header>
  );
}
