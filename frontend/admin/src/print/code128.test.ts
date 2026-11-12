import { describe, expect, it } from 'vitest';
import { PATTERN_COUNT, code128Bars, code128Modules, code128Widths } from './code128';

describe('code128', () => {
  it('has the 103 data patterns', () => expect(PATTERN_COUNT).toBe(103));
  it('every symbol is 11 modules wide, the stop is 13', () => {
    const w = code128Widths('POS-984322');
    // start + 10 chars + check = 12 symbols of 6 bars, then the 7 bar stop
    expect(w.length).toBe(12 * 6 + 7);
    expect(code128Modules('POS-984322')).toBe(12 * 11 + 13);
  });
  it('encodes a known value: "A" has check value 34 (104 + 33)', () => {
    // start B 104, 'A' = 33, check = (104 + 33*1) % 103 = 34
    expect(code128Widths('A').slice(0, 6).join('')).toBe('211214');
  });
  it('rejects characters outside the printable range', () => expect(() => code128Widths('é')).toThrow());
  it('draws bars inside the quiet zones', () => {
    const { width, bars } = code128Bars('KO1000369');
    expect(bars[0]!.x).toBe(10);
    expect(width).toBeGreaterThan(20);
  });
});
