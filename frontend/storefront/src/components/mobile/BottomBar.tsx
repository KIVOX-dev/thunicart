'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '../shared/Icon';
import { useCart } from '../shared/cart-context';
import { useUi } from '../shared/ui-context';

/** Mobile bottom bar: Home, Categories, Wishlist, Cart and Account. */
export function BottomBar() {
  const path = usePathname();
  const ui = useUi();
  const cart = useCart();
  const item = 'tk-press flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold';
  const on = (p: string) => (path === p ? 'bg-navy text-white' : 'text-navy');
  return (
    <nav aria-label="Main tabs" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex gap-1 rounded-full bg-white p-1.5 shadow-lift ring-2 ring-navy-100 md:hidden">
      <Link href="/" className={`${item} ${on('/')}`}><Icon name="home" />Home</Link>
      <button type="button" onClick={() => ui.setMenuOpen(true)} className={`${item} text-navy`}><Icon name="grid" />Categories</button>
      <Link href="/account/wishlist" className={`${item} ${on('/account/wishlist')}`}><Icon name="heart" />Wishlist</Link>
      <Link href="/cart" className={`${item} ${on('/cart')} relative`}><Icon name="bag" />Cart{cart.count > 0 && <span className="absolute right-[28%] top-1 rounded-full bg-orange px-1.5 text-[10px] font-bold text-navy">{cart.count}</span>}</Link>
      <Link href="/account" className={`${item} ${on('/account')}`}><Icon name="user" />Account</Link>
    </nav>
  );
}
