'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Banner } from '@/lib/types';
import { Icon } from './Icon';
import { Photo } from '@/components/shared/Photo';

/** Hero slideshow: a tall picture on phones and a wide one on desktop. It does not auto advance when reduced motion is on. */
export function HeroSlider({ banners }: { banners: Banner[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true); }, []);
  useEffect(() => { if (paused || banners.length < 2) return; const t = setInterval(() => setI((n) => (n + 1) % banners.length), 5000); return () => clearInterval(t); }, [paused, banners.length]);
  const b = banners[i];
  if (!b) return null;
  return (
    <section aria-roledescription="carousel" aria-label="Featured" className="relative mx-auto max-w-7xl px-3 pt-3 md:px-6 md:pt-6">
      <Link href={b.href} className="relative block overflow-hidden rounded-xl shadow-lift md:rounded-2xl" aria-label={`${b.title}. ${b.subtitle}`}>
        <picture>
          <source media="(min-width: 768px)" srcSet={b.desktopImage} />
          
          <Photo src={b.mobileImage} alt="" width={390} height={520} fetchPriority="high" className="aspect-[3/4] w-full object-cover md:aspect-[1600/560]" />
        </picture>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/90 via-navy/50 to-transparent p-6 text-white md:p-12">
          <h1 className="tk-display max-w-2xl">{b.title}</h1><p className="mt-2 text-base font-medium md:text-xl">{b.subtitle}</p>
          <span className="mt-3 inline-flex min-h-11 items-center rounded-full tk-press shadow-soft hover:bg-navy hover:text-white hover:shadow-lift bg-orange px-5 text-sm font-bold text-navy">Shop now</span>
        </div>
      </Link>
      <div className="absolute bottom-6 right-6 flex items-center gap-2 md:bottom-10 md:right-12">
        <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play slideshow' : 'Pause slideshow'} className="tk-press flex h-11 w-11 items-center justify-center rounded-full bg-white text-navy shadow-soft"><Icon name={paused ? 'play' : 'pause'} size={14} /></button>
        <ul className="flex gap-1" aria-label="Slides">{banners.map((x, n) => <li key={x.id}><button type="button" onClick={() => setI(n)} aria-label={`Slide ${n + 1}`} aria-current={n === i} className="flex h-11 w-6 items-center justify-center"><span className={`h-2.5 rounded-full ${n === i ? 'w-6 bg-orange' : 'w-2.5 bg-white/80'} transition-all`} /></button></li>)}</ul>
      </div>
    </section>
  );
}
