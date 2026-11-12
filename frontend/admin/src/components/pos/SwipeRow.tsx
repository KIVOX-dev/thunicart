import { useRef, useState, type ReactNode } from 'react';

/** Swipe a row left to remove it. A Remove button stays available for keyboard and screen reader users. */
export function SwipeRow({ children, onRemove, label }: { children: ReactNode; onRemove: () => void; label: string }) {
  const start = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  return (
    <div className="relative overflow-hidden rounded">
      <div aria-hidden className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-danger text-sm font-semibold text-white">Remove</div>
      <div
        className="relative bg-white"
        style={{ transform: `translateX(${dx}px)`, transition: start.current === null ? 'transform 160ms' : 'none', touchAction: 'pan-y' }}
        onTouchStart={(e) => { start.current = e.touches[0]!.clientX; }}
        onTouchMove={(e) => { if (start.current !== null) setDx(Math.min(0, Math.max(-120, e.touches[0]!.clientX - start.current))); }}
        onTouchEnd={() => { const swiped = dx < -80; start.current = null; setDx(0); if (swiped) onRemove(); }}
      >
        {children}
        <button type="button" onClick={onRemove} aria-label={label} className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-2 focus:rounded focus:bg-danger focus:px-3 focus:py-2 focus:text-white">Remove</button>
      </div>
    </div>
  );
}
