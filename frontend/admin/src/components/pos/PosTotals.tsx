import { formatPaise } from '@thunikart/shared';
import { Select, Input } from '@thunikart/ui';
import { useGstMode } from '../../features/auth/permissions';
import type { Cart } from '../../features/pos/use-cart';

/** Totals exactly as the API preview returns them. Tax and round off lines show only while GST mode is on. */
export function PosTotals({ cart }: { cart: Cart }) {
  const gst = useGstMode();
  const t = cart.preview?.totals;
  const row = 'flex justify-between';
  return (
    <dl className="space-y-1 text-sm" aria-label="Bill totals" aria-live="polite">
      <div className={row}><dt>Pieces</dt><dd>{t?.pieces ?? 0}</dd></div>
      <div className={row}><dt>Gross</dt><dd>{t ? formatPaise(t.gross) : '–'}</dd></div>
      {!!t?.discount && <div className={row}><dt>Discount</dt><dd>-{formatPaise(t.discount)}</dd></div>}
      {gst === 'on' && t && t.tax !== null && (
        <>
          <div className={row}><dt>Taxable value</dt><dd>{formatPaise(t.taxable)}</dd></div>
          {t.cgst > 0 && <><div className={row}><dt>CGST</dt><dd>{formatPaise(t.cgst)}</dd></div><div className={row}><dt>SGST</dt><dd>{formatPaise(t.sgst)}</dd></div></>}
          {t.igst > 0 && <div className={row}><dt>IGST</dt><dd>{formatPaise(t.igst)}</dd></div>}
          <div className={row}><dt>Round off</dt><dd>{t.roundOff < 0 ? '-' : ''}{formatPaise(Math.abs(t.roundOff))}</dd></div>
        </>
      )}
      <div className={`${row} border-t border-line pt-1 text-lg font-semibold`}><dt>Total</dt><dd data-testid="grand-total">{t ? formatPaise(t.grandTotal) : formatPaise(0)}</dd></div>
    </dl>
  );
}

/** Bill discount as an amount or a percent. The API works out the rupees. */
export function BillDiscount({ cart, big }: { cart: Cart; big?: boolean }) {
  const h = big ? 'min-h-12' : 'min-h-10';
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium" htmlFor="bill-discount">Bill discount</label>
      <Select aria-label="Bill discount type" className={`w-20 ${h}`} value={cart.cart.billDiscType} onChange={(e) => cart.setBillDiscount(e.target.value as 'amount' | 'percent', cart.cart.billDiscValue)}><option value="amount">₹</option><option value="percent">%</option></Select>
      <Input id="bill-discount" inputMode="decimal" className={`${h} text-right`} value={cart.cart.billDiscValue} onChange={(e) => cart.setBillDiscount(cart.cart.billDiscType, e.target.value)} placeholder="0" />
    </div>
  );
}
