export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

/** Stock Status is derived, never typed. Available = on hand minus reserved. */
export function stockStatusOf(available: number, reorderLevel: number): StockStatus {
  if (available <= 0) return 'Out of Stock';
  if (available <= reorderLevel) return 'Low Stock';
  return 'In Stock';
}

type Priced = { offerPrice?: number | null; sellingPrice?: number | null; mrp: number; salePrice?: number | null; saleUntil?: Date | string | null };

/** Price rule: a running one day sale if it is lower, otherwise the offer price if set, otherwise the selling price, otherwise the MRP. */
export function effectivePrice(v: Priced, now: number = Date.now()): number {
  const normal = regularPrice(v);
  if (v.salePrice != null && v.salePrice > 0 && v.saleUntil && new Date(v.saleUntil).getTime() >= now) return Math.min(v.salePrice, normal);
  return normal;
}

/** The price without any one day sale. */
export function regularPrice(v: Priced): number {
  if (v.offerPrice != null && v.offerPrice > 0) return v.offerPrice;
  if (v.sellingPrice != null && v.sellingPrice > 0) return v.sellingPrice;
  return v.mrp;
}
