/**
 * HSN codes are TEXT of 4, 6 or 8 digits. Never stored as numbers (leading zeros and spreadsheet floats ruin them).
 * Last valid heading per chapter for the chapters a garment shop uses. A heading beyond it is not a real heading
 * (for example 6407: Chapter 64 stops at 6406).
 */
const HEADING_RANGE: Record<string, [number, number]> = {
  '42': [4201, 4206], '50': [5001, 5007], '51': [5101, 5113], '52': [5201, 5212], '53': [5301, 5311], '54': [5401, 5408],
  '55': [5501, 5516], '56': [5601, 5609], '57': [5701, 5705], '58': [5801, 5811], '59': [5901, 5911], '60': [6001, 6006],
  '61': [6101, 6117], '62': [6201, 6217], '63': [6301, 6310], '64': [6401, 6406], '65': [6501, 6507], '71': [7101, 7118],
  '96': [9601, 9622],
};

/** Spreadsheet cells give 61083100.0 or "6204 " - normalise to clean text, or "" when blank. */
export function normalizeHsn(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? String(Math.trunc(raw)) : '';
  const s = String(raw).trim().replace(/\.0+$/, '').replace(/\s+/g, '');
  if (!s || /^(none|null|nan|0)$/i.test(s)) return '';
  return s;
}

export interface HsnCheck { ok: boolean; reason?: 'FORMAT' | 'NOT_A_HEADING' }

export function checkHsn(hsn: string): HsnCheck {
  if (!/^\d+$/.test(hsn) || ![4, 6, 8].includes(hsn.length)) return { ok: false, reason: 'FORMAT' };
  const heading = Number(hsn.slice(0, 4));
  const range = HEADING_RANGE[hsn.slice(0, 2)];
  if (range && (heading < range[0] || heading > range[1])) return { ok: false, reason: 'NOT_A_HEADING' };
  return { ok: true };
}
