import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, newIdempotencyKey } from '../api/http';
import { rupeesToPaise } from '../api/money';
import type { Customer, Item } from '../catalog/types';
import { invoiceDto, previewDto, type Invoice, type Preview, type Tender } from './types';

export interface CartLine { variantId: string; code: string; name: string; size: string; color: string; qty: number; discType: 'amount' | 'percent'; discValue: string }
export interface PayLine { id: string; mode: Tender; amount: string; reference: string }
export interface CartState {
  lines: CartLine[];
  billDiscType: 'amount' | 'percent';
  billDiscValue: string;
  customer: Customer | null;
  payments: PayLine[];
  approverToken: string | null;
  heldId: string | null;
}
export const EMPTY_CART: CartState = { lines: [], billDiscType: 'amount', billDiscValue: '', customer: null, payments: [], approverToken: null, heldId: null };
const STORE_KEY = 'tk.pos.cart';

/** The typed cart as the API wants it. Amounts typed in rupees are converted to paise here. */
export function toCartIn(c: CartState, withPayments = true) {
  const disc = (type: 'amount' | 'percent', v: string) => ({ type, value: type === 'amount' ? rupeesToPaise(v || '0') : Number(v || 0) });
  return {
    lines: c.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, discount: l.discValue ? disc(l.discType, l.discValue) : undefined })),
    billDiscount: c.billDiscValue ? disc(c.billDiscType, c.billDiscValue) : undefined,
    customerId: c.customer?.id ?? null,
    payments: withPayments ? c.payments.filter((p) => Number(p.amount) > 0).map((p) => ({ mode: p.mode, amount: rupeesToPaise(p.amount), reference: p.reference })) : [],
  };
}

function load(key: string): CartState {
  try { const raw = localStorage.getItem(key); return raw ? { ...EMPTY_CART, ...(JSON.parse(raw) as CartState) } : EMPTY_CART; } catch { return EMPTY_CART; }
}

/**
 * The POS cart: lines, discounts, customer and payments. The cart survives a reload. Every total on screen comes from the API
 * preview call (debounced), so no tax, discount or rounding maths happens here.
 */
export function useCart(storageKey: string = STORE_KEY) {
  const qc = useQueryClient();
  const [cart, setCart] = useState<CartState>(() => load(storageKey));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<ApiError | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* storage blocked */ } }, [cart, storageKey]);

  const body = useMemo(() => toCartIn(cart), [cart]);
  const bodyKey = JSON.stringify(body);
  useEffect(() => {
    if (!cart.lines.length) { setPreview(null); setPreviewError(null); return; }
    setLoadingPreview(true);
    const t = setTimeout(async () => {
      try { setPreview(previewDto.parse(await api.post('/pos/preview', body))); setPreviewError(null); } catch (e) { setPreviewError(e instanceof ApiError ? e : null); } finally { setLoadingPreview(false); }
    }, 200);
    return () => clearTimeout(t);
    // The key string captures every input that affects the preview.
  }, [bodyKey]);

  const patch = useCallback((fn: (c: CartState) => CartState) => setCart((c) => fn(c)), []);
  const addItem = useCallback((item: Item, variantId?: string) => patch((c) => {
    const v = (variantId ? item.variants.find((x) => x.id === variantId) : item.variants[0])!;
    // A scan of an item already in the cart adds one to its quantity.
    if (c.lines.some((l) => l.variantId === v.id)) return { ...c, lines: c.lines.map((l) => (l.variantId === v.id ? { ...l, qty: l.qty + 1 } : l)) };
    return { ...c, lines: [...c.lines, { variantId: v.id, code: item.code, name: item.name, size: v.size, color: v.color, qty: 1, discType: 'amount', discValue: '' }] };
  }), [patch]);

  const finalizeKey = useRef<{ hash: string; key: string } | null>(null);
  const finalize = useMutation({
    mutationFn: async (extra: { channel?: 'POS Store' | 'Counter'; dueDate?: string } = {}) => {
      const payload = { ...toCartIn(cart), ...extra, approverToken: cart.approverToken ?? undefined, heldId: cart.heldId ?? undefined };
      const hash = JSON.stringify(payload);
      // One key per action. It is reused when the same bill is retried and renewed when the bill changed.
      if (finalizeKey.current?.hash !== hash) finalizeKey.current = { hash, key: newIdempotencyKey() };
      return invoiceDto.parse(await api.post('/pos/bills', payload, { idempotencyKey: finalizeKey.current.key }));
    },
    onSuccess: () => {
      setCart(EMPTY_CART); setPreview(null); finalizeKey.current = null;
      for (const k of ['bills', 'items', 'ledger', 'held', 'shift', 'customers', 'reorder']) void qc.invalidateQueries({ queryKey: [k] });
    },
  });

  return {
    cart, preview, previewError, loadingPreview, patch, addItem,
    setQty: (variantId: string, qty: number) => patch((c) => ({ ...c, lines: qty < 1 ? c.lines.filter((l) => l.variantId !== variantId) : c.lines.map((l) => (l.variantId === variantId ? { ...l, qty } : l)) })),
    remove: (variantId: string) => patch((c) => ({ ...c, lines: c.lines.filter((l) => l.variantId !== variantId) })),
    setLineDiscount: (variantId: string, discType: 'amount' | 'percent', discValue: string) => patch((c) => ({ ...c, lines: c.lines.map((l) => (l.variantId === variantId ? { ...l, discType, discValue } : l)), approverToken: null })),
    setBillDiscount: (billDiscType: 'amount' | 'percent', billDiscValue: string) => patch((c) => ({ ...c, billDiscType, billDiscValue, approverToken: null })),
    setCustomer: (customer: Customer | null) => patch((c) => ({ ...c, customer })),
    setApprover: (approverToken: string | null) => patch((c) => ({ ...c, approverToken })),
    addPayment: (mode: Tender, amount = '') => patch((c) => ({ ...c, payments: [...c.payments, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, mode, amount, reference: '' }] })),
    setPayment: (id: string, p: Partial<PayLine>) => patch((c) => ({ ...c, payments: c.payments.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
    removePayment: (id: string) => patch((c) => ({ ...c, payments: c.payments.filter((x) => x.id !== id) })),
    clear: () => { setCart(EMPTY_CART); setPreview(null); setPreviewError(null); },
    loadCart: (c: Partial<CartState>, heldId: string | null) => setCart({ ...EMPTY_CART, ...c, payments: [], approverToken: null, heldId }),
    finalize,
    /** Lines the API reported as short on stock, by variant id, from the last failed finalize. */
    conflicts: finalize.error instanceof ApiError && finalize.error.code === 'STOCK_CONFLICT' ? Object.fromEntries(finalize.error.fields.map((f) => [f.path.replace('lines.', ''), f.message])) : {},
  };
}
export type Cart = ReturnType<typeof useCart>;
export type { Invoice };
