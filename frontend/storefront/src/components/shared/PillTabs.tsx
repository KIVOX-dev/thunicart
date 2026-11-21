import Link from 'next/link';

export interface TabLink { key: string; label: string; href: string }

/**
 * Pill tabs in the shopping-app style: a soft tinted bar, upper case labels, and the open tab drawn as an outlined tab that joins the content under it.
 * Plain links, so it works on the server and the back button keeps working. Used for the category tabs, the account pages and similar.
 */
export function PillTabs({ tabs, active, label }: { tabs: TabLink[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="bg-gradient-to-b from-orange-100 to-white">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto border-b-2 border-navy-100 px-3 pt-3 [scrollbar-width:none] md:px-6">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key} className="shrink-0">
              <Link
                href={t.href}
                aria-current={on ? 'page' : undefined}
                className={`tk-press -mb-[2px] flex min-h-12 items-center rounded-t-3xl px-5 text-[13px] uppercase tracking-[0.14em] md:px-7 ${on ? 'border-2 border-b-0 border-navy-200 bg-white/70 font-extrabold text-navy' : 'font-medium text-navy/80 hover:text-navy'}`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
