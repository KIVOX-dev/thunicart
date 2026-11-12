import { useEffect, useRef } from 'react';

/**
 * Keyboard style scanners type the barcode very fast and finish with Enter. This listens on the window, so it works in any
 * focused search box or with nothing focused.
 *
 * A burst counts as a scan when it has at least `minLength` characters, ends with Enter, has no pause longer than `pauseMs`,
 * and averages no more than `avgMs` per character. Using the average (not the slowest gap) keeps it reliable when the page
 * is briefly busy, while normal human typing (100 ms or more per key) is still ignored.
 */
export function useKeyboardScanner(onScan: (code: string) => void, enabled = true, avgMs = 60, minLength = 4, pauseMs = 250) {
  const buf = useRef('');
  const first = useRef(0);
  const last = useRef(0);
  const cb = useRef(onScan);
  cb.current = onScan;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = performance.now();
      if (e.key === 'Enter') {
        const code = buf.current;
        const fast = code.length > 1 && (last.current - first.current) / (code.length - 1) <= avgMs && now - last.current <= pauseMs;
        buf.current = '';
        if (code.length >= minLength && fast) { e.preventDefault(); cb.current(code); }
        return;
      }
      if (e.key.length !== 1) return;
      if (now - last.current > pauseMs) { buf.current = ''; }
      if (!buf.current) first.current = now;
      buf.current += e.key;
      last.current = now;
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, avgMs, minLength, pauseMs]);
}
