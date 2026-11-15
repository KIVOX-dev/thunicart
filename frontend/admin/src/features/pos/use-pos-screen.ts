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

  /** A short message under the scan box. The counter shortcuts use it so a key press always shows what happened. */
  const say = (m: string) => { setNotice(m); setTimeout(() => setNotice((n) => (n === m ? null : n)), 4000); };
  const why = (e: unknown) => (e instanceof ApiError ? (e.fields[0]?.message ?? e.message) : 'Something went wrong. Please try again.');

  /** Pay. A discount over the role limit asks for a manager PIN first, and the approver token goes with the bill. With no payment chosen yet, the full amount is put down as cash for the cashier to confirm. */
  const pay = async (extra: { channel?: 'POS Store' | 'Counter'; dueDate?: string } = {}) => {
    const lines = cart.cart.lines;
    if (!lines.length) { say('Add an item before paying.'); return null; }
    if (lines.some((l) => l.sizes?.length && !l.size)) { say('Choose the size sold for every item first.'); return null; }
    if (!cart.preview) { say('The bill is still being calculated. Try again in a moment.'); return null; }
    if (cart.preview.approvalNeeded && !cart.cart.approverToken) { setApprovalOpen(true); return null; }
    if (!cart.cart.payments.length) {
      cart.addPayment('Cash', (cart.preview.totals.grandTotal / 100).toFixed(2));
      say('Cash for the full amount is added. Press F8 again to complete, or change the payment first.');
      return null;
    }
    if (cart.preview.payment.left > 0) { say(`The payments do not cover the bill yet. ${(cart.preview.payment.left / 100).toFixed(2)} rupees left.`); return null; }
    try { const inv = await cart.finalize.mutateAsync(extra); setInvoice(inv); return inv; } catch { return null; }
  };
  const holdBill = async (kind: 'hold' | 'draft' = 'hold') => {
    if (!cart.cart.lines.length) { say('Add an item before holding the bill.'); return; }
    if (cart.cart.lines.some((l) => l.sizes?.length && !l.size)) { say('Choose the size sold for every item before holding.'); return; }
    try { const h = await hold.mutateAsync({ kind }); cart.clear(); say(`${kind === 'draft' ? 'Draft saved' : 'Bill held'} ${h.name}`); } catch (e) { say(`Could not hold the bill. ${why(e)}`); }
  };
  const newBill = () => { cart.clear(); say('New bill started.'); };
  return { cart, shift, hold, holdBill, newBill, say, pay, canPay, invoice, closeInvoice: () => setInvoice(null), approvalOpen, setApprovalOpen, approval, err, notice };
}
export type PosScreen = ReturnType<typeof usePosScreen>;
