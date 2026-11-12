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
  const item = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium';
  const on = (p: string) => (path === p ? 'border-t-2 border-teal text-navy' : 'border-t-2 border-transparent text-muted');
  return (
    <nav aria-label="Main tabs" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <Link href="/" className={`${item} ${on('/')}`}><Icon name="home" />Home</Link>
      <button type="button" onClick={() => ui.setMenuOpen(true)} className={`${item} border-t-2 border-transparent text-muted`}><Icon name="grid" />Categories</button>
      <Link href="/account/wishlist" className={`${item} ${on('/account/wishlist')}`}><Icon name="heart" />Wishlist</Link>
      <Link href="/cart" className={`${item} ${on('/cart')} relative`}><Icon name="bag" />Cart{cart.count > 0 && <span className="absolute right-[28%] top-1 rounded-full bg-orange px-1 text-[10px] font-semibold text-navy">{cart.count}</span>}</Link>
      <Link href="/account" className={`${item} ${on('/account')}`}><Icon name="user" />Account</Link>
    </nav>
  );
}
