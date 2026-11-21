import Link from 'next/link';
import { Photo, isDrawnArt } from './Photo';

export interface Tile { key: string; label: string; href: string; image?: string | null }

/** Soft tints for the tiles, cycling through the three brand colours. */
const TINTS = ['from-orange-100 to-orange-50', 'from-teal-100 to-teal-50', 'from-navy-100 to-navy-50'];

/**
 * A row of rounded picture tiles with the name under each one. It scrolls sideways on a phone and wraps on a wide screen.
 * A tile without a real photo shows the first letter, so the row never has holes.
 */
export function TileRow({ tiles, label, className = '' }: { tiles: Tile[]; label: string; className?: string }) {
  if (!tiles.length) return null;
  return (
    <ul aria-label={label} className={`mx-auto flex max-w-7xl snap-x gap-3 overflow-x-auto px-3 pb-3 pt-4 [scrollbar-width:none] md:flex-wrap md:gap-5 md:overflow-visible md:px-6 ${className}`}>
      {tiles.map((t, n) => {
        const real = t.image && !isDrawnArt(t.image);
        return (
          <li key={t.key} className="w-[84px] shrink-0 snap-start md:w-[112px]">
            <Link href={t.href} className="tk-press group flex flex-col items-center gap-1.5 text-center">
              <span className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b ${TINTS[n % TINTS.length]} ring-2 ring-transparent group-hover:ring-navy-200`}>
                {real ? <Photo src={t.image!} alt="" width={240} height={240} loading="lazy" className="h-full w-full object-cover" /> : <span aria-hidden className="text-3xl font-extrabold text-navy/70">{t.label.slice(0, 1).toUpperCase()}</span>}
              </span>
              <span className="text-[13px] font-medium leading-tight text-navy">{t.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
