import { describe, expect, it } from 'vitest';
import { allocateProportionally, divRoundHalfUp, rupeesToPaise } from './money';
import { gstinCheckChar, validateGstin, validatePan } from './gstin';
import { financialYearOf } from './financialYear';
import { formatNumber } from './numberSeries';
import { formatPaise } from '@thunikart/shared';

describe('money', () => {
  it('rounds half up with integers only', () => {
    expect(divRoundHalfUp(5, 2)).toBe(3);
    expect(divRoundHalfUp(7, 3)).toBe(2);
    expect(divRoundHalfUp(-5, 2)).toBe(-3);
    expect(divRoundHalfUp(134900 * 100, 112)).toBe(120446); // 1349.00 at 12% => taxable 1204.46
    expect(divRoundHalfUp(81000 * 100, 105)).toBe(77143); // 810.00 at 5% => taxable 771.43
  });
  it('parses rupees to paise', () => {
    expect(rupeesToPaise('1,499')).toBe(149900);
    expect(rupeesToPaise('450.5')).toBe(45050);
    expect(rupeesToPaise('0.005')).toBe(1);
  });
  it('splits proportionally and gives the leftover paisa to the largest line', () => {
    const parts = allocateProportionally(10000, [134900, 81000]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(allocateProportionally(1, [1, 1, 1])).toEqual([1, 0, 0]);
  });
  it('formats paise in Indian grouping', () => {
    expect(formatPaise(59222923)).toBe('₹5,92,229.23');
    expect(formatPaise(-5)).toBe('-₹0.05');
  });
});

describe('GSTIN and PAN', () => {
  const make = (s = '33', pan = 'ABCDE1234F') => { const f = `${s}${pan}1Z`; return f + gstinCheckChar(f); };
  it('accepts a correct GSTIN', () => expect(validateGstin(make(), '33', 'ABCDE1234F').ok).toBe(true));
  it('rejects a bad checksum', () => {
    const g = make(); const bad = g.slice(0, 14) + (g[14] === 'A' ? 'B' : 'A');
    expect(validateGstin(bad).reason).toMatch(/checksum/);
  });
  it('rejects the state code mismatch and PAN mismatch', () => {
    expect(validateGstin(make('27'), '33').reason).toMatch(/state code/);
    expect(validateGstin(make(), '33', 'ZZZZZ9999Z').reason).toMatch(/PAN/);
  });
  it('rejects bad format', () => expect(validateGstin('123').ok).toBe(false));
  it('checks PAN', () => { expect(validatePan('ABCDE1234F')).toBe(true); expect(validatePan('abcde')).toBe(false); });
});

describe('financial year and numbers', () => {
  it('runs 1 April to 31 March in IST', () => {
    expect(financialYearOf(new Date('2026-11-09T00:00:00Z'))).toBe('2026-27');
    expect(financialYearOf(new Date('2027-03-31T10:00:00Z'))).toBe('2026-27');
    expect(financialYearOf(new Date('2027-03-31T19:00:00Z'))).toBe('2027-28'); // 00:30 IST on 1 April
    expect(financialYearOf(new Date('2026-04-01T00:00:00+05:30'))).toBe('2026-27');
  });
  it('formats numbers like POS-2026-27-000001', () => {
    expect(formatNumber('POS', '2026-27', 1, 6)).toBe('POS-2026-27-000001');
    expect(formatNumber('CUST', '', 42, 6)).toBe('CUST-000042');
  });
});
