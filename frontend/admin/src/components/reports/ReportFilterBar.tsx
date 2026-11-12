import { Input, Select } from '@thunikart/ui';
import { useFacets } from '../../features/catalog/use-items';
import { useVendors } from '../../features/catalog/use-parties';
import type { ReportFilters } from '../../features/reports/use-reports';

/** Filters a report offers: date range, category, brand, vendor and search. Only the ones the report supports are shown. */
export function ReportFilterBar({ allowed, value, onChange, big }: { allowed: string[]; value: ReportFilters; onChange: (v: ReportFilters) => void; big?: boolean }) {
  const facets = useFacets().data;
  const vendors = useVendors('').data?.pages.flatMap((p) => p.items) ?? [];
  const set = (patch: Partial<ReportFilters>) => onChange({ ...value, ...patch });
  const h = big ? 'min-h-12' : '';
  const w = big ? '' : 'w-44';
  return (
    <div className={big ? 'flex flex-col gap-3' : 'flex flex-wrap items-end gap-3'} role="search" aria-label="Report filters">
      {allowed.includes('date') && (<>
        <label className="text-xs font-medium">From<Input type="date" className={`mt-1 ${h} ${w}`} value={value.from} onChange={(e) => set({ from: e.target.value })} /></label>
        <label className="text-xs font-medium">To<Input type="date" className={`mt-1 ${h} ${w}`} value={value.to} onChange={(e) => set({ to: e.target.value })} /></label>
      </>)}
      {allowed.includes('category') && <label className="text-xs font-medium">Category<Select className={`mt-1 ${h} ${w}`} value={value.category} onChange={(e) => set({ category: e.target.value })}><option value="">All categories</option>{facets?.categories.map((c) => <option key={c}>{c}</option>)}</Select></label>}
      {allowed.includes('brand') && <label className="text-xs font-medium">Brand<Select className={`mt-1 ${h} ${w}`} value={value.brand} onChange={(e) => set({ brand: e.target.value })}><option value="">All brands</option>{facets?.brands.map((c) => <option key={c}>{c}</option>)}</Select></label>}
      {allowed.includes('vendor') && <label className="text-xs font-medium">Vendor<Select className={`mt-1 ${h} ${w}`} value={value.vendor} onChange={(e) => set({ vendor: e.target.value })}><option value="">All vendors</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></label>}
      {allowed.includes('search') && <label className="text-xs font-medium">Search<Input className={`mt-1 ${h} ${w}`} placeholder="Type to search" value={value.q} onChange={(e) => set({ q: e.target.value })} /></label>}
    </div>
  );
}
