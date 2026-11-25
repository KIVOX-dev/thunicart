'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Banner } from '@/lib/types';
import { Icon } from './Icon';
import { Photo } from '@/components/shared/Photo';
import { MOCK_MODE } from '@/lib/config';

interface Slide { id: string; title: string; subtitle: string; href: string; mobileImage?: string; desktopImage?: string; bg: string; dark: boolean; art?: string; alt?: string }

/** The shop's own banner pictures (2000 x 700). The headline is part of each picture, so nothing is written over them. */
const slug = (live: string, demo: string) => (MOCK_MODE ? demo : live);
const PHOTO_SLIDES: Slide[] = [
  { id: 'p1', title: 'Kurtis and sets', subtitle: '', href: `/c/${slug('kurtis-and-sets', 'women-kurtis')}`, art: '/banners/kurtis.jpg', alt: 'Kurtis and sets: effortless elegance in every thread', bg: 'bg-orange-50', dark: false },
  { id: 'p2', title: 'Innerwear', subtitle: '', href: `/c/${slug('innerwear', 'women-innerwear')}`, art: '/banners/innerwear.jpg', alt: 'Innerwear: everyday comfort, revolutionized', bg: 'bg-navy-50', dark: false },
  { id: 'p3', title: 'Nightwear', subtitle: '', href: `/c/${slug('nightwear', 'women-nightwear')}`, art: '/banners/nightwear.jpg', alt: 'Nightwear: unwind in style, sleep better, live brighter', bg: 'bg-orange-50', dark: false },
  { id: 'p4', title: 'Leggings and bottoms', subtitle: '', href: `/c/${slug('bottoms', 'women-leggings')}`, art: '/banners/leggings.jpg', alt: 'Leggings and bottoms: made for every move', bg: 'bg-navy-50', dark: false },
];

/**
 * Full width hero, edge to edge like a fashion store: a big picture (tall on phones, wide on desktop) with the headline over it,
 * arrows on both sides, dots, and a Shop Now link. It does not auto advance when reduced motion is on.
 */
export function HeroSlider({ banners }: { banners: Banner[] }) {
  // The shop's banner pictures are used unless the store sends its own banners with real photos.
  // The store's own banners are shown the same way: the whole wide picture (2000 x 700), so nothing in it is cut off on a phone.
  const slides: Slide[] = !banners.length || MOCK_MODE ? PHOTO_SLIDES : banners.map((b) => ({ ...b, art: b.desktopImage, alt: b.title, bg: 'bg-navy-50', dark: false }));
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true); }, []);
  useEffect(() => { if (paused || slides.length < 2) return; const t = setInterval(() => setI((n) => (n + 1) % slides.length), 5500); return () => clearInterval(t); }, [paused, slides.length]);
  const go = (d: number) => setI((n) => (n + d + slides.length) % slides.length);
  const b = slides[i % slides.length]!;
  const ink = b.dark ? 'text-white' : 'text-navy';
  const arrow = 'tk-press absolute top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-navy shadow-soft hover:bg-white md:flex';
  return (
    <section aria-roledescription="carousel" aria-label="Featured" className="relative mx-3 mt-3 overflow-hidden rounded-3xl border-4 border-navy md:mx-auto md:max-w-7xl">
      <Link href={b.href} className={`relative block ${b.bg} ${ink}`} aria-label={`${b.title}. ${b.subtitle}`}>
        {b.art ? (
          <img src={b.art} alt={b.alt ?? b.title} width={2000} height={700} fetchPriority="high" className="aspect-[20/7] w-full object-cover" />
        ) : b.mobileImage ? (
          <picture>
            <source media="(min-width: 768px)" srcSet={b.desktopImage} />
            <Photo src={b.mobileImage} alt="" width={390} height={520} fetchPriority="high" className="aspect-[3/4] w-full object-cover md:aspect-[1600/640]" />
          </picture>
        ) : (
          <div className="relative aspect-[3/4] w-full overflow-hidden md:aspect-[1600/640]">
            <span aria-hidden className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/15 md:h-[34rem] md:w-[34rem]" />
            <span aria-hidden className="absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-white/10" />
            <span aria-hidden className="absolute bottom-16 right-1/4 hidden h-24 w-24 rounded-full bg-orange md:block" />
          </div>
        )}
        {!b.art && <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-navy/55 via-navy/10 to-transparent p-6 md:px-24" style={b.mobileImage ? undefined : { background: 'none' }}>
          <h1 className={`tk-display max-w-xl ${b.mobileImage ? 'text-white' : ink}`}>{b.title}</h1>
          <p className={`mt-3 max-w-md text-base font-medium md:text-xl ${b.mobileImage ? 'text-white' : ink}`}>{b.subtitle}</p>
        </div>}
        {!b.art && <span className={`absolute inset-x-0 bottom-8 text-center text-lg font-extrabold underline decoration-2 underline-offset-8 md:bottom-10 md:text-2xl ${b.mobileImage ? 'text-white' : ink}`}>Shop Now</span>}
      </Link>
      {slides.length > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label="Previous slide" className={`${arrow} left-4`}><Icon name="chevron" size={22} className="rotate-180" /></button>
          <button type="button" onClick={() => go(1)} aria-label="Next slide" className={`${arrow} right-4`}><Icon name="chevron" size={22} /></button>
        </>
      )}
      <div className="flex items-center justify-center gap-2 py-1 md:absolute md:bottom-6 md:right-6 md:justify-end md:py-0">
        <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play slideshow' : 'Pause slideshow'} className="tk-press flex h-11 w-11 items-center justify-center rounded-full bg-white text-navy shadow-soft"><Icon name={paused ? 'play' : 'pause'} size={14} /></button>
        <ul className="flex gap-1" aria-label="Slides">{slides.map((x, n) => <li key={x.id}><button type="button" onClick={() => setI(n)} aria-label={`Slide ${n + 1}`} aria-current={n === i} className="flex h-11 w-6 items-center justify-center"><span className={`h-2.5 rounded-full transition-all ${n === i ? (b.dark || b.mobileImage ? 'w-6 bg-orange' : 'w-6 bg-navy') : (b.dark || b.mobileImage ? 'w-2.5 bg-white/80' : 'w-2.5 bg-navy/40')}`} /></button></li>)}</ul>
      </div>
    </section>
  );
}
