'use client';
import { useRef, useState } from 'react';
import { Photo } from '@/components/shared/Photo';

/**
 * Product pictures. Phones get a swipe gallery with dots. Desktop gets thumbnails and a hover zoom.
 * Both are in the page and CSS shows the right one, so the pictures are in the server rendered HTML.
 */
export function Gallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div className="md:hidden" role="region" aria-roledescription="carousel" aria-label={`${name} pictures`}>
        <div ref={scroller} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]" onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); }}>
          {images.map((src, n) => (
            <Photo key={src} src={src} alt={`${name}, picture ${n + 1} of ${images.length}`} width={600} height={800} loading={n === 0 ? 'eager' : 'lazy'} className="aspect-[3/4] w-full shrink-0 snap-center object-cover" />
          ))}
        </div>
        <ul className="mt-2 flex justify-center" aria-label="Pictures">{images.map((_, n) => <li key={n}><button type="button" aria-label={`Show picture ${n + 1}`} aria-current={n === i} onClick={() => scroller.current?.scrollTo({ left: n * scroller.current.clientWidth, behavior: 'smooth' })} className="flex h-11 w-6 items-center justify-center"><span className={`h-2 w-2 rounded-full ${n === i ? 'bg-navy' : 'bg-line'}`} /></button></li>)}</ul>
      </div>
      <div className="hidden grid-cols-[5rem_1fr] gap-4 md:grid">
        <ul className="flex flex-col gap-2" aria-label="Pictures">{images.map((src, n) => <li key={src}><button type="button" onClick={() => setI(n)} aria-label={`Show picture ${n + 1}`} aria-current={n === i} className={`block overflow-hidden rounded-sm border-2 ${n === i ? 'border-navy' : 'border-transparent'}`}><Photo src={src} alt="" width={80} height={107} className="aspect-[3/4] w-full object-cover" /></button></li>)}</ul>
        <div className="relative aspect-[3/4] cursor-zoom-in overflow-hidden rounded-lg bg-navy-50" onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }} onMouseLeave={() => setZoom(null)} data-testid="zoom-area">
          
          <Photo src={images[i]} alt={`${name}, picture ${i + 1} of ${images.length}`} width={600} height={800} fetchPriority="high" className="h-full w-full object-cover transition-transform duration-200" style={zoom ? { transform: 'scale(2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined} />
        </div>
      </div>
    </div>
  );
}
