/**
 * Money is integer paise. Never use floating point arithmetic on money.
 * All division rounds half up (away from zero for exact .5, which only matters for negatives).
 */
export function assertPaise(n: number, label = 'amount'): number {
  if (!Number.isSafeInteger(n)) throw new Error(`${label} must be a whole number of paise, got ${n}`);
  return n;
}

/** round half up of (numerator / denominator) using integers only. */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) {
    throw new Error('divRoundHalfUp needs safe integers and a non zero denominator');
  }
  const neg = numerator < 0 !== denominator < 0;
  const n = BigInt(Math.abs(numerator));
  const d = BigInt(Math.abs(denominator));
  const q = (2n * n + d) / (2n * d);
  const r = Number(q);
  return neg ? -r : r;
}

/** Parse "1499", "1,499.50" or "450.5" into paise without floating point. */
export function rupeesToPaise(input: string | number): number {
  const s = String(input).replace(/[,₹\s]/g, '');
  const m = /^(-?)(\d+)(?:\.(\d{1,}))?$/.exec(s);
  if (!m) throw new Error(`Not a money amount: ${input}`);
  const [, sign, whole, fracRaw = ''] = m;
  const frac = (fracRaw + '00').slice(0, 2);
  let paise = Number(whole) * 100 + Number(frac);
  if (fracRaw.length > 2 && Number(fracRaw[2]) >= 5) paise += 1; // round half up on the third decimal
  return sign ? -paise : paise;
}

export const paiseToRupeesString = (paise: number): string => {
  const sign = paise < 0 ? '-' : '';
  const a = Math.abs(paise);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
};

/** Split a total across weights in proportion, giving the leftover paise to the largest weight. */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map(() => 0);
  const shares = weights.map((w) => Math.floor((total * w) / sum));
  const left = total - shares.reduce((a, b) => a + b, 0);
  let largest = 0;
  weights.forEach((w, i) => { if (w > (weights[largest] as number)) largest = i; });
  shares[largest] = (shares[largest] as number) + left;
  return shares;
}
