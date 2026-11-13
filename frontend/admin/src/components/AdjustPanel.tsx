import { useState } from 'react';
import { Button, Field, Input, Select, useToast } from '@thunikart/ui';
import { ErrorBanner } from './ErrorBanner';
import { ItemPicker } from './ItemPicker';
import { useFacets } from '../features/catalog/use-items';
import { ADJUST_REASONS } from '../features/inventory/types';
import { useAdjustForm } from '../features/inventory/use-stock';

/** Adjust stock with a reason. Use a minus number to take stock out. */
export function AdjustPanel({ big }: { big?: boolean }) {
  const { toast } = useToast();
  const stores = useFacets().data?.stores ?? [];
  const f = useAdjustForm(() => { toast('Stock adjusted', 'success'); setPicked(null); });
  const [picked, setPicked] = useState<{ name: string; code: string; size: string } | null>(null);
  const h = big ? 'min-h-12' : '';
  return (
    <form onSubmit={(e) => { e.preventDefault(); void f.submit(); }} noValidate className="flex max-w-xl flex-col gap-4" aria-label="Adjust stock">
      {f.banner && <ErrorBanner {...f.banner} />}
      <ItemPicker large={big} onPick={(i, v) => { const variant = i.variants.find((x) => x.id === v) ?? i.variants[0]!; f.setVariantId(variant.id); setPicked({ name: i.name, code: i.code, size: variant.size }); }} />
      <p className="rounded border-2 border-navy-100 bg-mist p-2 text-sm" role="status" data-testid="adjust-picked">{picked ? <><strong>{picked.name}</strong> · {picked.code} · Size {picked.size}</> : 'No item chosen yet.'}</p>
      {f.errors.variantId && <p role="alert" className="text-xs text-danger">{f.errors.variantId}</p>}
      <Field label="Store" required error={f.errors.storeId}>{(p) => <Select {...p} className={h} value={f.storeId} onChange={(e) => f.setStoreId(e.target.value)}><option value="">Choose a store</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
      <Field label="Quantity change" required hint="For example 5 to add, -2 to take out" error={f.errors.delta}>{(p) => <Input {...p} type="number" className={h} value={f.delta} onChange={(e) => f.setDelta(e.target.value)} />}</Field>
      <Field label="Reason" required error={f.errors.reason}>{(p) => <Select {...p} className={h} value={f.reason} onChange={(e) => f.setReason(e.target.value as typeof f.reason)}>{ADJUST_REASONS.map((r) => <option key={r}>{r}</option>)}</Select>}</Field>
      <Field label="Note">{(p) => <Input {...p} className={h} value={f.note} onChange={(e) => f.setNote(e.target.value)} />}</Field>
      <Button type="submit" variant="primary" size="lg" className={h} loading={f.saving}>Save adjustment</Button>
    </form>
  );
}
