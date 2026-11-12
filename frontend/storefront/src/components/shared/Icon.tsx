const P: Record<string, string> = {
  menu: 'M4 6h16M4 12h16M4 18h16', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5', heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  bag: 'M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2', close: 'M6 6l12 12M18 6L6 18', chevron: 'M9 6l6 6-6 6', down: 'M6 9l6 6 6-6', home: 'M4 11l8-7 8 7v9H4v-9z', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  pause: 'M8 5v14M16 5v14', play: 'M8 5l11 7-11 7V5z', filter: 'M4 6h16M7 12h10M10 18h4', sort: 'M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3', check: 'M5 12l5 5 9-10', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  compare: 'M4 7h12M4 7l3-3M4 7l3 3M20 17H8M20 17l-3-3M20 17l-3 3', truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
};

/** Small inline icons so the store ships no icon library. Decorative unless a label is given. */
export function Icon({ name, size = 20, label, className }: { name: keyof typeof P | string; size?: number; label?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'play' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={className}>
      <path d={P[name] ?? ''} />
    </svg>
  );
}
