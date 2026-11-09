export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

/** Stock Status is derived, never typed. Available = on hand minus reserved. */
export function stockStatusOf(available: number, reorderLevel: number): StockStatus {
  if (available <= 0) return 'Out of Stock';
  if (available <= reorderLevel) return 'Low Stock';
  return 'In Stock';
}

/** Online price rule: the offer price if set, otherwise the selling price, otherwise the MRP. */
export function effectivePrice(v: { offerPrice?: number | null; sellingPrice?: number | null; mrp: number }): number {
  if (v.offerPrice != null && v.offerPrice > 0) return v.offerPrice;
  if (v.sellingPrice != null && v.sellingPrice > 0) return v.sellingPrice;
  return v.mrp;
}
