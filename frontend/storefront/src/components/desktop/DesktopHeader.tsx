'use client';
import Link from 'next/link';
import type { Category } from '@/lib/types';
import { Icon } from '../shared/Icon';
import { useCart } from '../shared/cart-context';
import { useUi } from '../shared/ui-context';
import { useWish } from '../shared/wish-context';
import { Photo, isDrawnArt } from '@/components/shared/Photo';

/** Desktop header: menu button left, centered logo, search and bag on the right, and a row of uppercase category links with a mega menu. */
export function DesktopHeader({ categories }: { categories: Category[] }) {
  const ui = useUi();
  const cart = useCart();
  const wish = useWish();
  const link = 'tk-press relative flex min-h-10 items-center rounded-full px-4 text-[13px] font-bold uppercase tracking-wider text-navy hover:bg-navy hover:text-white';
  const icon = 'tk-press flex h-11 w-11 items-center justify-center rounded-full bg-navy-50 text-navy hover:bg-navy hover:text-white';
  return (
    <header className="sticky top-0 z-30 hidden bg-white/95 shadow-soft backdrop-blur md:block">
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-6 py-3">
        <button type="button" onClick={() => ui.setMenuOpen(true)} aria-label="Open menu" className={icon}><Icon name="menu" /></button>
        <Link href="/" aria-label="Thunikart home"><picture><img src="/logo-sidebar.png" alt="Thunikart by Krishnas Orchids" width={180} height={60} className="h-14 w-auto" /></picture></Link>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => ui.setSearchOpen(true)} aria-label="Search" className={icon}><Icon name="search" /></button>
          <Link href="/account/wishlist" aria-label={`Wishlist, ${wish.ids.length} items`} className={`${icon} relative`}><Icon name="heart" />{wish.ids.length > 0 && <span className="absolute right-1 top-1 rounded-full bg-orange px-1.5 text-[10px] font-bold text-navy ring-2 ring-white">{wish.ids.length}</span>}</Link>
          <Link href="/account" aria-label="Account" className={icon}><Icon name="user" /></Link>
          <button type="button" onClick={() => cart.setDrawerOpen(true)} aria-label={`Open bag, ${cart.count} items`} className={`${icon} relative`}><Icon name="bag" />{cart.count > 0 && <span data-testid="bag-count" className="absolute right-1 top-1 rounded-full bg-orange px-1.5 text-[10px] font-bold text-navy ring-2 ring-white">{cart.count}</span>}</button>
        </div>
      </div>
      <nav aria-label="Categories" className="mx-auto max-w-7xl px-6">
        <ul className="flex items-center justify-center gap-2 pb-3">
          {categories.map((c) => (
            <li key={c.slug} className="group relative">
              <Link href={`/c/${c.slug}`} className={link}>{c.name}</Link>
              <div className="invisible absolute left-1/2 top-full z-30 w-[36rem] -translate-x-1/2 rounded-xl border-2 border-navy-100 bg-white p-6 opacity-0 shadow-overlay transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="grid grid-cols-[1fr_10rem] gap-6">
                  <ul>{c.children.map((s) => <li key={s.slug}><Link href={`/c/${s.slug}`} className="tk-press flex min-h-11 items-center rounded-full px-3 text-sm font-medium hover:bg-teal-100">{s.name}</Link></li>)}<li><Link href={`/c/${c.slug}`} className="tk-press flex min-h-11 items-center rounded-full bg-orange px-4 text-sm font-bold text-navy">Shop all {c.name}</Link></li></ul>
                  
                  {!isDrawnArt(c.image) && <Photo src={c.image} alt="" width={160} height={200} className="h-40 w-40 rounded-lg object-cover" />}
                </div>
              </div>
            </li>
          ))}
          <li><Link href="/c/sale" className={`${link} bg-orange text-navy hover:bg-navy hover:text-white`}>Sale</Link></li>
          <li><Link href="/c/bestseller" className={`${link} bg-teal text-navy hover:bg-navy hover:text-white`}>Bestseller</Link></li>
        </ul>
      </nav>
    </header>
  );
}
