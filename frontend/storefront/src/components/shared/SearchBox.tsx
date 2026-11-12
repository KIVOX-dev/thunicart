'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Drawer } from '@thunikart/ui';
import { capi } from '@/lib/client-api';
import { formatPaise } from '@/lib/format';
import { useUi } from './ui-context';

interface Suggestion { slug: string; name: string; image: string; price: number }

/** Search panel with live suggestions. Enter goes to the full results page. */
export function SearchPanel() {
  const { searchOpen, setSearchOpen } = useUi();
  const [q, setQ] = useState('');
  const [list, setList] = useState<Suggestion[]>([]);
  const router = useRouter();
  useEffect(() => {
    if (q.trim().length < 2) { setList([]); return; }
    const t = setTimeout(async () => { try { setList(await capi<Suggestion[]>('GET', `/catalog/suggest?q=${encodeURIComponent(q.trim())}`)); } catch { setList([]); } }, 150);
    return () => clearTimeout(t);
  }, [q]);
  const go = () => { if (q.trim()) { setSearchOpen(false); router.push(`/search?q=${encodeURIComponent(q.trim())}`); } };
  return (
    <Drawer side="right" open={searchOpen} onClose={() => setSearchOpen(false)} title="Search">
      <form role="search" onSubmit={(e) => { e.preventDefault(); go(); }} className="flex gap-2">
        <input aria-label="Search the store" autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search kurtis, leggings, dothis" className="min-h-12 w-full rounded-sm border border-line px-3 text-base" />
        <button type="submit" className="min-h-12 rounded-sm bg-orange px-4 text-sm font-semibold uppercase tracking-wider text-navy">Go</button>
      </form>
      <ul className="mt-3 divide-y divide-line" aria-label="Suggestions">
        {list.map((s) => (
          <li key={s.slug}><Link href={`/p/${s.slug}`} onClick={() => setSearchOpen(false)} className="flex min-h-14 items-center gap-3 py-2">
            
            <img src={s.image} alt="" width={44} height={56} className="h-14 w-11 rounded-sm object-cover" /><span className="flex-1 text-sm">{s.name}</span><span className="text-sm font-semibold">{formatPaise(s.price)}</span></Link></li>
        ))}
      </ul>
      {q.trim().length >= 2 && list.length === 0 && <p className="mt-3 text-sm text-muted">No suggestions. Press Go to search everything.</p>}
    </Drawer>
  );
}
