import { describe, expect, it } from 'vitest';
import { APPROVED_PAIRS, BRAND, contrastRatio } from './contrast';

describe('brand contrast (WCAG AA)', () => {
  for (const [name, fg, bg] of APPROVED_PAIRS) {
    it(`${name} is at least 4.5:1`, () => expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5));
  }
  it('white on orange is too weak for small text, so it is never used', () => {
    expect(contrastRatio(BRAND.white, BRAND.orange)).toBeLessThan(4.5);
  });
});
