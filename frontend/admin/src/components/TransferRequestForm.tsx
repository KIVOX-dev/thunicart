import { Button, Field, Input, Select } from '@thunikart/ui';
import { ErrorBanner } from './ErrorBanner';
import { ItemPicker } from './ItemPicker';
import { useFacets } from '../features/catalog/use-items';
import { useTransferRequest } from '../features/inventory/use-transfers';

/** Request a stock transfer: from, to, and the items. Scanning an item already listed adds one piece. */
export function TransferRequestForm({ onDone }: { onDone: (id: string) => void }) {
  const t = useTransferRequest(onDone);
  const stores = useFacets().data?.stores ?? [];
  return (
    <form onSubmit={(e) => { e.preventDefault(); void t.submit(); }} noValidate className="flex flex-col gap-4" aria-label="Request transfer">
      {t.banner && <ErrorBanner {...t.banner} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" required error={t.errors.fromStoreId}>{(p) => <Select {...p} value={t.fromStoreId} onChange={(e) => t.setFrom(e.target.value)}><option value="">Choose</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
        <Field label="To" required error={t.errors.toStoreId}>{(p) => <Select {...p} value={t.toStoreId} onChange={(e) => t.setTo(e.target.value)}><option value="">Choose</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
      </div>
      <ItemPicker onPick={(i, v) => t.addItem(i, v)} />
      {t.errors.lines && <p role="alert" className="text-xs text-danger">{t.errors.lines}</p>}
      <ul className="flex flex-col gap-2" aria-label="Items to move">
        {t.lines.map((l) => (
          <li key={l.variantId} className="flex items-center justify-between gap-2 rounded border border-line p-2 text-sm">
            <span className="min-w-0"><strong className="block truncate">{l.name}</strong><span className="text-xs text-muted">Size {l.size}</span></span>
            <span className="flex items-center gap-2"><Input type="number" min={1} aria-label={`Quantity to move for ${l.name} size ${l.size}`} className="w-20" value={l.qty} onChange={(e) => t.setQty(l.variantId, e.target.value)} /><Button size="sm" variant="ghost" className="min-h-11" onClick={() => t.remove(l.variantId)}>Remove</Button></span>
          </li>
        ))}
      </ul>
      <Button type="submit" variant="primary" loading={t.saving} disabled={t.lines.length === 0}>Request transfer</Button>
    </form>
  );
}
