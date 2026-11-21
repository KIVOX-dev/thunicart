import Link from 'next/link';
import type { Category, Contact } from '@/lib/types';
import { Newsletter } from './Newsletter';
import { SocialLinks } from './SocialLinks';

/** Footer: logo and newsletter, then Quick Shop, Helpful Links and More. Contact details come from the business profile. */
export function Footer({ categories, contact }: { categories: Category[]; contact: Contact }) {
  const col = 'flex flex-col gap-1 text-sm';
  const a = 'flex min-h-11 items-center font-medium hover:text-orange';
  return (
    <footer className="mt-20 hidden rounded-t-[2.5rem] bg-navy text-white md:block">
      <div aria-hidden className="mx-auto flex max-w-7xl gap-2 px-6 pt-8"><span className="h-2 flex-[3] rounded-full bg-orange" /><span className="h-2 flex-[2] rounded-full bg-teal" /><span className="h-2 flex-1 rounded-full bg-white/80" /></div>
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <span className="inline-block rounded-lg bg-white p-3"><img src="/logo-sidebar.png" alt="Thunikart by Krishnas Orchids" width={180} height={60} className="h-12 w-auto" /></span>
          <Newsletter />
        </div>
        <nav aria-label="Quick shop"><h2 className="tk-eyebrow mb-2 text-teal">Quick shop</h2><ul className={col}>{categories.map((c) => <li key={c.slug}><Link className={a} href={`/c/${c.slug}`}>{c.name}</Link></li>)}<li><Link className={a} href="/c/sale">Sale</Link></li></ul></nav>
        <nav aria-label="Helpful links"><h2 className="tk-eyebrow mb-2 text-teal">Helpful links</h2><ul className={col}>{[['About us', '/pages/about'], ['Contact', '/pages/contact'], ['Shipping policy', '/pages/shipping-policy'], ['Refund policy', '/pages/refund-policy'], ['Privacy policy', '/pages/privacy'], ['Terms of service', '/pages/terms']].map(([l, h]) => <li key={h}><Link className={a} href={h!}>{l}</Link></li>)}</ul></nav>
        <div><h2 className="tk-eyebrow mb-2 text-teal">More</h2>
          <ul className={col}><li><Link className={a} href="/blog">Blog and lookbook</Link></li><li><Link className={a} href="/account/orders">Track my order</Link></li><li><Link className={a} href="/compare">Compare products</Link></li></ul>
          <address className="mt-3 text-sm not-italic text-white/85">{contact.address}<br /><a href={`tel:${contact.phone}`} className="underline">{contact.phone}</a><br />{contact.email}</address>
          <SocialLinks links={contact.social} />
        </div>
      </div>
      <p className="border-t border-white/20 px-6 py-4 text-center text-xs text-white/80">© {new Date().getFullYear()} Thunikart by Krishnas Orchids. All rights reserved.</p>
    </footer>
  );
}
