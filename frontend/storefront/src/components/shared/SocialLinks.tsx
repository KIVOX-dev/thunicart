import type { ReactNode } from 'react';

/** Each network drawn in its own colours (the logo colours people know), inside a white round button so it shows on the navy footer. */
const GLYPH: Record<string, ReactNode> = {
  instagram: (
    <>
      <defs>
        <linearGradient id="tk-ig" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FEDA75" /><stop offset=".35" stopColor="#FA7E1E" /><stop offset=".6" stopColor="#D62976" /><stop offset=".85" stopColor="#962FBF" /><stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="url(#tk-ig)" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="#fff" />
    </>
  ),
  facebook: (
    <>
      <circle cx="12" cy="12" r="10" fill="#1877F2" />
      <path d="M13.4 21v-7h2.3l.4-2.8h-2.7V9.5c0-.8.3-1.3 1.4-1.3h1.4V5.7c-.3 0-1.1-.1-2-.1-2.1 0-3.5 1.3-3.5 3.6v2H8.4V14h2.3v7z" fill="#fff" />
    </>
  ),
  youtube: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="4.5" fill="#FF0000" />
      <path d="M10 9l5.2 3L10 15z" fill="#fff" />
    </>
  ),
  whatsapp: (
    <>
      <circle cx="12" cy="12" r="10" fill="#25D366" />
      <path d="M12 5.8a6.2 6.2 0 0 0-5.3 9.4l-.9 3 3.1-.8A6.2 6.2 0 1 0 12 5.8z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.7 9.5c.2 2.2 2.6 4.6 4.9 4.8l.8-1.1-1.6-.8-.7.6c-.8-.3-1.7-1.1-2-2l.6-.7-.8-1.6z" fill="#fff" />
    </>
  ),
  x: (
    <>
      <circle cx="12" cy="12" r="10" fill="#000" />
      <path d="M7.5 7.5l9 9M16.5 7.5l-9 9" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  twitter: (
    <>
      <circle cx="12" cy="12" r="10" fill="#000" />
      <path d="M7.5 7.5l9 9M16.5 7.5l-9 9" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  linkedin: (
    <>
      <rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="#0A66C2" />
      <text x="12" y="17" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">in</text>
    </>
  ),
};

/** The icon row for the footer. A network with no drawing here still gets a round button with its first letter, so no link is lost. */
export function SocialLinks({ links }: { links: Array<{ label: string; href: string }> }) {
  return (
    <ul aria-label="Follow us" className="mt-3 flex flex-wrap gap-3">
      {links.map((s) => {
        const key = s.label.trim().toLowerCase().replace(/^twitter.*|^x \(.*/, 'x');
        const glyph = GLYPH[key] ?? GLYPH[s.label.trim().toLowerCase()];
        return (
          <li key={s.label}>
            <a href={s.href} rel="noopener noreferrer" target="_blank" aria-label={s.label} title={s.label} className="tk-press flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-soft hover:scale-105">
              {glyph ? <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>{glyph}</svg> : <span aria-hidden className="text-sm font-extrabold text-navy">{s.label.slice(0, 1).toUpperCase()}</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
