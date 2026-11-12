import { useState } from 'react';
import { Button, Input } from '@thunikart/ui';
import type { Item } from '../features/catalog/types';
import { lookupBarcode, useItems } from '../features/catalog/use-items';
import { beep } from '../pwa/feedback';
import { ScanBox } from './ScanBox';

/**
 * Scan or search to add items to a grid. A scan adds the scanned size (and a scan of an item already listed adds one piece, in the
 * caller). A name search lists sizes with an Add button each. Used by purchase orders, returns, transfers and adjustments.
 */
export function ItemPicker({ onPick, large, hint, autoFocus }: { onPick: (item: Item, variantId?: string) => void; large?: boolean; hint?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [miss, setMiss] = useState<string | null>(null);
  const results = useItems({ q, category: '', brand: '', stockStatus: '', active: 'true', issue: '', sort: 'name' });
  const list = q.trim().length >= 2 ? results.data?.pages[0]?.items.slice(0, 6) ?? [] : [];
  const scan = async (code: string) => {
    setMiss(null);
    try { const r = await lookupBarcode(code); beep(true); onPick(r.item, r.variantId); } catch { beep(false); setMiss(code); }
  };
  return (
    <div className="flex flex-col gap-2">
      <ScanBox onCode={scan} large={large} autoFocus={autoFocus} placeholder="Scan a barcode to add" />
      {miss && <p role="alert" className="rounded border border-danger bg-danger-bg p-2 text-sm">No item with code {miss}.</p>}
      <Input aria-label="Search items to add" placeholder="Or search by name or code" value={q} onChange={(e) => setQ(e.target.value)} className={large ? 'min-h-12' : ''} />
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {list.length > 0 && (
        <ul className="divide-y divide-line rounded border border-line bg-white">
          {list.flatMap((i) => i.variants.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 p-2 text-sm">
              <span className="min-w-0"><strong className="block truncate">{i.name}</strong><span className="font-mono text-xs text-muted">{i.code} · Size {v.size}</span></span>
              <Button size="sm" className="min-h-11" onClick={() => { onPick(i, v.id); setQ(''); }} aria-label={`Add ${i.name} size ${v.size}`}>Add</Button>
            </li>
          )))}
        </ul>
      )}
    </div>
  );
}
