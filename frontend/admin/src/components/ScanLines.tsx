import { Minus, Plus } from 'lucide-react';
import { Badge, Table, TBody, Td, Th, THead, Tr } from '@thunikart/ui';
import { ErrorBanner } from './ErrorBanner';
import type { useScanFeedback } from '../features/inventory/use-scan-feedback';
import { WARNING_TEXT } from '../features/inventory/types';

export interface ScanLine { id: string; code: string; name: string; size: string; expected?: number; qty: number; warning?: string | null }
interface Props { lines: ScanLine[]; qtyLabel: string; expectedLabel?: string; onSetQty: (id: string, qty: number) => void; flashId?: string | null; readOnly?: boolean }

const warnText = (w?: string | null) => (w ? WARNING_TEXT[w as keyof typeof WARNING_TEXT] ?? w : null);

/** Quantity box that commits on Enter or when it loses focus. The key makes it follow server changes. */
function QtyInput({ id, qty, label, onSet, big }: { id: string; qty: number; label: string; onSet: (id: string, q: number) => void; big?: boolean }) {
  const commit = (el: HTMLInputElement) => { const n = Math.round(Number(el.value)); if (Number.isFinite(n) && n >= 0 && n !== qty) onSet(id, n); else el.value = String(qty); };
  return <input key={qty} type="number" inputMode="numeric" min={0} aria-label={label} defaultValue={qty} onBlur={(e) => commit(e.currentTarget)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(e.currentTarget); } }} className={`rounded border border-line text-center ${big ? 'h-12 w-20 text-lg' : 'h-9 w-16 text-sm'}`} />;
}

/** Desktop: a dense table with a stepper per row. */
export function ScanLinesTable({ lines, qtyLabel, expectedLabel, onSetQty, flashId, readOnly }: Props) {
  return (
    <Table caption={`${qtyLabel} lines`}>
      <THead><Tr><Th>Code</Th><Th>Item</Th><Th>Size</Th>{expectedLabel && <Th className="text-right">{expectedLabel}</Th>}<Th className="text-center">{qtyLabel}</Th><Th>Check</Th></Tr></THead>
      <TBody>
        {lines.map((l) => (
          <Tr key={l.id} className={l.id === flashId ? '!bg-success-bg' : ''}>
            <Td className="font-mono text-xs">{l.code}</Td><Td className="font-medium">{l.name}</Td><Td>{l.size}</Td>
            {expectedLabel && <Td className="text-right">{l.expected ?? 0}</Td>}
            <Td className="text-center">
              {readOnly ? l.qty : (
                <span className="inline-flex items-center gap-1">
                  <button type="button" aria-label={`Fewer ${l.name} ${l.size}`} onClick={() => onSetQty(l.id, Math.max(0, l.qty - 1))} className="flex h-9 w-9 items-center justify-center rounded border border-line hover:bg-mist"><Minus size={14} /></button>
                  <QtyInput id={l.id} qty={l.qty} label={`${qtyLabel} for ${l.name} size ${l.size}`} onSet={onSetQty} />
                  <button type="button" aria-label={`More ${l.name} ${l.size}`} onClick={() => onSetQty(l.id, l.qty + 1)} className="flex h-9 w-9 items-center justify-center rounded border border-line hover:bg-mist"><Plus size={14} /></button>
                </span>
              )}
            </Td>
            <Td>{warnText(l.warning) && <Badge tone={l.warning === 'SHORT' ? 'warning' : 'danger'}>{warnText(l.warning)}</Badge>}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

/** Mobile: cards with big steppers (44 px or more), newest scan first. */
export function ScanLinesCards({ lines, qtyLabel, expectedLabel, onSetQty, flashId, readOnly }: Props) {
  return (
    <ul className="flex flex-col gap-3" aria-label={`${qtyLabel} lines`}>
      {lines.map((l) => (
        <li key={l.id} className={`rounded border p-3 ${l.id === flashId ? 'border-teal bg-success-bg' : 'border-line bg-white'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><strong className="block text-sm">{l.name}</strong><span className="font-mono text-xs text-muted">{l.code} · Size {l.size}</span></div>
            {warnText(l.warning) && <Badge tone={l.warning === 'SHORT' ? 'warning' : 'danger'}>{warnText(l.warning)}</Badge>}
          </div>
          <div className="mt-2 flex items-center justify-between">
            {expectedLabel ? <span className="text-sm text-muted">{expectedLabel} {l.expected ?? 0}</span> : <span />}
            {readOnly ? <strong className="text-lg">{l.qty}</strong> : (
              <span className="inline-flex items-center gap-2">
                <button type="button" aria-label={`Fewer ${l.name} ${l.size}`} onClick={() => onSetQty(l.id, Math.max(0, l.qty - 1))} className="flex h-12 w-12 items-center justify-center rounded border border-navy"><Minus size={20} /></button>
                <QtyInput id={l.id} qty={l.qty} big label={`${qtyLabel} for ${l.name} size ${l.size}`} onSet={onSetQty} />
                <button type="button" aria-label={`More ${l.name} ${l.size}`} onClick={() => onSetQty(l.id, l.qty + 1)} className="flex h-12 w-12 items-center justify-center rounded border border-navy bg-navy text-white"><Plus size={20} /></button>
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The miss or error message under a scan box. */
export function ScanMessage({ feedback }: { feedback: ReturnType<typeof useScanFeedback> }) {
  if (feedback.miss) return <div role="alert" className="rounded border border-danger bg-danger-bg p-3 text-sm">No item found for <strong>{feedback.miss}</strong>. Check the barcode and try again.</div>;
  if (feedback.error) return <ErrorBanner message={feedback.error.friendly} requestId={feedback.error.requestId} />;
  return null;
}
