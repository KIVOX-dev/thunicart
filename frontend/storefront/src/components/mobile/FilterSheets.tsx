'use client';
import { useState } from 'react';
import { BottomSheet } from '@thunikart/ui';
import type { Facets } from '@/lib/types';
import { Icon } from '../shared/Icon';
import { MULTI, SORTS, useFilters } from '../shared/use-filters';
import { isStandardSize, sortSizes } from '@/lib/sizes';

const chip = (on: boolean) => `flex min-h-11 items-center whitespace-nowrap rounded-full border-2 px-4 text-sm tk-press ${on ? 'border-navy bg-navy text-white font-bold' : 'border-navy-100'}`;

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
  const MoreSizes = ({ k, values }: { k: string; values: string[] }) => { const [open, setOpen] = useState(false); return open ? <ul className="mt-2 flex flex-wrap gap-2">{values.map((v) => <li key={v}><button type="button" aria-pressed={dList(k).includes(v)} onClick={() => dToggle(k, v)} className={chip(dList(k).includes(v))}>{v}</button></li>)}</ul> : <button type="button" onClick={() => setOpen(true)} className="mt-2 min-h-11 text-xs font-semibold underline">More sizes ({values.length})</button>; };
  const Group = ({ k, title, values, more = [] }: { k: string; title: string; values: string[]; more?: string[] }) => (
    <fieldset className="mb-5"><legend className="tk-eyebrow mb-2 text-teal-700">{title}</legend><ul className="flex flex-wrap gap-2">{values.map((v) => <li key={v}><button type="button" aria-pressed={dList(k).includes(v)} onClick={() => dToggle(k, v)} className={chip(dList(k).includes(v))}>{v}</button></li>)}</ul>{more.length > 0 && <MoreSizes k={k} values={more} />}</fieldset>
  );
  return (
    <div className="sticky top-[112px] z-20 flex gap-2 bg-white/95 py-2 backdrop-blur md:hidden">
      <button type="button" onClick={open} className="tk-press flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-teal text-sm font-bold text-navy shadow-soft"><Icon name="filter" size={16} />Filter{f.count > 0 && <span className="rounded-full bg-orange px-1.5 text-xs font-semibold text-navy">{f.count}</span>}</button>
      <button type="button" onClick={() => setSOpen(true)} className="tk-press flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-navy text-sm font-bold text-white shadow-soft"><Icon name="sort" size={16} />Sort</button>
      <BottomSheet open={sOpen} onClose={() => setSOpen(false)} title="Sort by">
        <ul>{SORTS.map((s) => <li key={s.key}><button type="button" aria-pressed={f.sort === s.key} onClick={() => { f.set('sort', s.key === 'popular' ? '' : s.key); setSOpen(false); }} className={`flex min-h-12 w-full items-center justify-between text-left text-sm ${f.sort === s.key ? 'font-semibold' : ''}`}>{s.label}{f.sort === s.key && <Icon name="check" size={16} />}</button></li>)}</ul>
      </BottomSheet>
      <BottomSheet open={fOpen} onClose={() => setFOpen(false)} title="Filters" footer={<><button type="button" onClick={() => { setDraft(new URLSearchParams()); }} className="min-h-12 rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-4 text-sm">Clear</button><button type="button" onClick={() => { f.apply(draft); setFOpen(false); }} className="min-h-12 rounded-full tk-press shadow-soft hover:bg-navy hover:text-white hover:shadow-lift bg-orange px-5 text-sm font-bold text-navy">Show {total} items</button></>}>
        <Group k="size" title="Size" values={sortSizes(facets.sizes).filter((s) => isStandardSize(s) || dList("size").includes(s))} more={sortSizes(facets.sizes).filter((s) => !isStandardSize(s) && !dList("size").includes(s))} />
        <fieldset className="mb-5"><legend className="mb-2 text-xs">Price</legend><ul className="flex flex-wrap gap-2">{facets.priceRanges.map((r) => <li key={r.key}><button type="button" aria-pressed={draft.get('price') === r.key} onClick={() => dSet('price', r.key)} className={chip(draft.get('price') === r.key)}>{r.label}</button></li>)}</ul></fieldset>
        <fieldset className="mb-5"><legend className="mb-2 text-xs">Colour</legend><ul className="flex flex-wrap gap-2">{facets.colors.map((c) => <li key={c.name}><button type="button" aria-pressed={dList('color').includes(c.name)} onClick={() => dToggle('color', c.name)} className={`${chip(dList('color').includes(c.name))} gap-2`}><span aria-hidden className="h-4 w-4 rounded-full border-2 border-navy-100" style={{ background: c.hex }} />{c.name}</button></li>)}</ul></fieldset>
        <Group k="brand" title="Brand" values={facets.brands} /><Group k="occasion" title="Occasion" values={facets.occasions} /><Group k="fabric" title="Fabric" values={facets.fabrics} />
        <fieldset className="mb-5"><legend className="mb-2 text-xs">Discount</legend><ul className="flex gap-2">{['10', '20', '30'].map((d) => <li key={d}><button type="button" aria-pressed={draft.get('discount') === d} onClick={() => dSet('discount', d)} className={chip(draft.get('discount') === d)}>{d}%+</button></li>)}</ul></fieldset>
        <label className="flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" checked={draft.get('availability') === 'in'} onChange={() => dSet('availability', 'in')} className="h-5 w-5 accent-[var(--color-navy)]" />In stock only</label>
        <span hidden>{MULTI.length}</span>
      </BottomSheet>
    </div>
  );
}
