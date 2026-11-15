import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, newIdempotencyKey } from '../api/http';
import { rupeesToPaise } from '../api/money';
import type { Customer, Item } from '../catalog/types';
import { invoiceDto, previewDto, type Invoice, type Preview, type Tender } from './types';
import { splitSizes } from './sizes';
import { useShopId } from './use-shop';

/** `sizes` is filled for an item whose sizes share one stock count: the cashier picks the size sold and it goes in `size`. */
export interface CartLine { variantId: string; code: string; name: string; size: string; sizes?: string[]; color: string; qty: number; discType: 'amount' | 'percent'; discValue: string }
export interface PayLine { id: string; mode: Tender; amount: string; reference: string }
export interface CartState {
  lines: CartLine[];
  billDiscType: 'amount' | 'percent';
  billDiscValue: string;
  customer: Customer | null;
  payments: PayLine[];
  approverToken: string | null;
  heldId: string | null;
  /** Name and mobile typed for a customer who is not registered. */
  walkIn?: { name: string; mobile: string };
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

const discIn = (type: 'amount' | 'percent', v: string) => ({ type, value: type === 'amount' ? rupeesToPaise(v || '0') : Number(v || 0) });
/** The cart as the bill API takes it. */
export function apiBill(c: CartState, storeId: string) {
  const w = c.walkIn;
  const walk = w && (w.name.trim() || w.mobile) ? { name: w.name.trim() || 'Walk-in Customer', mobile: w.mobile } : undefined;
  return {
    storeId,
    lines: c.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, ...(l.sizes?.length ? { size: l.size } : {}), ...(l.discValue ? { discount: discIn(l.discType, l.discValue) } : {}) })),
    ...(c.billDiscValue ? { billDiscount: discIn(c.billDiscType, c.billDiscValue) } : {}),
    ...(c.customer ? { customerId: c.customer.id } : walk ? { customer: walk } : {}),
  };
}
const needsSize = (c: CartState) => c.lines.some((l) => l.sizes?.length && !l.size);
const tenderMode = (m: string) => m.toLowerCase().replace(/\s+/g, '_');
const paidPaise = (c: CartState) => c.payments.reduce((a, p) => a + (Number(p.amount) > 0 ? rupeesToPaise(p.amount) : 0), 0);

/** The API's preview, in the shape the bill screen uses. */
function toPreview(r: any, c: CartState): Preview {
  const t = r.totals ?? {};
  const paid = paidPaise(c);
  const grand = t.grandTotal ?? 0;
  return previewDto.parse({
    lines: (r.lines ?? []).map((l: any) => ({
      variantId: l.variantId, code: l.itemCode ?? '', name: l.description ?? '', size: l.size ?? '', color: '', hsn: l.hsn ?? '', qty: l.qty,
      rate: l.unitPrice ?? 0, discount: (l.lineDiscount ?? 0) + (l.billDiscountShare ?? 0), taxableValue: l.taxable ?? 0, taxRate: r.gstMode === 'on' ? (l.rate ?? null) : null,
      cgst: l.cgst ?? 0, sgst: l.sgst ?? 0, igst: l.igst ?? 0, net: l.net ?? 0, available: l.available ?? 0,
    })),
    totals: { gross: t.gross ?? 0, discount: t.discount ?? 0, taxable: t.taxable ?? 0, cgst: t.cgst ?? 0, sgst: t.sgst ?? 0, igst: t.igst ?? 0, tax: r.gstMode === 'on' ? (t.tax ?? 0) : null, roundOff: t.roundOff ?? 0, grandTotal: grand, pieces: (r.lines ?? []).reduce((a: number, l: any) => a + l.qty, 0) },
    interState: r.supply === 'inter',
    approvalNeeded: null,
    payment: { paid, left: Math.max(0, grand - paid), changeDue: Math.max(0, paid - grand) },
  });
}

