'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'tk.consent.v1';
const COOKIE = 'tk_consent';
/** Raised by the "Cookie settings" link in the footer, to show the question again. */
export const OPEN_CONSENT = 'tk:open-consent';

type Choice = 'all' | 'essential';

function save(choice: Choice) {
  const value = JSON.stringify({ choice, at: new Date().toISOString(), v: 1 });
  try { localStorage.setItem(KEY, value); } catch { /* storage blocked: the cookie below still remembers it */ }
  // A first party cookie for 12 months. It holds only the choice, nothing about the person.
  document.cookie = `${COOKIE}=${choice}; max-age=${365 * 24 * 3600}; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}
function saved(): Choice | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { choice?: Choice } | null; if (v?.choice) return v.choice; } catch { /* fall through to the cookie */ }
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=(all|essential)`));
  return (m?.[1] as Choice | undefined) ?? null;
}

/**
 * The first visit question: agree to the terms and cookie use, or keep only the essential cookies. It is a bottom card on a phone and a
 * corner card on a wide screen, so the shop stays visible behind it. The choice is remembered for 12 months, and can be changed from the footer.
 */
export function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const agree = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!saved()) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_CONSENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT, reopen);
  }, []);
  useEffect(() => { if (open) agree.current?.focus({ preventScroll: true }); }, [open]);
  const choose = useCallback((c: Choice) => { save(c); setOpen(false); }, []);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="false" aria-labelledby="tk-consent-title" aria-describedby="tk-consent-text"
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] rounded-3xl bg-white p-5 shadow-overlay ring-2 ring-navy-100 md:inset-x-auto md:bottom-6 md:left-6 md:max-w-md md:p-6">
      <h2 id="tk-consent-title" className="text-lg font-extrabold text-navy">Your privacy matters</h2>
      <p id="tk-consent-text" className="mt-2 text-sm leading-relaxed text-navy/85">
        We use a few cookies to keep you signed in and remember your cart. We do not use them for ads and we never sell your data. By continuing you agree to our{' '}
        <Link href="/pages/terms" className="font-semibold underline">Terms of service</Link>,{' '}
        <Link href="/pages/privacy" className="font-semibold underline">Privacy policy</Link> and{' '}
        <Link href="/pages/cookies" className="font-semibold underline">Cookie policy</Link>.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button ref={agree} type="button" onClick={() => choose('all')} className="tk-press min-h-12 flex-1 rounded-full bg-navy px-5 text-sm font-bold text-white shadow-soft">Agree and continue</button>
        <button type="button" onClick={() => choose('essential')} className="tk-press min-h-12 flex-1 rounded-full border-2 border-navy px-5 text-sm font-bold text-navy hover:bg-navy-50">Essential only</button>
      </div>
    </div>
  );
}

/** A footer link that opens the question again. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT))} className={className}>Cookie settings</button>;
}
