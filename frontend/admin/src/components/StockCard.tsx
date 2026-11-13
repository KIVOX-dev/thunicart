import { formatPaise } from '@thunikart/shared';
import { Badge } from '@thunikart/ui';
import { useFacets } from '../features/catalog/use-items';
import type { Item } from '../features/catalog/types';

export const statusTone = (s: Item['stockStatus']) => (s === 'In Stock' ? 'success' : s === 'Low Stock' ? 'warning' : 'danger');

/** Price, sizes and stock by store for one scanned item. Quantities come from the API as is. */
export function StockCard({ item, variantId, flash }: { item: Item; variantId?: string; flash?: boolean }) {
  const stores = useFacets().data?.stores ?? [];
  return (
    <section aria-label="Scanned item" className={`rounded border p-4 ${flash ? 'border-teal bg-success-bg' : 'border-navy-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-muted">{item.code}</p>
          <h2 className="mt-1 text-lg normal-case tracking-normal">{item.name}</h2>
          <p className="text-xs text-muted">{[item.category, item.brand, item.model].filter(Boolean).join(' · ')}</p>
        </div>
        <Badge tone={statusTone(item.stockStatus)}>{item.stockStatus}</Badge>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {item.variants.map((v) => (
          <li key={v.id} className={`py-2 text-sm ${v.id === variantId ? 'font-semibold' : ''}`}>
            <div className="flex items-center justify-between">
              <span>Size {v.size}{v.color && ` · ${v.color}`}</span>
              <span>{v.mrp ? formatPaise(v.offer ?? v.selling) : 'No price'}{v.mrp && v.mrp !== (v.offer ?? v.selling) ? <span className="ml-2 text-xs font-normal text-muted line-through">{formatPaise(v.mrp)}</span> : null}</span>
            </div>
            <p className="mt-1 text-xs font-normal text-muted">
              {stores.map((s) => `${s.name}: ${v.stock[s.id] ?? 0}`).join('  |  ') || 'Stock by store loading'}{v.bin && `  |  Bin ${v.bin}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
