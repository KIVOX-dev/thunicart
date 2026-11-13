'use client';
import type { Facets } from '@/lib/types';
import { useFilters } from '../shared/use-filters';

const head = 'tk-eyebrow mb-2 text-teal-700';
const chip = (on: boolean) => `flex min-h-10 items-center rounded-full border-2 px-4 text-sm tk-press ${on ? 'border-navy bg-navy text-white font-bold' : 'border-navy-100 bg-white hover:border-navy hover:bg-navy-50'}`;

/** Left filter sidebar for desktop: square size buttons, price ranges, colour chips with names, brand, occasion, fabric. */
export function FilterSidebar({ facets }: { facets: Facets }) {
  const f = useFilters();
  const Multi = ({ k, title, values }: { k: string; title: string; values: string[] }) => (
    <fieldset className="mb-6"><legend className={head}>{title}</legend>
      <ul className="flex flex-wrap gap-2">{values.map((v) => <li key={v}><button type="button" aria-pressed={f.list(k).includes(v)} onClick={() => f.toggle(k, v)} className={chip(f.list(k).includes(v))}>{v}</button></li>)}</ul></fieldset>
  );
  return (
    <aside aria-label="Filters" className="hidden w-60 shrink-0 md:block">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-xl">Filters</h2>{f.count > 0 && <button type="button" onClick={f.clear} className="min-h-11 text-xs underline">Clear all ({f.count})</button>}</div>
      <fieldset className="mb-6"><legend className={head}>Size</legend>
        <ul className="flex flex-wrap gap-2">{facets.sizes.map((s) => <li key={s}><button type="button" aria-pressed={f.list('size').includes(s)} onClick={() => f.toggle('size', s)} className={`tk-press flex h-11 min-w-11 items-center justify-center rounded-full border-2 px-3 text-sm ${f.list('size').includes(s) ? 'border-navy bg-navy text-white font-bold' : 'border-navy-100 bg-white hover:border-navy hover:bg-navy-50'}`}>{s}</button></li>)}</ul></fieldset>
      <fieldset className="mb-6"><legend className={head}>Price</legend>
        <ul className="flex flex-col gap-1">{facets.priceRanges.map((r) => <li key={r.key}><button type="button" aria-pressed={f.get('price') === r.key} onClick={() => f.set('price', r.key)} className={`${chip(f.get('price') === r.key)} w-full`}>{r.label}</button></li>)}</ul></fieldset>
      <fieldset className="mb-6"><legend className={head}>Colour</legend>
        <ul className="flex flex-wrap gap-2">{facets.colors.map((c) => <li key={c.name}><button type="button" aria-pressed={f.list('color').includes(c.name)} onClick={() => f.toggle('color', c.name)} className={`${chip(f.list('color').includes(c.name))} gap-2`}><span aria-hidden className="h-4 w-4 rounded-full border-2 border-navy-100" style={{ background: c.hex }} />{c.name}</button></li>)}</ul></fieldset>
      <Multi k="brand" title="Brand" values={facets.brands} />
      <Multi k="occasion" title="Occasion" values={facets.occasions} />
      <Multi k="fabric" title="Fabric" values={facets.fabrics} />
      <fieldset className="mb-6"><legend className={head}>Discount</legend>
        <ul className="flex gap-2">{['10', '20', '30'].map((d) => <li key={d}><button type="button" aria-pressed={f.get('discount') === d} onClick={() => f.set('discount', d)} className={chip(f.get('discount') === d)}>{d}% or more</button></li>)}</ul></fieldset>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={f.get('availability') === 'in'} onChange={() => f.set('availability', 'in')} className="h-5 w-5 accent-[var(--color-navy)]" />In stock only</label>
    </aside>
  );
}
