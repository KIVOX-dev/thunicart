const BASE = import.meta.env.BASE_URL; // '/' locally, '/admin/' on Vercel
const SRC = { sidebar: [`${BASE}logo-sidebar.png`, 720, 239], mark: [`${BASE}logo-mark.png`, 256, 256], primary: [`${BASE}logo-primary.png`, 640, 506] } as const;

/**
 * Thunikart logo files (source copies are in docs/source/logos).
 * sidebar: wide logo for menus and headers. mark: icon only. primary: stacked logo for sign in pages.
 * The artwork has a white background, so on the navy sidebar and headers it sits on a white tile (`tile`).
 */
export function Logo({ variant = 'sidebar', tile = false, className = '' }: { variant?: keyof typeof SRC; tile?: boolean; className?: string }) {
  const [src, width, height] = SRC[variant];
  const img = <img src={src} width={width} height={height} alt="Thunikart by Krishnas Orchids" className="block h-auto w-full object-contain" />;
  return tile ? <span className={`inline-block rounded bg-white p-1.5 ${className}`}>{img}</span> : <span className={`inline-block ${className}`}>{img}</span>;
}
