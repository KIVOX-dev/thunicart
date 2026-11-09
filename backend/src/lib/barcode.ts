import { nextNumber } from './numberSeries';
import type { ClientSession } from 'mongoose';

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}
export const isValidEan13 = (s: string) => /^\d{13}$/.test(s) && ean13CheckDigit(s.slice(0, 12)) === Number(s[12]);

/** In-store EAN-13: prefix (20 to 29) + sequence from the EAN series + check digit. A number is never reused. */
export async function generateEan13(session?: ClientSession): Promise<string> {
  const twelve = await nextNumber('EAN', { session });
  if (!/^2\d\d{10}$/.test(twelve)) throw new Error(`EAN series is misconfigured: ${twelve}`);
  return twelve + ean13CheckDigit(twelve);
}

/** Barcode text for a variant that has none: Code-128 of the item code. */
export const code128For = (itemCode: string) => itemCode;
export const barcodeKind = (barcode: string): 'ean13' | 'code128' => (isValidEan13(barcode) ? 'ean13' : 'code128');
