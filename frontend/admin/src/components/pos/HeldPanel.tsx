import { useNavigate } from 'react-router-dom';
import { formatDate, formatPaise } from '@thunikart/shared';
import { Badge, Button, EmptyState, ListSkeleton } from '@thunikart/ui';
import { QueryError } from '../ErrorBanner';
import { EMPTY_CART, type CartState } from '../../features/pos/use-cart';
import { useDeleteHeld, useHeld } from '../../features/pos/use-pos-data';

/** Held bills and drafts. Resume puts the bill back on the POS screen. */
export function HeldPanel({ big }: { big?: boolean }) {
  const q = useHeld();
  const del = useDeleteHeld();
  const nav = useNavigate();
  if (q.isPending) return <ListSkeleton rows={2} label="Loading held bills" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.length) return <EmptyState title="No held bills" body="Hold a bill on the POS screen to serve the next customer, then resume it here." />;
  const resume = (id: string, cart: unknown) => {
    const ui = (cart as { ui?: CartState }).ui ?? EMPTY_CART;
    try { localStorage.setItem('tk.pos.cart', JSON.stringify({ ...EMPTY_CART, ...ui, payments: [], approverToken: null, heldId: id })); } catch { /* storage blocked */ }
    nav('/billing');
  };
  return (
    <ul className="flex max-w-2xl flex-col gap-2" aria-label="Held bills">
      {q.data.map((h) => (
        <li key={h.id} className="flex items-center justify-between gap-3 rounded border border-line p-3 text-sm">
          <span className="min-w-0"><strong>{h.name}</strong> <Badge>{h.kind === 'draft' ? 'Draft' : 'Held'}</Badge><span className="block text-xs text-muted">{h.customerName} · {h.pieces} pieces · {formatPaise(h.total)} · {formatDate(h.createdAt)}</span></span>
          <span className="flex gap-2"><Button size="sm" variant="primary" className={big ? 'min-h-11' : ''} onClick={() => resume(h.id, h.cart)} aria-label={`Resume ${h.name}`}>Resume</Button><Button size="sm" variant="ghost" className={big ? 'min-h-11' : ''} onClick={() => del.mutate(h.id)} aria-label={`Delete ${h.name}`}>Delete</Button></span>
        </li>
      ))}
    </ul>
  );
}
