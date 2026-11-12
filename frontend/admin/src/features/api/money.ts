/** Conversion for form inputs only (rupees typed by a person to paise sent to the API). No tax, discount or rounding rules live here. */
export function rupeesToPaise(v: string | number): number {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export function paiseToRupees(paise: number): string {
  return paise ? (paise / 100).toString() : '';
}
