import { describe, expect, it } from 'vitest';
import { normalizeOrgNumber, openSqliteStore, SaleInputSchema, type SaleInput } from './store.ts';

const sale = (over: Partial<SaleInput> = {}): SaleInput => ({
  address: 'Testgatan 1',
  city: 'Stockholm',
  saleDate: '2026-09-15',
  price: 3_000_000,
  area: 50,
  rooms: 2,
  floor: 3,
  monthlyFee: 3_000,
  brfOrgNumber: '7696000000',
  hasBalcony: true,
  hasElevator: null,
  consent: true,
  ...over,
});

describe('store', () => {
  it('normalizes org numbers', () => {
    expect(normalizeOrgNumber('7696001234')).toBe('769600-1234');
    expect(normalizeOrgNumber('769600-1234')).toBe('769600-1234');
    expect(normalizeOrgNumber('123')).toBeNull();
  });

  it('caches extractions by hash and org number', () => {
    const s = openSqliteStore(':memory:');
    expect(s.getExtractionByHash('abc')).toBeNull();
    s.saveExtraction('abc', { orgNumber: '7696001234', fiscalYear: '2024', model: 'm', data: { x: 1 } });
    s.saveExtraction('def', { orgNumber: '769600-1234', fiscalYear: '2025', model: 'm', data: { x: 2 } });
    expect(s.getExtractionByHash('abc')!.data).toEqual({ x: 1 });
    expect(s.getLatestExtractionByOrg('769600-1234')!.fiscalYear).toBe('2025');
    expect(s.getLatestExtractionByOrg('7696001234')!.data).toEqual({ x: 2 });
  });

  it('stores sales, summarizes per city only above threshold, and deletes with token', () => {
    const s = openSqliteStore(':memory:');
    const a = s.addSale(sale({ price: 3_000_000 }));
    s.addSale(sale({ price: 3_500_000 }));
    expect(s.salesSummary()).toEqual([]);
    s.addSale(sale({ price: 4_000_000, city: ' stockholm ' }));
    expect(s.salesSummary()).toEqual([{ city: 'stockholm', sales: 3, medianPricePerSqm: 70_000 }]);
    expect(s.deleteSale(a.id, 'wrong')).toBe(false);
    expect(s.deleteSale(a.id, a.deleteToken)).toBe(true);
    expect(s.salesSummary()).toEqual([]);
  });

  it('requires consent and sane values', () => {
    expect(SaleInputSchema.safeParse({ ...sale(), consent: false }).success).toBe(false);
    expect(SaleInputSchema.safeParse({ ...sale(), price: 10 }).success).toBe(false);
    expect(SaleInputSchema.safeParse(sale()).success).toBe(true);
  });
});
