import { describe, expect, it } from 'vitest';
import { calcPurchaseLine, sumLines, supplyFor, termDays } from './purchaseTax';
import { weightedAverageCost } from './stock';
import { stockStatusOf, effectivePrice } from './stockStatus';

describe('purchase line tax (cost excludes GST, round half up)', () => {
  it('PO-2026-082: 495 x 150.00 at 5% intra state', () => {
    const l = calcPurchaseLine({ qty: 495, unitCost: 15000, discountPercent: 0, gstRate: 5 }, { gstOn: true, supply: 'intra' });
    expect(l).toMatchObject({ taxable: 7425000, cgst: 185625, sgst: 185625, igst: 0, total: 7796250 });
  });
  it('inter state gives IGST only', () => {
    const l = calcPurchaseLine({ qty: 100, unitCost: 50000, discountPercent: 0, gstRate: 12 }, { gstOn: true, supply: 'inter' });
    expect(l).toMatchObject({ taxable: 5000000, cgst: 0, sgst: 0, igst: 600000 });
  });
  it('GST off: no tax, the full amount is the cost', () => {
    const l = calcPurchaseLine({ qty: 3, unitCost: 3333, discountPercent: 0, gstRate: 12 }, { gstOn: false, supply: null });
    expect(l).toMatchObject({ taxable: 9999, cgst: 0, sgst: 0, igst: 0, total: 9999 });
  });
  it('fractional rates and discounts round half up', () => {
    const l = calcPurchaseLine({ qty: 3, unitCost: 3333, discountPercent: 2.5, gstRate: 5 }, { gstOn: true, supply: 'intra' });
    expect(l).toMatchObject({ gross: 9999, discount: 250, taxable: 9749, cgst: 244, sgst: 244 });
    const half = calcPurchaseLine({ qty: 1, unitCost: 10000, discountPercent: 0, gstRate: 2.5 }, { gstOn: true, supply: 'intra' });
    expect(half).toMatchObject({ cgst: 125, sgst: 125 });
  });
  it('sums lines and decides the supply by state code', () => {
    const a = calcPurchaseLine({ qty: 1, unitCost: 10000, discountPercent: 0, gstRate: 5 }, { gstOn: true, supply: 'intra' });
    expect(sumLines([a, a])).toMatchObject({ taxable: 20000, cgst: 500, sgst: 500, tax: 1000, total: 21000 });
    expect(supplyFor('33', '33')).toBe('intra');
    expect(supplyFor('24', '33')).toBe('inter');
    expect(termDays('NET15')).toBe(15);
    expect(termDays('ADVANCE')).toBe(0);
  });
});

describe('weighted average cost', () => {
  it('three receipts at three costs', () => {
    let c = weightedAverageCost(0, 0, 10, 10000); expect(c).toBe(10000);
    c = weightedAverageCost(10, c, 20, 13000); expect(c).toBe(12000);
    c = weightedAverageCost(30, c, 10, 16000); expect(c).toBe(13000);
  });
  it('rounds half up and ignores empty or negative stock', () => {
    expect(weightedAverageCost(1, 100, 1, 101)).toBe(101); // 100.5 -> 101
    expect(weightedAverageCost(-4, 500, 6, 300)).toBe(300);
    expect(weightedAverageCost(5, 500, 0, 300)).toBe(500);
  });
});

describe('stock status and online price', () => {
  it('Out of Stock at 0 or less, Low Stock at or below the reorder level, else In Stock', () => {
    expect(stockStatusOf(0, 5)).toBe('Out of Stock');
    expect(stockStatusOf(-2, 0)).toBe('Out of Stock');
    expect(stockStatusOf(5, 5)).toBe('Low Stock');
    expect(stockStatusOf(6, 5)).toBe('In Stock');
    expect(stockStatusOf(1, 0)).toBe('In Stock');
  });
  it('offer price, else selling price, else MRP', () => {
    expect(effectivePrice({ offerPrice: 900, sellingPrice: 1000, mrp: 1200 })).toBe(900);
    expect(effectivePrice({ offerPrice: null, sellingPrice: 1000, mrp: 1200 })).toBe(1000);
    expect(effectivePrice({ offerPrice: null, sellingPrice: 0, mrp: 1200 })).toBe(1200);
  });
});
