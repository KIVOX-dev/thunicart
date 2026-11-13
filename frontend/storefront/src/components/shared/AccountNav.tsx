'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [['/account', 'Profile'], ['/account/addresses', 'Addresses'], ['/account/orders', 'Orders'], ['/account/wallet', 'Wallet'], ['/account/wishlist', 'Wishlist']] as const;

export function AccountNav() {
  const path = usePathname();
  return (
    <nav aria-label="Account" className="overflow-x-auto md:overflow-visible">
      <ul className="flex gap-2 md:flex-col md:gap-0">
        {LINKS.map(([href, label]) => {
          const on = href === '/account' ? path === href : path.startsWith(href);
          return <li key={href} className="shrink-0"><Link href={href} aria-current={on ? 'page' : undefined} className={`flex min-h-11 items-center rounded-full border-2 px-4 text-sm tk-press md:border-0 md:border-l-2 md:rounded-none ${on ? 'border-navy font-semibold md:border-l-teal' : 'border-line md:border-l-transparent'}`}>{label}</Link></li>;
        })}
      </ul>
    </nav>
  );
}
