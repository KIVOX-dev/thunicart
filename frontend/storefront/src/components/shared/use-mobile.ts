'use client';
import { useEffect, useState } from 'react';

/** True below 768 px. Used by screens that are client only (checkout) to show the phone or the desktop layout. */
export function useIsMobile(): boolean | null {
  const [m, setM] = useState<boolean | null>(null);
  useEffect(() => {
    const q = window.matchMedia('(max-width: 767px)');
    const on = () => setM(q.matches);
    on();
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return m;
}
