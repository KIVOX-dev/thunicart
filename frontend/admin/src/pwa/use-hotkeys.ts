import { useEffect, useRef } from 'react';

/** Counter shortcuts such as F2, F4, F8 and Escape. Handlers are looked up at press time, so they always see current state. */
export function useHotkeys(map: Record<string, () => void>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      const fn = ref.current[e.key];
      if (!fn) return;
      // Escape should not clear the bill while a dialog is open.
      if (e.key === 'Escape' && document.querySelector('dialog[open]')) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [enabled]);
}
