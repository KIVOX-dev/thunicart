import { useState } from 'react';
import { ApiError } from '../api/http';
import { useCart } from './use-cart';
import { useApproval, useHold, useShift } from './use-pos-data';
import type { Invoice } from './types';

/** Everything a POS screen needs, shared by the desktop and mobile views: cart, day state, pay, hold and approval. */
export function usePosScreen(storageKey?: string) {
  const cart = useCart(storageKey);
  const shift = useShift();
  const hold = useHold(cart);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const approval = useApproval((t) => { cart.setApprover(t); setApprovalOpen(false); });

  const err = cart.finalize.error instanceof ApiError ? cart.finalize.error : null;
  const canPay = !!cart.preview && cart.preview.totals.grandTotal > 0 && cart.preview.payment.left === 0 && !cart.finalize.isPending;

  /** Pay. A discount over the role limit asks for a manager PIN first, and the approver token goes with the bill. */
  const pay = async (extra: { channel?: 'POS Store' | 'Counter'; dueDate?: string } = {}) => {
    if (!cart.preview) return null;
    if (cart.preview.approvalNeeded && !cart.cart.approverToken) { setApprovalOpen(true); return null; }
    try { const inv = await cart.finalize.mutateAsync(extra); setInvoice(inv); return inv; } catch { return null; }
  };
  const holdBill = async (kind: 'hold' | 'draft' = 'hold') => {
    if (!cart.cart.lines.length) return;
    try { const h = await hold.mutateAsync({ kind }); cart.clear(); setNotice(`${kind === 'draft' ? 'Draft saved' : 'Bill held'} as ${h.name}`); setTimeout(() => setNotice(null), 4000); } catch { /* the error shows from the mutation */ }
  };
  return { cart, shift, hold, holdBill, pay, canPay, invoice, closeInvoice: () => setInvoice(null), approvalOpen, setApprovalOpen, approval, err, notice };
}
export type PosScreen = ReturnType<typeof usePosScreen>;
