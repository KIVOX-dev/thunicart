'use client';
import { useState } from 'react';
import { BottomSheet } from '@thunikart/ui';
import type { Facets } from '@/lib/types';
import { Icon } from '../shared/Icon';
import { MULTI, SORTS, useFilters } from '../shared/use-filters';

const chip = (on: boolean) => `flex min-h-11 items-center rounded-sm border px-3 text-sm ${on ? 'border-navy border-b-2 border-b-teal font-semibold' : 'border-line'}`;

/** Mobile: Filter and Sort buttons that open bottom sheets. The filter sheet applies all choices together. */
export function FilterSheets({ facets, total }: { facets: Facets; total: number }) {
  const f = useFilters();
  const [fOpen, setFOpen] = useState(false);
  const [sOpen, setSOpen] = useState(false);
  const [draft, setDraft] = useState<URLSearchParams>(new URLSearchParams());
  const open = () => { setDraft(new URLSearchParams(f.sp.toString())); setFOpen(true); };
  const dList = (k: string) => (draft.get(k) ?? '').split(',').filter(Boolean);
  const dToggle = (k: string, v: string) => setDraft((d) => { const n = new URLSearchParams(d.toString()); const cur = (n.get(k) ?? '').split(',').filter(Boolean); const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]; if (next.length) n.set(k, next.join(',')); else n.delete(k); return n; });
  const dSet = (k: string, v: string) => setDraft((d) => { const n = new URLSearchParams(d.toString()); if (n.get(k) === v) n.delete(k); else n.set(k, v); return n; });
  const Group = ({ k, title, values }: { k: string; title: string; values: string[] }) => (
    <fieldset className="mb-5"><legend className="mb-2 text-xs">{title}</legend><ul className="flex flex-wrap gap-2">{values.map((v) => <li key={v}><button type="button" aria-pressed={dList(k).includes(v)} onClick={() => dToggle(k, v)} className={chip(dList(k).includes(v))}>{v}</button></li>)}</ul></fieldset>
  );
  return (
    <div className="sticky top-[104px] z-20 flex border-y border-line bg-white md:hidden">
      <button type="button" onClick={open} className="flex min-h-12 flex-1 items-center justify-center gap-2 border-r border-line text-sm font-medium uppercase tracking-wider"><Icon name="filter" size={16} />Filter{f.count > 0 && <span className="rounded-full bg-orange px-1.5 text-xs font-semibold text-navy">{f.count}</span>}</button>
      <button type="button" onClick={() => setSOpen(true)} className="flex min-h-12 flex-1 items-center justify-center gap-2 text-sm font-medium uppercase tracking-wider"><Icon name="sort" size={16} />Sort</button>
      <BottomSheet open={sOpen} onClose={() => setSOpen(false)} title="Sort by">
        <ul>{SORTS.map((s) => <li key={s.key}><button type="button" aria-pressed={f.sort === s.key} onClick={() => { f.set('sort', s.key === 'popular' ? '' : s.key); setSOpen(false); }} className={`flex min-h-12 w-full items-center justify-between text-left text-sm ${f.sort === s.key ? 'font-semibold' : ''}`}>{s.label}{f.sort === s.key && <Icon name="check" size={16} />}</button></li>)}</ul>
      </BottomSheet>
      <BottomSheet open={fOpen} onClose={() => setFOpen(false)} title="Filters" footer={<><button type="button" onClick={() => { setDraft(new URLSearchParams()); }} className="min-h-12 rounded-sm border border-navy px-4 text-sm uppercase tracking-wider">Clear</button><button type="button" onClick={() => { f.apply(draft); setFOpen(false); }} className="min-h-12 rounded-sm bg-orange px-5 text-sm font-semibold uppercase tracking-wider text-navy">Show {total} items</button></>}>
        <Group k="size" title="Size" values={facets.sizes} />
        <fieldset className="mb-5"><legend className="mb-2 text-xs">Price</legend><ul className="flex flex-wrap gap-2">{facets.priceRanges.map((r) => <li key={r.key}><button type="button" aria-pressed={draft.get('price') === r.key} onClick={() => dSet('price', r.key)} className={chip(draft.get('price') === r.key)}>{r.label}</button></li>)}</ul></fieldset>
        <fieldset className="mb-5"><legend className="mb-2 text-xs">Colour</legend><ul className="flex flex-wrap gap-2">{facets.colors.map((c) => <li key={c.name}><button type="button" aria-pressed={dList('color').includes(c.name)} onClick={() => dToggle('color', c.name)} className={`${chip(dList('color').includes(c.name))} gap-2`}><span aria-hidden className="h-4 w-4 rounded-full border border-line" style={{ background: c.hex }} />{c.name}</button></li>)}</ul></fieldset>
        <Group k="brand" title="Brand" values={facets.brands} /><Group k="occasion" title="Occasion" values={facets.occasions} /><Group k="fabric" title="Fabric" values={facets.fabrics} />
        <fieldset className="mb-5"><legend className="mb-2 text-xs">Discount</legend><ul className="flex gap-2">{['10', '20', '30'].map((d) => <li key={d}><button type="button" aria-pressed={draft.get('discount') === d} onClick={() => dSet('discount', d)} className={chip(draft.get('discount') === d)}>{d}%+</button></li>)}</ul></fieldset>
        <label className="flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" checked={draft.get('availability') === 'in'} onChange={() => dSet('availability', 'in')} className="h-5 w-5 accent-[var(--color-navy)]" />In stock only</label>
        <span hidden>{MULTI.length}</span>
      </BottomSheet>
    </div>
  );
}
