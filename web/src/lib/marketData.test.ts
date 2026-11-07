import { describe, expect, it } from 'vitest';
import { MARKET_REGIONS, ageInMonths, formatAsOf, isStale } from './marketData';
import { REGIONS } from './resilience';

describe('market data', () => {
  it('every figure has a source and a valid month', () => {
    for (const r of MARKET_REGIONS) {
      for (const d of [r.drop2022, r.avgPricePerSqm]) {
        if (!d) continue;
        expect(d.source.length).toBeGreaterThan(0);
        expect(d.asOf).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      }
    }
  });

  it('computes age and staleness', () => {
    const now = new Date(2026, 10, 7); // nov 2026
    expect(ageInMonths('2026-05', now)).toBe(6);
    expect(isStale({ value: 1, source: 's', asOf: '2026-05' }, now)).toBe(false);
    expect(isStale({ value: 1, source: 's', asOf: '2025-10' }, now)).toBe(true);
    expect(formatAsOf('2025-10')).toBe('okt 2025');
  });

  it('resilience regions are derived from the data file', () => {
    expect(REGIONS.map((r) => r.drop2022)).toEqual(MARKET_REGIONS.map((r) => r.drop2022.value));
  });
});
