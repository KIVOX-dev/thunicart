'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Banner } from '@/lib/types';
import { Icon } from './Icon';

/** Hero slideshow: a tall picture on phones and a wide one on desktop. It does not auto advance when reduced motion is on. */
export function HeroSlider({ banners }: { banners: Banner[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true); }, []);
  useEffect(() => { if (paused || banners.length < 2) return; const t = setInterval(() => setI((n) => (n + 1) % banners.length), 5000); return () => clearInterval(t); }, [paused, banners.length]);
  const b = banners[i];
  if (!b) return null;
  return (
    <section aria-roledescription="carousel" aria-label="Featured" className="relative">
      <Link href={b.href} className="block" aria-label={`${b.title}. ${b.subtitle}`}>
        <picture>
          <source media="(min-width: 768px)" srcSet={b.desktopImage} />
          
          <img src={b.mobileImage} alt="" width={390} height={520} fetchPriority="high" className="aspect-[3/4] w-full object-cover md:aspect-[1600/560]" />
        </picture>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/80 to-transparent p-6 text-white md:p-12">
          <h1 className="text-2xl md:text-4xl">{b.title}</h1><p className="mt-1 text-sm md:text-base">{b.subtitle}</p>
          <span className="mt-3 inline-flex min-h-11 items-center rounded-sm bg-orange px-5 text-sm font-semibold uppercase tracking-wider text-navy">Shop now</span>
        </div>
      </Link>
      <div className="absolute bottom-3 right-3 flex items-center gap-2">
        <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play slideshow' : 'Pause slideshow'} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-navy"><Icon name={paused ? 'play' : 'pause'} size={14} /></button>
        <ul className="flex gap-1" aria-label="Slides">{banners.map((x, n) => <li key={x.id}><button type="button" onClick={() => setI(n)} aria-label={`Slide ${n + 1}`} aria-current={n === i} className="flex h-11 w-5 items-center justify-center"><span className={`h-2 w-2 rounded-full ${n === i ? 'bg-orange' : 'bg-white/80'}`} /></button></li>)}</ul>
      </div>
    </section>
  );
}