/** A finished bill from the API, in the shape the receipt screens use. */
function toInvoice(b: any): Invoice {
  const sn = b.snapshot ?? {}; const biz = sn.business ?? {}; const cu = sn.customer ?? b.customer ?? {};
  const when = new Date(b.finalizedAt ?? b.createdAt ?? Date.now());
  const t = sn.totals ?? b.totals ?? {};
  const tenders: any[] = b.tenders ?? sn.tenders ?? [];
  const paid = tenders.reduce((a, x) => a + (x.amount ?? 0), 0);
  const lines: any[] = sn.lines ?? [];
  return invoiceDto.parse({
    id: b.id, number: b.invoiceNumber ?? '', type: b.gstMode === 'on' ? 'tax-invoice' : 'bill-of-supply', gst: b.gstMode === 'on', date: when.toISOString().slice(0, 10),
    time: when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), channel: b.channel ?? 'POS', storeName: sn.store ?? '',
    customer: cu.name ? { name: cu.name, mobile: cu.mobile ?? '', gstin: cu.gstin ?? '', state: cu.stateCode ?? '' } : null,
    lines: lines.map((l) => ({ variantId: '', code: l.itemCode ?? '', name: l.description ?? '', size: '', color: '', hsn: l.hsn ?? '', qty: l.qty, rate: l.rate ?? 0, discount: l.discount ?? 0, taxableValue: l.taxable ?? 0, taxRate: l.gstRate ?? null, cgst: l.cgst ?? 0, sgst: l.sgst ?? 0, igst: l.igst ?? 0, net: l.net ?? 0, available: 0 })),
    totals: { gross: t.gross ?? 0, discount: t.discount ?? 0, taxable: t.taxable ?? 0, cgst: t.cgst ?? 0, sgst: t.sgst ?? 0, igst: t.igst ?? 0, tax: b.gstMode === 'on' ? (t.tax ?? 0) : null, roundOff: b.roundOff ?? 0, grandTotal: b.grandTotal ?? 0, pieces: lines.reduce((a, l) => a + l.qty, 0) },
    payments: tenders.map((x) => ({ mode: x.mode, amount: x.amount, reference: x.reference ?? '' })), changeDue: Math.max(0, paid - (b.grandTotal ?? 0)), dueDate: b.dueDate ?? null, cashier: sn.cashier ?? '',
    shop: { name: biz.brandName || biz.legalName || '', legalName: biz.legalName ?? '', address: biz.addressLines ?? [], city: biz.city ?? '', pincode: biz.pincode ?? '', phone: biz.phone ?? '', gstin: biz.gstin ?? '' },
    terms: biz.termsText ?? '', footer: biz.invoiceFooter ?? '', returned: lines.map(() => 0),
  });
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

  const shop = useShopId().data;
  const waiting = !shop || needsSize(cart);
  const body = useMemo(() => (shop ? apiBill(cart, shop) : null), [cart, shop]);
  const bodyKey = JSON.stringify(body) + String(waiting) + JSON.stringify(cart.payments.map((p) => p.amount));
  useEffect(() => {
    if (!cart.lines.length || waiting || !body) { setPreview(null); setPreviewError(null); return; }
    setLoadingPreview(true);
    const t = setTimeout(async () => {
      try { setPreview(toPreview(await api.post('/pos/preview', body), cart)); setPreviewError(null); } catch (e) { setPreviewError(e instanceof ApiError ? e : null); } finally { setLoadingPreview(false); }
    }, 200);
    return () => clearTimeout(t);
    // The key string captures every input that affects the preview.
  }, [bodyKey]);

  const patch = useCallback((fn: (c: CartState) => CartState) => setCart((c) => fn(c)), []);
  const addItem = useCallback((item: Item, variantId?: string) => patch((c) => {
    const v = (variantId ? item.variants.find((x) => x.id === variantId) : item.variants[0])!;
    // A scan of an item already in the cart adds one to its quantity.
    if (c.lines.some((l) => l.variantId === v.id)) return { ...c, lines: c.lines.map((l) => (l.variantId === v.id ? { ...l, qty: l.qty + 1 } : l)) };
    const sp = splitSizes(v.size);
    return { ...c, lines: [...c.lines, { variantId: v.id, code: item.code, name: item.name, size: sp.multi ? '' : v.size, ...(sp.multi ? { sizes: sp.sizes } : {}), color: v.color, qty: 1, discType: 'amount', discValue: '' }] };
  }), [patch]);

  const finalizeKey = useRef<{ hash: string; key: string; draftId?: string } | null>(null);
  const finalize = useMutation({
    mutationFn: async (extra: { channel?: 'POS Store' | 'Counter'; dueDate?: string } = {}) => {
      if (!shop) throw new Error('No store is selected yet.');
      const bill = { ...apiBill(cart, shop), ...(extra.channel === 'Counter' ? { channel: 'CNT' } : {}), ...(extra.dueDate ? { dueDate: extra.dueDate } : {}) };
      const tenders = cart.payments.filter((p) => Number(p.amount) > 0).map((p) => ({ mode: tenderMode(p.mode), amount: rupeesToPaise(p.amount), ...(p.reference ? { reference: p.reference } : {}) }));
      const hash = JSON.stringify({ bill, tenders });
      // One key and one draft per action. They are reused when the same bill is retried and renewed when the bill changed.
      if (finalizeKey.current?.hash !== hash) finalizeKey.current = { hash, key: newIdempotencyKey() };
      const fk = finalizeKey.current;
      fk.draftId ??= (await api.post<{ id: string }>('/pos/bills', bill)).id;
      return toInvoice(await api.post(`/pos/bills/${fk.draftId}/finalize`, { tenders }, { idempotencyKey: fk.key }));
    },
    onSuccess: () => {
      setCart(EMPTY_CART); setPreview(null); finalizeKey.current = null;
      for (const k of ['bills', 'items', 'ledger', 'held', 'shift', 'customers', 'reorder', 'stock-rows']) void qc.invalidateQueries({ queryKey: [k] });
    },
  });

  return {
    cart, preview, previewError, loadingPreview, patch, addItem,
    setQty: (variantId: string, qty: number) => patch((c) => ({ ...c, lines: qty < 1 ? c.lines.filter((l) => l.variantId !== variantId) : c.lines.map((l) => (l.variantId === variantId ? { ...l, qty } : l)) })),
    remove: (variantId: string) => patch((c) => ({ ...c, lines: c.lines.filter((l) => l.variantId !== variantId) })),
    setLineDiscount: (variantId: string, discType: 'amount' | 'percent', discValue: string) => patch((c) => ({ ...c, lines: c.lines.map((l) => (l.variantId === variantId ? { ...l, discType, discValue } : l)), approverToken: null })),
    setBillDiscount: (billDiscType: 'amount' | 'percent', billDiscValue: string) => patch((c) => ({ ...c, billDiscType, billDiscValue, approverToken: null })),
    setSize: (variantId: string, size: string) => patch((c) => ({ ...c, lines: c.lines.map((l) => (l.variantId === variantId ? { ...l, size } : l)) })),
    setWalkIn: (walkIn: { name: string; mobile: string }) => patch((c) => ({ ...c, walkIn })),
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
