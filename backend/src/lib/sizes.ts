// Order matters: longest tokens first so "XXL" is not read as X + X + L.
const TOKENS = ['XXXXL', 'XXXL', 'XXL', '5XL', '4XL', '3XL', '2XL', 'XL', 'XS', 'S', 'M', 'L'];

export interface ParsedSize { sizes: string[]; multi: boolean; blank: boolean; weird: boolean }

/** "Primary", "None" and empty mean no size. */
export const isBlankWord = (v: unknown) => {
  const s = String(v ?? '').trim();
  return s === '' || /^primary$/i.test(s) || /^none$/i.test(s) || /^null$/i.test(s);
};

/** Turns a spreadsheet size cell into clean sizes. 80.0 becomes "80". MLXL2XL and "S M L XL XXL" become several sizes. */
export function parseSizes(raw: unknown): ParsedSize {
  if (isBlankWord(raw)) return { sizes: [], multi: false, blank: true, weird: false };
  if (typeof raw === 'number') {
    return { sizes: [Number.isInteger(raw) ? String(raw) : String(raw)], multi: false, blank: false, weird: !Number.isInteger(raw) || raw < 20 };
  }
  const s = String(raw).trim().replace(/\.0+$/, '');
  if (/^free\s*size$/i.test(s) || /^(fs|os|one size)$/i.test(s)) return { sizes: ['Free Size'], multi: false, blank: false, weird: false };
  if (/^\d{2,3}$/.test(s)) return { sizes: [s], multi: false, blank: false, weird: false };
  const compact = s.toUpperCase().replace(/[\s,/\-+]+/g, '');
  // Try to read the whole string as a run of known size tokens.
  const found: string[] = [];
  let rest = compact;
  while (rest.length) {
    const t = TOKENS.find((x) => rest.startsWith(x));
    if (!t) { return { sizes: [s], multi: false, blank: false, weird: true }; }
    found.push(t); rest = rest.slice(t.length);
  }
  if (found.length > 1) return { sizes: found, multi: true, blank: false, weird: false };
  return { sizes: found, multi: false, blank: false, weird: false };
}
