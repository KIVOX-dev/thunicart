'use client';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/** A slim bar of rotating offers with a pause and play control. It starts paused when the visitor prefers reduced motion. */
export function AnnouncementBar({ messages }: { messages: string[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true); }, []);
  useEffect(() => {
    if (paused || messages.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % messages.length), 4000);
    return () => clearInterval(t);
  }, [paused, messages.length]);
  return (
    <div className="bg-orange text-navy" role="region" aria-label="Offers">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-2 text-xs font-bold tracking-wide">
        <p aria-live={paused ? 'polite' : 'off'} className="text-center" data-testid="announcement">{messages[i]}</p>
        {messages.length > 1 && (
          <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play offer messages' : 'Pause offer messages'} aria-pressed={paused} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-navy hover:bg-navy hover:text-white">
            <Icon name={paused ? 'play' : 'pause'} size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
