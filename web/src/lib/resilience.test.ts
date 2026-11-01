import { describe, expect, it } from 'vitest';
import { REGIONS, SCENARIOS, resilience, scenarioResult, segmentBeta, type ResilienceInput } from './resilience';

const sthlm = REGIONS.find((r) => r.id === 'stockholm')!;
const base: ResilienceInput = {
  price: 3_000_000, area: 50, loan: 2_500_000, ownRate: 0.03, monthlyFee: 3_000, region: sthlm,
  priceRatio: 1, segmentSensitivity: 0.5, debtPerSqm: 6_000, areaDebtPerSqm: 6_000, brfBindingYears: 2, perThousandMonthly: -0.025,
};
const like2022 = SCENARIOS.find((s) => s.id === 'like2022')!;

describe('resilience', () => {
  it('an average apartment follows the region', () => {
    const r = scenarioResult(base, like2022);
    expect(r.total).toBeCloseTo(-0.12);
    expect(r.valueAfter).toBeCloseTo(2_640_000);
    expect(r.ltvAfter).toBeCloseTo(2_500_000 / 2_640_000);
    expect(resilience(base).rating).toBe('same');
  });

  it('cheaper segments swing more, within bounds', () => {
    expect(segmentBeta(0.7, 0.5)).toBeCloseTo(1.15);
    expect(segmentBeta(1.3, 0.5)).toBeCloseTo(0.85);
    expect(segmentBeta(0, 2)).toBe(1.5);
    expect(scenarioResult({ ...base, priceRatio: 0.7 }, like2022).total).toBeCloseTo(-0.12 * 1.15);
    expect(resilience({ ...base, priceRatio: 1.3 }).rating).toBe('better');
  });

  it('extra association debt adds a fee-driven drop', () => {
    const r = scenarioResult({ ...base, debtPerSqm: 14_000 }, like2022);
    // 50 kvm × 8 000 kr/kvm × 3 pe / 12 = 1 000 kr/mån extra ⇒ −2,5 %
    expect(r.association).toBeCloseTo(-0.025);
    expect(r.feeIncrease).toBeCloseTo((50 * 14_000 * 0.03) / 12);
    expect(resilience({ ...base, debtPerSqm: 14_000 }).rating).toBe('worse');
  });

  it('long fixed-rate periods delay the fee increase', () => {
    const short = scenarioResult({ ...base, brfBindingYears: 1 }, like2022);
    const long = scenarioResult({ ...base, brfBindingYears: 4 }, like2022);
    expect(long.feeIncrease).toBeCloseTo(short.feeIncrease / 2);
  });
});

describe('resilience – low debt', () => {
  it('lower association debt than the area cushions the drop', () => {
    expect(scenarioResult({ ...base, debtPerSqm: 2_000 }, like2022).association).toBeGreaterThan(0);
  });
});
