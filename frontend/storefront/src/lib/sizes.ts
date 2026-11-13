/** Clothing sizes in the order shoppers expect. Anything else from the stock import (100, 2.5, PARTS-7, MLXL2XL...) is kept for filtering but sorted after these. */
export const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'Free Size'];
export const isStandardSize = (s: string) => STANDARD_SIZES.includes(s);
export function sortSizes(sizes: string[]): string[] {
  const rank = (s: string) => { const i = STANDARD_SIZES.indexOf(s); return i === -1 ? 100 : i; };
  return [...sizes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true }));
}
