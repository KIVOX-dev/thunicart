const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const GSTIN_FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_FORMAT = /^[A-Z]{5}\d{4}[A-Z]$/;

/** The 15th character of a GSTIN, calculated from the first 14. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i] as string);
    const prod = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] as string;
}

export interface GstinCheck { ok: boolean; reason?: string }

export function validateGstin(gstin: string, stateCode?: string, pan?: string): GstinCheck {
  const g = gstin.trim().toUpperCase();
  if (!GSTIN_FORMAT.test(g)) return { ok: false, reason: 'GSTIN format is not valid' };
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return { ok: false, reason: 'GSTIN checksum does not match. Check the last character.' };
  if (stateCode && g.slice(0, 2) !== stateCode) return { ok: false, reason: `GSTIN starts with ${g.slice(0, 2)} but the state code is ${stateCode}` };
  if (pan && g.slice(2, 12) !== pan.toUpperCase()) return { ok: false, reason: 'Characters 3 to 12 of the GSTIN must match the PAN' };
  return { ok: true };
}

export const validatePan = (pan: string): boolean => PAN_FORMAT.test(pan.trim().toUpperCase());
