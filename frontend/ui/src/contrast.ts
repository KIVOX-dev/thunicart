/** WCAG contrast helpers, used to check the brand colors in tests and on the style guide. */
function lum(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
export const BRAND = { navy: '#0B1B54', orange: '#F67025', teal: '#0BBBB4', white: '#FFFFFF', mist: '#F5F7FB', line: '#E3E7F0', muted: '#5B6482', danger: '#C62828' } as const;
/** Approved text on background pairs (AA, 4.5:1). White on orange and white on teal are deliberately absent. */
export const APPROVED_PAIRS: Array<[string, string, string]> = [
  ['Navy on white', BRAND.navy, BRAND.white],
  ['White on navy', BRAND.white, BRAND.navy],
  ['Navy on orange', BRAND.navy, BRAND.orange],
  ['Navy on teal', BRAND.navy, BRAND.teal],
  ['Navy on mist', BRAND.navy, BRAND.mist],
  ['Muted on white', BRAND.muted, BRAND.white],
  ['Muted on mist', BRAND.muted, BRAND.mist],
  ['Danger on white', BRAND.danger, BRAND.white],
];
