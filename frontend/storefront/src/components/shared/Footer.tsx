import Link from 'next/link';
import type { Category, Contact } from '@/lib/types';
import { Newsletter } from './Newsletter';

/** Footer: logo and newsletter, then Quick Shop, Helpful Links and More. Contact details come from the business profile. */
export function Footer({ categories, contact }: { categories: Category[]; contact: Contact }) {
  const col = 'flex flex-col gap-1 text-sm';
  const a = 'flex min-h-11 items-center hover:underline';
  return (
    <footer className="mt-16 bg-navy pb-24 text-white md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <span className="inline-block rounded-sm bg-white p-2"><img src="/logo-sidebar.png" alt="Thunikart by Krishnas Orchids" width={180} height={60} className="h-12 w-auto" /></span>
          <Newsletter />
        </div>
        <nav aria-label="Quick shop"><h2 className="mb-2 text-xs">Quick shop</h2><ul className={col}>{categories.map((c) => <li key={c.slug}><Link className={a} href={`/c/${c.slug}`}>{c.name}</Link></li>)}<li><Link className={a} href="/c/sale">Sale</Link></li></ul></nav>
        <nav aria-label="Helpful links"><h2 className="mb-2 text-xs">Helpful links</h2><ul className={col}>{[['About us', '/pages/about'], ['Contact', '/pages/contact'], ['Shipping policy', '/pages/shipping-policy'], ['Refund policy', '/pages/refund-policy'], ['Privacy policy', '/pages/privacy'], ['Terms of service', '/pages/terms']].map(([l, h]) => <li key={h}><Link className={a} href={h!}>{l}</Link></li>)}</ul></nav>
        <div><h2 className="mb-2 text-xs">More</h2>
          <ul className={col}><li><Link className={a} href="/blog">Blog and lookbook</Link></li><li><Link className={a} href="/account/orders">Track my order</Link></li><li><Link className={a} href="/compare">Compare products</Link></li></ul>
          <address className="mt-3 text-sm not-italic text-white/85">{contact.address}<br /><a href={`tel:${contact.phone}`} className="underline">{contact.phone}</a><br />{contact.email}</address>
          <ul className="mt-3 flex gap-4 text-sm">{contact.social.map((s) => <li key={s.label}><a href={s.href} rel="noopener noreferrer" target="_blank" className="flex min-h-11 items-center underline">{s.label}</a></li>)}</ul>
        </div>
      </div>
      <p className="border-t border-white/20 px-6 py-4 text-center text-xs text-white/80">© {new Date().getFullYear()} Thunikart by Krishnas Orchids. All rights reserved.</p>
    </footer>
  );
}
