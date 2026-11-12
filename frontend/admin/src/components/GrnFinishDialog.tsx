import { BottomSheet, Button, Modal } from '@thunikart/ui';
import { WARNING_TEXT, type Grn } from '../features/inventory/types';

/** Short receipt and over receipt warnings: the API lists them, the person confirms to finish anyway. */
export function GrnFinishDialog({ grn, message, saving, onConfirm, onCancel, sheet }: { grn: Grn; message: string | null; saving: boolean; onConfirm: () => void; onCancel: () => void; sheet?: boolean }) {
  const Shell = sheet ? BottomSheet : Modal;
  const warned = grn.lines.filter((l) => l.warning);
  return (
    <Shell open={!!message} onClose={onCancel} title="Check before finishing"
      footer={<><Button onClick={onCancel}>Keep scanning</Button><Button variant="primary" loading={saving} onClick={onConfirm}>Finish anyway</Button></>}>
      <p className="mb-3 text-sm">{message}</p>
      <ul className="divide-y divide-line rounded border border-line text-sm">
        {warned.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2 p-2">
            <span className="min-w-0"><strong className="block truncate">{l.name}</strong><span className="text-xs text-muted">Size {l.size} · ordered {l.orderedQty}, received {l.receivedQty}</span></span>
            <span className={`shrink-0 text-xs font-semibold ${l.warning === 'SHORT' ? 'text-warning' : 'text-danger'}`}>{WARNING_TEXT[l.warning!]}</span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
