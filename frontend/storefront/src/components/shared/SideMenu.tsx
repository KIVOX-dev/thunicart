'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Drawer } from '@thunikart/ui';
import type { Category } from '@/lib/types';
import { Icon } from './Icon';
import { useUi } from './ui-context';

const QUICK = [
  { href: '/c/new-arrivals', label: 'New arrivals' }, { href: '/c/sale', label: 'Sale' }, { href: '/c/bestseller', label: 'Bestseller' }, { href: '/blog', label: 'Blog and lookbook' },
  { href: '/pages/about', label: 'About us' }, { href: '/pages/contact', label: 'Contact' }, { href: '/account/orders', label: 'Track my order' },
];

/** Side menu drawer: expandable categories (a small picture tile each, sub lists inside) and quick links. */
export function SideMenu({ categories }: { categories: Category[] }) {
  const { menuOpen, setMenuOpen } = useUi();
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setMenuOpen(false);
  return (
    <Drawer side="left" open={menuOpen} onClose={close} title="Menu">
      <nav aria-label="Shop by category">
        <ul>
          {categories.map((c) => (
            <li key={c.slug} className="border-b border-line">
              <div className="flex items-center">
                <Link href={`/c/${c.slug}`} onClick={close} className="flex min-h-14 flex-1 items-center gap-3 text-sm font-medium uppercase tracking-wider">
                  
                  <img src={c.image} alt="" width={40} height={40} className="h-10 w-10 rounded-sm object-cover" />{c.name}
                </Link>
                <button type="button" onClick={() => setOpen(open === c.slug ? null : c.slug)} aria-expanded={open === c.slug} aria-label={`${c.name} sub categories`} className="flex h-11 w-11 items-center justify-center"><Icon name="down" size={18} className={open === c.slug ? 'rotate-180' : ''} /></button>
              </div>
              {open === c.slug && <ul className="pb-2 pl-14">{c.children.map((s) => <li key={s.slug}><Link href={`/c/${s.slug}`} onClick={close} className="flex min-h-11 items-center text-sm text-muted hover:text-navy">{s.name}</Link></li>)}</ul>}
            </li>
          ))}
        </ul>
      </nav>
      <ul className="mt-4" aria-label="Quick links">
        {QUICK.map((q) => <li key={q.href}><Link href={q.href} onClick={close} className={`flex min-h-11 items-center text-sm ${q.label === 'Sale' || q.label === 'Bestseller' ? 'font-semibold underline decoration-orange decoration-2 underline-offset-4' : ''}`}>{q.label}</Link></li>)}
      </ul>
    </Drawer>
  );
}
