'use client';
import { SORTS, useFilters } from '../shared/use-filters';

export function SortSelect() {
  const f = useFilters();
  return (
    <label className="hidden items-center gap-2 text-xs font-medium uppercase tracking-wider md:flex">Sort
      <select aria-label="Sort products" value={f.sort} onChange={(e) => f.set('sort', e.target.value === 'popular' ? '' : e.target.value)} className="min-h-11 rounded-sm border border-line bg-white px-3 text-sm normal-case tracking-normal">
        {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </label>
  );
}
